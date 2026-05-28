import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import {
  getPool,
  type ChatConversationRow,
  type ChatMessageRole,
  type ChatMessageRow,
  type ChatMessageStatus
} from './db.js';
import { httpError } from './errors.js';

export interface CreateMessageInput {
  conversationId: number;
  userId?: number | null;
  guestSessionId?: number | null;
  role: ChatMessageRole;
  content: string;
  status?: ChatMessageStatus;
  errorMessage?: string | null;
  chatModelId?: number | null;
  modelNameSnapshot?: string | null;
  modelKeySnapshot?: string | null;
  creditCost?: number;
  creditTransactionId?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface ChatOwner {
  userId?: number | null;
  guestSessionId?: number | null;
}

export async function listChatConversations(owner: ChatOwner) {
  const condition = ownerCondition(owner, 'chat_conversations');
  const [rows] = await getPool().query<ChatConversationRow[]>(
    `SELECT * FROM chat_conversations
     WHERE ${condition.sql} AND status = 'active'
     ORDER BY COALESCE(last_message_at, updated_at) DESC, id DESC`,
    condition.params
  );
  return rows;
}

export async function createChatConversation(owner: ChatOwner, title = '新对话') {
  assertOwner(owner);
  const [result] = await getPool().execute<ResultSetHeader>(
    `INSERT INTO chat_conversations (user_id, guest_session_id, title, title_is_auto, status)
     VALUES (?, ?, ?, 1, 'active')`,
    [owner.userId || null, owner.guestSessionId || null, cleanTitle(title)]
  );
  return getChatConversationForOwner(result.insertId, owner);
}

export async function getChatConversationForOwner(id: number, owner: ChatOwner) {
  const condition = ownerCondition(owner, 'chat_conversations');
  const [rows] = await getPool().query<ChatConversationRow[]>(
    `SELECT * FROM chat_conversations WHERE id = ? AND ${condition.sql} AND status = 'active'`,
    [id, ...condition.params]
  );
  const row = rows[0];
  if (!row) throw httpError(404, 'Chat conversation not found');
  return row;
}

export const getChatConversationForUser = (id: number, userId: number) => getChatConversationForOwner(id, { userId });

export async function updateChatConversationTitle(id: number, owner: ChatOwner, title: string) {
  const condition = ownerCondition(owner, 'chat_conversations');
  await getChatConversationForOwner(id, owner);
  await getPool().execute(
    `UPDATE chat_conversations SET title = ?, title_is_auto = 0 WHERE id = ? AND ${condition.sql}`,
    [cleanTitle(title), id, ...condition.params]
  );
  return getChatConversationForOwner(id, owner);
}

export async function softDeleteChatConversation(id: number, owner: ChatOwner) {
  const condition = ownerCondition(owner, 'chat_conversations');
  await getChatConversationForOwner(id, owner);
  await getPool().execute(
    `UPDATE chat_conversations
     SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP
     WHERE id = ? AND ${condition.sql}`,
    [id, ...condition.params]
  );
}

export async function listChatMessages(conversationId: number, owner: ChatOwner) {
  await getChatConversationForOwner(conversationId, owner);
  return listChatMessagesForKnownConversation(conversationId, owner);
}

export async function listChatMessagesForKnownConversation(conversationId: number, owner: ChatOwner) {
  const condition = ownerCondition(owner, 'chat_messages');
  const [rows] = await getPool().query<ChatMessageRow[]>(
    `SELECT * FROM chat_messages
     WHERE conversation_id = ? AND ${condition.sql}
     ORDER BY created_at ASC, id ASC`,
    [conversationId, ...condition.params]
  );
  return rows;
}

export async function listCompletedHistoryMessages(
  conversationId: number,
  owner: ChatOwner,
  limit: number
) {
  const condition = ownerCondition(owner, 'chat_messages');
  const [rows] = await getPool().query<ChatMessageRow[]>(
    `SELECT * FROM (
       SELECT * FROM chat_messages
       WHERE conversation_id = ? AND ${condition.sql} AND status = 'completed' AND role IN ('user', 'assistant')
       ORDER BY created_at DESC, id DESC
       LIMIT ?
     ) recent
     ORDER BY created_at ASC, id ASC`,
    [conversationId, ...condition.params, limit]
  );
  return rows;
}

export async function createChatMessageInConnection(
  connection: PoolConnection,
  input: CreateMessageInput
) {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO chat_messages
       (conversation_id, user_id, guest_session_id, role, content, status, error_message, chat_model_id, model_name_snapshot,
         model_key_snapshot, credit_cost, credit_transaction_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.conversationId,
      input.userId || null,
      input.guestSessionId || null,
      input.role,
      input.content,
      input.status || 'completed',
      input.errorMessage || null,
      input.chatModelId || null,
      input.modelNameSnapshot || null,
      input.modelKeySnapshot || null,
      input.creditCost || 0,
      input.creditTransactionId || null,
      input.metadata ? JSON.stringify(input.metadata) : null
    ]
  );
  const message = await getChatMessageByIdInConnection(connection, result.insertId);
  await touchConversationInConnection(connection, input.conversationId, input.role === 'user' ? input.content : '');
  return message;
}

export async function updateAssistantMessage(
  id: number,
  patch: {
    content?: string;
    status?: ChatMessageStatus;
    errorMessage?: string | null;
    creditTransactionId?: number | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  await getPool().execute(
    `UPDATE chat_messages
     SET content = COALESCE(?, content),
         status = COALESCE(?, status),
         error_message = ?,
         credit_transaction_id = COALESCE(?, credit_transaction_id),
         metadata_json = COALESCE(?, metadata_json)
     WHERE id = ?`,
    [
      patch.content === undefined ? null : patch.content,
      patch.status || null,
      patch.errorMessage === undefined ? null : patch.errorMessage,
      patch.creditTransactionId || null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
      id
    ]
  );
  return getChatMessageById(id);
}

export async function markChatMessageRefunded(messageId: number) {
  await getPool().execute(
    'UPDATE chat_messages SET credit_refunded_at = CURRENT_TIMESTAMP WHERE id = ? AND credit_refunded_at IS NULL',
    [messageId]
  );
}

export async function getChatMessageById(id: number) {
  const [rows] = await getPool().query<ChatMessageRow[]>('SELECT * FROM chat_messages WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) throw httpError(404, 'Chat message not found');
  return row;
}

export async function getChatMessageByIdInConnection(connection: PoolConnection, id: number) {
  const [rows] = await connection.query<ChatMessageRow[]>('SELECT * FROM chat_messages WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) throw httpError(404, 'Chat message not found');
  return row;
}

export function serializeChatConversation(row: ChatConversationRow) {
  return {
    id: row.id,
    userId: row.user_id,
    guestSessionId: row.guest_session_id,
    title: row.title,
    titleIsAuto: Boolean(row.title_is_auto),
    status: row.status,
    lastMessageAt: row.last_message_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeChatMessage(row: ChatMessageRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    guestSessionId: row.guest_session_id,
    role: row.role,
    content: row.content,
    status: row.status,
    errorMessage: row.error_message,
    chatModelId: row.chat_model_id,
    modelNameSnapshot: row.model_name_snapshot,
    modelKeySnapshot: row.model_key_snapshot,
    creditCost: row.credit_cost,
    creditTransactionId: row.credit_transaction_id,
    creditRefundedAt: row.credit_refunded_at,
    metadata: row.metadata_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function assertOwner(owner: ChatOwner) {
  if (owner.userId || owner.guestSessionId) return;
  throw httpError(401, 'Chat owner is required');
}

function ownerCondition(owner: ChatOwner, tableName: 'chat_conversations' | 'chat_messages') {
  assertOwner(owner);
  const prefix = tableName ? '' : '';
  if (owner.userId) return { sql: `${prefix}user_id = ?`, params: [owner.userId] as number[] };
  return { sql: `${prefix}guest_session_id = ?`, params: [owner.guestSessionId as number] };
}

async function touchConversationInConnection(
  connection: PoolConnection,
  conversationId: number,
  userContentForTitle: string
) {
  if (userContentForTitle) {
    await connection.execute(
      `UPDATE chat_conversations
       SET last_message_at = CURRENT_TIMESTAMP,
           title = CASE WHEN title_is_auto = 1 THEN ? ELSE title END,
           title_is_auto = CASE WHEN title_is_auto = 1 THEN 0 ELSE title_is_auto END
       WHERE id = ?`,
      [autoTitle(userContentForTitle), conversationId]
    );
    return;
  }
  await connection.execute(
    'UPDATE chat_conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?',
    [conversationId]
  );
}

function cleanTitle(title: string) {
  const trimmed = title.trim();
  return trimmed ? trimmed.slice(0, 160) : '新对话';
}

function autoTitle(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return (normalized || '新对话').slice(0, 30);
}
