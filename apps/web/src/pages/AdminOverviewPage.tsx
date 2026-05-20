import { useEffect, useState } from 'react';
import { getAdminOverview } from '../api';

export function AdminOverviewPage() {
  const [data, setData] = useState<{ users: Record<string, number>; generations: Record<string, number>; images: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminOverview().then(setData).catch((err) => setError(err instanceof Error ? err.message : '读取失败'));
  }, []);

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>后台概览</h1>
        </div>
      </header>
      {error && <div className="errorBox">{error}</div>}
      <div className="statsGrid">
        <Stat label="活跃用户" value={data?.users.active ?? 0} />
        <Stat label="待验证用户" value={data?.users.pending_email_verification ?? 0} />
        <Stat label="禁用用户" value={data?.users.disabled ?? 0} />
        <Stat label="成功任务" value={data?.generations.succeeded ?? 0} />
        <Stat label="失败任务" value={data?.generations.failed ?? 0} />
        <Stat label="图片数量" value={data?.images ?? 0} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel statCard">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
