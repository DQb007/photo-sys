import fs from 'node:fs/promises';
import path from 'node:path';
import { getPool } from '../db.js';
import { getUploadsDir } from '../storage.js';
import { config } from '../config.js';

interface CleanupCandidate {
  storageKey: string;
  absolutePath: string;
  size: number;
}

const shouldApply = process.argv.includes('--apply');
const shouldVerbose = process.argv.includes('--verbose');

async function main() {
  const uploadsDir = getUploadsDir();
  await fs.mkdir(uploadsDir, { recursive: true });

  const protectedKeys = await getProtectedUploadKeys();
  const uploadedFiles = await listUploadedFiles(uploadsDir);
  const candidates = uploadedFiles.filter((file) => !protectedKeys.has(file.storageKey));
  const totalBytes = candidates.reduce((sum, file) => sum + file.size, 0);

  console.log(`Uploads cleanup mode: ${shouldApply ? 'apply' : 'dry-run'}`);
  console.log(`Protected upload files: ${protectedKeys.size}`);
  console.log(`Files on disk: ${uploadedFiles.length}`);
  console.log(`Cleanup candidates: ${candidates.length}`);
  console.log(`Candidate bytes: ${formatBytes(totalBytes)}`);

  if (shouldVerbose || !shouldApply) {
    for (const candidate of candidates) {
      console.log(`${shouldApply ? 'DELETE' : 'WOULD DELETE'} ${candidate.storageKey} (${formatBytes(candidate.size)})`);
    }
  }

  if (!shouldApply) {
    console.log('Dry-run only. Re-run with --apply to delete these files.');
    await getPool().end();
    return;
  }

  for (const candidate of candidates) {
    await fs.rm(candidate.absolutePath, { force: true });
  }

  console.log(`Deleted ${candidates.length} upload files (${formatBytes(totalBytes)}).`);
  await getPool().end();
}

async function getProtectedUploadKeys() {
  const keys = new Set<string>();
  const pool = getPool();

  const [generationRows] = await pool.query<Array<{ reference_image_path: string | null } & import('mysql2').RowDataPacket>>(
    `SELECT reference_image_path
     FROM generations
     WHERE deleted_at IS NULL
       AND reference_image_path IS NOT NULL
       AND reference_image_path <> ''`
  );
  for (const row of generationRows) {
    for (const storageKey of parseReferenceImagePaths(row.reference_image_path)) {
      if (storageKey.startsWith('uploads/')) keys.add(storageKey);
    }
  }

  try {
    const [referenceRows] = await pool.query<Array<{ storage_key: string } & import('mysql2').RowDataPacket>>(
      `SELECT storage_key
       FROM reference_uploads
       WHERE storage_key LIKE 'uploads/%'`
    );
    for (const row of referenceRows) {
      keys.add(row.storage_key.replaceAll('\\', '/'));
    }
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    console.warn('reference_uploads table not found; run the latest migration before relying on dedup metadata.');
  }

  return keys;
}

async function listUploadedFiles(root: string) {
  const files: CleanupCandidate[] = [];
  await walk(root, files);
  return files;
}

async function walk(directory: string, files: CleanupCandidate[]) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolutePath, files);
      continue;
    }
    if (!entry.isFile()) continue;

    const relativeKey = path.relative(config.storageDir, absolutePath).replaceAll('\\', '/');
    if (!relativeKey.startsWith('uploads/')) continue;
    const stat = await fs.stat(absolutePath);
    files.push({ storageKey: relativeKey, absolutePath, size: stat.size });
  }
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function isMissingTableError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'ER_NO_SUCH_TABLE';
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await getPool().end().catch(() => undefined);
  process.exitCode = 1;
});
