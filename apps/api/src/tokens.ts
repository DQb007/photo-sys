import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from './config.js';
import { httpError } from './errors.js';
import type { UserRole } from './db.js';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export function createAuthToken(payload: AuthTokenPayload) {
  if (!config.JWT_SECRET) {
    throw httpError(500, 'JWT_SECRET is not configured');
  }
  const options: SignOptions = { expiresIn: config.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, config.JWT_SECRET, options);
}

export function verifyAuthToken(token: string) {
  if (!config.JWT_SECRET) {
    throw httpError(500, 'JWT_SECRET is not configured');
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    if (!isAuthTokenPayload(decoded)) {
      throw httpError(401, 'Invalid authentication token');
    }
    return decoded;
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid authentication token') throw error;
    throw httpError(401, 'Invalid or expired authentication token');
  }
}

export function createOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isAuthTokenPayload(value: unknown): value is AuthTokenPayload {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<AuthTokenPayload>;
  return typeof item.sub === 'string'
    && typeof item.email === 'string'
    && (item.role === 'user' || item.role === 'admin');
}
