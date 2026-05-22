import express from 'express';
import { z } from 'zod';
import { requireActiveUser, requireUser, type AuthenticatedRequest } from '../authMiddleware.js';
import { getPool } from '../db.js';
import { httpError } from '../errors.js';
import { getAppSettings, type AppSettings } from '../settingsService.js';
import {
  getActiveChatModelWithSecret,
  listActiveChatModels,
  serializeChatModel
} from '../chatModels.js';
import {
  createChatConversation,
  createChatMessageInConnection,
  getChatConversationForUser,
  getChatMessageById,
  listChatConversations,
  listChatMessages,
  listChatMessagesForKnownConversation,
  listCompletedHistoryMessages,
  markChatMessageRefunded,
  serializeChatConversation,
  serializeChatMessage,
  softDeleteChatConversation,
  updateAssistantMessage,
  updateChatConversationTitle
} from '../chatConversations.js';
import { applyCreditTransaction, applyCreditTransactionInConnection, calculateChatMessageCreditCost, serializeCreditTransaction } from '../credits.js';
import { buildRelayMessages, streamChatCompletion } from '../chatRelay.js';

const router = express.Router();

const conversationCreateSchema = z.object({
  title: z.string().trim().max(160).optional().or(z.literal(''))
});

const conversationPatchSchema = z.object({
  title: z.string().trim().min(1).max(160)
});

const sendMessageSchema = z.object({
  content: z.string().trim().min(1),
  chatModelId: z.number().int().min(1),
  attachments: z.array(z.object({
    name: z.string().trim().min(1).max(240),
    type: z.string().trim().max(120).optional().default('application/octet-stream'),
    size: z.number().int().min(0).max(10 * 1024 * 1024),
    dataUrl: z.string().max(14 * 1024 * 1024).optional(),
    content: z.string().max(12000).optional()
  })).max(6).optional().default([])
});

router.use(requireUser);

router.get('/bootstrap', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, 'Please sign in');
    const [settings, models, conversations] = await Promise.all([
      getAppSettings() as Promise<AppSettings>,
      listActiveChatModels(),
      listChatConversations(req.user.id)
    ]);
    const firstConversation = conversations[0] || null;
    const defaultModel = models.find((item) => item.is_default) || models[0] || null;
    const messages = firstConversation ? await listChatMessagesForKnownConversation(firstConversation.id, req.user.id) : [];
    res.json({
      settings: {
        enabled: settings.chat.enabled,
        messageCreditCost: settings.chat.messageCreditCost,
        maxInputChars: settings.chat.maxInputChars,
        maxHistoryMessages: settings.chat.maxHistoryMessages
      },
      models: {
        items: models.map((item) => serializeChatModel(item)),
        defaultModelId: defaultModel?.id || null
      },
      conversations: {
        items: conversations.map(serializeChatConversation)
      },
      activeConversationId: firstConversation?.id || null,
      messages: {
        items: messages.map(serializeChatMessage)
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/settings', async (_req, res, next) => {
  try {
    const settings = await getAppSettings() as AppSettings;
    res.json({
      enabled: settings.chat.enabled,
      messageCreditCost: settings.chat.messageCreditCost,
      maxInputChars: settings.chat.maxInputChars,
      maxHistoryMessages: settings.chat.maxHistoryMessages
    });
  } catch (error) {
    next(error);
  }
});

router.get('/models', async (_req, res, next) => {
  try {
    const items = await listActiveChatModels();
    const defaultModel = items.find((item) => item.is_default) || items[0] || null;
    res.json({
      items: items.map((item) => serializeChatModel(item)),
      defaultModelId: defaultModel?.id || null
    });
  } catch (error) {
    next(error);
  }
});

router.get('/conversations', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, 'Please sign in');
    const items = await listChatConversations(req.user.id);
    res.json({ items: items.map(serializeChatConversation) });
  } catch (error) {
    next(error);
  }
});

router.post('/conversations', requireActiveUser, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, 'Please sign in');
    const parsed = conversationCreateSchema.parse(req.body);
    const item = await createChatConversation(req.user.id, parsed.title || undefined);
    res.status(201).json({ item: serializeChatConversation(item) });
  } catch (error) {
    next(error);
  }
});

router.patch('/conversations/:id', requireActiveUser, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, 'Please sign in');
    const id = numericParam(req.params.id, 'Invalid conversation id');
    const parsed = conversationPatchSchema.parse(req.body);
    const item = await updateChatConversationTitle(id, req.user.id, parsed.title);
    res.json({ item: serializeChatConversation(item) });
  } catch (error) {
    next(error);
  }
});

router.delete('/conversations/:id', requireActiveUser, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, 'Please sign in');
    await softDeleteChatConversation(numericParam(req.params.id, 'Invalid conversation id'), req.user.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/conversations/:id/messages', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) throw httpError(401, 'Please sign in');
    const items = await listChatMessages(numericParam(req.params.id, 'Invalid conversation id'), req.user.id);
    res.json({ items: items.map(serializeChatMessage) });
  } catch (error) {
    next(error);
  }
});

router.post('/conversations/:id/messages/stream', requireActiveUser, async (req: AuthenticatedRequest, res, next) => {
  let assistantMessageId: number | null = null;
  let creditCost = 0;
  let refunded = false;

  try {
    if (!req.user) throw httpError(401, 'Please sign in');
    const conversationId = numericParam(req.params.id, 'Invalid conversation id');
    const settings = await getAppSettings({ includeSecrets: true, fresh: true }) as AppSettings;
    if (!settings.chat.enabled) throw httpError(409, 'AI chat is disabled', 'CHAT_DISABLED');

    const parsed = sendMessageSchema.parse(req.body);
    if (parsed.content.length > settings.chat.maxInputChars) {
      throw httpError(400, 'Chat message is too long');
    }

    await getChatConversationForUser(conversationId, req.user.id);
    const model = await getActiveChatModelWithSecret(parsed.chatModelId);
    creditCost = calculateChatMessageCreditCost(settings);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const pool = getPool();
    const connection = await pool.getConnection();
    let userMessage;
    let assistantMessage;
    let debitTransactionId: number | null = null;
    try {
      await connection.beginTransaction();
      userMessage = await createChatMessageInConnection(connection, {
        conversationId,
        userId: req.user.id,
        role: 'user',
        content: parsed.content,
        chatModelId: model.id,
        modelNameSnapshot: model.name,
        modelKeySnapshot: model.model_key,
        creditCost,
        metadata: parsed.attachments.length ? { attachments: parsed.attachments } : null
      });
      if (creditCost > 0) {
        const debit = await applyCreditTransactionInConnection(connection, {
          userId: req.user.id,
          type: 'chat_message_debit',
          amount: -creditCost,
          reason: 'AI 对话扣费',
          metadata: {
            conversationId,
            userMessageId: userMessage.id,
            chatModelId: model.id,
            modelKey: model.model_key
          }
        });
        debitTransactionId = debit.transaction.id;
      }
      assistantMessage = await createChatMessageInConnection(connection, {
        conversationId,
        userId: req.user.id,
        role: 'assistant',
        content: '',
        status: 'streaming',
        chatModelId: model.id,
        modelNameSnapshot: model.name,
        modelKeySnapshot: model.model_key,
        creditCost,
        creditTransactionId: debitTransactionId
      });
      assistantMessageId = assistantMessage.id;
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    sendEvent(res, 'message_created', {
      userMessage: serializeChatMessage(userMessage),
      assistantMessage: serializeChatMessage(assistantMessage)
    });

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());
    let content = '';

    try {
      const history = await listCompletedHistoryMessages(conversationId, req.user.id, settings.chat.maxHistoryMessages);
      const relayMessages = buildRelayMessages({
        systemPrompt: settings.chat.systemPrompt,
        history,
        maxHistoryMessages: settings.chat.maxHistoryMessages
      });
      for await (const delta of streamChatCompletion({
        model,
        messages: relayMessages,
        timeoutMs: settings.chat.requestTimeoutMs,
        signal: abortController.signal
      })) {
        content += delta;
        sendEvent(res, 'delta', { delta });
      }

      const updated = await updateAssistantMessage(assistantMessage.id, {
        content,
        status: 'completed',
        errorMessage: null
      });
      const conversation = await getChatConversationForUser(conversationId, req.user.id);
      sendEvent(res, 'completed', {
        assistantMessage: serializeChatMessage(updated),
        conversation: serializeChatConversation(conversation)
      });
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Chat request failed';
      const updated = await updateAssistantMessage(assistantMessage.id, {
        content,
        status: abortController.signal.aborted ? 'cancelled' : 'failed',
        errorMessage: message
      });
      const refund = await refundChatMessageIfNeeded(assistantMessage.id, req.user.id, creditCost);
      refunded = Boolean(refund);
      sendEvent(res, 'failed', {
        error: message,
        assistantMessage: serializeChatMessage(updated),
        refund: refund ? serializeCreditTransaction(refund.transaction) : null
      });
      res.end();
    }
  } catch (error) {
    if (res.headersSent) {
      if (assistantMessageId && creditCost > 0 && !refunded && req.user) {
        await refundChatMessageIfNeeded(assistantMessageId, req.user.id, creditCost).catch(() => undefined);
      }
      sendEvent(res, 'failed', { error: error instanceof Error ? error.message : 'Chat request failed' });
      res.end();
      return;
    }
    next(error);
  }
});

async function refundChatMessageIfNeeded(messageId: number, userId: number, creditCost: number) {
  if (creditCost <= 0) return null;
  const message = await getChatMessageById(messageId);
  if (message.credit_refunded_at) return null;
  const result = await applyCreditTransaction({
    userId,
    type: 'chat_message_refund',
    amount: creditCost,
    reason: 'AI 对话失败退费',
    metadata: {
      conversationId: message.conversation_id,
      assistantMessageId: message.id,
      chatModelId: message.chat_model_id,
      modelKey: message.model_key_snapshot
    }
  });
  await markChatMessageRefunded(messageId);
  return result;
}

function sendEvent(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function numericParam(value: string | string[], message: string) {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, message);
  return id;
}

export { router as chatRouter };
