import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, BookOpen, Bot, Clock3, Images, ImagePlus, LogOut, Menu, MessageSquare, Settings, Shield, SlidersHorizontal, Tags, Ticket, Users, X } from 'lucide-react';
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
import { AdminRedeemCodesPage } from './pages/AdminRedeemCodesPage';
import { PromptLibraryPage } from './pages/PromptLibraryPage';
import { AdminPromptTemplatesPage } from './pages/AdminPromptTemplatesPage';
import { ChatPage } from './pages/ChatPage';
import { AdminChatPage } from './pages/AdminChatPage';
import { ThemeProvider } from './theme';

const appName = '炫步 AI';
const brandIconSrc = '/brand-icon.png';

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/*" element={<ProtectedShell />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

function ProtectedShell() {
  const auth = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isChatRoute = location.pathname === '/chat';

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  if (auth.isLoading) {
    return <div className="appLoadingPage"><div className="panel appLoadingPanel">加载中...</div></div>;
  }

  if (!auth.user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const isAdmin = auth.user.role === 'admin';

  return (
    <div className="shell">
      <header className="mobileTopbar">
        <button className="iconButton mobileMenuButton" type="button" onClick={() => setIsSidebarOpen(true)} aria-label="打开菜单">
          <Menu size={20} />
        </button>
        <div className="mobileBrand">
          <img className="mobileBrandIcon" src={brandIconSrc} alt="" />
          <div>
            <strong>{appName}</strong>
            <span>{auth.user.email}</span>
          </div>
        </div>
        {isChatRoute && (
          <div className="mobileTopbarActions">
            <button
              className="ghostButton mobileTopbarHistoryButton"
              type="button"
              onClick={() => window.dispatchEvent(new Event('photo-sys:open-chat-history'))}
            >
              <Menu size={16} />
              历史
            </button>
          </div>
        )}
      </header>

      {isSidebarOpen && (
        <button className="mobileSidebarBackdrop" type="button" onClick={() => setIsSidebarOpen(false)} aria-label="关闭菜单" />
      )}

      <aside className={isSidebarOpen ? 'sidebar mobileOpen' : 'sidebar'}>
        <div className="brand">
          <div className="brandMark">
            <img src={brandIconSrc} alt="" />
          </div>
          <div>
            <strong>{appName}</strong>
            <span>{auth.user.email}</span>
          </div>
          <button className="iconButton sidebarClose" type="button" onClick={() => setIsSidebarOpen(false)} aria-label="关闭菜单">
            <X size={18} />
          </button>
        </div>

        <nav className="nav">
          {!isAdmin && (
            <>
              <NavLink to="/generate" onClick={() => setIsSidebarOpen(false)}>
                <ImagePlus size={18} />
                图片生成
              </NavLink>
              <NavLink to="/history" onClick={() => setIsSidebarOpen(false)}>
                <Clock3 size={18} />
                生成历史
              </NavLink>
              <NavLink to="/prompts" onClick={() => setIsSidebarOpen(false)}>
                <BookOpen size={18} />
                提示词库
              </NavLink>
              <NavLink to="/chat" onClick={() => setIsSidebarOpen(false)}>
                <MessageSquare size={18} />
                AI 对话
              </NavLink>
              <NavLink to="/settings" onClick={() => setIsSidebarOpen(false)}>
                <Settings size={18} />
                账号设置
              </NavLink>
            </>
          )}
          {isAdmin && (
            <>
              <NavLink to="/admin/overview" onClick={() => setIsSidebarOpen(false)}>
                <Shield size={18} />
                后台概览
              </NavLink>
              <NavLink to="/admin/generations" onClick={() => setIsSidebarOpen(false)}>
                <Images size={18} />
                图片管理
              </NavLink>
              <NavLink to="/admin/settings" onClick={() => setIsSidebarOpen(false)}>
                <SlidersHorizontal size={18} />
                配置管理
              </NavLink>
              <NavLink to="/admin/users" onClick={() => setIsSidebarOpen(false)}>
                <Users size={18} />
                用户管理
              </NavLink>
              <NavLink to="/admin/redeem-codes" onClick={() => setIsSidebarOpen(false)}>
                <Ticket size={18} />
                兑换码管理
              </NavLink>
              <NavLink to="/admin/prompt-templates" onClick={() => setIsSidebarOpen(false)}>
                <Tags size={18} />
                提示词管理
              </NavLink>
              <NavLink to="/chat" onClick={() => setIsSidebarOpen(false)}>
                <MessageSquare size={18} />
                AI 对话
              </NavLink>
              <NavLink to="/admin/chat" onClick={() => setIsSidebarOpen(false)}>
                <Bot size={18} />
                模型管理
              </NavLink>
              <NavLink to="/admin/audit-logs" onClick={() => setIsSidebarOpen(false)}>
                <Clock3 size={18} />
                审计日志
              </NavLink>
              <NavLink to="/admin/status" onClick={() => setIsSidebarOpen(false)}>
                <Activity size={18} />
                运行状态
              </NavLink>
            </>
          )}
        </nav>

        <button className="navButton logoutButton" onClick={() => {
          setIsSidebarOpen(false);
          void auth.signOut();
        }}>
          <LogOut size={18} />
          退出
        </button>
      </aside>

      <main className={isChatRoute ? 'main chatMain' : 'main'}>
        <Routes>
          <Route path="/" element={<Navigate to={isAdmin ? '/admin/overview' : '/generate'} replace />} />
          <Route path="/generate" element={<UserOnly><GeneratePage /></UserOnly>} />
          <Route path="/history" element={<UserOnly><HistoryPage /></UserOnly>} />
          <Route path="/prompts" element={<UserOnly><PromptLibraryPage /></UserOnly>} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/settings" element={<UserOnly><SettingsPage /></UserOnly>} />
          <Route path="/admin/overview" element={<AdminOnly><AdminOverviewPage /></AdminOnly>} />
          <Route path="/admin/status" element={<AdminOnly><AdminStatusPage /></AdminOnly>} />
          <Route path="/admin/generations" element={<AdminOnly><HistoryPage mode="admin" /></AdminOnly>} />
          <Route path="/admin/settings" element={<AdminOnly><AdminSettingsPage /></AdminOnly>} />
          <Route path="/admin/users" element={<AdminOnly><AdminUsersPage /></AdminOnly>} />
          <Route path="/admin/users/:id/generations" element={<AdminOnly><AdminUserGenerationsPage /></AdminOnly>} />
          <Route path="/admin/redeem-codes" element={<AdminOnly><AdminRedeemCodesPage /></AdminOnly>} />
          <Route path="/admin/prompt-templates" element={<AdminOnly><AdminPromptTemplatesPage /></AdminOnly>} />
          <Route path="/admin/chat" element={<AdminOnly><AdminChatPage /></AdminOnly>} />
          <Route path="/admin/audit-logs" element={<AdminOnly><AdminAuditLogsPage /></AdminOnly>} />
        </Routes>
      </main>
    </div>
  );
}

function UserOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'admin') {
    return <Navigate to="/admin/overview" replace />;
  }
  return children;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return <div className="page"><div className="panel emptyState">需要管理员权限。</div></div>;
  }
  return children;
}
