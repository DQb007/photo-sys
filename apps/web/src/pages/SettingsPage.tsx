import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, PlugZap, XCircle } from 'lucide-react';
import { changePassword, getSettingsStatus, testSettings, type SettingsStatus, type SettingsTestResult } from '../api';

const emptyPasswordForm = {
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
};

export function SettingsPage() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [testResult, setTestResult] = useState<SettingsTestResult | null>(null);
  const [error, setError] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    getSettingsStatus()
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : '读取设置失败'));
  }, []);

  async function runTest() {
    setIsTesting(true);
    setError('');
    try {
      setTestResult(await testSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : '测试失败');
    } finally {
      setIsTesting(false);
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    if (!passwordForm.oldPassword) {
      setPasswordError('请输入旧密码');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('新密码至少 8 位');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('两次新密码输入不一致');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(passwordForm);
      setPasswordForm(emptyPasswordForm);
      setPasswordMessage('密码已修改。');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : '修改密码失败');
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>运行配置</h1>
        </div>
        <button className="primaryButton compact" onClick={() => void runTest()} disabled={isTesting}>
          <PlugZap size={16} />
          {isTesting ? '测试中' : '连接测试'}
        </button>
      </header>

      {error && <div className="errorBox">{error}</div>}

      <section className="panel settingsPanel">
        <div className="settingRow">
          <span>模型</span>
          <strong>{status?.model || 'gpt-image-2'}</strong>
        </div>
        <div className="settingRow">
          <span>配置状态</span>
          <Status ok={Boolean(status?.configured)} />
        </div>
        <div className="settingRow">
          <span>缺失环境变量</span>
          <strong>{status?.missing.length ? status.missing.join(', ') : '无'}</strong>
        </div>
        <div className="settingRow">
          <span>存储目录</span>
          <code>{status?.storageDir || '-'}</code>
        </div>
      </section>

      <form className="panel settingsPanel passwordSettingsPanel" onSubmit={submitPassword}>
        <div className="panelTitle">
          <h2>修改密码</h2>
        </div>
        <div className="passwordFields">
          <label className="field">
            <span>旧密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={passwordForm.oldPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, oldPassword: event.target.value })}
            />
          </label>
          <label className="field">
            <span>新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
            />
          </label>
          <label className="field">
            <span>确认新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })}
            />
          </label>
        </div>
        {passwordError && <div className="inlineError">{passwordError}</div>}
        {passwordMessage && <div className="hintBox">{passwordMessage}</div>}
        <button className="primaryButton compact" type="submit" disabled={isChangingPassword}>
          <KeyRound size={16} />
          {isChangingPassword ? '修改中' : '修改密码'}
        </button>
      </form>

      {testResult && (
        <section className="panel settingsPanel">
          <div className="panelTitle">
            <h2>连接测试结果</h2>
            <Status ok={testResult.ok} />
          </div>
          {Object.entries(testResult.checks).map(([name, check]) => (
            <div className="settingRow" key={name}>
              <span>{name}</span>
              <strong>{check.ok ? '正常' : check.error}</strong>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Status({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? 'okStatus' : 'badStatus'}>
      {ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      {ok ? '正常' : '需要处理'}
    </span>
  );
}
