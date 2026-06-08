import { useEffect, useState } from 'react';
import { CheckCircle2, PlugZap, XCircle } from 'lucide-react';
import { getSettingsStatus, testSettings, type SettingsStatus, type SettingsTestResult } from '../api';

export function AdminStatusPage() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [testResult, setTestResult] = useState<SettingsTestResult | null>(null);
  const [error, setError] = useState('');
  const [isTesting, setIsTesting] = useState(false);

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

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>运行状态</h1>
        </div>
        <button className="primaryButton compact" onClick={() => void runTest()} disabled={isTesting}>
          <PlugZap size={16} />
          {isTesting ? '测试中' : '连接测试'}
        </button>
      </header>

      {error && <div className="errorBox" role="alert">{error}</div>}

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
