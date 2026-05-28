import type express from 'express';
import type { PoolConnection } from 'mysql2/promise';
import { getPool, type GuestSessionRow } from './db.js';
import { httpError } from './errors.js';
import { getAppSettings, type AppSettings } from './settingsService.js';
import { createOpaqueToken, hashOpaqueToken } from './tokens.js';

export interface GuestSessionPayload {
  token: string;
  session: GuestSessionRow;
  settings: AppSettings['trial'];
}

export function serializeGuestSession(session: GuestSessionRow, trial: AppSettings['trial']) {
  return {
    id: session.id,
    generationLimit: session.generation_limit,
    generationUsed: session.generation_used,
    generationRemaining: Math.max(session.generation_limit - session.generation_used, 0),
    chatLimit: session.chat_limit,
    chatUsed: session.chat_used,
    chatRemaining: Math.max(session.chat_limit - session.chat_used, 0),
    expiresAt: session.expires_at,
    trial: {
      enabled: trial.enabled,
      allowReferenceImages: trial.allowReferenceImages,
      maxImagesPerGeneration: trial.maxImagesPerGeneration
    }
  };
}

export async function createGuestSession(req: express.Request): Promise<GuestSessionPayload> {
  const settings = await getAppSettings({ fresh: true }) as AppSettings;
  if (!settings.trial.enabled) throw httpError(403, '游客试用暂未开放', 'TRIAL_DISABLED');

  const ipAddress = clientIp(req);
  const userAgent = (req.get('user-agent') || '').slice(0, 500) || null;
  if (await ipSessionLimitReached(ipAddress, settings.trial.maxSessionsPerIpPerDay)) {
    const recovered = await recoverLatestGuestSession(ipAddress, userAgent, settings.trial);
    if (recovered) return recovered;
    throw httpError(429, '当前网络的游客试用创建次数过多，请稍后再试！', 'TRIAL_IP_LIMIT_EXCEEDED');
  }

  const token = createOpaqueToken();
  await getPool().execute(
    `INSERT INTO guest_sessions
       (token_hash, ip_address, user_agent, generation_limit, chat_limit, expires_at)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [
      hashOpaqueToken(token),
      ipAddress,
      userAgent,
      settings.trial.generationLimit,
      settings.trial.chatLimit,
      settings.trial.sessionTtlHours
    ]
  );

  const session = await getGuestSessionByToken(token);
  if (!session) throw httpError(500, '游客会话创建失败');
  return { token, session, settings: settings.trial };
}

export async function getGuestSessionByToken(token: string) {
  const [rows] = await getPool().query<GuestSessionRow[]>(
    'SELECT * FROM guest_sessions WHERE token_hash = ? AND expires_at > NOW() LIMIT 1',
    [hashOpaqueToken(token)]
  );
  const session = rows[0] || null;
  if (session) {
    await getPool().execute('UPDATE guest_sessions SET last_seen_at = NOW() WHERE id = ?', [session.id]);
  }
  return session;
}

export async function consumeGuestGeneration(sessionId: number) {
  return consumeGuestQuota(sessionId, 'generation_used', 'generation_limit', '图片试用次数已用完，请前往注册页面注册登录使用！');
}

export async function consumeGuestChat(sessionId: number) {
  return consumeGuestQuota(sessionId, 'chat_used', 'chat_limit', 'AI对话试用次数已用完，请前往注册页面注册登录使用！');
}

export async function consumeGuestGenerationInConnection(connection: PoolConnection, sessionId: number) {
  return consumeGuestQuotaInConnection(connection, sessionId, 'generation_used', 'generation_limit', '图片试用次数已用完，请前往注册页面注册登录使用！');
}

export async function consumeGuestChatInConnection(connection: PoolConnection, sessionId: number) {
  return consumeGuestQuotaInConnection(connection, sessionId, 'chat_used', 'chat_limit', 'AI对话试用次数已用完，请前往注册页面注册登录使用！');
}

async function consumeGuestQuota(sessionId: number, usedColumn: 'generation_used' | 'chat_used', limitColumn: 'generation_limit' | 'chat_limit', message: string) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const session = await consumeGuestQuotaInConnection(connection, sessionId, usedColumn, limitColumn, message);
    await connection.commit();
    return session;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function consumeGuestQuotaInConnection(
  connection: PoolConnection,
  sessionId: number,
  usedColumn: 'generation_used' | 'chat_used',
  limitColumn: 'generation_limit' | 'chat_limit',
  message: string
) {
  const [rows] = await connection.query<GuestSessionRow[]>(
    'SELECT * FROM guest_sessions WHERE id = ? AND expires_at > NOW() FOR UPDATE',
    [sessionId]
  );
  const session = rows[0];
  if (!session) throw httpError(401, '游客会话已过期，请刷新后重试', 'GUEST_SESSION_EXPIRED');
  if (session[usedColumn] >= session[limitColumn]) {
    throw httpError(403, message, 'TRIAL_LIMIT_EXCEEDED');
  }
  await connection.execute(
    `UPDATE guest_sessions SET ${usedColumn} = ${usedColumn} + 1, last_seen_at = NOW() WHERE id = ?`,
    [sessionId]
  );
  const [updatedRows] = await connection.query<GuestSessionRow[]>('SELECT * FROM guest_sessions WHERE id = ?', [sessionId]);
  return updatedRows[0];
}

async function ipSessionLimitReached(ipAddress: string | null, limit: number) {
  if (!ipAddress) return false;
  const [rows] = await getPool().query<Array<{ total: number } & import('mysql2').RowDataPacket>>(
    `SELECT COUNT(*) AS total FROM guest_sessions
     WHERE ip_address = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    [ipAddress]
  );
  return Number(rows[0]?.total || 0) >= limit;
}

async function recoverLatestGuestSession(ipAddress: string | null, userAgent: string | null, settings: AppSettings['trial']): Promise<GuestSessionPayload | null> {
  if (!ipAddress || !userAgent) return null;
  const [rows] = await getPool().query<GuestSessionRow[]>(
    `SELECT * FROM guest_sessions
     WHERE ip_address = ? AND user_agent = ? AND expires_at > NOW()
     ORDER BY last_seen_at DESC, id DESC
     LIMIT 1`,
    [ipAddress, userAgent]
  );
  const session = rows[0];
  if (!session) return null;
  const token = createOpaqueToken();
  await getPool().execute(
    'UPDATE guest_sessions SET token_hash = ?, last_seen_at = NOW() WHERE id = ?',
    [hashOpaqueToken(token), session.id]
  );
  const refreshed = await getGuestSessionByToken(token);
  if (!refreshed) return null;
  return { token, session: refreshed, settings };
}

export function clientIp(req: express.Request) {
  const forwarded = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (forwarded || req.ip || req.socket.remoteAddress || '').slice(0, 100) || null;
}
