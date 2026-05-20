import express from 'express';
import mime from 'mime-types';
import { requireUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { getPool } from '../db.js';
import { httpError } from '../errors.js';
import { keyFromFileRoute, resolveStorageKey } from '../storage.js';

const router = express.Router();

router.get('/:folder/:filename', requireUser, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, '请先登录');
    const folder = stringParam(req.params.folder);
    if (folder !== 'uploads' && folder !== 'generated') {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const filename = stringParam(req.params.filename);
    const key = keyFromFileRoute(folder, filename);
    await assertCanAccessFile(key, req.user);
    const absolutePath = resolveStorageKey(key);
    res.type(mime.lookup(absolutePath) || 'application/octet-stream');
    if (req.query.download === '1') {
      res.attachment(filename);
    }
    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
});

async function assertCanAccessFile(storageKey: string, user: NonNullable<AuthenticatedRequest['user']>) {
  const [generatedRows] = await getPool().query<Array<{ user_id: number } & import('mysql2').RowDataPacket>>(
    `SELECT g.user_id
     FROM generation_images gi
     INNER JOIN generations g ON g.id = gi.generation_id
     WHERE gi.file_path = ?
     LIMIT 1`,
    [storageKey]
  );

  const generatedOwner = generatedRows[0]?.user_id;
  if (generatedOwner) {
    if (user.role === 'admin' || generatedOwner === user.id) return;
    throw httpError(403, '无权访问该文件');
  }

  const [referenceRows] = await getPool().query<Array<{ user_id: number; reference_image_path: string | null } & import('mysql2').RowDataPacket>>(
    `SELECT user_id, reference_image_path
     FROM generations
     WHERE reference_image_path IS NOT NULL
       AND reference_image_path LIKE ?
     LIMIT 20`,
    [`%${storageKey}%`]
  );

  for (const row of referenceRows) {
    if (!parseReferenceImagePaths(row.reference_image_path).includes(storageKey)) continue;
    if (user.role === 'admin' || row.user_id === user.id) return;
    throw httpError(403, '无权访问该文件');
  }

  throw httpError(404, 'File not found');
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

function stringParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export { router as filesRouter };
