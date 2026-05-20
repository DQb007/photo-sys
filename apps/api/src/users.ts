import { config } from './config.js';
import { grantInitialCredits } from './credits.js';
import { getPool, type UserRole, type UserRow, type UserStatus } from './db.js';
import { hashPassword } from './passwords.js';
import { getAppSettings, type AppSettings } from './settingsService.js';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function serializeUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.email_verified_at,
    lastLoginAt: user.last_login_at,
    creditBalance: user.credit_balance,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

export async function getUserById(id: number) {
  const [rows] = await getPool().query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function getUserByEmail(email: string) {
  const [rows] = await getPool().query<UserRow[]>('SELECT * FROM users WHERE email = ?', [normalizeEmail(email)]);
  return rows[0] || null;
}

export async function createUser(input: {
  email: string;
  displayName?: string | null;
  password: string;
  role?: UserRole;
  status?: UserStatus;
  emailVerifiedAt?: Date | null;
}) {
  const settings = await getAppSettings({ includeSecrets: true }) as AppSettings;
  const [result] = await getPool().execute(
    `INSERT INTO users (email, display_name, password_hash, role, status, email_verified_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      normalizeEmail(input.email),
      input.displayName || null,
      await hashPassword(input.password),
      input.role || 'user',
      input.status || 'pending_email_verification',
      input.emailVerifiedAt || null
    ]
  );
  const userId = Number((result as { insertId: number }).insertId);
  await grantInitialCredits(userId, settings.credits.initialBalance);
  return getUserById(userId);
}

export async function ensureAdminSeed() {
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) return;

  const email = normalizeEmail(config.ADMIN_EMAIL);
  const existing = await getUserByEmail(email);
  if (!existing) {
    await createUser({
      email,
      displayName: config.ADMIN_NAME,
      password: config.ADMIN_PASSWORD,
      role: 'admin',
      status: 'active',
      emailVerifiedAt: new Date()
    });
    return;
  }

  await getPool().execute(
    `UPDATE users
     SET role = 'admin', status = 'active', email_verified_at = COALESCE(email_verified_at, NOW())
     WHERE id = ?`,
    [existing.id]
  );
}
