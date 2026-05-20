import fs from 'node:fs/promises';
import { getPool, type GenerationRow } from './db.js';
import { generateImages } from './relay.js';
import { resolveStorageKey, saveGeneratedImage } from './storage.js';

export async function processGeneration(generationId: number) {
  const pool = getPool();
  const startedAt = new Date();

  await pool.execute(
    `UPDATE generations
     SET status = 'processing', started_at = ?, completed_at = NULL, duration_ms = NULL, error_message = NULL
     WHERE id = ? AND deleted_at IS NULL`,
    [startedAt, generationId]
  );

  try {
    const generation = await getGeneration(generationId);
    const referenceImages = await Promise.all(
      parseReferenceImagePaths(generation.reference_image_path).map(async (storageKey) => {
        const absolutePath = resolveStorageKey(storageKey);
        return {
          buffer: await fs.readFile(absolutePath),
          mimeType: mimeTypeFromPath(storageKey),
          filename: storageKey.split('/').pop() || 'reference.png'
        };
      })
    );

    const relayImages = await generateImages({
      prompt: generation.prompt,
      size: generation.size || undefined,
      quality: generation.quality || undefined,
      count: generation.count,
      referenceImages
    });

    for (let index = 0; index < relayImages.length; index += 1) {
      const image = relayImages[index];
      const filePath = await saveGeneratedImage(generationId, index + 1, image.base64, image.mimeType);
      await pool.execute(
        `INSERT INTO generation_images (generation_id, file_path, mime_type)
         VALUES (?, ?, ?)`,
        [generationId, filePath, image.mimeType]
      );
    }

    const completedAt = new Date();
    await pool.execute(
      `UPDATE generations
       SET status = 'succeeded', completed_at = ?, duration_ms = ?, error_message = NULL
       WHERE id = ? AND deleted_at IS NULL`,
      [completedAt, completedAt.getTime() - startedAt.getTime(), generationId]
    );
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : 'Image generation failed';
    await pool.execute(
      `UPDATE generations
       SET status = 'failed', completed_at = ?, duration_ms = ?, error_message = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [completedAt, completedAt.getTime() - startedAt.getTime(), message, generationId]
    );
    throw error;
  }
}

async function getGeneration(id: number) {
  const [rows] = await getPool().query<GenerationRow[]>('SELECT * FROM generations WHERE id = ? AND deleted_at IS NULL', [id]);
  const row = rows[0];
  if (!row) throw new Error(`Generation ${id} not found`);
  return row;
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

function mimeTypeFromPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}
