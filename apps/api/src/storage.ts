import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config } from './config.js';

export async function ensureStorageDirs() {
  await fs.mkdir(getUploadsDir(), { recursive: true });
  await fs.mkdir(getGeneratedDir(), { recursive: true });
}

export function getUploadsDir() {
  return path.join(config.storageDir, 'uploads');
}

export function getGeneratedDir() {
  return path.join(config.storageDir, 'generated');
}

export function makeUploadFilename(originalName: string) {
  const ext = safeExt(originalName) || '.png';
  return `${Date.now()}-${nanoid(10)}${ext}`;
}

export function makeGeneratedFilename(generationId: number, index: number, mimeType: string) {
  const ext = mimeType === 'image/webp' ? '.webp' : mimeType === 'image/jpeg' ? '.jpg' : '.png';
  return `${generationId}-${index}-${nanoid(10)}${ext}`;
}

export async function saveGeneratedImage(generationId: number, index: number, base64: string, mimeType: string) {
  const filename = makeGeneratedFilename(generationId, index, mimeType);
  const absolutePath = path.join(getGeneratedDir(), filename);
  await fs.writeFile(absolutePath, Buffer.from(base64, 'base64'));
  return path.relative(config.storageDir, absolutePath).replaceAll('\\', '/');
}

export async function deleteStoredFile(storageKey: string | null) {
  if (!storageKey) return;

  const absolutePath = resolveStorageKey(storageKey);
  await fs.rm(absolutePath, { force: true });
}

export function resolveStorageKey(storageKey: string) {
  const normalized = storageKey.replaceAll('\\', '/');
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

function safeExt(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return ext;
  return '';
}

