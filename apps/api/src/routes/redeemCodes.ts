import express from 'express';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { writeAuditLog } from '../audit.js';
import { httpError } from '../errors.js';
import { redeemCodeForUser } from '../redeemCodes.js';

const router = express.Router();
router.use(requireUser);

const redeemSchema = z.object({
  code: z.string().trim().min(1).max(80)
});

router.post('/redeem', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, '请先登录');
    const parsed = redeemSchema.parse(req.body);
    const result = await redeemCodeForUser({
      userId: req.user.id,
      code: parsed.code
    });
    await writeAuditLog({
      actor: req.user,
      action: 'redeem_codes.redeemed',
      targetType: 'redeem_code',
      targetId: result.codeId,
      targetUserId: req.user.id,
      metadata: { batchId: result.batchId, credits: result.credits },
      req
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as redeemCodesRouter };
