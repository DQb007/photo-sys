import express from 'express';
import { z } from 'zod';
import { requireAdmin, requireUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { writeAuditLog } from '../audit.js';
import { httpError } from '../errors.js';
import {
  createRedeemPackage,
  disableRedeemCode,
  generateRedeemCodeBatch,
  getRedeemBatchById,
  listRedeemBatches,
  listRedeemCodesForBatch,
  listRedeemPackages,
  serializeRedeemBatch,
  serializeRedeemCode,
  serializeRedeemPackage,
  updateRedeemPackage
} from '../redeemCodes.js';

const router = express.Router();
router.use(requireUser, requireAdmin);

const packageCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  credits: z.number().int().min(1).max(1000000),
  status: z.enum(['active', 'disabled']).optional(),
  description: z.string().trim().max(500).optional().or(z.literal(''))
});

const packagePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  credits: z.number().int().min(1).max(1000000).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  description: z.string().trim().max(500).optional().or(z.literal(''))
});

const batchCreateSchema = z.object({
  packageId: z.number().int().min(1),
  quantity: z.number().int().min(1).max(1000),
  expiresAt: z.string().datetime().optional().nullable().or(z.literal('')),
  note: z.string().trim().max(500).optional().or(z.literal(''))
});

router.get('/redeem-packages', async (_req, res, next) => {
  try {
    const items = await listRedeemPackages();
    res.json({ items: items.map(serializeRedeemPackage) });
  } catch (error) {
    next(error);
  }
});

router.post('/redeem-packages', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = packageCreateSchema.parse(req.body);
    const item = await createRedeemPackage({
      ...parsed,
      description: parsed.description || null
    }, req.user?.id || null);
    await writeAuditLog({
      actor: req.user,
      action: 'redeem_packages.created',
      targetType: 'redeem_package',
      targetId: item.id,
      metadata: { name: item.name, credits: item.credits, status: item.status },
      req
    });
    res.status(201).json({ item: serializeRedeemPackage(item) });
  } catch (error) {
    next(error);
  }
});

router.patch('/redeem-packages/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = numericParam(req.params.id, 'Invalid package id');
    const parsed = packagePatchSchema.parse(req.body);
    const item = await updateRedeemPackage(id, {
      ...parsed,
      description: parsed.description === undefined ? undefined : parsed.description || null
    });
    await writeAuditLog({
      actor: req.user,
      action: 'redeem_packages.updated',
      targetType: 'redeem_package',
      targetId: item.id,
      metadata: parsed,
      req
    });
    res.json({ item: serializeRedeemPackage(item) });
  } catch (error) {
    next(error);
  }
});

router.get('/redeem-code-batches', async (_req, res, next) => {
  try {
    const items = await listRedeemBatches();
    res.json({ items: items.map(serializeRedeemBatch) });
  } catch (error) {
    next(error);
  }
});

router.post('/redeem-code-batches', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = batchCreateSchema.parse(req.body);
    const result = await generateRedeemCodeBatch({
      packageId: parsed.packageId,
      quantity: parsed.quantity,
      expiresAt: parsed.expiresAt || null,
      note: parsed.note || null,
      actorUserId: req.user?.id || null
    });
    await writeAuditLog({
      actor: req.user,
      action: 'redeem_codes.batch_created',
      targetType: 'redeem_code_batch',
      targetId: result.batch.id,
      metadata: {
        packageId: result.batch.package_id,
        credits: result.batch.credits_snapshot,
        quantity: result.batch.quantity,
        expiresAt: result.batch.expires_at
      },
      req
    });
    res.status(201).json({
      batch: serializeRedeemBatch(result.batch),
      codes: result.codes
    });
  } catch (error) {
    next(error);
  }
});

router.get('/redeem-code-batches/:id', async (req, res, next) => {
  try {
    const batch = await getRedeemBatchById(numericParam(req.params.id, 'Invalid batch id'));
    res.json({ batch: serializeRedeemBatch(batch) });
  } catch (error) {
    next(error);
  }
});

router.get('/redeem-code-batches/:id/codes', async (req, res, next) => {
  try {
    const batchId = numericParam(req.params.id, 'Invalid batch id');
    const items = await listRedeemCodesForBatch(batchId);
    res.json({ items: items.map(serializeRedeemCode) });
  } catch (error) {
    next(error);
  }
});

router.post('/redeem-codes/:id/disable', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = numericParam(req.params.id, 'Invalid redeem code id');
    const item = await disableRedeemCode(id);
    await writeAuditLog({
      actor: req.user,
      action: 'redeem_codes.disabled',
      targetType: 'redeem_code',
      targetId: item.id,
      metadata: { batchId: item.batch_id, suffix: item.code_suffix },
      req
    });
    res.json({ item: serializeRedeemCode(item) });
  } catch (error) {
    next(error);
  }
});

function numericParam(value: string | string[], message: string) {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, message);
  return id;
}

export { router as adminRedeemCodesRouter };
