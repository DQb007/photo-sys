import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { getPool, type GenerationImageRow, type GenerationRow } from '../db.js';
import {
  deleteStoredFile,
  getUploadsDir,
  makeUploadFilename,
} from '../storage.js';
import { serializeGeneration } from '../serializers.js';
import { enqueueGeneration, getQueueSummary } from '../queue.js';
import { requireActiveUser, requireUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { httpError } from '../errors.js';
import { writeAuditLog } from '../audit.js';
import {
  calculateGenerationCreditCost,
  debitGenerationCreditsInConnection
} from '../credits.js';
import { getAppSettings, type AppSettings } from '../settingsService.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadsDir()),
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

router.use(requireUser);

const createGenerationSchema = z.object({
  prompt: z.string().trim().min(1, '请输入提示词').max(8000),
  size: z.string().trim().max(50).optional().or(z.literal('')),
  quality: z.string().trim().max(50).optional().or(z.literal('')),
  count: z.coerce.number().int().min(1).max(4).default(1)
});

router.post('/', requireActiveUser, upload.array('referenceImages', 4), async (req: AuthenticatedRequest, res, next) => {
  const uploadedFiles = getUploadedFiles(req.files);

  try {
    if (!req.user) throw httpError(401, '请先登录');
    const parsed = createGenerationSchema.parse(req.body);
    const pool = getPool();
    const settings = await getAppSettings({ includeSecrets: true }) as AppSettings;
    const creditCost = calculateGenerationCreditCost(parsed.count, settings);
    const referenceImagePaths = uploadedFiles.map((file) =>
      path.relative(config.storageDir, file.path).replaceAll('\\', '/')
    );
    const referenceImagePath = referenceImagePaths.length ? JSON.stringify(referenceImagePaths) : null;

    const connection = await pool.getConnection();
    let generationId: number;
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO generations (user_id, prompt, model, status, size, quality, count, credit_cost, reference_image_path)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
        [
          req.user.id,
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
      await debitGenerationCreditsInConnection(connection, {
        userId: req.user.id,
        generationId,
        creditCost,
        count: parsed.count
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
      action: 'generation.created',
      targetType: 'generation',
      targetId: generationId,
      targetUserId: req.user.id,
      metadata: { count: parsed.count, creditCost },
      req
    });

    const generation = await getGenerationById(generationId, req.user);
    res.status(202).json({ generation: serializeGeneration(generation) });
  } catch (error) {
    await Promise.all(uploadedFiles.map((file) => {
      const key = path.relative(config.storageDir, file.path).replaceAll('\\', '/');
      return deleteStoredFile(key).catch(() => undefined);
    }));
    next(error);
  }
});

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, '请先登录');
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 12), 1), 50);
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['deleted_at IS NULL'];
    const params: Array<string | number> = [];
    if (req.user.role !== 'admin') {
      conditions.push('user_id = ?');
      params.push(req.user.id);
    } else if (typeof req.query.userId === 'string' && Number.isInteger(Number(req.query.userId))) {
      conditions.push('user_id = ?');
      params.push(Number(req.query.userId));
    }
    if (['pending', 'processing', 'succeeded', 'failed'].includes(status)) {
      conditions.push('status = ?');
      params.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await getPool().query<Array<{ total: number } & import('mysql2').RowDataPacket>>(
      `SELECT COUNT(*) AS total FROM generations ${where}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await getPool().query<GenerationRow[]>(
      `SELECT * FROM generations ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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
    if (!req.user) throw httpError(401, '请先登录');
    const where = req.user.role === 'admin' ? 'WHERE deleted_at IS NULL' : 'WHERE user_id = ? AND deleted_at IS NULL';
    const params = req.user.role === 'admin' ? [] : [req.user.id];
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

    const generation = await getGenerationById(id, req.user);
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

async function getGenerationById(id: number, user?: AuthenticatedRequest['user']) {
  const [rows] = await getPool().query<GenerationRow[]>('SELECT * FROM generations WHERE id = ? AND deleted_at IS NULL', [id]);
  const row = rows[0];
  if (!row) {
    const error = new Error('Generation not found');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  if (!user) throw httpError(401, '请先登录');
  if (user.role !== 'admin' && row.user_id !== user.id) {
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

export { router as generationsRouter };
