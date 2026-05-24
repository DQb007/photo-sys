import { FormEvent, useCallback, useEffect, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { listAuditLogs, type AuditLog } from '../api';
import { Pagination } from '../Pagination';

const auditLogPageSize = 20;
const emptyAuditFilters = {
  action: ''
};

export function AdminAuditLogsPage() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [action, setAction] = useState('');
  const [filters, setFilters] = useState(emptyAuditFilters);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const payload = await listAuditLogs({
        action: filters.action,
        page,
        pageSize: auditLogPageSize
      });
      setItems(payload.items);
      setPage(payload.page);
      setTotal(payload.total);
      setTotalPages(payload.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取审计日志失败');
    }
  }, [filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function submitFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters({ action: action.trim() });
  }

  function resetFilters() {
    setAction('');
    setPage(1);
    setFilters(emptyAuditFilters);
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>审计日志</h1>
        </div>
      </header>
      <form className="historyToolbar auditToolbar" onSubmit={submitFilters}>
        <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="按 action 过滤" />
        <button className="primaryButton compact" type="submit">
          <Search size={16} />
          查询
        </button>
        <button className="ghostButton compact resetButton" type="button" onClick={resetFilters}>
          <RotateCcw size={16} />
          重置
        </button>
      </form>
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
            {items.length === 0 && (
              <tr>
                <td colSpan={5}>暂无审计日志</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
    </div>
  );
}
