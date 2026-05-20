import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, RefreshCcw, Shield, UserX } from 'lucide-react';
import { listAdminUsers, resetAdminUserPassword, updateAdminUser, type AdminUser } from '../api';
import { useAuth } from '../auth';

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const payload = await listAdminUsers({ search });
      setUsers(payload.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取用户失败');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function patchUser(id: number, patch: Parameters<typeof updateAdminUser>[1]) {
    await updateAdminUser(id, patch);
    await load();
  }

  async function resetPassword(id: number) {
    const password = window.prompt('请输入新密码，至少 8 位');
    if (!password) return;
    await resetAdminUserPassword(id, password);
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>用户管理</h1>
        </div>
        <button className="ghostButton" onClick={() => void load()}>
          <RefreshCcw size={16} />
          刷新
        </button>
      </header>
      <div className="historyToolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索邮箱或昵称" />
        <button className="primaryButton compact" onClick={() => void load()}>搜索</button>
      </div>
      {error && <div className="errorBox">{error}</div>}
      <div className="panel tablePanel">
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>角色</th>
              <th>状态</th>
              <th>生成</th>
              <th>图片</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUser?.id;
              const cannotDemoteSelf = isSelf && user.role === 'admin';
              const cannotDisableSelf = isSelf && user.status !== 'disabled';
              return (
                <tr key={user.id}>
                  <td><strong>{user.email}</strong><span>{user.displayName || '-'}</span></td>
                  <td>{user.role}</td>
                  <td>{user.status}</td>
                  <td>{user.generationCount} / 成功 {user.succeededCount} / 失败 {user.failedCount}</td>
                  <td>{user.imageCount}</td>
                  <td className="tableActions">
                    <button
                      className="ghostButton"
                      disabled={cannotDemoteSelf}
                      title={cannotDemoteSelf ? '不能降级当前登录管理员' : undefined}
                      onClick={() => void patchUser(user.id, { role: user.role === 'admin' ? 'user' : 'admin' })}
                    >
                      <Shield size={14} />
                      {user.role === 'admin' ? '降级' : '设管理员'}
                    </button>
                    <button
                      className="dangerButton"
                      disabled={cannotDisableSelf}
                      title={cannotDisableSelf ? '不能禁用当前登录管理员' : undefined}
                      onClick={() => void patchUser(user.id, { status: user.status === 'disabled' ? 'active' : 'disabled' })}
                    >
                      <UserX size={14} />
                      {user.status === 'disabled' ? '启用' : '禁用'}
                    </button>
                    <button className="ghostButton" onClick={() => void resetPassword(user.id)}>
                      <KeyRound size={14} />
                      重置密码
                    </button>
                    <Link className="ghostButton" to={`/admin/users/${user.id}/generations`}>
                      生成记录
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
