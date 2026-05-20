import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, KeyRound, RefreshCcw, Shield, UserX, X } from 'lucide-react';
import { adjustAdminUserCredits, listAdminUsers, resetAdminUserPassword, updateAdminUser, type AdminUser } from '../api';
import { useAuth } from '../auth';

const emptyPasswordForm = {
  password: '',
  confirmPassword: ''
};

const emptyCreditForm = {
  amount: 0,
  reason: ''
};

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [passwordError, setPasswordError] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [creditTarget, setCreditTarget] = useState<AdminUser | null>(null);
  const [creditForm, setCreditForm] = useState(emptyCreditForm);
  const [creditError, setCreditError] = useState('');
  const [isAdjustingCredit, setIsAdjustingCredit] = useState(false);

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

  async function resetPassword() {
    if (!passwordTarget) return;
    setPasswordError('');
    if (passwordForm.password.length < 8) {
      setPasswordError('新密码至少 8 位');
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setPasswordError('两次密码输入不一致');
      return;
    }

    setIsResettingPassword(true);
    try {
      await resetAdminUserPassword({
        id: passwordTarget.id,
        password: passwordForm.password,
        confirmPassword: passwordForm.confirmPassword
      });
      closePasswordModal();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : '重置密码失败');
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function adjustCredits() {
    if (!creditTarget) return;
    setCreditError('');
    if (!Number.isInteger(creditForm.amount) || creditForm.amount === 0) {
      setCreditError('请输入非 0 的整数积分');
      return;
    }
    if (!creditForm.reason.trim()) {
      setCreditError('请填写调整原因');
      return;
    }

    setIsAdjustingCredit(true);
    try {
      await adjustAdminUserCredits({
        id: creditTarget.id,
        amount: creditForm.amount,
        reason: creditForm.reason.trim()
      });
      closeCreditModal();
      await load();
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : '调整积分失败');
    } finally {
      setIsAdjustingCredit(false);
    }
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
              <th>积分</th>
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
                  <td>{user.creditBalance}</td>
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
                    <button className="ghostButton" onClick={() => openPasswordModal(user)}>
                      <KeyRound size={14} />
                      重置密码
                    </button>
                    <button className="ghostButton" onClick={() => openCreditModal(user)}>
                      <Coins size={14} />
                      调整积分
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
      {passwordTarget && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="password-reset-title">
          <form className="confirmModal passwordResetModal" onSubmit={(event) => {
            event.preventDefault();
            void resetPassword();
          }}>
            <div className="modalHeader">
              <div>
                <h2 id="password-reset-title">重置密码</h2>
                <span>{passwordTarget.email}</span>
              </div>
              <button className="iconButton" type="button" onClick={closePasswordModal} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="passwordFields">
              <label className="field">
                <span>新密码</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.password}
                  onChange={(event) => setPasswordForm({ ...passwordForm, password: event.target.value })}
                />
              </label>
              <label className="field">
                <span>确认新密码</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })}
                />
              </label>
            </div>
            {passwordError && <div className="inlineError">{passwordError}</div>}
            <div className="modalActions">
              <button className="ghostButton" type="button" onClick={closePasswordModal}>
                取消
              </button>
              <button className="primaryButton compact" type="submit" disabled={isResettingPassword}>
                确认重置
              </button>
            </div>
          </form>
        </div>
      )}
      {creditTarget && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="credit-adjust-title">
          <form className="confirmModal passwordResetModal" onSubmit={(event) => {
            event.preventDefault();
            void adjustCredits();
          }}>
            <div className="modalHeader">
              <div>
                <h2 id="credit-adjust-title">调整积分</h2>
                <span>{creditTarget.email} · 当前 {creditTarget.creditBalance}</span>
              </div>
              <button className="iconButton" type="button" onClick={closeCreditModal} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="passwordFields">
              <label className="field">
                <span>调整数量</span>
                <input
                  type="number"
                  step={1}
                  value={creditForm.amount}
                  onChange={(event) => setCreditForm({ ...creditForm, amount: Number(event.target.value) })}
                />
              </label>
              <label className="field">
                <span>原因</span>
                <input
                  value={creditForm.reason}
                  onChange={(event) => setCreditForm({ ...creditForm, reason: event.target.value })}
                />
              </label>
            </div>
            {creditError && <div className="inlineError">{creditError}</div>}
            <div className="modalActions">
              <button className="ghostButton" type="button" onClick={closeCreditModal}>
                取消
              </button>
              <button className="primaryButton compact" type="submit" disabled={isAdjustingCredit}>
                确认调整
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );

  function openPasswordModal(user: AdminUser) {
    setPasswordTarget(user);
    setPasswordForm(emptyPasswordForm);
    setPasswordError('');
  }

  function closePasswordModal() {
    setPasswordTarget(null);
    setPasswordForm(emptyPasswordForm);
    setPasswordError('');
  }

  function openCreditModal(user: AdminUser) {
    setCreditTarget(user);
    setCreditForm(emptyCreditForm);
    setCreditError('');
  }

  function closeCreditModal() {
    setCreditTarget(null);
    setCreditForm(emptyCreditForm);
    setCreditError('');
  }
}
