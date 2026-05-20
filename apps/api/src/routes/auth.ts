import express from 'express';
import { z } from 'zod';
import { getPool, type EmailVerificationTokenRow } from '../db.js';
import { httpError } from '../errors.js';
import { sendVerificationEmail, verificationUrl } from '../mail.js';
import { hashPassword, verifyPassword } from '../passwords.js';
import { getAppSettings, type AppSettings } from '../settingsService.js';
import { createAuthToken, createOpaqueToken, hashOpaqueToken } from '../tokens.js';
import { createUser, getUserByEmail, getUserById, normalizeEmail, serializeUser } from '../users.js';
import { writeAuditLog } from '../audit.js';
import { requireUser, type AuthenticatedRequest } from '../authMiddleware.js';

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().max(120).optional().or(z.literal(''))
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const verifyEmailSchema = z.object({
  token: z.string().min(20)
});

const resendSchema = z.object({
  email: z.string().email()
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
  confirmPassword: z.string().min(8).max(200)
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: '两次新密码输入不一致',
  path: ['confirmPassword']
});

router.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.parse(req.body);
    const settings = await getAppSettings({ includeSecrets: true }) as AppSettings;
    if (!settings.registration.enabled) {
      throw httpError(403, '当前未开放注册');
    }

    const email = normalizeEmail(parsed.email);
    const existing = await getUserByEmail(email);
    if (existing) {
      if (existing.status === 'pending_email_verification'
        && settings.registration.emailVerificationRequired
        && settings.registration.resendVerificationEnabled) {
        await createAndSendVerification(existing.id, existing.email, settings);
      }
      res.status(202).json({ ok: true, verificationRequired: existing.status !== 'active' });
      return;
    }

    const verificationRequired = settings.registration.emailVerificationRequired;
    const user = await createUser({
      email,
      displayName: parsed.displayName || null,
      password: parsed.password,
      status: verificationRequired ? 'pending_email_verification' : 'active',
      emailVerifiedAt: verificationRequired ? null : new Date()
    });
    if (!user) throw httpError(500, '创建用户失败');

    await writeAuditLog({
      actor: null,
      action: 'auth.registered',
      targetType: 'user',
      targetId: user.id,
      targetUserId: user.id,
      metadata: { verificationRequired },
      req
    });

    if (verificationRequired) {
      await createAndSendVerification(user.id, user.email, settings);
    }

    res.status(201).json({
      ok: true,
      verificationRequired,
      user: verificationRequired ? undefined : serializeUser(user),
      token: verificationRequired ? undefined : createAuthToken({ sub: String(user.id), email: user.email, role: user.role })
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const user = await getUserByEmail(parsed.email);
    const valid = user ? await verifyPassword(parsed.password, user.password_hash) : false;

    if (!user || !valid) {
      await writeAuditLog({
        actor: user ? { id: user.id, email: user.email } : null,
        action: 'auth.login_failed',
        targetType: 'user',
        targetId: user?.id || null,
        targetUserId: user?.id || null,
        req
      });
      throw httpError(401, '邮箱或密码错误');
    }

    if (user.status === 'pending_email_verification') {
      throw httpError(403, '请先完成邮箱验证', 'EMAIL_VERIFICATION_REQUIRED');
    }
    if (user.status !== 'active') {
      throw httpError(403, '账号不可用');
    }

    await getPool().execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    const refreshed = await getUserById(user.id);
    await writeAuditLog({
      actor: user,
      action: 'auth.login_succeeded',
      targetType: 'user',
      targetId: user.id,
      targetUserId: user.id,
      req
    });

    res.json({
      token: createAuthToken({ sub: String(user.id), email: user.email, role: user.role }),
      user: serializeUser(refreshed || user)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const parsed = verifyEmailSchema.parse(req.body);
    const tokenHash = hashOpaqueToken(parsed.token);
    const [rows] = await getPool().query<EmailVerificationTokenRow[]>(
      `SELECT * FROM email_verification_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    const token = rows[0];
    if (!token) throw httpError(400, '验证链接无效或已过期');

    await getPool().execute('UPDATE users SET status = ?, email_verified_at = NOW() WHERE id = ?', ['active', token.user_id]);
    await getPool().execute('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ?', [token.id]);

    const user = await getUserById(token.user_id);
    if (!user) throw httpError(404, '用户不存在');
    await writeAuditLog({
      actor: user,
      action: 'auth.email_verified',
      targetType: 'user',
      targetId: user.id,
      targetUserId: user.id,
      req
    });

    res.json({
      ok: true,
      user: serializeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/resend-verification', async (req, res, next) => {
  try {
    const parsed = resendSchema.parse(req.body);
    const settings = await getAppSettings({ includeSecrets: true }) as AppSettings;
    if (!settings.registration.resendVerificationEnabled) {
      throw httpError(403, '当前不允许重发验证邮件');
    }

    const user = await getUserByEmail(parsed.email);
    if (user && user.status === 'pending_email_verification') {
      await createAndSendVerification(user.id, user.email, settings);
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requireUser, async (req: AuthenticatedRequest, res, next) => {
  try {
    await writeAuditLog({
      actor: req.user,
      action: 'auth.logout',
      targetType: 'user',
      targetId: req.user?.id || null,
      targetUserId: req.user?.id || null,
      req
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/change-password', requireUser, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, '请先登录');
    const parsed = changePasswordSchema.parse(req.body);
    const user = await getUserById(req.user.id);
    if (!user) throw httpError(404, '用户不存在');
    if (!(await verifyPassword(parsed.oldPassword, user.password_hash))) {
      throw httpError(422, '旧密码不正确');
    }

    await getPool().execute('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(parsed.newPassword), user.id]);
    await writeAuditLog({
      actor: user,
      action: 'auth.password_changed',
      targetType: 'user',
      targetId: user.id,
      targetUserId: user.id,
      req
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireUser, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user ? serializeUser(req.user) : null });
});

async function createAndSendVerification(userId: number, email: string, settings: AppSettings) {
  const token = createOpaqueToken();
  await getPool().execute(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [userId, hashOpaqueToken(token), settings.registration.verificationTokenTtlHours]
  );
  await sendVerificationEmail({ email, verificationUrl: verificationUrl(token) });
}

export { router as authRouter };
