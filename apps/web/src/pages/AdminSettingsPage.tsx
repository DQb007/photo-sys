import { FormEvent, useEffect, useState } from 'react';
import { MailCheck, RotateCcw, Save } from 'lucide-react';
import { getAdminSettings, resetAdminSettings, testAdminEmail, updateAdminSettings, type AppSettings } from '../api';

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminSettings()
      .then((payload) => setSettings(payload.settings))
      .catch((err) => setError(err instanceof Error ? err.message : '读取配置失败'));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setError('');
    setMessage('');
    try {
      const payload = await updateAdminSettings(settings);
      setSettings(payload.settings);
      setMessage('配置已保存。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  }

  async function resetDefaults() {
    setError('');
    setMessage('');
    try {
      const payload = await resetAdminSettings();
      setSettings(payload.settings);
      setMessage('已恢复默认配置。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败');
    }
  }

  async function sendTest() {
    setError('');
    setMessage('');
    try {
      await testAdminEmail(testEmail);
      setMessage('测试邮件已发送。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    }
  }

  if (!settings) {
    return <div className="page"><div className="panel emptyState">加载配置中...</div></div>;
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>配置管理</h1>
        </div>
      </header>
      {error && <div className="errorBox">{error}</div>}
      {message && <div className="hintBox">{message}</div>}
      <form className="adminForm" onSubmit={save}>
        <section className="panel formPanel">
          <div className="panelTitle"><h2>注册策略</h2></div>
          <label className="toggleRow">
            <span>开放公开注册</span>
            <input type="checkbox" checked={settings.registration.enabled} onChange={(event) => setSettings({
              ...settings,
              registration: { ...settings.registration, enabled: event.target.checked }
            })} />
          </label>
          <label className="toggleRow">
            <span>注册必须邮箱验证</span>
            <input type="checkbox" checked={settings.registration.emailVerificationRequired} onChange={(event) => setSettings({
              ...settings,
              registration: { ...settings.registration, emailVerificationRequired: event.target.checked }
            })} />
          </label>
          <label className="toggleRow">
            <span>允许重发验证邮件</span>
            <input type="checkbox" checked={settings.registration.resendVerificationEnabled} onChange={(event) => setSettings({
              ...settings,
              registration: { ...settings.registration, resendVerificationEnabled: event.target.checked }
            })} />
          </label>
          <label className="field">
            <span>验证链接有效期（小时）</span>
            <input type="number" min={1} max={168} value={settings.registration.verificationTokenTtlHours} onChange={(event) => setSettings({
              ...settings,
              registration: { ...settings.registration, verificationTokenTtlHours: Number(event.target.value) }
            })} />
          </label>
        </section>

        <section className="panel formPanel">
          <div className="panelTitle"><h2>邮件配置</h2></div>
          <div className="formRow two">
            <label className="field"><span>SMTP 主机</span><input value={settings.mail.smtpHost} onChange={(event) => setMail('smtpHost', event.target.value)} /></label>
            <label className="field"><span>SMTP 端口</span><input type="number" value={settings.mail.smtpPort} onChange={(event) => setMail('smtpPort', Number(event.target.value))} /></label>
          </div>
          <label className="toggleRow">
            <span>使用 TLS</span>
            <input type="checkbox" checked={settings.mail.smtpSecure} onChange={(event) => setMail('smtpSecure', event.target.checked)} />
          </label>
          <div className="formRow two">
            <label className="field"><span>SMTP 用户名</span><input value={settings.mail.smtpUser} onChange={(event) => setMail('smtpUser', event.target.value)} /></label>
            <label className="field"><span>SMTP 密码</span><input type="password" placeholder={settings.mail.smtpPassword ? '已配置，留空不修改' : ''} onChange={(event) => setMail('smtpPassword', event.target.value)} /></label>
          </div>
          <div className="formRow two">
            <label className="field"><span>发件人名称</span><input value={settings.mail.fromName} onChange={(event) => setMail('fromName', event.target.value)} /></label>
            <label className="field"><span>发件邮箱</span><input value={settings.mail.fromAddress} onChange={(event) => setMail('fromAddress', event.target.value)} /></label>
          </div>
          <label className="field"><span>验证邮件标题</span><input value={settings.mail.verificationSubject} onChange={(event) => setMail('verificationSubject', event.target.value)} /></label>
          <label className="field"><span>验证邮件模板</span><textarea value={settings.mail.verificationTemplate} onChange={(event) => setMail('verificationTemplate', event.target.value)} /></label>
          <div className="formRow two">
            <label className="field"><span>测试收件邮箱</span><input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} /></label>
            <button className="ghostButton alignEnd" type="button" onClick={() => void sendTest()}>
              <MailCheck size={16} />
              发送测试邮件
            </button>
          </div>
        </section>

        <div className="stickyActions">
          <button className="ghostButton" type="button" onClick={() => void resetDefaults()}>
            <RotateCcw size={16} />
            恢复默认
          </button>
          <button className="primaryButton compact" type="submit">
            <Save size={16} />
            保存配置
          </button>
        </div>
      </form>
    </div>
  );

  function setMail<K extends keyof AppSettings['mail']>(key: K, value: AppSettings['mail'][K]) {
    setSettings((current) => current ? { ...current, mail: { ...current.mail, [key]: value } } : current);
  }
}
