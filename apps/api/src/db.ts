import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { config } from './config.js';

let pool: mysql.Pool | null = null;

export function getPool() {
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!pool) {
    pool = mysql.createPool(config.DATABASE_URL);
  }

  return pool;
}

export async function pingDatabase() {
  const connection = await getPool().getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export type GenerationStatus = 'pending' | 'processing' | 'succeeded' | 'failed';
export type UserRole = 'user' | 'admin';
export type UserStatus = 'pending_email_verification' | 'active' | 'disabled';

export interface GenerationRow extends RowDataPacket {
  id: number;
  user_id: number;
  prompt: string;
  model: string;
  status: GenerationStatus;
  size: string | null;
  quality: string | null;
  count: number;
  reference_image_path: string | null;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  duration_ms: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface GenerationImageRow extends RowDataPacket {
  id: number;
  generation_id: number;
  file_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  created_at: Date;
}

export interface UserRow extends RowDataPacket {
  id: number;
  email: string;
  display_name: string | null;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  email_verified_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface EmailVerificationTokenRow extends RowDataPacket {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface AppSettingRow extends RowDataPacket {
  id: number;
  setting_key: string;
  setting_value: string | null;
  value_type: 'string' | 'number' | 'boolean' | 'json' | 'secret';
  category: string;
  is_secret: 0 | 1;
  description: string | null;
  updated_by: number | null;
  created_at: Date;
  updated_at: Date;
}
