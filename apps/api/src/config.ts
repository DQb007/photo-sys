import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3001'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  IMAGE_MODEL: z.string().default('gpt-image-2'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().default(10),
  REQUEST_TIMEOUT_MS: z.coerce.number().default(300000)
});

const parsed = envSchema.parse(process.env);

export const config = {
  ...parsed,
  storageDir: path.resolve(process.cwd(), parsed.STORAGE_DIR),
  maxUploadBytes: parsed.MAX_UPLOAD_MB * 1024 * 1024
};

export function getMissingConfig() {
  const missing: string[] = [];
  if (!config.OPENAI_BASE_URL) missing.push('OPENAI_BASE_URL');
  if (!config.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!config.DATABASE_URL) missing.push('DATABASE_URL');
  if (!config.REDIS_URL) missing.push('REDIS_URL');
  return missing;
}
