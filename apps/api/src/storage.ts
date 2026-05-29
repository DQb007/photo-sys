import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type express from 'express';
import mime from 'mime-types';
import { Client, type BucketItemStat } from 'minio';
import { nanoid } from 'nanoid';
import { config } from './config.js';

let minioClient: Client | null = null;

export async function ensureStorageDirs() {
  await fs.mkdir(getUploadsDir(), { recursive: true });
  await fs.mkdir(getGeneratedDir(), { recursive: true });
  await fs.mkdir(getTempUploadsDir(), { recursive: true });

  if (config.STORAGE_DRIVER === 'minio' && config.MINIO_AUTO_CREATE_BUCKET) {
    await ensureMinioBucket();
  }
}

export async function ensureMinioBucket() {
  const client = getMinioClient();
  const exists = await client.bucketExists(config.MINIO_BUCKET);
  if (!exists) await client.makeBucket(config.MINIO_BUCKET);
}

export function getUploadsDir() {
  return path.join(config.storageDir, 'uploads');
}

export function getGeneratedDir() {
  return path.join(config.storageDir, 'generated');
}

export function getTempUploadsDir() {
  return path.join(config.storageDir, 'tmp', 'uploads');
}

export function makeUploadFilename(originalName: string) {
  const ext = safeExt(originalName) || '.png';
  return `${Date.now()}-${nanoid(10)}${ext}`;
}

export function makeGeneratedFilename(generationId: number, index: number, mimeType: string) {
  const ext = mimeType === 'image/webp' ? '.webp' : mimeType === 'image/jpeg' ? '.jpg' : '.png';
  return `${generationId}-${index}-${nanoid(10)}${ext}`;
}

export function uploadedStorageKey(filename: string) {
  return keyFromFileRoute('uploads', filename);
}

export async function saveUploadedTempFile(file: Express.Multer.File) {
  const storageKey = uploadedStorageKey(file.filename);
  if (config.STORAGE_DRIVER === 'local') {
    const destination = resolveStorageKey(storageKey);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(file.path, destination);
    return storageKey;
  }

  try {
    await uploadLocalFileToStorage(storageKey, file.path, file.mimetype);
  } finally {
    await discardUploadedTempFile(file);
  }
  return storageKey;
}

export async function discardUploadedTempFile(file: Express.Multer.File) {
  await fs.rm(file.path, { force: true }).catch(() => undefined);
}

export async function saveGeneratedImage(generationId: number, index: number, base64: string, mimeType: string) {
  const filename = makeGeneratedFilename(generationId, index, mimeType);
  const storageKey = keyFromFileRoute('generated', filename);
  const buffer = Buffer.from(base64, 'base64');

  if (config.STORAGE_DRIVER === 'local') {
    const absolutePath = resolveStorageKey(storageKey);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    return storageKey;
  }

  await getMinioClient().putObject(config.MINIO_BUCKET, storageKey, buffer, buffer.length, {
    'Content-Type': mimeType
  });
  return storageKey;
}

export async function readStoredFile(storageKey: string) {
  if (config.STORAGE_DRIVER === 'local') {
    return fs.readFile(resolveStorageKey(storageKey));
  }

  try {
    const stream = await getMinioClient().getObject(config.MINIO_BUCKET, normalizeStorageKey(storageKey));
    return await streamToBuffer(stream);
  } catch (error) {
    if (!shouldFallbackToLocal(error)) throw error;
    return fs.readFile(resolveStorageKey(storageKey));
  }
}

export async function sendStoredFile(storageKey: string, req: express.Request, res: express.Response, options: { downloadName?: string } = {}) {
  const contentType = mime.lookup(storageKey) || 'application/octet-stream';
  res.type(contentType);
  if (options.downloadName) res.attachment(options.downloadName);

  if (config.STORAGE_DRIVER === 'local') {
    await applyLocalCacheHeaders(storageKey, req, res);
    if (res.headersSent) return;
    res.sendFile(resolveStorageKey(storageKey));
    return;
  }

  let stream: Readable;
  try {
    await applyMinioCacheHeaders(storageKey, req, res);
    if (res.headersSent) return;
    stream = await getMinioClient().getObject(config.MINIO_BUCKET, normalizeStorageKey(storageKey));
  } catch (error) {
    if (!shouldFallbackToLocal(error)) throw error;
    await applyLocalCacheHeaders(storageKey, req, res);
    if (res.headersSent) return;
    res.sendFile(resolveStorageKey(storageKey));
    return;
  }
  stream.on('error', (error) => {
    if (!res.headersSent) res.status(500).json({ error: error.message });
    else res.destroy(error);
  });
  stream.pipe(res);
}

export async function deleteStoredFile(storageKey: string | null) {
  if (!storageKey) return;

  if (config.STORAGE_DRIVER === 'local') {
    await fs.rm(resolveStorageKey(storageKey), { force: true });
    return;
  }

  await getMinioClient().removeObject(config.MINIO_BUCKET, normalizeStorageKey(storageKey));
}

export async function storageObjectExists(storageKey: string) {
  try {
    await statStoredFile(storageKey);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

export async function statStoredFile(storageKey: string): Promise<{ size: number; contentType?: string }> {
  if (config.STORAGE_DRIVER === 'local') {
    const stat = await fs.stat(resolveStorageKey(storageKey));
    return { size: stat.size, contentType: mime.lookup(storageKey) || undefined };
  }

  const stat = await getMinioClient().statObject(config.MINIO_BUCKET, normalizeStorageKey(storageKey)) as BucketItemStat;
  return { size: stat.size, contentType: stat.metaData?.['content-type'] };
}

export async function uploadLocalFileToStorage(storageKey: string, filePath: string, contentType?: string) {
  const key = normalizeStorageKey(storageKey);
  if (config.STORAGE_DRIVER === 'local') {
    const destination = resolveStorageKey(key);
    if (path.resolve(filePath) === destination) return;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(filePath, destination);
    return;
  }

  await getMinioClient().fPutObject(config.MINIO_BUCKET, key, filePath, {
    'Content-Type': contentType || mime.lookup(key) || 'application/octet-stream'
  });
}

export function resolveStorageKey(storageKey: string) {
  const normalized = normalizeStorageKey(storageKey);
  const absolutePath = path.resolve(config.storageDir, normalized);
  const root = path.resolve(config.storageDir);
  if (!absolutePath.startsWith(root + path.sep) && absolutePath !== root) {
    throw new Error('Invalid storage path');
  }
  return absolutePath;
}

export function keyFromFileRoute(folder: 'uploads' | 'generated', filename: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    throw new Error('Invalid filename');
  }
  return `${folder}/${filename}`;
}

export function normalizeStorageKey(storageKey: string) {
  const normalized = storageKey.replaceAll('\\', '/').replace(/^\/+/, '');
  if (normalized.includes('..') || normalized.startsWith('/')) {
    throw new Error('Invalid storage path');
  }
  if (!normalized.startsWith('uploads/') && !normalized.startsWith('generated/')) {
    throw new Error('Invalid storage folder');
  }
  return normalized;
}

export function getMinioClient() {
  if (!config.MINIO_ENDPOINT || !config.MINIO_ACCESS_KEY || !config.MINIO_SECRET_KEY) {
    throw new Error('MinIO storage requires MINIO_ENDPOINT, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY');
  }

  minioClient ||= new Client({
    endPoint: config.MINIO_ENDPOINT,
    port: config.MINIO_PORT,
    useSSL: config.MINIO_USE_SSL,
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY
  });
  return minioClient;
}

function safeExt(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return ext;
  return '';
}

function streamToBuffer(stream: Readable) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function isNotFoundError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && ['NotFound', 'NoSuchKey'].includes(String((error as { code?: unknown }).code));
}

function shouldFallbackToLocal(error: unknown) {
  return config.MINIO_FALLBACK_TO_LOCAL && isNotFoundError(error);
}

async function applyLocalCacheHeaders(storageKey: string, req: express.Request, res: express.Response) {
  const stat = await fs.stat(resolveStorageKey(storageKey));
  applyCacheHeaders(req, res, {
    etag: weakEtag(stat.size, stat.mtimeMs),
    lastModified: stat.mtime,
    size: stat.size
  });
}

async function applyMinioCacheHeaders(storageKey: string, req: express.Request, res: express.Response) {
  try {
    const stat = await getMinioClient().statObject(config.MINIO_BUCKET, normalizeStorageKey(storageKey)) as BucketItemStat;
    applyCacheHeaders(req, res, {
      etag: stat.etag ? `"${stat.etag}"` : weakEtag(stat.size, stat.lastModified?.getTime() || 0),
      lastModified: stat.lastModified,
      size: stat.size
    });
  } catch (error) {
    if (isNotFoundError(error)) throw error;
    applyCacheHeaders(req, res, { etag: storageKeyEtag(storageKey) });
  }
}

function applyCacheHeaders(req: express.Request, res: express.Response, input: { etag: string; lastModified?: Date; size?: number }) {
  res.setHeader('Cache-Control', 'private, max-age=2592000, immutable');
  res.setHeader('ETag', input.etag);
  if (input.lastModified) res.setHeader('Last-Modified', input.lastModified.toUTCString());
  if (input.size != null) res.setHeader('Content-Length', String(input.size));

  if (etagMatches(req.headers['if-none-match'], input.etag)) {
    res.status(304).end();
    return;
  }

  const ifModifiedSince = req.headers['if-modified-since'];
  if (input.lastModified && typeof ifModifiedSince === 'string') {
    const since = Date.parse(ifModifiedSince);
    if (!Number.isNaN(since) && Math.floor(input.lastModified.getTime() / 1000) <= Math.floor(since / 1000)) {
      res.status(304).end();
    }
  }
}

function weakEtag(size: number, mtimeMs: number) {
  return `W/"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

function storageKeyEtag(storageKey: string) {
  return `W/"${Buffer.from(storageKey).toString('base64url')}"`;
}

function etagMatches(header: string | string[] | undefined, etag: string) {
  const values = Array.isArray(header) ? header : header ? [header] : [];
  return values.some((value) => value
    .split(',')
    .map((item) => item.trim())
    .some((item) => item === '*' || normalizeEtag(item) === normalizeEtag(etag)));
}

function normalizeEtag(value: string) {
  return value.replace(/^W\//, '').replace(/^"|"$/g, '');
}
