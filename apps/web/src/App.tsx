import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Activity, Clock3, ImagePlus, Settings } from 'lucide-react';
import { GeneratePage } from './pages/GeneratePage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">
            <Activity size={22} />
          </div>
          <div>
            <strong>Photo Sys</strong>
            <span>gpt-image-2 studio</span>
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
            设置
          </NavLink>
        </nav>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/generate" replace />} />
          <Route path="/generate" element={<GeneratePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

