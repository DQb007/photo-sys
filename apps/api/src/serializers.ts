import { config } from './config.js';
import type { GenerationImageRow, GenerationRow } from './db.js';

export interface GenerationWithImages extends GenerationRow {
  images?: GenerationImageRow[];
}

export function serializeGeneration(row: GenerationWithImages) {
  return {
    id: row.id,
    userId: row.user_id,
    prompt: row.prompt,
    model: row.model,
    status: row.status,
    size: row.size,
    quality: row.quality,
    count: row.count,
    referenceImageUrl: firstReferenceImageUrl(row.reference_image_path),
    referenceImageUrls: referenceImageUrls(row.reference_image_path),
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images: row.images?.map((image) => ({
      id: image.id,
      url: fileUrl(image.file_path),
      mimeType: image.mime_type,
      width: image.width,
      height: image.height,
      createdAt: image.created_at
    })) ?? []
  };
}

export function fileUrl(storageKey: string) {
  const cleanKey = storageKey.replaceAll('\\', '/');
  return `${config.PUBLIC_BASE_URL}/files/${cleanKey}`;
}

function referenceImageUrls(value: string | null) {
  return parseReferenceImagePaths(value).map((item) => fileUrl(item));
}

function firstReferenceImageUrl(value: string | null) {
  return referenceImageUrls(value)[0] || null;
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
