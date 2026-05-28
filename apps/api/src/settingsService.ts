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
    fromName: '炫步 AI',
    fromAddress: '',
    verificationSubject: '验证你的炫步 AI 邮箱',
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
  },
  generation: {
    imageConcurrency: 10
  },
  chat: {
    enabled: true,
    messageCreditCost: 1,
    systemPrompt: '',
    maxInputChars: 8000,
    maxHistoryMessages: 20,
    requestTimeoutMs: 120000
  },
  trial: {
    enabled: true,
    generationLimit: 2,
    chatLimit: 10,
    sessionTtlHours: 168,
    maxSessionsPerIpPerDay: 5,
    allowReferenceImages: false,
    maxImagesPerGeneration: 1
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
  }),
  generation: z.object({
    imageConcurrency: z.number().int().min(1).max(20)
  }),
  chat: z.object({
    enabled: z.boolean(),
    messageCreditCost: z.number().int().min(0).max(100000),
    systemPrompt: z.string().max(12000),
    maxInputChars: z.number().int().min(1).max(50000),
    maxHistoryMessages: z.number().int().min(1).max(100),
    requestTimeoutMs: z.number().int().min(1000).max(600000)
  }),
  trial: z.object({
    enabled: z.boolean(),
    generationLimit: z.number().int().min(0).max(1000),
    chatLimit: z.number().int().min(0).max(1000),
    sessionTtlHours: z.number().int().min(1).max(8760),
    maxSessionsPerIpPerDay: z.number().int().min(1).max(10000),
    allowReferenceImages: z.boolean(),
    maxImagesPerGeneration: z.number().int().min(1).max(4)
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
  'credits.refundOnFailure': { category: 'credits', type: 'boolean', description: 'Refund credits when generation fails' },
  'generation.imageConcurrency': { category: 'generation', type: 'number', description: 'Maximum concurrent image generation jobs' },
  'chat.enabled': { category: 'chat', type: 'boolean', description: 'Enable AI chat' },
  'chat.messageCreditCost': { category: 'chat', type: 'number', description: 'Credits charged per user chat message' },
  'chat.systemPrompt': { category: 'chat', type: 'string', description: 'Global AI chat system prompt' },
  'chat.maxInputChars': { category: 'chat', type: 'number', description: 'Maximum characters per user chat message' },
  'chat.maxHistoryMessages': { category: 'chat', type: 'number', description: 'Maximum historical messages sent to chat model' },
  'chat.requestTimeoutMs': { category: 'chat', type: 'number', description: 'AI chat upstream request timeout in milliseconds' },
  'trial.enabled': { category: 'trial', type: 'boolean', description: '是否开启游客试用' },
  'trial.generationLimit': { category: 'trial', type: 'number', description: '每个游客会话可创建的图片生成任务数' },
  'trial.chatLimit': { category: 'trial', type: 'number', description: '每个游客会话可发送的 AI 对话条数' },
  'trial.sessionTtlHours': { category: 'trial', type: 'number', description: '游客会话有效期小时数' },
  'trial.maxSessionsPerIpPerDay': { category: 'trial', type: 'number', description: '同 IP 每天最多创建游客会话数' },
  'trial.allowReferenceImages': { category: 'trial', type: 'boolean', description: '游客是否可上传参考图' },
  'trial.maxImagesPerGeneration': { category: 'trial', type: 'number', description: '游客单次生成最大图片数量' }
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
  generation?: Partial<AppSettings['generation']>;
  chat?: Partial<AppSettings['chat']>;
  trial?: Partial<AppSettings['trial']>;
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
    'credits.refundOnFailure': settings.credits.refundOnFailure,
    'generation.imageConcurrency': settings.generation.imageConcurrency,
    'chat.enabled': settings.chat.enabled,
    'chat.messageCreditCost': settings.chat.messageCreditCost,
    'chat.systemPrompt': settings.chat.systemPrompt,
    'chat.maxInputChars': settings.chat.maxInputChars,
    'chat.maxHistoryMessages': settings.chat.maxHistoryMessages,
    'chat.requestTimeoutMs': settings.chat.requestTimeoutMs,
    'trial.enabled': settings.trial.enabled,
    'trial.generationLimit': settings.trial.generationLimit,
    'trial.chatLimit': settings.trial.chatLimit,
    'trial.sessionTtlHours': settings.trial.sessionTtlHours,
    'trial.maxSessionsPerIpPerDay': settings.trial.maxSessionsPerIpPerDay,
    'trial.allowReferenceImages': settings.trial.allowReferenceImages,
    'trial.maxImagesPerGeneration': settings.trial.maxImagesPerGeneration
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
    },
    generation: {
      ...current.generation,
      ...(patch.generation || {})
    },
    chat: {
      ...current.chat,
      ...(patch.chat || {})
    },
    trial: {
      ...current.trial,
      ...(patch.trial || {})
    }
  };
}
