import { useEffect, useState } from 'react';
import { listAuditLogs, type AuditLog } from '../api';

export function AdminAuditLogsPage() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');

  async function load(nextAction = action) {
    setError('');
    try {
      const payload = await listAuditLogs(nextAction);
      setItems(payload.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取审计日志失败');
    }
  }

  useEffect(() => {
    void load('');
  }, []);

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>审计日志</h1>
        </div>
      </header>
      <div className="historyToolbar">
        <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="按 action 过滤" />
        <button className="primaryButton compact" onClick={() => void load()}>查询</button>
      </div>
      {error && <div className="errorBox">{error}</div>}
      <div className="panel tablePanel">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作</th>
              <th>操作者</th>
              <th>目标</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.created_at).toLocaleString()}</td>
                <td>{item.action}</td>
                <td>{item.actor_email || '-'}</td>
                <td>{item.target_type || '-'} {item.target_id || ''}</td>
                <td>{item.ip_address || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
