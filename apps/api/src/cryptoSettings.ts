import crypto from 'node:crypto';
import { config, isProduction } from './config.js';
import { httpError } from './errors.js';

const algorithm = 'aes-256-gcm';

export function encryptSettingSecret(value: string) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSettingSecret(value: string) {
  const key = getKey();
  const [version, ivText, tagText, encryptedText] = value.split(':');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) {
    throw httpError(500, 'Invalid encrypted setting format');
  }
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

function getKey() {
  const secret = config.SETTINGS_ENCRYPTION_KEY;
  if (!secret && isProduction()) {
    throw httpError(500, 'SETTINGS_ENCRYPTION_KEY is not configured');
  }
  return crypto.createHash('sha256').update(secret || 'photo-sys-development-settings-key').digest();
}
