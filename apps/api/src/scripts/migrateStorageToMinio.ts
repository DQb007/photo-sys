import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { ensureMinioBucket, storageObjectExists, uploadLocalFileToStorage } from '../storage.js';

interface MigrationCandidate {
  storageKey: string;
  absolutePath: string;
  size: number;
}

const shouldApply = process.argv.includes('--apply');
const shouldVerbose = process.argv.includes('--verbose');
const shouldOverwrite = process.argv.includes('--overwrite');

async function main() {
  if (config.STORAGE_DRIVER !== 'minio') {
    throw new Error('Set STORAGE_DRIVER=minio before running storage migration.');
  }

  if (config.MINIO_AUTO_CREATE_BUCKET) {
    await ensureMinioBucket();
  }
  const candidates = await listStorageFiles(config.storageDir);
  let skipped = 0;
  let uploaded = 0;
  let failed = 0;
  let bytesToUpload = 0;

  console.log(`Storage migration mode: ${shouldApply ? 'apply' : 'dry-run'}`);
  console.log(`Bucket: ${config.MINIO_BUCKET}`);
  console.log(`Local storage dir: ${config.storageDir}`);
  console.log(`Local files found: ${candidates.length}`);
  console.log(`Overwrite existing objects: ${shouldOverwrite ? 'yes' : 'no'}`);

  for (const candidate of candidates) {
    const exists = !shouldOverwrite && await canConfirmObjectExists(candidate.storageKey);
    if (exists) {
      skipped += 1;
      if (shouldVerbose) console.log(`SKIP ${candidate.storageKey}`);
      continue;
    }

    bytesToUpload += candidate.size;
    if (!shouldApply) {
      console.log(`WOULD UPLOAD ${candidate.storageKey} (${formatBytes(candidate.size)})`);
      continue;
    }

    try {
      await uploadLocalFileToStorage(candidate.storageKey, candidate.absolutePath);
      uploaded += 1;
      if (shouldVerbose) console.log(`UPLOAD ${candidate.storageKey} (${formatBytes(candidate.size)})`);
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${candidate.storageKey}: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`Existing objects skipped: ${skipped}`);
  console.log(`${shouldApply ? 'Uploaded' : 'Would upload'} files: ${shouldApply ? uploaded : candidates.length - skipped}`);
  console.log(`${shouldApply ? 'Uploaded' : 'Would upload'} bytes: ${formatBytes(bytesToUpload)}`);

  if (failed > 0) {
    console.error(`Failed uploads: ${failed}`);
    process.exitCode = 1;
  }
}

async function canConfirmObjectExists(storageKey: string) {
  try {
    return await storageObjectExists(storageKey);
  } catch (error) {
    if (isAccessDeniedError(error)) {
      if (shouldVerbose) console.warn(`Cannot stat ${storageKey}; upload will be attempted.`);
      return false;
    }
    throw error;
  }
}

async function listStorageFiles(root: string) {
  const files: MigrationCandidate[] = [];
  await walk(root, files);
  return files;
}

async function walk(directory: string, files: MigrationCandidate[]) {
  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return;
    throw error;
  }

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolutePath, files);
      continue;
    }
    if (!entry.isFile()) continue;

    const storageKey = path.relative(config.storageDir, absolutePath).replaceAll('\\', '/');
    if (!storageKey.startsWith('uploads/') && !storageKey.startsWith('generated/')) continue;
    const stat = await fs.stat(absolutePath);
    files.push({ storageKey, absolutePath, size: stat.size });
  }
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

function isMissingPathError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT';
}

function isAccessDeniedError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && String((error as { code?: unknown }).code) === 'AccessDenied';
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
