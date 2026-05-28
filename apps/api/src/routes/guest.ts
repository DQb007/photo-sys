import express from 'express';
import { createGuestSession, getGuestSessionByToken, serializeGuestSession } from '../guestSessions.js';
import { getAppSettings, type AppSettings } from '../settingsService.js';
import { httpError } from '../errors.js';

const router = express.Router();

router.post('/session', async (req, res, next) => {
  try {
    const payload = await createGuestSession(req);
    res.status(201).json({
      token: payload.token,
      session: serializeGuestSession(payload.session, payload.settings)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/session', async (req, res, next) => {
  try {
    const token = req.get('x-guest-token') || '';
    if (!token) throw httpError(401, '游客会话不存在', 'GUEST_SESSION_REQUIRED');
    const [settings, session] = await Promise.all([
      getAppSettings({ fresh: true }) as Promise<AppSettings>,
      getGuestSessionByToken(token)
    ]);
    if (!session) throw httpError(401, '游客会话已过期，请刷新后重试', 'GUEST_SESSION_EXPIRED');
    res.json({ session: serializeGuestSession(session, settings.trial) });
  } catch (error) {
    next(error);
  }
});

export { router as guestRouter };
