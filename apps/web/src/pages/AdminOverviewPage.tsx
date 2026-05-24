import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { getAdminOverview } from '../api';
import { useTheme, type AppTheme } from '../theme';

export function AdminOverviewPage() {
  const { theme, setTheme, themeLabels } = useTheme();
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

      <section className="panel settingsPanel themeSettingsPanel adminOverviewThemePanel">
        <div className="panelTitle">
          <div>
            <h2>主题样式</h2>
            <span>切换后台管理界面的视觉主题，会自动保存到当前浏览器。</span>
          </div>
          <Palette size={18} />
        </div>
        <div className="themeChoiceGrid" role="radiogroup" aria-label="主题样式">
          {(['studio', 'ink'] as AppTheme[]).map((item) => (
            <button
              key={item}
              className={theme === item ? `themeChoice active ${item}` : `themeChoice ${item}`}
              type="button"
              role="radio"
              aria-checked={theme === item}
              onClick={() => setTheme(item)}
            >
              <span className="themePreview" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <strong>{themeLabels[item]}</strong>
              <small>{item === 'studio' ? '暗房光感、图片优先，适合专业创作台。' : '宣纸底色、墨绿细线，保留中文品牌温润感。'}</small>
            </button>
          ))}
        </div>
      </section>
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
