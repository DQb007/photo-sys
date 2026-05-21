import type { ResultSetHeader } from 'mysql2/promise';
import {
  getPool,
  type PromptTemplateRow,
  type PromptTemplateStatus
} from './db.js';
import { httpError } from './errors.js';

export interface PromptTemplateInput {
  title: string;
  description?: string | null;
  promptText: string;
  exampleImageUrl?: string | null;
  category?: string | null;
  status?: PromptTemplateStatus;
  sortOrder?: number;
}

export interface PromptTemplateListOptions {
  userId: number;
  scope?: 'all' | 'favorites';
  category?: string;
  search?: string;
}

export interface AdminPromptTemplateListOptions {
  search?: string;
  status?: PromptTemplateStatus | '';
  page?: number;
  pageSize?: number;
}

export interface PromptTemplateWithFavorite extends PromptTemplateRow {
  is_favorite?: 0 | 1;
}

const variablePattern = /\{\s*([\p{L}\p{N}_-]+)\s*\}/gu;

export function parsePromptVariables(promptText: string) {
  const variables: string[] = [];
  const seen = new Set<string>();
  for (const match of promptText.matchAll(variablePattern)) {
    const name = match[1]?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    variables.push(name);
  }
  return variables;
}

export function serializePromptTemplate(row: PromptTemplateWithFavorite) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    promptText: row.prompt_text,
    exampleImageUrl: row.example_image_url,
    category: row.category,
    status: row.status,
    sortOrder: row.sort_order,
    usageCount: Number(row.usage_count || 0),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isFavorite: Boolean(row.is_favorite),
    variables: parsePromptVariables(row.prompt_text)
  };
}

export async function listPromptTemplates(options: PromptTemplateListOptions) {
  const conditions = ['t.deleted_at IS NULL', "t.status = 'active'"];
  const params: Array<string | number> = [options.userId];

  if (options.scope === 'favorites') {
    conditions.push('f.user_id IS NOT NULL');
  }
  if (options.category) {
    conditions.push('t.category = ?');
    params.push(options.category);
  }
  if (options.search) {
    conditions.push('(t.title LIKE ? OR t.description LIKE ? OR t.category LIKE ? OR t.prompt_text LIKE ?)');
    const like = `%${options.search}%`;
    params.push(like, like, like, like);
  }

  const [rows] = await getPool().query<PromptTemplateWithFavorite[]>(
    `SELECT t.*, IF(f.user_id IS NULL, 0, 1) AS is_favorite
     FROM prompt_templates t
     LEFT JOIN prompt_template_favorites f
       ON f.template_id = t.id AND f.user_id = ?
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.sort_order ASC, t.created_at DESC, t.id DESC
     LIMIT 100`,
    params
  );
  return rows;
}

export async function listPromptTemplateCategories() {
  const [rows] = await getPool().query<Array<{ category: string } & import('mysql2').RowDataPacket>>(
    `SELECT DISTINCT category
     FROM prompt_templates
     WHERE deleted_at IS NULL AND status = 'active' AND category IS NOT NULL AND category <> ''
     ORDER BY category ASC`
  );
  return rows.map((row) => row.category);
}

export async function listAdminPromptTemplates(options: AdminPromptTemplateListOptions = {}) {
  const conditions = ['deleted_at IS NULL'];
  const params: Array<string | number> = [];
  const pageSize = clampPageSize(options.pageSize, 10);
  const requestedPage = normalizePage(options.page);
  if (options.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options.search) {
    conditions.push('(title LIKE ? OR description LIKE ? OR category LIKE ? OR prompt_text LIKE ?)');
    const like = `%${options.search}%`;
    params.push(like, like, like, like);
  }
  const [countRows] = await getPool().query<Array<{ total: number } & import('mysql2').RowDataPacket>>(
    `SELECT COUNT(*) AS total
     FROM prompt_templates
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const [rows] = await getPool().query<PromptTemplateRow[]>(
    `SELECT *
     FROM prompt_templates
     WHERE ${conditions.join(' AND ')}
     ORDER BY sort_order ASC, created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return {
    page,
    pageSize,
    total,
    totalPages,
    items: rows
  };
}

export async function createPromptTemplate(input: PromptTemplateInput, actorUserId: number | null) {
  const [result] = await getPool().execute<ResultSetHeader>(
    `INSERT INTO prompt_templates
      (title, description, prompt_text, example_image_url, category, status, sort_order, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.title,
      input.description || null,
      input.promptText,
      input.exampleImageUrl || null,
      input.category || null,
      input.status || 'active',
      input.sortOrder ?? 0,
      actorUserId,
      actorUserId
    ]
  );
  return getAdminPromptTemplateById(result.insertId);
}

export async function updatePromptTemplate(id: number, input: Partial<PromptTemplateInput>, actorUserId: number | null) {
  await assertPromptTemplateExists(id);
  await getPool().execute(
    `UPDATE prompt_templates
     SET title = COALESCE(?, title),
         description = CASE WHEN ? THEN ? ELSE description END,
         prompt_text = COALESCE(?, prompt_text),
         example_image_url = CASE WHEN ? THEN ? ELSE example_image_url END,
         category = CASE WHEN ? THEN ? ELSE category END,
         status = COALESCE(?, status),
         sort_order = COALESCE(?, sort_order),
         updated_by = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [
      input.title ?? null,
      input.description !== undefined,
      input.description || null,
      input.promptText ?? null,
      input.exampleImageUrl !== undefined,
      input.exampleImageUrl || null,
      input.category !== undefined,
      input.category || null,
      input.status ?? null,
      input.sortOrder ?? null,
      actorUserId,
      id
    ]
  );
  return getAdminPromptTemplateById(id);
}

export async function softDeletePromptTemplate(id: number, actorUserId: number | null) {
  await assertPromptTemplateExists(id);
  await getPool().execute(
    `UPDATE prompt_templates
     SET deleted_at = CURRENT_TIMESTAMP, updated_by = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [actorUserId, id]
  );
}

export async function favoritePromptTemplate(userId: number, templateId: number) {
  await getActivePromptTemplateById(templateId);
  await getPool().execute(
    `INSERT IGNORE INTO prompt_template_favorites (user_id, template_id)
     VALUES (?, ?)`,
    [userId, templateId]
  );
}

export async function unfavoritePromptTemplate(userId: number, templateId: number) {
  await getPool().execute(
    'DELETE FROM prompt_template_favorites WHERE user_id = ? AND template_id = ?',
    [userId, templateId]
  );
}

export async function markPromptTemplateUsed(templateId: number) {
  await getActivePromptTemplateById(templateId);
  await getPool().execute(
    'UPDATE prompt_templates SET usage_count = usage_count + 1 WHERE id = ? AND deleted_at IS NULL AND status = ?',
    [templateId, 'active']
  );
  return getActivePromptTemplateById(templateId);
}

export async function getActivePromptTemplateById(id: number) {
  const [rows] = await getPool().query<PromptTemplateRow[]>(
    'SELECT * FROM prompt_templates WHERE id = ? AND deleted_at IS NULL AND status = ?',
    [id, 'active']
  );
  const row = rows[0];
  if (!row) throw httpError(404, 'Prompt template not found');
  return row;
}

export async function getAdminPromptTemplateById(id: number) {
  const [rows] = await getPool().query<PromptTemplateRow[]>(
    'SELECT * FROM prompt_templates WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  const row = rows[0];
  if (!row) throw httpError(404, 'Prompt template not found');
  return row;
}

async function assertPromptTemplateExists(id: number) {
  await getAdminPromptTemplateById(id);
}

function normalizePage(page?: number) {
  return Number.isInteger(page) && page && page > 0 ? page : 1;
}

function clampPageSize(pageSize: number | undefined, fallback: number) {
  if (!Number.isInteger(pageSize)) return fallback;
  return Math.min(Math.max(Number(pageSize), 1), 100);
}
