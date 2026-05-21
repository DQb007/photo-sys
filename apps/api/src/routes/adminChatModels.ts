import express from 'express';
import { z } from 'zod';
import { requireAdmin, requireUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { writeAuditLog } from '../audit.js';
import { httpError } from '../errors.js';
import {
  createChatModel,
  getActiveChatModelWithSecret,
  getChatModelById,
  listAdminChatModels,
  serializeChatModel,
  updateChatModel
} from '../chatModels.js';
import { streamChatCompletion } from '../chatRelay.js';

const router = express.Router();
router.use(requireUser, requireAdmin);

const modelCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  modelKey: z.string().trim().min(1).max(160),
  baseUrl: z.string().trim().url().max(1000),
  apiKey: z.string().trim().max(2000).optional().or(z.literal('')),
  status: z.enum(['active', 'disabled']).optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(-1000000).max(1000000).optional(),
  description: z.string().trim().max(500).optional().or(z.literal(''))
});

const modelPatchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  modelKey: z.string().trim().min(1).max(160).optional(),
  baseUrl: z.string().trim().url().max(1000).optional(),
  apiKey: z.string().trim().max(2000).optional().or(z.literal('')),
  status: z.enum(['active', 'disabled']).optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(-1000000).max(1000000).optional(),
  description: z.string().trim().max(500).optional().or(z.literal(''))
});

router.get('/chat-models', async (_req, res, next) => {
  try {
    const items = await listAdminChatModels();
    res.json({ items: items.map((item) => serializeChatModel(item, { admin: true })) });
  } catch (error) {
    next(error);
  }
});

router.post('/chat-models', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = modelCreateSchema.parse(req.body);
    const item = await createChatModel({
      ...parsed,
      apiKey: parsed.apiKey || undefined,
      description: parsed.description || null
    }, req.user?.id || null);
    await writeAuditLog({
      actor: req.user,
      action: 'chat_models.created',
      targetType: 'chat_model',
      targetId: item.id,
      metadata: { name: item.name, modelKey: item.model_key, status: item.status, isDefault: Boolean(item.is_default) },
      req
    });
    res.status(201).json({ item: serializeChatModel(item, { admin: true }) });
  } catch (error) {
    next(error);
  }
});

router.patch('/chat-models/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = numericParam(req.params.id, 'Invalid chat model id');
    const before = await getChatModelById(id);
    if (!before) throw httpError(404, 'Chat model not found');
    const parsed = modelPatchSchema.parse(req.body);
    const item = await updateChatModel(id, {
      ...parsed,
      apiKey: parsed.apiKey || undefined,
      description: parsed.description === undefined ? undefined : parsed.description || null
    }, req.user?.id || null);
    await writeAuditLog({
      actor: req.user,
      action: auditAction(before.status, item.status, Boolean(before.is_default), Boolean(item.is_default)),
      targetType: 'chat_model',
      targetId: item.id,
      metadata: { ...parsed, apiKey: parsed.apiKey ? '[updated]' : undefined },
      req
    });
    res.json({ item: serializeChatModel(item, { admin: true }) });
  } catch (error) {
    next(error);
  }
});

router.delete('/chat-models/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = numericParam(req.params.id, 'Invalid chat model id');
    const item = await updateChatModel(id, { status: 'disabled', isDefault: false }, req.user?.id || null);
    await writeAuditLog({
      actor: req.user,
      action: 'chat_models.disabled',
      targetType: 'chat_model',
      targetId: item.id,
      metadata: { name: item.name, modelKey: item.model_key },
      req
    });
    res.json({ item: serializeChatModel(item, { admin: true }) });
  } catch (error) {
    next(error);
  }
});

router.post('/chat-models/:id/test', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = numericParam(req.params.id, 'Invalid chat model id');
    const model = await getActiveChatModelWithSecret(id);
    let text = '';
    for await (const delta of streamChatCompletion({
      model,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      timeoutMs: 20000
    })) {
      text += delta;
      if (text.length > 20) break;
    }
    await writeAuditLog({
      actor: req.user,
      action: 'chat_models.tested',
      targetType: 'chat_model',
      targetId: id,
      metadata: { ok: true },
      req
    });
    res.json({ ok: true });
  } catch (error) {
    if (req.user) {
      await writeAuditLog({
        actor: req.user,
        action: 'chat_models.tested',
        targetType: 'chat_model',
        targetId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
        metadata: { ok: false, error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' },
        req
      }).catch(() => undefined);
    }
    next(error);
  }
});

function auditAction(beforeStatus: string, afterStatus: string, beforeDefault: boolean, afterDefault: boolean) {
  if (!beforeDefault && afterDefault) return 'chat_models.default_changed';
  if (beforeStatus !== afterStatus && afterStatus === 'active') return 'chat_models.enabled';
  if (beforeStatus !== afterStatus && afterStatus === 'disabled') return 'chat_models.disabled';
  return 'chat_models.updated';
}

function numericParam(value: string | string[], message: string) {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, message);
  return id;
}

export { router as adminChatModelsRouter };
