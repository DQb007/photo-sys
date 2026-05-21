import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import {
  getPool,
  type CreditTransactionRow,
  type CreditTransactionType,
  type GenerationRow,
  type UserRow
} from './db.js';
import { httpError } from './errors.js';
import { getAppSettings, type AppSettings } from './settingsService.js';

export interface CreditTransactionInput {
  userId: number;
  type: CreditTransactionType;
  amount: number;
  generationId?: number | null;
  actorUserId?: number | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreditTransactionResult {
  transaction: CreditTransactionRow;
  balanceAfter: number;
}

export function calculateGenerationCreditCost(count: number, settings: AppSettings) {
  if (!settings.credits.enabled) return 0;
  return count * settings.credits.costPerImage;
}

export function calculateChatMessageCreditCost(settings: AppSettings) {
  return settings.chat.messageCreditCost;
}

export async function applyCreditTransaction(input: CreditTransactionInput) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await applyCreditTransactionInConnection(connection, input);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listCreditTransactions(userId: number, page: number, pageSize: number) {
  const safePage = Math.max(page, 1);
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const offset = (safePage - 1) * safePageSize;
  const pool = getPool();
  const [countRows] = await pool.query<Array<{ total: number } & import('mysql2').RowDataPacket>>(
    'SELECT COUNT(*) AS total FROM credit_transactions WHERE user_id = ?',
    [userId]
  );
  const [items] = await pool.query<CreditTransactionRow[]>(
    `SELECT * FROM credit_transactions
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, safePageSize, offset]
  );
  const total = Number(countRows[0]?.total || 0);
  return {
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages: Math.max(Math.ceil(total / safePageSize), 1),
    items
  };
}

export function serializeCreditTransaction(row: CreditTransactionRow) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balance_after,
    generationId: row.generation_id,
    actorUserId: row.actor_user_id,
    reason: row.reason,
    metadata: row.metadata_json,
    createdAt: row.created_at
  };
}

export async function applyCreditTransactionInConnection(
  connection: PoolConnection,
  input: CreditTransactionInput
): Promise<CreditTransactionResult> {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw httpError(422, '积分变更数量无效');
  }

  const user = await lockUserForCredits(connection, input.userId);
  const nextBalance = user.credit_balance + input.amount;
  if (nextBalance < 0) {
    throw httpError(409, '积分余额不足', 'INSUFFICIENT_CREDITS');
  }

  await connection.execute('UPDATE users SET credit_balance = ? WHERE id = ?', [nextBalance, input.userId]);
  const [insertResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO credit_transactions
       (user_id, type, amount, balance_after, generation_id, actor_user_id, reason, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.type,
      input.amount,
      nextBalance,
      input.generationId || null,
      input.actorUserId || null,
      input.reason || null,
      input.metadata ? JSON.stringify(input.metadata) : null
    ]
  );

  const transaction = await getCreditTransactionById(connection, insertResult.insertId);
  return { transaction, balanceAfter: nextBalance };
}

export async function grantInitialCredits(userId: number, amount: number) {
  if (amount <= 0) return null;
  return applyCreditTransaction({
    userId,
    type: 'initial_grant',
    amount,
    reason: '新用户初始积分'
  });
}

export async function debitGenerationCreditsInConnection(
  connection: PoolConnection,
  input: {
    userId: number;
    generationId: number;
    creditCost: number;
    count: number;
  }
) {
  if (input.creditCost <= 0) return null;
  return applyCreditTransactionInConnection(connection, {
    userId: input.userId,
    type: 'generation_debit',
    amount: -input.creditCost,
    generationId: input.generationId,
    reason: '图片生成扣费',
    metadata: { count: input.count }
  });
}

export async function refundGenerationCreditsIfNeeded(generationId: number) {
  const settings = await getAppSettings({ includeSecrets: true, fresh: true }) as AppSettings;
  if (!settings.credits.refundOnFailure) return null;

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const generation = await lockGenerationForRefund(connection, generationId);
    if (generation.credit_cost <= 0 || generation.credit_refunded_at) {
      await connection.commit();
      return null;
    }

    const result = await applyCreditTransactionInConnection(connection, {
      userId: generation.user_id,
      type: 'generation_refund',
      amount: generation.credit_cost,
      generationId: generation.id,
      reason: '生成失败自动退还',
      metadata: { generationId: generation.id }
    });

    await connection.execute(
      'UPDATE generations SET credit_refunded_at = CURRENT_TIMESTAMP WHERE id = ? AND credit_refunded_at IS NULL',
      [generation.id]
    );
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function refundCancelledGenerationCreditsInConnection(
  connection: PoolConnection,
  generationId: number,
  actorUserId?: number | null
) {
  const generation = await lockGenerationForRefund(connection, generationId);
  if (generation.credit_cost <= 0 || generation.credit_refunded_at) {
    return null;
  }

  const result = await applyCreditTransactionInConnection(connection, {
    userId: generation.user_id,
    type: 'generation_cancel_refund',
    amount: generation.credit_cost,
    generationId: generation.id,
    actorUserId: actorUserId || null,
    reason: '取消生成退还积分',
    metadata: { generationId: generation.id }
  });

  await connection.execute(
    'UPDATE generations SET credit_refunded_at = CURRENT_TIMESTAMP WHERE id = ? AND credit_refunded_at IS NULL',
    [generation.id]
  );
  return result;
}

async function lockUserForCredits(connection: PoolConnection, userId: number) {
  const [rows] = await connection.query<UserRow[]>(
    'SELECT * FROM users WHERE id = ? FOR UPDATE',
    [userId]
  );
  const user = rows[0];
  if (!user) throw httpError(404, '用户不存在');
  return user;
}

async function getCreditTransactionById(connection: PoolConnection, id: number) {
  const [rows] = await connection.query<CreditTransactionRow[]>('SELECT * FROM credit_transactions WHERE id = ?', [id]);
  const transaction = rows[0];
  if (!transaction) throw httpError(500, '积分流水创建失败');
  return transaction;
}

async function lockGenerationForRefund(connection: PoolConnection, generationId: number) {
  const [rows] = await connection.query<GenerationRow[]>(
    'SELECT * FROM generations WHERE id = ? FOR UPDATE',
    [generationId]
  );
  const generation = rows[0];
  if (!generation) throw httpError(404, '生成记录不存在');
  return generation;
}
