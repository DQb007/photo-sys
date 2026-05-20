import type { Request } from 'express';
import { getPool, type UserRow } from './db.js';

export interface AuditInput {
  actor?: Pick<UserRow, 'id' | 'email'> | null;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  targetUserId?: number | null;
  metadata?: Record<string, unknown> | null;
  req?: Request;
}

export async function writeAuditLog(input: AuditInput) {
  await getPool().execute(
    `INSERT INTO audit_logs
       (actor_user_id, actor_email, action, target_type, target_id, target_user_id, metadata_json, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.actor?.id || null,
      input.actor?.email || null,
      input.action,
      input.targetType || null,
      input.targetId == null ? null : String(input.targetId),
      input.targetUserId || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.req?.ip || null,
      input.req?.get('user-agent') || null
    ]
  );
}
