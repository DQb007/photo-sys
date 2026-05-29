import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { ResultSetHeader } from 'mysql2/promise';
import { z } from 'zod';
import { config } from '../config.js';
import { getPool, type GenerationImageRow, type GenerationRow } from '../db.js';
import {
  deleteStoredFile,
  discardUploadedTempFile,
  getTempUploadsDir,
  makeUploadFilename,
  saveUploadedTempFile,
  uploadedStorageKey,
} from '../storage.js';
import { serializeGeneration } from '../serializers.js';
import { enqueueGeneration, getQueueSummary, removeGenerationFromQueue } from '../queue.js';
import { optionalUserOrGuest, requireActiveUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { httpError } from '../errors.js';
import { writeAuditLog } from '../audit.js';
import {
  calculateGenerationCreditCost,
  debitGenerationCreditsInConnection,
  refundCancelledGenerationCreditsInConnection
} from '../credits.js';
import { getAppSettings, type AppSettings } from '../settingsService.js';
import { consumeGuestGenerationInConnection } from '../guestSessions.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getTempUploadsDir()),
    filename: (_req, file, cb) => cb(null, makeUploadFilename(file.originalname))
  }),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PNG, JPEG, and WebP reference images are supported'));
  }
});

const router = express.Router();

router.use(optionalUserOrGuest);

const createGenerationSchema = z.object({
  prompt: z.string().trim().min(1, '请输入提示词').max(8000),
  size: z.string().trim().max(50).optional().or(z.literal('')),
  quality: z.string().trim().max(50).optional().or(z.literal('')),
  count: z.coerce.number().int().min(1).max(4).default(1)
});

router.post('/', upload.array('referenceImages', 4), async (req: AuthenticatedRequest, res, next) => {
  const uploadedFiles = getUploadedFiles(req.files);
  const newReferenceKeys: string[] = [];

  try {
    if (!req.user && !req.guestSession) throw httpError(401, '请先登录或开始游客试用');
    if (req.user) {
      if (req.user.status === 'pending_email_verification') {
        throw httpError(403, '请先完成邮箱验证', 'EMAIL_VERIFICATION_REQUIRED');
      }
      if (req.user.status !== 'active') throw httpError(403, '账号不可用');
    }
    const parsed = createGenerationSchema.parse(req.body);
    const pool = getPool();
    const settings = await getAppSettings({ includeSecrets: true }) as AppSettings;
    const isGuest = !req.user && Boolean(req.guestSession);
    if (isGuest && !settings.trial.enabled) throw httpError(403, '游客试用暂未开放', 'TRIAL_DISABLED');
    if (isGuest && uploadedFiles.length > 0 && !settings.trial.allowReferenceImages) {
      throw httpError(403, '游客试用暂不支持上传参考图', 'TRIAL_REFERENCE_DISABLED');
    }
    if (isGuest && parsed.count > settings.trial.maxImagesPerGeneration) {
      throw httpError(422, `游客单次最多生成 ${settings.trial.maxImagesPerGeneration} 张图片`, 'TRIAL_COUNT_LIMIT');
    }
    const creditCost = req.user ? calculateGenerationCreditCost(parsed.count, settings) : 0;
    const resolvedReferenceImages = req.user
      ? await resolveReferenceImagePaths(req.user.id, uploadedFiles, newReferenceKeys)
      : await saveGuestReferenceImagePaths(uploadedFiles, newReferenceKeys);
    const referenceImagePaths = resolvedReferenceImages.map((item) => item.storageKey);
    const referenceImagePath = referenceImagePaths.length ? JSON.stringify(referenceImagePaths) : null;

    const connection = await pool.getConnection();
    let generationId: number;
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO generations (user_id, guest_session_id, prompt, model, status, size, quality, count, credit_cost, reference_image_path)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
        [
          req.user?.id || null,
          req.guestSession?.id || null,
          parsed.prompt,
          config.IMAGE_MODEL,
          emptyToNull(parsed.size),
          emptyToNull(parsed.quality),
          parsed.count,
          creditCost,
          referenceImagePath
        ]
      );
      generationId = Number((result as { insertId: number }).insertId);
      if (req.user) {
        await debitGenerationCreditsInConnection(connection, {
          userId: req.user.id,
          generationId,
          creditCost,
          count: parsed.count
        });
      } else if (req.guestSession) {
        await consumeGuestGenerationInConnection(connection, req.guestSession.id);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await enqueueGeneration(generationId);
    await writeAuditLog({
      actor: req.user,
      action: 'generation.created',
      targetType: 'generation',
      targetId: generationId,
      targetUserId: req.user?.id || null,
      metadata: { count: parsed.count, creditCost, guestSessionId: req.guestSession?.id || null },
      req
    });

    const generation = await getGenerationById(generationId, req.user, req.guestSession);
    res.status(202).json({ generation: serializeGeneration(generation) });
  } catch (error) {
    if (newReferenceKeys.length) {
      await Promise.all(newReferenceKeys.map((key) => removeReferenceUpload(key)));
    }
    await Promise.all(uploadedFiles.map((file) => {
      return Promise.all([
        deleteStoredFile(uploadedStorageKey(file.filename)).catch(() => undefined),
        discardUploadedTempFile(file)
      ]);
    }));
    next(error);
  }
});

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 12), 1), 50);
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const ownerType = req.query.ownerType === 'guest' || req.query.ownerType === 'user' ? req.query.ownerType : '';
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['deleted_at IS NULL'];
    const params: Array<string | number> = [];
    if (!req.user && req.guestSession) {
      conditions.push('guest_session_id = ?');
      params.push(req.guestSession.id);
    } else if (!req.user) {
      throw httpError(401, '请先登录或开始游客试用');
    } else if (req.user.role !== 'admin') {
      conditions.push('user_id = ?');
      params.push(req.user.id);
    } else if (typeof req.query.userId === 'string' && Number.isInteger(Number(req.query.userId))) {
      conditions.push('user_id = ?');
      params.push(Number(req.query.userId));
    } else if (ownerType === 'guest') {
      conditions.push('guest_session_id IS NOT NULL');
    } else if (ownerType === 'user') {
      conditions.push('user_id IS NOT NULL');
    }
    if (['pending', 'processing', 'succeeded', 'failed', 'cancelled'].includes(status)) {
      conditions.push('status = ?');
      params.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await getPool().query<Array<{ total: number } & import('mysql2').RowDataPacket>>(
      `SELECT COUNT(*) AS total FROM generations ${where}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await getPool().query<Array<GenerationRow & { owner_email: string | null }>>(
      `SELECT g.*, u.email AS owner_email
       FROM generations g
       LEFT JOIN users u ON u.id = g.user_id
       ${where.replaceAll('user_id', 'g.user_id').replaceAll('guest_session_id', 'g.guest_session_id').replaceAll('deleted_at', 'g.deleted_at').replaceAll('status', 'g.status')}
       ORDER BY g.created_at DESC, g.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const ids = rows.map((row) => row.id);
    const images = ids.length ? await getImagesForGenerations(ids) : [];
    const byGeneration = new Map<number, GenerationImageRow[]>();
    for (const image of images) {
      const list = byGeneration.get(image.generation_id) || [];
      list.push(image);
      byGeneration.set(image.generation_id, list);
    }

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
      items: rows.map((row) => serializeGeneration({ ...row, images: byGeneration.get(row.id) || [] }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/meta/summary', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user && !req.guestSession) throw httpError(401, '请先登录或开始游客试用');
    const where = req.user?.role === 'admin'
      ? 'WHERE deleted_at IS NULL'
      : req.user
        ? 'WHERE user_id = ? AND deleted_at IS NULL'
        : 'WHERE guest_session_id = ? AND deleted_at IS NULL';
    const params = req.user?.role === 'admin' ? [] : [req.user?.id || req.guestSession?.id || 0];
    const [statusRows] = await getPool().query<Array<{ status: string; total: number } & import('mysql2').RowDataPacket>>(
      `SELECT status, COUNT(*) AS total FROM generations ${where} GROUP BY status`,
      params
    );
    const statusCounts = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.total)]));
    const queue = await getQueueSummary();
    res.json({ statusCounts, queue });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Invalid generation id' });
      return;
    }

    const generation = await getGenerationById(id, req.user, req.guestSession);
    res.json({ generation: serializeGeneration(generation) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/retry', requireActiveUser, async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Invalid generation id' });
      return;
    }

    const original = await getGenerationById(id, req.user);
    if (!original.user_id) throw httpError(403, '游客生成任务不支持重试');
    const settings = await getAppSettings({ includeSecrets: true }) as AppSettings;
    const creditCost = calculateGenerationCreditCost(original.count, settings);
    const pool = getPool();
    const connection = await pool.getConnection();
    let generationId: number;
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO generations (user_id, prompt, model, status, size, quality, count, credit_cost, reference_image_path)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
        [
          original.user_id,
          original.prompt,
          original.model,
          original.size,
          original.quality,
          original.count,
          creditCost,
          original.reference_image_path
        ]
      );
      generationId = Number((result as { insertId: number }).insertId);
      await debitGenerationCreditsInConnection(connection, {
        userId: original.user_id,
        generationId,
        creditCost,
        count: original.count
      });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    await enqueueGeneration(generationId);
    await writeAuditLog({
      actor: req.user,
      action: 'generation.retried',
      targetType: 'generation',
      targetId: generationId,
      targetUserId: original.user_id,
      metadata: { originalGenerationId: id, creditCost },
      req
    });
    const generation = await getGenerationById(generationId, req.user);
    res.status(202).json({ generation: serializeGeneration(generation) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/cancel', requireActiveUser, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, '请先登录');
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Invalid generation id' });
      return;
    }

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<GenerationRow[]>(
        'SELECT * FROM generations WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      const generation = rows[0];
      if (!generation) throw httpError(404, 'Generation not found');
      if (req.user.role !== 'admin' && generation.user_id !== req.user.id) {
        throw httpError(403, '无权取消该生成任务');
      }
      if (generation.status !== 'pending') {
        throw httpError(409, '任务已开始生成，无法取消', 'GENERATION_NOT_PENDING');
      }

      const completedAt = new Date();
      await connection.execute(
        `UPDATE generations
         SET status = 'cancelled', completed_at = ?, duration_ms = ?, error_message = ?
         WHERE id = ? AND status = 'pending'`,
        [
          completedAt,
          generation.created_at ? completedAt.getTime() - generation.created_at.getTime() : null,
          '用户取消生成',
          generation.id
        ]
      );
      const refund = await refundCancelledGenerationCreditsInConnection(connection, generation.id, req.user.id);
      await connection.commit();

      const removedQueueItems = await removeGenerationFromQueue(generation.id);
      await writeAuditLog({
        actor: req.user,
        action: 'generation.cancelled',
        targetType: 'generation',
        targetId: generation.id,
        targetUserId: generation.user_id,
        metadata: {
          creditRefunded: refund?.balanceAfter == null ? 0 : generation.credit_cost,
          removedQueueItems
        },
        req
      });

      const updated = await getGenerationById(generation.id, req.user);
      res.json({ generation: serializeGeneration(updated), removedQueueItems });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Invalid generation id' });
      return;
    }

    const generation = await getGenerationById(id, req.user);
    await getPool().execute(
      'UPDATE generations SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ? AND deleted_at IS NULL',
      [req.user?.id || null, id]
    );

    await writeAuditLog({
      actor: req.user,
      action: 'generation.soft_deleted',
      targetType: 'generation',
      targetId: id,
      targetUserId: generation.user_id,
      req
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

async function getGenerationById(id: number, user?: AuthenticatedRequest['user'], guestSession?: AuthenticatedRequest['guestSession']) {
  const [rows] = await getPool().query<GenerationRow[]>('SELECT * FROM generations WHERE id = ? AND deleted_at IS NULL', [id]);
  const row = rows[0];
  if (!row) {
    const error = new Error('Generation not found');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  if (!user && !guestSession) throw httpError(401, '请先登录或开始游客试用');
  if (guestSession) {
    if (row.guest_session_id !== guestSession.id) throw httpError(403, '无权访问该生成记录');
  }
  if (user && user.role !== 'admin' && row.user_id !== user.id) {
    throw httpError(403, '无权访问该生成记录');
  }

  const [images] = await getPool().query<GenerationImageRow[]>(
    'SELECT * FROM generation_images WHERE generation_id = ? ORDER BY id ASC',
    [id]
  );

  return { ...row, images };
}

async function getImagesForGenerations(ids: number[]) {
  const placeholders = ids.map(() => '?').join(',');
  const [images] = await getPool().query<GenerationImageRow[]>(
    `SELECT * FROM generation_images WHERE generation_id IN (${placeholders}) ORDER BY id ASC`,
    ids
  );
  return images;
}

function emptyToNull(value?: string) {
  return value?.trim() ? value.trim() : null;
}

function getUploadedFiles(files: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] } | undefined) {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
}

async function resolveReferenceImagePaths(userId: number, files: Express.Multer.File[], newReferenceKeys: string[]) {
  const paths: Array<{ storageKey: string; isNew: boolean }> = [];
  for (const file of files) {
    const resolved = await resolveReferenceImagePath(userId, file);
    if (resolved.isNew) newReferenceKeys.push(resolved.storageKey);
    paths.push(resolved);
  }
  return paths;
}

async function resolveReferenceImagePath(userId: number, file: Express.Multer.File) {
  const hash = await sha256File(file.path);
  const storageKey = uploadedStorageKey(file.filename);
  const pool = getPool();

  const [existingRows] = await pool.query<Array<{ storage_key: string } & import('mysql2').RowDataPacket>>(
    'SELECT storage_key FROM reference_uploads WHERE user_id = ? AND content_sha256 = ? LIMIT 1',
    [userId, hash]
  );
  const existingKey = existingRows[0]?.storage_key;
  if (existingKey) {
    await discardUploadedTempFile(file);
    return { storageKey: existingKey, isNew: false };
  }

  await saveUploadedTempFile(file);

  const [insertResult] = await pool.execute<ResultSetHeader>(
    `INSERT IGNORE INTO reference_uploads (user_id, content_sha256, storage_key, mime_type, byte_size, original_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, hash, storageKey, file.mimetype, file.size, file.originalname]
  );
  if (insertResult.affectedRows < 1) {
    const [rows] = await pool.query<Array<{ storage_key: string } & import('mysql2').RowDataPacket>>(
      'SELECT storage_key FROM reference_uploads WHERE user_id = ? AND content_sha256 = ? LIMIT 1',
      [userId, hash]
    );
    const insertedKey = rows[0]?.storage_key;
    if (insertedKey) {
      await deleteStoredFile(storageKey).catch(() => undefined);
      return { storageKey: insertedKey, isNew: false };
    }
  }
  return { storageKey, isNew: true };
}

async function saveGuestReferenceImagePaths(files: Express.Multer.File[], newReferenceKeys: string[]) {
  const paths: Array<{ storageKey: string; isNew: boolean }> = [];
  for (const file of files) {
    const storageKey = await saveUploadedTempFile(file);
    newReferenceKeys.push(storageKey);
    paths.push({ storageKey, isNew: true });
  }
  return paths;
}

async function removeReferenceUpload(storageKey: string) {
  await getPool().execute('DELETE FROM reference_uploads WHERE storage_key = ?', [storageKey]).catch(() => undefined);
  await deleteStoredFile(storageKey).catch(() => undefined);
}

async function sha256File(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export { router as generationsRouter };
