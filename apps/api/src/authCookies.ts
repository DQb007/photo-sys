import type express from 'express';
import { isProduction } from './config.js';

export const authCookieName = 'photo_sys_auth';

export function setAuthCookie(res: express.Response, token: string) {
  res.cookie(authCookieName, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(res: express.Response) {
  res.clearCookie(authCookieName, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/'
  });
}

export function getAuthCookie(req: express.Request) {
  return parseCookies(req.get('cookie') || '')[authCookieName] || '';
}

function parseCookies(header: string) {
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}
