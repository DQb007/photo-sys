import type express from 'express';
import { getUserById } from './users.js';
import { verifyAuthToken } from './tokens.js';
import { httpError } from './errors.js';
import type { UserRow } from './db.js';

export interface AuthenticatedRequest extends express.Request {
  user?: UserRow;
}

export async function requireUser(req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction) {
  try {
    const header = req.get('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    const queryToken = req.baseUrl === '/files' && typeof req.query.token === 'string' ? req.query.token : '';
    const token = match?.[1] || queryToken;
    if (!token) {
      throw httpError(401, '请先登录');
    }

    const payload = verifyAuthToken(token);
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId < 1) {
      throw httpError(401, '登录状态无效');
    }

    const user = await getUserById(userId);
    if (!user) throw httpError(401, '登录状态无效');
    if (user.status === 'disabled') throw httpError(403, '账号已被禁用');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireActiveUser(req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction) {
  try {
    if (!req.user) throw httpError(401, '请先登录');
    if (req.user.status === 'pending_email_verification') {
      throw httpError(403, '请先完成邮箱验证', 'EMAIL_VERIFICATION_REQUIRED');
    }
    if (req.user.status !== 'active') throw httpError(403, '账号不可用');
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction) {
  try {
    if (!req.user) throw httpError(401, '请先登录');
    if (req.user.role !== 'admin') throw httpError(403, '需要管理员权限');
    next();
  } catch (error) {
    next(error);
  }
}
