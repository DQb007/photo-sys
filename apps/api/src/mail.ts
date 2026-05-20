import nodemailer from 'nodemailer';
import { config, isProduction } from './config.js';
import { httpError } from './errors.js';
import { getAppSettings, mailConfigComplete, type AppSettings } from './settingsService.js';

export async function sendVerificationEmail(input: {
  email: string;
  verificationUrl: string;
}) {
  const settings = await getAppSettings({ includeSecrets: true }) as AppSettings;
  if (!mailConfigComplete(settings)) {
    if (isProduction()) {
      throw httpError(503, '邮件服务未配置，请联系管理员');
    }
    console.log(`Verification link for ${input.email}: ${input.verificationUrl}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: settings.mail.smtpHost,
    port: settings.mail.smtpPort,
    secure: settings.mail.smtpSecure,
    auth: settings.mail.smtpUser ? {
      user: settings.mail.smtpUser,
      pass: settings.mail.smtpPassword
    } : undefined
  });

  await transporter.sendMail({
    from: formatFrom(settings),
    to: input.email,
    subject: settings.mail.verificationSubject,
    text: renderTemplate(settings.mail.verificationTemplate, {
      appName: 'Photo Sys',
      email: input.email,
      verificationUrl: input.verificationUrl,
      expiresHours: String(settings.registration.verificationTokenTtlHours)
    })
  });
}

export async function sendTestEmail(to: string) {
  const settings = await getAppSettings({ includeSecrets: true }) as AppSettings;
  if (!mailConfigComplete(settings)) {
    throw httpError(422, '邮件配置不完整');
  }

  const transporter = nodemailer.createTransport({
    host: settings.mail.smtpHost,
    port: settings.mail.smtpPort,
    secure: settings.mail.smtpSecure,
    auth: settings.mail.smtpUser ? {
      user: settings.mail.smtpUser,
      pass: settings.mail.smtpPassword
    } : undefined
  });

  await transporter.sendMail({
    from: formatFrom(settings),
    to,
    subject: 'Photo Sys 测试邮件',
    text: '这是一封 Photo Sys 配置测试邮件。'
  });
}

export function verificationUrl(token: string) {
  return `${config.PUBLIC_APP_URL.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
}

function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => variables[key] || '');
}

function formatFrom(settings: AppSettings) {
  const address = settings.mail.fromAddress;
  if (!settings.mail.fromName) return address;
  return `"${settings.mail.fromName.replaceAll('"', '')}" <${address}>`;
}
