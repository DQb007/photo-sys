import express from 'express';
import { requireUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { listCreditTransactions, serializeCreditTransaction } from '../credits.js';
import { httpError } from '../errors.js';
import { getAppSettings, type AppSettings } from '../settingsService.js';
import { getUserById } from '../users.js';

const router = express.Router();
router.use(requireUser);

router.get('/balance', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, '请先登录');
    const user = await getUserById(req.user.id);
    if (!user) throw httpError(404, '用户不存在');
    const settings = await getAppSettings() as AppSettings;
    res.json({
      balance: user.credit_balance,
      credits: settings.credits
    });
  } catch (error) {
    next(error);
  }
});

router.get('/transactions', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, '请先登录');
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 20);
    const result = await listCreditTransactions(req.user.id, page, pageSize);
    res.json({
      ...result,
      items: result.items.map(serializeCreditTransaction)
    });
  } catch (error) {
    next(error);
  }
});

export { router as creditsRouter };
