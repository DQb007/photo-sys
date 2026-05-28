import express from 'express';
import { optionalUserOrGuest, requireActiveUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { httpError } from '../errors.js';
import {
  favoritePromptTemplate,
  listPromptTemplateCategories,
  listPromptTemplates,
  markPromptTemplateUsed,
  serializePromptTemplate,
  unfavoritePromptTemplate
} from '../promptTemplates.js';

const router = express.Router();
router.use(optionalUserOrGuest);

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = req.user && req.query.scope === 'favorites' ? 'favorites' : 'all';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const [items, categories] = await Promise.all([
      listPromptTemplates({
        userId: req.user?.id || null,
        scope,
        category,
        search
      }),
      listPromptTemplateCategories()
    ]);
    res.json({
      items: items.map(serializePromptTemplate),
      categories
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/favorite', requireActiveUser, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, '璇峰厛鐧诲綍');
    const id = numericParam(req.params.id, 'Invalid prompt template id');
    await favoritePromptTemplate(req.user.id, id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/favorite', requireActiveUser, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, '璇峰厛鐧诲綍');
    const id = numericParam(req.params.id, 'Invalid prompt template id');
    await unfavoritePromptTemplate(req.user.id, id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/use', async (req, res, next) => {
  try {
    const id = numericParam(req.params.id, 'Invalid prompt template id');
    const item = await markPromptTemplateUsed(id);
    res.json({ item: serializePromptTemplate(item) });
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

export { router as promptTemplatesRouter };
