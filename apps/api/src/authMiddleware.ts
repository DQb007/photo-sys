import type express from 'express';
import { getUserById } from './users.js';
import { verifyAuthToken } from './tokens.js';
import { httpError } from './errors.js';
import type { GuestSessionRow, UserRow } from './db.js';
import { getGuestSessionByToken } from './guestSessions.js';
import { getAuthCookie } from './authCookies.js';

export interface AuthenticatedRequest extends express.Request {
  user?: UserRow;
  guestSession?: GuestSessionRow;
}

export async function optionalUserOrGuest(req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction) {
  try {
    const queryToken = req.baseUrl === '/files' && typeof req.query.token === 'string' ? req.query.token : '';
    const bearer = bearerToken(req);
    const cookieToken = getAuthCookie(req);
    const token = bearer || cookieToken || queryToken;
    if (token) {
      try {
        const payload = verifyAuthToken(token);
        const userId = Number(payload.sub);
        if (!Number.isInteger(userId) || userId < 1) throw httpError(401, '登录状态无效');
        const user = await getUserById(userId);
        if (!user) throw httpError(401, '登录状态无效');
        if (user.status === 'disabled') throw httpError(403, '账号已被禁用');
        req.user = user;
        next();
        return;
      } catch (error) {
        if (!bearer && cookieToken && !queryToken) {
          const headerGuestToken = req.get('x-guest-token') || '';
          const queryGuestToken = typeof req.query.guestToken === 'string' ? req.query.guestToken : '';
          const fallbackGuestToken = headerGuestToken || queryGuestToken;
          if (fallbackGuestToken) {
            const fallbackGuest = await getGuestSessionByToken(fallbackGuestToken);
            if (!fallbackGuest) throw httpError(401, '游客会话已过期，请刷新后重试', 'GUEST_SESSION_EXPIRED');
            req.guestSession = fallbackGuest;
            next();
            return;
          }
        }
        const guest = await getGuestSessionByToken(token);
        if (!guest) {
          const headerGuestToken = req.get('x-guest-token') || '';
          const headerGuest = headerGuestToken ? await getGuestSessionByToken(headerGuestToken) : null;
          if (!headerGuest) throw error;
          req.guestSession = headerGuest;
          next();
          return;
        }
        req.guestSession = guest;
        next();
        return;
      }
    }

    const guestToken = req.get('x-guest-token') || (typeof req.query.guestToken === 'string' ? req.query.guestToken : '');
    if (guestToken) {
      const guest = await getGuestSessionByToken(guestToken);
      if (!guest) throw httpError(401, '游客会话已过期，请刷新后重试', 'GUEST_SESSION_EXPIRED');
      req.guestSession = guest;
    }
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireUser(req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction) {
  try {
    const match = bearerToken(req);
    const queryToken = req.baseUrl === '/files' && typeof req.query.token === 'string' ? req.query.token : '';
    const token = match || getAuthCookie(req) || queryToken;
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

function bearerToken(req: express.Request) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
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
