import { FormEvent, useEffect, useState } from 'react';
import { MailCheck, RotateCcw, Save, X } from 'lucide-react';
import { getAdminSettings, resetAdminSettings, testAdminEmail, updateAdminSettings, type AppSettings } from '../api';
import { useBodyScrollLock } from '../useBodyScrollLock';

type ConfirmAction = 'save' | 'reset';

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mailMessage, setMailMessage] = useState('');
  const [mailError, setMailError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  useBodyScrollLock(Boolean(confirmAction));

  useEffect(() => {
    getAdminSettings()
      .then((payload) => {
        setSettings(payload.settings);
        setIsDirty(false);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '读取配置失败'));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setConfirmAction('save');
  }

  async function confirmSave() {
    if (!settings) return;
    setError('');
    setMessage('');
    setMailError('');
    setMailMessage('');
    setConfirmAction(null);
    setIsSaving(true);
    try {
      const payload = await updateAdminSettings(settingsPayload(settings));
      setSettings(payload.settings);
      setIsDirty(false);
      setMessage('配置已保存。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmResetDefaults() {
    setError('');
    setMessage('');
    setMailError('');
    setMailMessage('');
    setConfirmAction(null);
    try {
      const payload = await resetAdminSettings();
      setSettings(payload.settings);
      setIsDirty(false);
      setMessage('已恢复默认配置。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败');
    }
  }

  function submitConfirmAction() {
    if (confirmAction === 'save') {
      void confirmSave();
      return;
    }
    if (confirmAction === 'reset') {
      void confirmResetDefaults();
    }
  }

  async function sendTest() {
    setError('');
    setMessage('');
    setMailError('');
    setMailMessage('');

    const recipient = testEmail.trim();
    if (!recipient) {
      setMailError('请填写测试收件邮箱。');
      return;
    }

    if (isDirty) {
      setMailError('当前配置有未保存修改，请先保存配置后再发送测试邮件。');
      return;
    }

    setIsTesting(true);
    try {
      await testAdminEmail(recipient);
      setMailMessage('测试邮件已发送。');
    } catch (err) {
      setMailError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setIsTesting(false);
    }
  }

  if (!settings) {
    return <div className="page"><div className="panel emptyState">加载配置中...</div></div>;
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>配置管理</h1>
        </div>
      </header>
      {error && <div className="errorBox">{error}</div>}
      {message && <div className="toastNotice" role="status">{message}</div>}
      {isDirty && <div className="hintBox">有未保存的配置修改。</div>}
      <form className="adminForm" onSubmit={save}>
        <section className="panel formPanel">
          <div className="panelTitle"><h2>注册策略</h2></div>
          <label className="toggleRow">
            <span>开放公开注册</span>
            <input
              type="checkbox"
              checked={settings.registration.enabled}
              onChange={(event) => updateSettings({
                ...settings,
                registration: { ...settings.registration, enabled: event.target.checked }
              })}
            />
          </label>
          <label className="toggleRow">
            <span>注册必须邮箱验证</span>
            <input
              type="checkbox"
              checked={settings.registration.emailVerificationRequired}
              onChange={(event) => updateSettings({
                ...settings,
                registration: { ...settings.registration, emailVerificationRequired: event.target.checked }
              })}
            />
          </label>
          <label className="toggleRow">
            <span>允许重发验证邮件</span>
            <input
              type="checkbox"
              checked={settings.registration.resendVerificationEnabled}
              onChange={(event) => updateSettings({
                ...settings,
                registration: { ...settings.registration, resendVerificationEnabled: event.target.checked }
              })}
            />
          </label>
          <label className="field">
            <span>验证链接有效期（小时）</span>
            <input
              type="number"
              min={1}
              max={168}
              value={settings.registration.verificationTokenTtlHours}
              onChange={(event) => updateSettings({
                ...settings,
                registration: { ...settings.registration, verificationTokenTtlHours: Number(event.target.value) }
              })}
            />
          </label>
        </section>

        <section className="panel formPanel">
          <div className="panelTitle"><h2>邮件配置</h2></div>
          <div className="formRow two">
            <label className="field">
              <span>SMTP 主机</span>
              <input value={settings.mail.smtpHost} onChange={(event) => setMail('smtpHost', event.target.value)} />
            </label>
            <label className="field">
              <span>SMTP 端口</span>
              <input type="number" value={settings.mail.smtpPort} onChange={(event) => setMail('smtpPort', Number(event.target.value))} />
            </label>
          </div>
          <label className="toggleRow">
            <span>使用 TLS</span>
            <input type="checkbox" checked={settings.mail.smtpSecure} onChange={(event) => setMail('smtpSecure', event.target.checked)} />
          </label>
          <div className="formRow two">
            <label className="field">
              <span>SMTP 用户名</span>
              <input value={settings.mail.smtpUser} onChange={(event) => setMail('smtpUser', event.target.value)} />
            </label>
            <label className="field">
              <span>SMTP 密码</span>
              <input
                type="password"
                placeholder={settings.mail.smtpPassword ? '已配置，留空不修改' : ''}
                onChange={(event) => setMail('smtpPassword', event.target.value)}
              />
            </label>
          </div>
          <div className="formRow two">
            <label className="field">
              <span>发件人名称</span>
              <input value={settings.mail.fromName} onChange={(event) => setMail('fromName', event.target.value)} />
            </label>
            <label className="field">
              <span>发件邮箱</span>
              <input value={settings.mail.fromAddress} onChange={(event) => setMail('fromAddress', event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>验证邮件标题</span>
            <input value={settings.mail.verificationSubject} onChange={(event) => setMail('verificationSubject', event.target.value)} />
          </label>
          <label className="field">
            <span>验证邮件模板</span>
            <textarea value={settings.mail.verificationTemplate} onChange={(event) => setMail('verificationTemplate', event.target.value)} />
          </label>
          <div className="formRow two">
            <label className="field">
              <span>测试收件邮箱</span>
              <input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} />
            </label>
            <button className="ghostButton alignEnd" type="button" disabled={isTesting} onClick={() => void sendTest()}>
              <MailCheck size={16} />
              {isTesting ? '发送中' : '发送测试邮件'}
            </button>
          </div>
          {mailError && <div className="inlineError">{mailError}</div>}
          {mailMessage && <div className="toastNotice" role="status">{mailMessage}</div>}
        </section>

        <section className="panel formPanel">
          <div className="panelTitle"><h2>积分规则</h2></div>
          <label className="toggleRow">
            <span>启用积分扣费</span>
            <input
              type="checkbox"
              checked={settings.credits.enabled}
              onChange={(event) => setCredits('enabled', event.target.checked)}
            />
          </label>
          <div className="formRow two">
            <label className="field">
              <span>每张图片消耗积分</span>
              <input
                type="number"
                min={0}
                max={100000}
                value={settings.credits.costPerImage}
                onChange={(event) => setCredits('costPerImage', Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>新用户初始积分</span>
              <input
                type="number"
                min={0}
                max={1000000}
                value={settings.credits.initialBalance}
                onChange={(event) => setCredits('initialBalance', Number(event.target.value))}
              />
            </label>
          </div>
          <label className="toggleRow">
            <span>生成失败自动退还积分</span>
            <input
              type="checkbox"
              checked={settings.credits.refundOnFailure}
              onChange={(event) => setCredits('refundOnFailure', event.target.checked)}
            />
          </label>
        </section>

        <section className="panel formPanel">
          <div className="panelTitle"><h2>图片生成</h2></div>
          <label className="field">
            <span>并发处理数</span>
            <input
              type="number"
              min={1}
              max={20}
              value={settings.generation.imageConcurrency}
              onChange={(event) => setGeneration('imageConcurrency', Number(event.target.value))}
            />
          </label>
          <p className="fieldHint">最多同时处理多少个图片生成任务，保存后对后续取队列任务生效。</p>
        </section>

        <section className="panel formPanel">
          <div className="panelTitle"><h2>游客试用</h2></div>
          <label className="toggleRow">
            <span>开启游客试用</span>
            <input type="checkbox" checked={settings.trial.enabled} onChange={(event) => setTrial('enabled', event.target.checked)} />
          </label>
          <div className="formRow two">
            <label className="field">
              <span>生图试用次数</span>
              <input type="number" min={0} max={1000} value={settings.trial.generationLimit} onChange={(event) => setTrial('generationLimit', Number(event.target.value))} />
            </label>
            <label className="field">
              <span>对话试用次数</span>
              <input type="number" min={0} max={1000} value={settings.trial.chatLimit} onChange={(event) => setTrial('chatLimit', Number(event.target.value))} />
            </label>
          </div>
          <div className="formRow two">
            <label className="field">
              <span>会话有效期（小时）</span>
              <input type="number" min={1} max={8760} value={settings.trial.sessionTtlHours} onChange={(event) => setTrial('sessionTtlHours', Number(event.target.value))} />
            </label>
            <label className="field">
              <span>同 IP 每日新会话上限</span>
              <input type="number" min={1} max={10000} value={settings.trial.maxSessionsPerIpPerDay} onChange={(event) => setTrial('maxSessionsPerIpPerDay', Number(event.target.value))} />
            </label>
          </div>
          <div className="formRow two">
            <label className="field">
              <span>游客单次最大图片数</span>
              <input type="number" min={1} max={4} value={settings.trial.maxImagesPerGeneration} onChange={(event) => setTrial('maxImagesPerGeneration', Number(event.target.value))} />
            </label>
            <label className="toggleRow alignEnd">
              <span>允许游客上传参考图</span>
              <input type="checkbox" checked={settings.trial.allowReferenceImages} onChange={(event) => setTrial('allowReferenceImages', event.target.checked)} />
            </label>
          </div>
        </section>

        <div className="stickyActions">
          <button className="ghostButton resetButton" type="button" onClick={() => void resetDefaults()}>
            <RotateCcw size={16} />
            恢复默认
          </button>
          <button className="primaryButton compact" type="submit" disabled={isSaving}>
            <Save size={16} />
            {isSaving ? '保存中' : '保存配置'}
          </button>
        </div>
      </form>
      {confirmAction && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="settings-confirm-title">
          <div className={`confirmModal settingsConfirmModal ${confirmAction === 'reset' ? 'danger' : ''}`}>
            <button className="iconButton modalClose" type="button" onClick={() => setConfirmAction(null)} aria-label="关闭">
              <X size={18} />
            </button>
            <h2 id="settings-confirm-title">{confirmAction === 'reset' ? '恢复默认配置？' : '保存配置？'}</h2>
            <p>
              {confirmAction === 'reset'
                ? '当前配置会被默认值覆盖。'
                : '保存后配置将立即生效。'}
            </p>
            <div className="modalActions">
              <button className="ghostButton" type="button" onClick={() => setConfirmAction(null)}>
                取消
              </button>
              <button
                className={confirmAction === 'reset' ? 'dangerButton strong' : 'primaryButton compact'}
                type="button"
                disabled={isSaving}
                onClick={submitConfirmAction}
              >
                {confirmAction === 'reset' ? '确认恢复' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function updateSettings(next: AppSettings) {
    setSettings(next);
    setIsDirty(true);
    setMessage('');
  }

  function setMail<K extends keyof AppSettings['mail']>(key: K, value: AppSettings['mail'][K]) {
    setSettings((current) => {
      if (!current) return current;
      setIsDirty(true);
      setMessage('');
      setMailError('');
      setMailMessage('');
      return { ...current, mail: { ...current.mail, [key]: value } };
    });
  }

  function setCredits<K extends keyof AppSettings['credits']>(key: K, value: AppSettings['credits'][K]) {
    setSettings((current) => {
      if (!current) return current;
      setIsDirty(true);
      setMessage('');
      return { ...current, credits: { ...current.credits, [key]: value } };
    });
  }

  function setGeneration<K extends keyof AppSettings['generation']>(key: K, value: AppSettings['generation'][K]) {
    setSettings((current) => {
      if (!current) return current;
      setIsDirty(true);
      setMessage('');
      return { ...current, generation: { ...current.generation, [key]: value } };
    });
  }

  function setTrial<K extends keyof AppSettings['trial']>(key: K, value: AppSettings['trial'][K]) {
    setSettings((current) => {
      if (!current) return current;
      setIsDirty(true);
      setMessage('');
      return { ...current, trial: { ...current.trial, [key]: value } };
    });
  }

  function resetDefaults() {
    setConfirmAction('reset');
  }
}

function settingsPayload(settings: AppSettings): AppSettings {
  if (settings.mail.smtpPassword !== '********') {
    return settings;
  }

  return {
    ...settings,
    mail: {
      ...settings.mail,
      smtpPassword: ''
    }
  };
}
