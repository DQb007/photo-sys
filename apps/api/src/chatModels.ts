import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { getPool, type ChatModelRow, type ChatModelStatus } from './db.js';
import { decryptSettingSecret, encryptSettingSecret } from './cryptoSettings.js';
import { httpError } from './errors.js';

export interface ChatModelInput {
  name: string;
  modelKey: string;
  baseUrl: string;
  apiKey?: string;
  status?: ChatModelStatus;
  isDefault?: boolean;
  sortOrder?: number;
  description?: string | null;
}

export interface ChatModelPatch {
  name?: string;
  modelKey?: string;
  baseUrl?: string;
  apiKey?: string;
  status?: ChatModelStatus;
  isDefault?: boolean;
  sortOrder?: number;
  description?: string | null;
}

export interface ChatModelWithSecret extends ChatModelRow {
  apiKey: string;
}

export async function listAdminChatModels() {
  const [rows] = await getPool().query<ChatModelRow[]>(
    'SELECT * FROM chat_models ORDER BY sort_order ASC, created_at DESC'
  );
  return rows;
}

export async function listActiveChatModels() {
  const [rows] = await getPool().query<ChatModelRow[]>(
    `SELECT * FROM chat_models
     WHERE status = 'active'
     ORDER BY is_default DESC, sort_order ASC, created_at DESC`
  );
  return rows;
}

export async function getDefaultChatModel() {
  const [rows] = await getPool().query<ChatModelRow[]>(
    `SELECT * FROM chat_models
     WHERE status = 'active'
     ORDER BY is_default DESC, sort_order ASC, created_at DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

export async function getChatModelById(id: number) {
  const [rows] = await getPool().query<ChatModelRow[]>('SELECT * FROM chat_models WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function getActiveChatModelWithSecret(id: number): Promise<ChatModelWithSecret> {
  const model = await getChatModelById(id);
  if (!model || model.status !== 'active') {
    throw httpError(409, 'Chat model is unavailable', 'CHAT_MODEL_UNAVAILABLE');
  }
  if (!model.api_key_encrypted) {
    throw httpError(409, 'Chat model API key is not configured', 'CHAT_MODEL_NOT_CONFIGURED');
  }
  return {
    ...model,
    apiKey: decryptSettingSecret(model.api_key_encrypted)
  };
}

export async function createChatModel(input: ChatModelInput, actorUserId: number | null) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.isDefault) {
      await connection.execute('UPDATE chat_models SET is_default = 0 WHERE is_default = 1');
    }
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO chat_models
        (name, model_key, base_url, api_key_encrypted, status, is_default, sort_order, description, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.modelKey,
        input.baseUrl,
        input.apiKey ? encryptSettingSecret(input.apiKey) : null,
        input.status || 'active',
        input.isDefault ? 1 : 0,
        input.sortOrder ?? 0,
        input.description || null,
        actorUserId,
        actorUserId
      ]
    );
    await ensureDefaultModelInConnection(connection);
    await connection.commit();
    const item = await getChatModelById(result.insertId);
    if (!item) throw httpError(500, 'Chat model was not created');
    return item;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateChatModel(id: number, patch: ChatModelPatch, actorUserId: number | null) {
  const current = await getChatModelById(id);
  if (!current) throw httpError(404, 'Chat model not found');

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (patch.isDefault) {
      await connection.execute('UPDATE chat_models SET is_default = 0 WHERE is_default = 1 AND id <> ?', [id]);
    }

    const nextStatus = patch.status ?? current.status;
    const nextIsDefault = patch.isDefault === undefined ? Boolean(current.is_default) : patch.isDefault;
    if (nextStatus === 'disabled' && nextIsDefault) {
      throw httpError(409, 'Default chat model cannot be disabled', 'DEFAULT_CHAT_MODEL_REQUIRED');
    }

    await connection.execute(
      `UPDATE chat_models
       SET name = ?,
           model_key = ?,
           base_url = ?,
           api_key_encrypted = ?,
           status = ?,
           is_default = ?,
           sort_order = ?,
           description = ?,
           updated_by = ?
       WHERE id = ?`,
      [
        patch.name ?? current.name,
        patch.modelKey ?? current.model_key,
        patch.baseUrl ?? current.base_url,
        patch.apiKey ? encryptSettingSecret(patch.apiKey) : current.api_key_encrypted,
        nextStatus,
        nextIsDefault ? 1 : 0,
        patch.sortOrder ?? current.sort_order,
        patch.description === undefined ? current.description : patch.description || null,
        actorUserId,
        id
      ]
    );
    await ensureDefaultModelInConnection(connection);
    await connection.commit();
    const item = await getChatModelById(id);
    if (!item) throw httpError(404, 'Chat model not found');
    return item;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function serializeChatModel(row: ChatModelRow, options: { admin?: boolean } = {}) {
  return {
    id: row.id,
    name: row.name,
    modelKey: row.model_key,
    baseUrl: options.admin ? row.base_url : undefined,
    status: row.status,
    isDefault: Boolean(row.is_default),
    sortOrder: row.sort_order,
    description: row.description,
    hasApiKey: Boolean(row.api_key_encrypted),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function ensureDefaultModelInConnection(connection: PoolConnection) {
  const [defaults] = await connection.query<Array<{ id: number } & import('mysql2').RowDataPacket>>(
    "SELECT id FROM chat_models WHERE status = 'active' AND is_default = 1 ORDER BY updated_at DESC"
  );
  if (defaults.length > 1) {
    const [keep, ...rest] = defaults;
    await connection.execute(`UPDATE chat_models SET is_default = 0 WHERE id IN (${rest.map(() => '?').join(',')})`, rest.map((item) => item.id));
    await connection.execute('UPDATE chat_models SET is_default = 1 WHERE id = ?', [keep.id]);
    return;
  }
  if (defaults.length === 1) return;
  const [activeRows] = await connection.query<Array<{ id: number } & import('mysql2').RowDataPacket>>(
    "SELECT id FROM chat_models WHERE status = 'active' ORDER BY sort_order ASC, created_at DESC LIMIT 1"
  );
  if (activeRows[0]) {
    await connection.execute('UPDATE chat_models SET is_default = 1 WHERE id = ?', [activeRows[0].id]);
  }
}
