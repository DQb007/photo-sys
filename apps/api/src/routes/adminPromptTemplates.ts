import express from 'express';
import { z } from 'zod';
import { requireAdmin, requireUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { writeAuditLog } from '../audit.js';
import { httpError } from '../errors.js';
import {
  createPromptTemplate,
  getAdminPromptTemplateById,
  listAdminPromptTemplates,
  serializePromptTemplate,
  softDeletePromptTemplate,
  updatePromptTemplate
} from '../promptTemplates.js';

const router = express.Router();
router.use(requireUser, requireAdmin);

const promptTemplateCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  promptText: z.string().trim().min(1).max(8000),
  category: z.string().trim().max(80).optional().or(z.literal('')),
  status: z.enum(['active', 'disabled']).optional(),
  sortOrder: z.number().int().min(-1000000).max(1000000).optional()
});

const promptTemplatePatchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  promptText: z.string().trim().min(1).max(8000).optional(),
  category: z.string().trim().max(80).optional().or(z.literal('')),
  status: z.enum(['active', 'disabled']).optional(),
  sortOrder: z.number().int().min(-1000000).max(1000000).optional()
});

router.get('/prompt-templates', async (req, res, next) => {
  try {
    const status = req.query.status === 'active' || req.query.status === 'disabled' ? req.query.status : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const items = await listAdminPromptTemplates({ status, search });
    res.json({ items: items.map(serializePromptTemplate) });
  } catch (error) {
    next(error);
  }
});

router.post('/prompt-templates', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = promptTemplateCreateSchema.parse(req.body);
    const item = await createPromptTemplate({
      ...parsed,
      description: parsed.description || null,
      category: parsed.category || null,
      sortOrder: parsed.sortOrder ?? 0
    }, req.user?.id || null);
    await writeAuditLog({
      actor: req.user,
      action: 'prompt_templates.created',
      targetType: 'prompt_template',
      targetId: item.id,
      metadata: { title: item.title, status: item.status, category: item.category },
      req
    });
    res.status(201).json({ item: serializePromptTemplate(item) });
  } catch (error) {
    next(error);
  }
});

router.patch('/prompt-templates/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = numericParam(req.params.id, 'Invalid prompt template id');
    const before = await getAdminPromptTemplateById(id);
    const parsed = promptTemplatePatchSchema.parse(req.body);
    const item = await updatePromptTemplate(id, {
      ...parsed,
      description: parsed.description === undefined ? undefined : parsed.description || null,
      category: parsed.category === undefined ? undefined : parsed.category || null
    }, req.user?.id || null);
    const statusAction = statusAuditAction(before.status, item.status);
    await writeAuditLog({
      actor: req.user,
      action: statusAction || 'prompt_templates.updated',
      targetType: 'prompt_template',
      targetId: item.id,
      metadata: parsed,
      req
    });
    res.json({ item: serializePromptTemplate(item) });
  } catch (error) {
    next(error);
  }
});

router.delete('/prompt-templates/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = numericParam(req.params.id, 'Invalid prompt template id');
    const item = await getAdminPromptTemplateById(id);
    await softDeletePromptTemplate(id, req.user?.id || null);
    await writeAuditLog({
      actor: req.user,
      action: 'prompt_templates.deleted',
      targetType: 'prompt_template',
      targetId: item.id,
      metadata: { title: item.title },
      req
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

function statusAuditAction(before: string, after: string) {
  if (before === after) return '';
  if (after === 'active') return 'prompt_templates.enabled';
  if (after === 'disabled') return 'prompt_templates.disabled';
  return '';
}

function numericParam(value: string | string[], message: string) {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, message);
  return id;
}

export { router as adminPromptTemplatesRouter };
