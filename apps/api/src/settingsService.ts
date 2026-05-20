import { z } from 'zod';
import { getPool, type AppSettingRow } from './db.js';
import { decryptSettingSecret, encryptSettingSecret } from './cryptoSettings.js';

const defaults = {
  registration: {
    enabled: true,
    emailVerificationRequired: true,
    resendVerificationEnabled: true,
    verificationTokenTtlHours: 24,
    defaultUserStatusWhenVerificationDisabled: 'active' as const
  },
  mail: {
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPassword: '',
    fromName: 'Photo Sys',
    fromAddress: '',
    verificationSubject: '验证你的 Photo Sys 邮箱',
    verificationTemplate: [
      '你好，',
      '',
      '请点击下面的链接验证你的邮箱：',
      '{{verificationUrl}}',
      '',
      '该链接将在 {{expiresHours}} 小时后过期。'
    ].join('\n')
  },
  credits: {
    enabled: true,
    costPerImage: 1,
    initialBalance: 0,
    refundOnFailure: true
  }
};

const redactedSecret = '********';

const settingsSchema = z.object({
  registration: z.object({
    enabled: z.boolean(),
    emailVerificationRequired: z.boolean(),
    resendVerificationEnabled: z.boolean(),
    verificationTokenTtlHours: z.number().int().min(1).max(168),
    defaultUserStatusWhenVerificationDisabled: z.literal('active')
  }),
  mail: z.object({
    smtpHost: z.string(),
    smtpPort: z.number().int().min(1).max(65535),
    smtpSecure: z.boolean(),
    smtpUser: z.string(),
    smtpPassword: z.string(),
    fromName: z.string(),
    fromAddress: z.string(),
    verificationSubject: z.string(),
    verificationTemplate: z.string()
  }),
  credits: z.object({
    enabled: z.boolean(),
    costPerImage: z.number().int().min(0).max(100000),
    initialBalance: z.number().int().min(0).max(1000000),
    refundOnFailure: z.boolean()
  })
});

export type AppSettings = z.infer<typeof settingsSchema>;
type SettingType = AppSettingRow['value_type'];

const definitions: Record<string, {
  category: string;
  type: SettingType;
  isSecret?: boolean;
  description: string;
}> = {
  'registration.enabled': { category: 'registration', type: 'boolean', description: '是否开放公开注册' },
  'registration.emailVerificationRequired': { category: 'registration', type: 'boolean', description: '注册是否需要邮箱验证' },
  'registration.resendVerificationEnabled': { category: 'registration', type: 'boolean', description: '是否允许重发验证邮件' },
  'registration.verificationTokenTtlHours': { category: 'registration', type: 'number', description: '验证链接有效期小时数' },
  'registration.defaultUserStatusWhenVerificationDisabled': { category: 'registration', type: 'string', description: '关闭邮箱验证时的新用户状态' },
  'mail.smtpHost': { category: 'mail', type: 'string', description: 'SMTP 主机' },
  'mail.smtpPort': { category: 'mail', type: 'number', description: 'SMTP 端口' },
  'mail.smtpSecure': { category: 'mail', type: 'boolean', description: 'SMTP 是否使用 TLS' },
  'mail.smtpUser': { category: 'mail', type: 'string', description: 'SMTP 用户名' },
  'mail.smtpPassword': { category: 'mail', type: 'secret', isSecret: true, description: 'SMTP 密码' },
  'mail.fromName': { category: 'mail', type: 'string', description: '发件人名称' },
  'mail.fromAddress': { category: 'mail', type: 'string', description: '发件邮箱' },
  'mail.verificationSubject': { category: 'mail', type: 'string', description: '验证邮件标题' },
  'mail.verificationTemplate': { category: 'mail', type: 'string', description: '验证邮件模板' },
  'credits.enabled': { category: 'credits', type: 'boolean', description: 'Enable credit charging' },
  'credits.costPerImage': { category: 'credits', type: 'number', description: 'Credits charged per image' },
  'credits.initialBalance': { category: 'credits', type: 'number', description: 'Initial credits for new users' },
  'credits.refundOnFailure': { category: 'credits', type: 'boolean', description: 'Refund credits when generation fails' }
};

let cache: { value: AppSettings; expiresAt: number } | null = null;
const cacheMs = 30_000;

export async function getAppSettings(options: { includeSecrets?: boolean; fresh?: boolean } = {}) {
  if (!options.fresh && cache && cache.expiresAt > Date.now()) {
    return options.includeSecrets ? cache.value : redactSettings(cache.value);
  }

  const [rows] = await getPool().query<AppSettingRow[]>('SELECT * FROM app_settings');
  const value = settingsSchema.parse(applyRows(rows));
  cache = { value, expiresAt: Date.now() + cacheMs };
  return options.includeSecrets ? value : redactSettings(value);
}

export type AppSettingsPatch = {
  registration?: Partial<AppSettings['registration']>;
  mail?: Partial<AppSettings['mail']>;
  credits?: Partial<AppSettings['credits']>;
};

export async function updateAppSettings(
  patch: AppSettingsPatch,
  updatedBy: number | null
) {
  const current = await getAppSettings({ includeSecrets: true, fresh: true });
  const next = settingsSchema.parse(mergeSettingsPatch(current, patch));
  const entries = flattenSettings(next);

  for (const [key, value] of Object.entries(entries)) {
    const definition = definitions[key];
    if (!definition) continue;
    if (definition.isSecret && (value === '' || value === redactedSecret)) continue;

    await getPool().execute(
      `INSERT INTO app_settings
         (setting_key, setting_value, value_type, category, is_secret, description, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         value_type = VALUES(value_type),
         category = VALUES(category),
         is_secret = VALUES(is_secret),
         description = VALUES(description),
         updated_by = VALUES(updated_by)`,
      [
        key,
        serializeSettingValue(value, definition.type),
        definition.type,
        definition.category,
        definition.isSecret ? 1 : 0,
        definition.description,
        updatedBy
      ]
    );
  }

  cache = null;
  return getAppSettings({ fresh: true });
}

export async function resetAppSettings(updatedBy: number | null) {
  await getPool().execute('DELETE FROM app_settings');
  cache = null;
  return updateAppSettings(defaults, updatedBy);
}

export function mailConfigComplete(settings: AppSettings) {
  return Boolean(settings.mail.smtpHost
    && settings.mail.smtpPort
    && settings.mail.fromAddress
    && (settings.mail.smtpUser ? validMailPassword(settings.mail.smtpPassword) : true));
}

export function mailPasswordWasRedacted(settings: AppSettings) {
  return settings.mail.smtpPassword === redactedSecret;
}

function validMailPassword(value: string) {
  return Boolean(value && value !== redactedSecret);
}

function applyRows(rows: AppSettingRow[]) {
  const next = structuredClone(defaults);
  for (const row of rows) {
    const definition = definitions[row.setting_key];
    if (!definition) continue;
    setByPath(next, row.setting_key, parseSettingValue(row.setting_value, row.value_type));
  }
  return next;
}

function redactSettings(settings: AppSettings) {
  return {
    ...settings,
    mail: {
      ...settings.mail,
      smtpPassword: settings.mail.smtpPassword ? redactedSecret : ''
    }
  };
}

function parseSettingValue(value: string | null, type: SettingType) {
  if (type === 'secret') return value ? decryptSettingSecret(value) : '';
  if (type === 'boolean') return value === 'true';
  if (type === 'number') return Number(value);
  if (type === 'json') return value ? JSON.parse(value) : null;
  return value || '';
}

function serializeSettingValue(value: unknown, type: SettingType) {
  if (type === 'secret') return typeof value === 'string' ? encryptSettingSecret(value) : '';
  if (type === 'json') return JSON.stringify(value);
  return String(value ?? '');
}

function flattenSettings(settings: AppSettings) {
  return {
    'registration.enabled': settings.registration.enabled,
    'registration.emailVerificationRequired': settings.registration.emailVerificationRequired,
    'registration.resendVerificationEnabled': settings.registration.resendVerificationEnabled,
    'registration.verificationTokenTtlHours': settings.registration.verificationTokenTtlHours,
    'registration.defaultUserStatusWhenVerificationDisabled': settings.registration.defaultUserStatusWhenVerificationDisabled,
    'mail.smtpHost': settings.mail.smtpHost,
    'mail.smtpPort': settings.mail.smtpPort,
    'mail.smtpSecure': settings.mail.smtpSecure,
    'mail.smtpUser': settings.mail.smtpUser,
    'mail.smtpPassword': settings.mail.smtpPassword,
    'mail.fromName': settings.mail.fromName,
    'mail.fromAddress': settings.mail.fromAddress,
    'mail.verificationSubject': settings.mail.verificationSubject,
    'mail.verificationTemplate': settings.mail.verificationTemplate,
    'credits.enabled': settings.credits.enabled,
    'credits.costPerImage': settings.credits.costPerImage,
    'credits.initialBalance': settings.credits.initialBalance,
    'credits.refundOnFailure': settings.credits.refundOnFailure
  };
}

function setByPath(target: Record<string, unknown>, path: string, value: unknown) {
  const [group, key] = path.split('.');
  const current = target[group];
  if (current && typeof current === 'object') {
    (current as Record<string, unknown>)[key] = value;
  }
}

function mergeSettingsPatch(current: AppSettings, patch: AppSettingsPatch): AppSettings {
  return {
    registration: {
      ...current.registration,
      ...(patch.registration || {})
    },
    mail: {
      ...current.mail,
      ...(patch.mail || {})
    },
    credits: {
      ...current.credits,
      ...(patch.credits || {})
    }
  };
}
