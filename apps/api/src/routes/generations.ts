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

const createGenerationSchema = z.object({
  prompt: z.string().trim().min(1, '请输入提示词').max(8000),
  size: z.string().trim().max(50).optional().or(z.literal('')),
  quality: z.string().trim().max(50).optional().or(z.literal('')),
  count: z.coerce.number().int().min(1).max(4).default(1)
});

router.post('/', upload.array('referenceImages', 4), async (req, res, next) => {
  const uploadedFiles = getUploadedFiles(req.files);

  try {
    const parsed = createGenerationSchema.parse(req.body);
    const pool = getPool();
    const referenceImagePaths = uploadedFiles.map((file) =>
      path.relative(config.storageDir, file.path).replaceAll('\\', '/')
    );
    const referenceImagePath = referenceImagePaths.length ? JSON.stringify(referenceImagePaths) : null;

    const [result] = await pool.execute(
      `INSERT INTO generations (prompt, model, status, size, quality, count, reference_image_path)
       VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
      [
        parsed.prompt,
        config.IMAGE_MODEL,
        emptyToNull(parsed.size),
        emptyToNull(parsed.quality),
        parsed.count,
        referenceImagePath
      ]
    );

    const generationId = Number((result as { insertId: number }).insertId);

    await enqueueGeneration(generationId);

    const generation = await getGenerationById(generationId);
    res.status(202).json({ generation: serializeGeneration(generation) });
  } catch (error) {
    await Promise.all(uploadedFiles.map((file) => {
      const key = path.relative(config.storageDir, file.path).replaceAll('\\', '/');
      return deleteStoredFile(key).catch(() => undefined);
    }));
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 12), 1), 50);
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const offset = (page - 1) * pageSize;

    const where = ['pending', 'processing', 'succeeded', 'failed'].includes(status) ? 'WHERE status = ?' : '';
    const params = where ? [status] : [];

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

router.get('/meta/summary', async (_req, res, next) => {
  try {
    const [statusRows] = await getPool().query<Array<{ status: string; total: number } & import('mysql2').RowDataPacket>>(
      'SELECT status, COUNT(*) AS total FROM generations GROUP BY status'
    );
    const statusCounts = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.total)]));
    const queue = await getQueueSummary();
    res.json({ statusCounts, queue });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Invalid generation id' });
      return;
    }

    const generation = await getGenerationById(id);
    res.json({ generation: serializeGeneration(generation) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/retry', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Invalid generation id' });
      return;
    }

    const original = await getGenerationById(id);
    const [result] = await getPool().execute(
      `INSERT INTO generations (prompt, model, status, size, quality, count, reference_image_path)
       VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
      [
        original.prompt,
        original.model,
        original.size,
        original.quality,
        original.count,
        original.reference_image_path
      ]
    );
    const generationId = Number((result as { insertId: number }).insertId);
    await enqueueGeneration(generationId);
    const generation = await getGenerationById(generationId);
    res.status(202).json({ generation: serializeGeneration(generation) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Invalid generation id' });
      return;
    }

    const generation = await getGenerationById(id);
    const files = [
      ...parseReferenceImagePaths(generation.reference_image_path),
      ...(generation.images || []).map((image) => image.file_path)
    ];

    await getPool().execute('DELETE FROM generations WHERE id = ?', [id]);

    await Promise.all(files.map((file) => deleteStoredFile(file).catch(() => undefined)));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

async function getGenerationById(id: number) {
  const [rows] = await getPool().query<GenerationRow[]>('SELECT * FROM generations WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) {
    const error = new Error('Generation not found');
    (error as Error & { status?: number }).status = 404;
    throw error;
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

function parseReferenceImagePaths(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    return [value];
  }
  return [value];
}

export { router as generationsRouter };
