import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Activity, BookOpen, Bot, Clock3, Images, ImagePlus, LogIn, LogOut, Menu, MessageSquare, Palette, Settings, Shield, SlidersHorizontal, Tags, Ticket, Users, X } from 'lucide-react';
import { AuthProvider, useAuth } from './auth';
import { ThemeProvider, useTheme } from './theme';

const appName = '炫步 AI';
const brandIconSrc = '/brand-icon.png';
const loadGeneratePage = () => import('./pages/GeneratePage');
const loadHistoryPage = () => import('./pages/HistoryPage');
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })));
const GeneratePage = lazy(() => loadGeneratePage().then((module) => ({ default: module.GeneratePage })));
const HistoryPage = lazy(() => loadHistoryPage().then((module) => ({ default: module.HistoryPage })));
const PromptLibraryPage = lazy(() => import('./pages/PromptLibraryPage').then((module) => ({ default: module.PromptLibraryPage })));
const ChatPage = lazy(() => import('./pages/ChatPage').then((module) => ({ default: module.ChatPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const AdminOverviewPage = lazy(() => import('./pages/AdminOverviewPage').then((module) => ({ default: module.AdminOverviewPage })));
const AdminStatusPage = lazy(() => import('./pages/AdminStatusPage').then((module) => ({ default: module.AdminStatusPage })));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage').then((module) => ({ default: module.AdminSettingsPage })));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage').then((module) => ({ default: module.AdminUsersPage })));
const AdminUserGenerationsPage = lazy(() => import('./pages/AdminUserGenerationsPage').then((module) => ({ default: module.AdminUserGenerationsPage })));
const AdminRedeemCodesPage = lazy(() => import('./pages/AdminRedeemCodesPage').then((module) => ({ default: module.AdminRedeemCodesPage })));
const AdminPromptTemplatesPage = lazy(() => import('./pages/AdminPromptTemplatesPage').then((module) => ({ default: module.AdminPromptTemplatesPage })));
const AdminChatPage = lazy(() => import('./pages/AdminChatPage').then((module) => ({ default: module.AdminChatPage })));
const AdminAuditLogsPage = lazy(() => import('./pages/AdminAuditLogsPage').then((module) => ({ default: module.AdminAuditLogsPage })));

function preloadHistoryPage() {
  void loadHistoryPage();
}

function preloadGeneratePage() {
  void loadGeneratePage();
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/*" element={<ProtectedShell />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ThemeProvider>
  );
}

function RouteLoading() {
  return <div className="appLoadingPage"><div className="panel appLoadingPanel">加载中...</div></div>;
}

function ProtectedShell() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isChatRoute = location.pathname === '/chat';

  useEffect(() => {
    setIsSidebarOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    if (auth.isLoading) return;
    const timer = window.setTimeout(() => {
      preloadGeneratePage();
      preloadHistoryPage();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [auth.isLoading, auth.user?.role]);

  if (auth.isLoading) {
    return <div className="appLoadingPage"><div className="panel appLoadingPanel">加载中...</div></div>;
  }

  const isAdmin = auth.user?.role === 'admin';
  const accountLabel = auth.user?.email || '游客试用中';

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
            <span>{accountLabel}</span>
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
            <span>{accountLabel}</span>
          </div>
          {!auth.user && <SidebarThemeSwitch />}
          <button className="iconButton sidebarClose" type="button" onClick={() => setIsSidebarOpen(false)} aria-label="关闭菜单">
            <X size={18} />
          </button>
        </div>

        <nav className="nav">
          {!isAdmin && (
            <>
              <NavLink to="/generate" onFocus={preloadGeneratePage} onMouseEnter={preloadGeneratePage} onClick={() => setIsSidebarOpen(false)}>
                <ImagePlus size={18} />
                图片生成
              </NavLink>
              <NavLink to="/history" onFocus={preloadHistoryPage} onMouseEnter={preloadHistoryPage} onClick={() => setIsSidebarOpen(false)}>
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
              {auth.user && (
                <NavLink to="/settings" onClick={() => setIsSidebarOpen(false)}>
                  <Settings size={18} />
                  账号设置
                </NavLink>
              )}
            </>
          )}
          {isAdmin && (
            <>
              <NavLink to="/admin/overview" onClick={() => setIsSidebarOpen(false)}>
                <Shield size={18} />
                后台概览
              </NavLink>
              <NavLink to="/admin/generations" onFocus={preloadHistoryPage} onMouseEnter={preloadHistoryPage} onClick={() => setIsSidebarOpen(false)}>
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

        {auth.user ? (
          <button className="navButton logoutButton" onClick={() => {
            setIsSidebarOpen(false);
            void auth.signOut().finally(() => navigate('/generate', { replace: true }));
          }}>
            <LogOut size={18} />
            退出
          </button>
        ) : (
          <NavLink className="navButton logoutButton" to="/login" onClick={() => setIsSidebarOpen(false)}>
            <LogIn size={18} />
            登录 / 注册
          </NavLink>
        )}
      </aside>

      <main className={isChatRoute ? 'main chatMain' : 'main'}>
        <Routes>
          <Route path="/" element={<Navigate to={isAdmin ? '/admin/overview' : '/generate'} replace />} />
          <Route path="/generate" element={<UserOnly><GeneratePage /></UserOnly>} />
          <Route path="/history" element={<UserOnly><HistoryPage /></UserOnly>} />
          <Route path="/prompts" element={<UserOnly><PromptLibraryPage /></UserOnly>} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/settings" element={<AccountOnly><SettingsPage /></AccountOnly>} />
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

function SidebarThemeSwitch() {
  const { theme, setTheme, themeLabels } = useTheme();
  const nextTheme = theme === 'studio' ? 'ink' : 'studio';
  return (
    <button className="sidebarThemeSwitch" type="button" onClick={() => setTheme(nextTheme)} title={`切换到${themeLabels[nextTheme]}`} aria-label={`切换到${themeLabels[nextTheme]}`}>
      <Palette size={18} />
    </button>
  );
}

function AccountOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
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
