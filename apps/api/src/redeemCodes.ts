import crypto from 'node:crypto';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { applyCreditTransactionInConnection, serializeCreditTransaction } from './credits.js';
import {
  getPool,
  type CreditTransactionRow,
  type RedeemCodeBatchRow,
  type RedeemCodeRow,
  type RedeemCodeStatus,
  type RedeemPackageRow,
  type RedeemPackageStatus
} from './db.js';
import { httpError } from './errors.js';

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const maxBatchQuantity = 1000;

export interface RedeemPackageInput {
  name: string;
  credits: number;
  description?: string | null;
  status?: RedeemPackageStatus;
}

export interface RedeemBatchInput {
  packageId: number;
  quantity: number;
  expiresAt?: string | null;
  note?: string | null;
  actorUserId?: number | null;
}

export function serializeRedeemPackage(row: RedeemPackageRow) {
  return {
    id: row.id,
    name: row.name,
    credits: row.credits,
    status: row.status,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeRedeemBatch(row: RedeemCodeBatchRow & RedeemBatchStats) {
  return {
    id: row.id,
    packageId: row.package_id,
    packageNameSnapshot: row.package_name_snapshot,
    creditsSnapshot: row.credits_snapshot,
    quantity: row.quantity,
    activeCount: Number(row.active_count || 0),
    redeemedCount: Number(row.redeemed_count || 0),
    disabledCount: Number(row.disabled_count || 0),
    expiresAt: row.expires_at,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export function serializeRedeemCode(row: RedeemCodeRow & { redeemed_email?: string | null }) {
  return {
    id: row.id,
    batchId: row.batch_id,
    codeSuffix: row.code_suffix,
    credits: row.credits,
    status: row.status,
    redeemedBy: row.redeemed_by,
    redeemedEmail: row.redeemed_email || null,
    redeemedAt: row.redeemed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

export async function listRedeemPackages() {
  const [rows] = await getPool().query<RedeemPackageRow[]>(
    'SELECT * FROM redeem_packages ORDER BY created_at DESC, id DESC'
  );
  return rows;
}

export async function createRedeemPackage(input: RedeemPackageInput, actorUserId: number | null) {
  const [result] = await getPool().execute<ResultSetHeader>(
    `INSERT INTO redeem_packages (name, credits, status, description, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [input.name, input.credits, input.status || 'active', input.description || null, actorUserId]
  );
  return getRedeemPackageById(result.insertId);
}

export async function updateRedeemPackage(id: number, input: Partial<RedeemPackageInput>) {
  await getPool().execute(
    `UPDATE redeem_packages
     SET name = COALESCE(?, name),
         credits = COALESCE(?, credits),
         status = COALESCE(?, status),
         description = CASE WHEN ? THEN ? ELSE description END
     WHERE id = ?`,
    [
      input.name ?? null,
      input.credits ?? null,
      input.status ?? null,
      input.description !== undefined,
      input.description || null,
      id
    ]
  );
  return getRedeemPackageById(id);
}

export async function generateRedeemCodeBatch(input: RedeemBatchInput) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > maxBatchQuantity) {
    throw httpError(422, `Batch quantity must be between 1 and ${maxBatchQuantity}`, 'REDEEM_BATCH_QUANTITY_INVALID');
  }

  const expiresAt = parseOptionalDate(input.expiresAt);
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const packageRow = await lockRedeemPackage(connection, input.packageId);
    if (packageRow.status !== 'active') {
      throw httpError(409, 'Redeem package is disabled', 'REDEEM_PACKAGE_DISABLED');
    }

    const [batchResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO redeem_code_batches
         (package_id, package_name_snapshot, credits_snapshot, quantity, expires_at, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        packageRow.id,
        packageRow.name,
        packageRow.credits,
        input.quantity,
        expiresAt,
        input.note || null,
        input.actorUserId || null
      ]
    );

    const plaintextCodes: string[] = [];
    for (let index = 0; index < input.quantity; index += 1) {
      const code = await createUniquePlaintextCode(connection);
      plaintextCodes.push(code);
      const normalized = normalizeRedeemCode(code);
      await connection.execute(
        `INSERT INTO redeem_codes (batch_id, code_hash, code_suffix, credits, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          batchResult.insertId,
          hashRedeemCode(normalized),
          normalized.slice(-10),
          packageRow.credits,
          expiresAt
        ]
      );
    }

    await connection.commit();
    return {
      batch: await getRedeemBatchById(batchResult.insertId),
      codes: plaintextCodes
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listRedeemBatches() {
  const [rows] = await getPool().query<Array<RedeemCodeBatchRow & RedeemBatchStats>>(
    redeemBatchSelectSql('ORDER BY b.created_at DESC, b.id DESC LIMIT 100')
  );
  return rows;
}

export async function getRedeemBatchById(id: number) {
  const [rows] = await getPool().query<Array<RedeemCodeBatchRow & RedeemBatchStats>>(
    redeemBatchSelectSql('WHERE b.id = ?'),
    [id]
  );
  const batch = rows[0];
  if (!batch) throw httpError(404, 'Redeem code batch not found');
  return batch;
}

export async function listRedeemCodesForBatch(batchId: number) {
  await getRedeemBatchById(batchId);
  const [rows] = await getPool().query<Array<RedeemCodeRow & { redeemed_email?: string | null }>>(
    `SELECT c.*, u.email AS redeemed_email
     FROM redeem_codes c
     LEFT JOIN users u ON u.id = c.redeemed_by
     WHERE c.batch_id = ?
     ORDER BY c.id ASC
     LIMIT 1000`,
    [batchId]
  );
  return rows;
}

export async function disableRedeemCode(id: number) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const code = await lockRedeemCodeById(connection, id);
    if (code.status !== 'active') {
      throw httpError(409, 'Only active unused redeem codes can be disabled', 'REDEEM_CODE_NOT_ACTIVE');
    }
    await connection.execute('UPDATE redeem_codes SET status = ? WHERE id = ?', ['disabled', id]);
    await connection.commit();
    return getRedeemCodeById(id);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function redeemCodeForUser(input: { userId: number; code: string }) {
  const normalized = normalizeRedeemCode(input.code);
  if (!isRedeemCodeShape(normalized)) {
    throw httpError(400, '兑换码无效', 'INVALID_REDEEM_CODE');
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const code = await lockRedeemCodeByHash(connection, hashRedeemCode(normalized));
    validateRedeemableCode(code);

    const batch = await getRedeemBatchByIdInConnection(connection, code.batch_id);
    const result = await applyCreditTransactionInConnection(connection, {
      userId: input.userId,
      type: 'redeem_code_credit',
      amount: code.credits,
      reason: '兑换码充值',
      metadata: {
        redeemCodeId: code.id,
        batchId: code.batch_id,
        packageNameSnapshot: batch.package_name_snapshot
      }
    });

    await connection.execute(
      `UPDATE redeem_codes
       SET status = 'redeemed', redeemed_by = ?, redeemed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [input.userId, code.id]
    );
    await connection.commit();
    return {
      codeId: code.id,
      batchId: code.batch_id,
      credits: code.credits,
      balance: result.balanceAfter,
      transaction: serializeCreditTransaction(result.transaction as CreditTransactionRow)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function normalizeRedeemCode(code: string) {
  return code.toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
}

export function hashRedeemCode(normalizedCode: string) {
  return crypto.createHash('sha256').update(normalizedCode).digest('hex');
}

function formatRedeemCode(raw: string) {
  return `PS-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function generatePlaintextCode() {
  let raw = '';
  const bytes = crypto.randomBytes(12);
  for (const byte of bytes) {
    raw += codeAlphabet[byte % codeAlphabet.length];
  }
  return formatRedeemCode(raw);
}

async function createUniquePlaintextCode(connection: PoolConnection) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generatePlaintextCode();
    const normalized = normalizeRedeemCode(code);
    const [rows] = await connection.query<Array<{ id: number } & import('mysql2').RowDataPacket>>(
      'SELECT id FROM redeem_codes WHERE code_hash = ? LIMIT 1',
      [hashRedeemCode(normalized)]
    );
    if (!rows[0]) return code;
  }
  throw httpError(500, 'Failed to generate a unique redeem code');
}

async function getRedeemPackageById(id: number) {
  const [rows] = await getPool().query<RedeemPackageRow[]>('SELECT * FROM redeem_packages WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) throw httpError(404, 'Redeem package not found');
  return row;
}

async function lockRedeemPackage(connection: PoolConnection, id: number) {
  const [rows] = await connection.query<RedeemPackageRow[]>('SELECT * FROM redeem_packages WHERE id = ? FOR UPDATE', [id]);
  const row = rows[0];
  if (!row) throw httpError(404, 'Redeem package not found');
  return row;
}

async function getRedeemCodeById(id: number) {
  const [rows] = await getPool().query<Array<RedeemCodeRow & { redeemed_email?: string | null }>>(
    `SELECT c.*, u.email AS redeemed_email
     FROM redeem_codes c
     LEFT JOIN users u ON u.id = c.redeemed_by
     WHERE c.id = ?`,
    [id]
  );
  const row = rows[0];
  if (!row) throw httpError(404, 'Redeem code not found');
  return row;
}

async function lockRedeemCodeById(connection: PoolConnection, id: number) {
  const [rows] = await connection.query<RedeemCodeRow[]>('SELECT * FROM redeem_codes WHERE id = ? FOR UPDATE', [id]);
  const row = rows[0];
  if (!row) throw httpError(404, 'Redeem code not found');
  return row;
}

async function lockRedeemCodeByHash(connection: PoolConnection, codeHash: string) {
  const [rows] = await connection.query<RedeemCodeRow[]>('SELECT * FROM redeem_codes WHERE code_hash = ? FOR UPDATE', [codeHash]);
  const row = rows[0];
  if (!row) throw httpError(400, '兑换码无效', 'INVALID_REDEEM_CODE');
  return row;
}

async function getRedeemBatchByIdInConnection(connection: PoolConnection, id: number) {
  const [rows] = await connection.query<RedeemCodeBatchRow[]>('SELECT * FROM redeem_code_batches WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) throw httpError(404, 'Redeem code batch not found');
  return row;
}

function validateRedeemableCode(code: RedeemCodeRow) {
  if (code.status === 'redeemed') {
    throw httpError(409, '兑换码已使用', 'REDEEM_CODE_ALREADY_USED');
  }
  if (code.status === 'disabled') {
    throw httpError(409, '兑换码已停用', 'REDEEM_CODE_DISABLED');
  }
  if (code.status !== 'active') {
    throw httpError(409, '兑换码不可用', 'REDEEM_CODE_NOT_ACTIVE');
  }
  if (code.expires_at && code.expires_at.getTime() <= Date.now()) {
    throw httpError(409, '兑换码已过期', 'REDEEM_CODE_EXPIRED');
  }
}

function isRedeemCodeShape(normalizedCode: string) {
  return /^PS[A-Z2-9]{12}$/.test(normalizedCode);
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw httpError(422, 'Invalid expiry time');
  }
  return date;
}

interface RedeemBatchStats {
  active_count: number;
  redeemed_count: number;
  disabled_count: number;
}

function redeemBatchSelectSql(tail: string) {
  return `SELECT b.*,
      SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN c.status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed_count,
      SUM(CASE WHEN c.status = 'disabled' THEN 1 ELSE 0 END) AS disabled_count
    FROM redeem_code_batches b
    LEFT JOIN redeem_codes c ON c.batch_id = b.id
    ${tail.includes('WHERE') ? tail : ''}
    GROUP BY b.id
    ${tail.includes('WHERE') ? '' : tail}`;
}
