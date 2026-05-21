import express from 'express';
import { z } from 'zod';
import { requireAdmin, requireUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { getPool, type GenerationImageRow, type GenerationRow, type UserRole, type UserStatus } from '../db.js';
import { httpError } from '../errors.js';
import { sendTestEmail, sendVerificationEmail, verificationUrl } from '../mail.js';
import { hashPassword } from '../passwords.js';
import { serializeGeneration } from '../serializers.js';
import { getAppSettings, resetAppSettings, updateAppSettings, type AppSettings } from '../settingsService.js';
import { getUserById, serializeUser } from '../users.js';
import { writeAuditLog } from '../audit.js';
import { applyCreditTransaction, listCreditTransactions, serializeCreditTransaction } from '../credits.js';
import { createOpaqueToken, hashOpaqueToken } from '../tokens.js';

const router = express.Router();
router.use(requireUser, requireAdmin);

const userPatchSchema = z.object({
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['pending_email_verification', 'active', 'disabled']).optional(),
  displayName: z.string().trim().max(120).optional().or(z.literal(''))
});

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(200),
  confirmPassword: z.string().min(8).max(200)
}).refine((value) => value.password === value.confirmPassword, {
  message: '两次密码输入不一致',
  path: ['confirmPassword']
});

const testEmailSchema = z.object({
  to: z.string().email()
});

const settingsPatchSchema = z.object({
  registration: z.object({
    enabled: z.boolean().optional(),
    emailVerificationRequired: z.boolean().optional(),
    resendVerificationEnabled: z.boolean().optional(),
    verificationTokenTtlHours: z.number().int().min(1).max(168).optional()
  }).optional(),
  mail: z.object({
    smtpHost: z.string().optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpSecure: z.boolean().optional(),
    smtpUser: z.string().optional(),
    smtpPassword: z.string().optional(),
    fromName: z.string().optional(),
    fromAddress: z.string().optional(),
    verificationSubject: z.string().optional(),
    verificationTemplate: z.string().optional()
  }).optional(),
  credits: z.object({
    enabled: z.boolean().optional(),
    costPerImage: z.number().int().min(0).max(100000).optional(),
    initialBalance: z.number().int().min(0).max(1000000).optional(),
    refundOnFailure: z.boolean().optional()
  }).optional()
});

const creditAdjustmentSchema = z.object({
  amount: z.number().int().min(-1000000).max(1000000).refine((value) => value !== 0, {
    message: '积分调整数量不能为 0'
  }),
  reason: z.string().trim().max(500).optional().or(z.literal(''))
});

router.get('/overview', async (_req, res, next) => {
  try {
    const [userRows] = await getPool().query<Array<{ status: string; total: number } & import('mysql2').RowDataPacket>>(
      'SELECT status, COUNT(*) AS total FROM users GROUP BY status'
    );
    const [generationRows] = await getPool().query<Array<{ status: string; total: number } & import('mysql2').RowDataPacket>>(
      'SELECT status, COUNT(*) AS total FROM generations WHERE deleted_at IS NULL GROUP BY status'
    );
    const [imageRows] = await getPool().query<Array<{ total: number } & import('mysql2').RowDataPacket>>(
      `SELECT COUNT(*) AS total
       FROM generation_images gi
       INNER JOIN generations g ON g.id = gi.generation_id
       WHERE g.deleted_at IS NULL`
    );
    res.json({
      users: Object.fromEntries(userRows.map((row) => [row.status, Number(row.total)])),
      generations: Object.fromEntries(generationRows.map((row) => [row.status, Number(row.total)])),
      images: Number(imageRows[0]?.total || 0)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/settings', async (_req, res, next) => {
  try {
    res.json({ settings: await getAppSettings() });
  } catch (error) {
    next(error);
  }
});

router.patch('/settings', async (req: AuthenticatedRequest, res, next) => {
  try {
    const patch = settingsPatchSchema.parse(req.body);
    const settings = await updateAppSettings(patch, req.user?.id || null);
    await writeAuditLog({
      actor: req.user,
      action: 'settings.updated',
      targetType: 'settings',
      metadata: { keys: collectKeys(patch) },
      req
    });
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

router.post('/settings/reset-defaults', async (req: AuthenticatedRequest, res, next) => {
  try {
    const settings = await resetAppSettings(req.user?.id || null);
    await writeAuditLog({
      actor: req.user,
      action: 'settings.reset_defaults',
      targetType: 'settings',
      req
    });
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

router.post('/settings/test-email', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = testEmailSchema.parse(req.body);
    await sendTestEmail(parsed.to);
    await writeAuditLog({
      actor: req.user,
      action: 'settings.test_email_succeeded',
      targetType: 'settings',
      metadata: { to: parsed.to },
      req
    });
    res.json({ ok: true });
  } catch (error) {
    if (req.user) {
      await writeAuditLog({
        actor: req.user,
        action: 'settings.test_email_failed',
        targetType: 'settings',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
        req
      }).catch(() => undefined);
    }
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const role = req.query.role === 'admin' || req.query.role === 'user' ? req.query.role : '';
    const status = ['pending_email_verification', 'active', 'disabled'].includes(String(req.query.status))
      ? String(req.query.status)
      : '';
    const requestedPage = Number(req.query.page || 1);
    const requestedPageSize = Number(req.query.pageSize || 10);
    const requestedSafePage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isInteger(requestedPageSize)
      ? Math.min(Math.max(requestedPageSize, 1), 100)
      : 10;
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (search) {
      conditions.push('(u.email LIKE ? OR u.display_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (role) {
      conditions.push('u.role = ?');
      params.push(role);
    }
    if (status) {
      conditions.push('u.status = ?');
      params.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countRows] = await getPool().query<Array<{ total: number } & import('mysql2').RowDataPacket>>(
      `SELECT COUNT(*) AS total
       FROM users u
       ${where}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedSafePage, totalPages);
    const offset = (page - 1) * pageSize;
    const [rows] = await getPool().query<Array<{
      id: number;
      email: string;
      display_name: string | null;
      role: UserRole;
      status: UserStatus;
      email_verified_at: Date | null;
      last_login_at: Date | null;
      credit_balance: number;
      created_at: Date;
      updated_at: Date;
      generation_count: number;
      succeeded_count: number;
      failed_count: number;
      image_count: number;
    } & import('mysql2').RowDataPacket>>(
      `SELECT u.*,
        COUNT(DISTINCT g.id) AS generation_count,
        SUM(CASE WHEN g.status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded_count,
        SUM(CASE WHEN g.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
        COUNT(gi.id) AS image_count
       FROM users u
       LEFT JOIN generations g ON g.user_id = u.id AND g.deleted_at IS NULL
       LEFT JOIN generation_images gi ON gi.generation_id = g.id
       ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({
      page,
      pageSize,
      total,
      totalPages,
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        status: row.status,
        emailVerifiedAt: row.email_verified_at,
        lastLoginAt: row.last_login_at,
        creditBalance: Number(row.credit_balance || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        generationCount: Number(row.generation_count || 0),
        succeededCount: Number(row.succeeded_count || 0),
        failedCount: Number(row.failed_count || 0),
        imageCount: Number(row.image_count || 0)
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await getAdminTargetUser(stringParam(req.params.id));
    res.json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await getAdminTargetUser(stringParam(req.params.id));
    const parsed = userPatchSchema.parse(req.body);
    if (req.user?.id === user.id && (parsed.role === 'user' || parsed.status === 'disabled')) {
      throw httpError(409, '不能降级或禁用当前登录管理员');
    }

    if ((parsed.role === 'user' || parsed.status === 'disabled') && user.role === 'admin') {
      await assertNotOnlyActiveAdmin(user.id);
    }

    await getPool().execute(
      `UPDATE users
       SET role = COALESCE(?, role),
           status = COALESCE(?, status),
           display_name = COALESCE(?, display_name)
       WHERE id = ?`,
      [parsed.role || null, parsed.status || null, parsed.displayName || null, user.id]
    );
    const updated = await getAdminTargetUser(String(user.id));
    await writeAuditLog({
      actor: req.user,
      action: 'user.updated',
      targetType: 'user',
      targetId: user.id,
      targetUserId: user.id,
      metadata: { role: parsed.role, status: parsed.status },
      req
    });
    res.json({ user: serializeUser(updated) });
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/reset-password', async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await getAdminTargetUser(stringParam(req.params.id));
    const parsed = resetPasswordSchema.parse(req.body);
    await getPool().execute('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(parsed.password), user.id]);
    await writeAuditLog({
      actor: req.user,
      action: 'user.password_reset',
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

router.post('/users/:id/credits/adjust', async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await getAdminTargetUser(stringParam(req.params.id));
    const parsed = creditAdjustmentSchema.parse(req.body);
    const result = await applyCreditTransaction({
      userId: user.id,
      type: 'admin_adjustment',
      amount: parsed.amount,
      actorUserId: req.user?.id || null,
      reason: parsed.reason || null
    });
    await writeAuditLog({
      actor: req.user,
      action: 'credits.admin_adjusted',
      targetType: 'user',
      targetId: user.id,
      targetUserId: user.id,
      metadata: { amount: parsed.amount, reason: parsed.reason || null },
      req
    });
    res.json({
      balance: result.balanceAfter,
      transaction: serializeCreditTransaction(result.transaction)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id/credits/transactions', async (req, res, next) => {
  try {
    const user = await getAdminTargetUser(stringParam(req.params.id));
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 20);
    const result = await listCreditTransactions(user.id, page, pageSize);
    res.json({
      user: serializeUser(user),
      ...result,
      items: result.items.map(serializeCreditTransaction)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/resend-verification', async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await getAdminTargetUser(stringParam(req.params.id));
    if (user.status !== 'pending_email_verification') {
      throw httpError(409, '该用户不需要邮箱验证');
    }
    const settings = await getAppSettings({ includeSecrets: true }) as AppSettings;
    const token = createOpaqueToken();
    await getPool().execute(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [user.id, hashOpaqueToken(token), settings.registration.verificationTokenTtlHours]
    );
    await sendVerificationEmail({ email: user.email, verificationUrl: verificationUrl(token) });
    await writeAuditLog({
      actor: req.user,
      action: 'user.verification_resent',
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

router.get('/users/:id/generations', async (req, res, next) => {
  try {
    const user = await getAdminTargetUser(req.params.id);
    const [rows] = await getPool().query<GenerationRow[]>(
      'SELECT * FROM generations WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100',
      [user.id]
    );
    const ids = rows.map((row) => row.id);
    const images = ids.length ? await getImagesForGenerations(ids) : [];
    const byGeneration = new Map<number, GenerationImageRow[]>();
    for (const image of images) {
      const list = byGeneration.get(image.generation_id) || [];
      list.push(image);
      byGeneration.set(image.generation_id, list);
    }
    res.json({
      user: serializeUser(user),
      items: rows.map((row) => serializeGeneration({ ...row, images: byGeneration.get(row.id) || [] }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    const action = typeof req.query.action === 'string' ? req.query.action : '';
    const requestedPage = Number(req.query.page || 1);
    const requestedPageSize = Number(req.query.pageSize || 20);
    const requestedSafePage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isInteger(requestedPageSize)
      ? Math.min(Math.max(requestedPageSize, 1), 100)
      : 20;
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (action) {
      conditions.push('action = ?');
      params.push(action);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countRows] = await getPool().query<Array<{ total: number } & import('mysql2').RowDataPacket>>(
      `SELECT COUNT(*) AS total FROM audit_logs ${where}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedSafePage, totalPages);
    const offset = (page - 1) * pageSize;
    const [rows] = await getPool().query(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({
      page,
      pageSize,
      total,
      totalPages,
      items: rows
    });
  } catch (error) {
    next(error);
  }
});

async function getAdminTargetUser(idValue: string) {
  const id = Number(idValue);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, 'Invalid user id');
  const user = await getUserById(id);
  if (!user) throw httpError(404, 'User not found');
  return user;
}

async function assertNotOnlyActiveAdmin(userId: number) {
  const [rows] = await getPool().query<Array<{ total: number } & import('mysql2').RowDataPacket>>(
    `SELECT COUNT(*) AS total FROM users
     WHERE role = 'admin' AND status = 'active' AND id <> ?`,
    [userId]
  );
  if (Number(rows[0]?.total || 0) < 1) {
    throw httpError(409, '不能禁用或降级唯一的活跃管理员');
  }
}

async function getImagesForGenerations(ids: number[]) {
  const placeholders = ids.map(() => '?').join(',');
  const [images] = await getPool().query<GenerationImageRow[]>(
    `SELECT * FROM generation_images WHERE generation_id IN (${placeholders}) ORDER BY id ASC`,
    ids
  );
  return images;
}

function collectKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return collectKeys(item, path);
    }
    return [path];
  });
}

function stringParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export { router as adminRouter };
