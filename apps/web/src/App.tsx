import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, Clock3, ImagePlus, LogOut, Settings, Shield, SlidersHorizontal, Users } from 'lucide-react';
import { AuthProvider, useAuth } from './auth';
import { GeneratePage } from './pages/GeneratePage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminStatusPage } from './pages/AdminStatusPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { AdminOverviewPage } from './pages/AdminOverviewPage';
import { AdminSettingsPage } from './pages/AdminSettingsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminAuditLogsPage } from './pages/AdminAuditLogsPage';
import { AdminUserGenerationsPage } from './pages/AdminUserGenerationsPage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/*" element={<ProtectedShell />} />
      </Routes>
    </AuthProvider>
  );
}

function ProtectedShell() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return <div className="authPage"><div className="panel authPanel">加载中...</div></div>;
  }

  if (!auth.user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">
            <Activity size={22} />
          </div>
          <div>
            <strong>Photo Sys</strong>
            <span>{auth.user.email}</span>
          </div>
        </div>

        <nav className="nav">
          <NavLink to="/generate">
            <ImagePlus size={18} />
            生成
          </NavLink>
          <NavLink to="/history">
            <Clock3 size={18} />
            历史
          </NavLink>
          <NavLink to="/settings">
            <Settings size={18} />
            账号设置
          </NavLink>
          {auth.user.role === 'admin' && (
            <>
              <NavLink to="/admin/overview">
                <Shield size={18} />
                后台概览
              </NavLink>
              <NavLink to="/admin/status">
                <Activity size={18} />
                运行状态
              </NavLink>
              <NavLink to="/admin/settings">
                <SlidersHorizontal size={18} />
                配置管理
              </NavLink>
              <NavLink to="/admin/users">
                <Users size={18} />
                用户管理
              </NavLink>
              <NavLink to="/admin/audit-logs">
                <Clock3 size={18} />
                审计日志
              </NavLink>
            </>
          )}
          <button className="navButton" onClick={() => void auth.signOut()}>
            <LogOut size={18} />
            退出
          </button>
        </nav>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/generate" replace />} />
          <Route path="/generate" element={<GeneratePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin/overview" element={<AdminOnly><AdminOverviewPage /></AdminOnly>} />
          <Route path="/admin/status" element={<AdminOnly><AdminStatusPage /></AdminOnly>} />
          <Route path="/admin/settings" element={<AdminOnly><AdminSettingsPage /></AdminOnly>} />
          <Route path="/admin/users" element={<AdminOnly><AdminUsersPage /></AdminOnly>} />
          <Route path="/admin/users/:id/generations" element={<AdminOnly><AdminUserGenerationsPage /></AdminOnly>} />
          <Route path="/admin/audit-logs" element={<AdminOnly><AdminAuditLogsPage /></AdminOnly>} />
        </Routes>
      </main>
    </div>
  );
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return <div className="page"><div className="panel emptyState">需要管理员权限。</div></div>;
  }
  return children;
}
