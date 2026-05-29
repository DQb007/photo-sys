import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const booleanEnv = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3001),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3001'),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  IMAGE_MODEL: z.string().default('gpt-image-2'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  STORAGE_DRIVER: z.enum(['local', 'minio']).default('local'),
  STORAGE_DIR: z.string().default('./storage'),
  MINIO_ENDPOINT: z.string().optional(),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: booleanEnv.default(false),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_BUCKET: z.string().default('photo-sys'),
  MINIO_AUTO_CREATE_BUCKET: booleanEnv.default(false),
  MINIO_FALLBACK_TO_LOCAL: booleanEnv.default(false),
  MAX_UPLOAD_MB: z.coerce.number().default(10),
  REQUEST_TIMEOUT_MS: z.coerce.number().default(300000),
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  SETTINGS_ENCRYPTION_KEY: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_NAME: z.string().default('Administrator')
});

const parsed = envSchema.parse(process.env);
const storageBaseDir = process.env.INIT_CWD || process.cwd();

export const config = {
  ...parsed,
  storageDir: path.resolve(storageBaseDir, parsed.STORAGE_DIR),
  maxUploadBytes: parsed.MAX_UPLOAD_MB * 1024 * 1024
};

export function getMissingConfig() {
  const missing: string[] = [];
  if (!config.OPENAI_BASE_URL) missing.push('OPENAI_BASE_URL');
  if (!config.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!config.DATABASE_URL) missing.push('DATABASE_URL');
  if (!config.REDIS_URL) missing.push('REDIS_URL');
  if (!config.JWT_SECRET) missing.push('JWT_SECRET');
  if (config.STORAGE_DRIVER === 'minio') {
    if (!config.MINIO_ENDPOINT) missing.push('MINIO_ENDPOINT');
    if (!config.MINIO_ACCESS_KEY) missing.push('MINIO_ACCESS_KEY');
    if (!config.MINIO_SECRET_KEY) missing.push('MINIO_SECRET_KEY');
  }
  if (config.NODE_ENV === 'production' && !config.SETTINGS_ENCRYPTION_KEY) {
    missing.push('SETTINGS_ENCRYPTION_KEY');
  }
  return missing;
}

export function isProduction() {
  return config.NODE_ENV === 'production';
}
