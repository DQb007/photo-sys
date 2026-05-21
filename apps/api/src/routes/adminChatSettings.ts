import express from 'express';
import { z } from 'zod';
import { requireAdmin, requireUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { writeAuditLog } from '../audit.js';
import { getAppSettings, updateAppSettings, type AppSettings } from '../settingsService.js';

const router = express.Router();
router.use(requireUser, requireAdmin);

const chatSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  messageCreditCost: z.number().int().min(0).max(100000).optional(),
  systemPrompt: z.string().max(12000).optional(),
  maxInputChars: z.number().int().min(1).max(50000).optional(),
  maxHistoryMessages: z.number().int().min(1).max(100).optional(),
  requestTimeoutMs: z.number().int().min(1000).max(600000).optional()
});

router.get('/chat-settings', async (_req, res, next) => {
  try {
    const settings = await getAppSettings() as AppSettings;
    res.json({ settings: settings.chat });
  } catch (error) {
    next(error);
  }
});

router.patch('/chat-settings', async (req: AuthenticatedRequest, res, next) => {
  try {
    const patch = chatSettingsPatchSchema.parse(req.body);
    const settings = await updateAppSettings({ chat: patch }, req.user?.id || null) as AppSettings;
    await writeAuditLog({
      actor: req.user,
      action: 'chat_settings.updated',
      targetType: 'chat_settings',
      metadata: { keys: Object.keys(patch) },
      req
    });
    res.json({ settings: settings.chat });
  } catch (error) {
    next(error);
  }
});

export { router as adminChatSettingsRouter };
