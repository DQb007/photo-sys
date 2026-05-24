import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Image, KeyRound, RotateCcw, Search, Shield, UserCheck, UsersRound, UserX, X } from 'lucide-react';
import {
  adjustAdminUserCredits,
  listAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
  type AdminUser,
  type UserRole,
  type UserStatus
} from '../api';
import { useAuth } from '../auth';
import { Pagination } from '../Pagination';
import { SelectField } from '../SelectField';
import { useBodyScrollLock } from '../useBodyScrollLock';

const emptyPasswordForm = {
  password: '',
  confirmPassword: ''
};

const emptyCreditForm = {
  amount: 0,
  reason: ''
};

const userPageSize = 10;
const emptyUserFilters = {
  search: '',
  role: '',
  status: ''
};

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [filters, setFilters] = useState(emptyUserFilters);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [passwordError, setPasswordError] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [creditTarget, setCreditTarget] = useState<AdminUser | null>(null);
  const [creditForm, setCreditForm] = useState(emptyCreditForm);
  const [creditError, setCreditError] = useState('');
  const [isAdjustingCredit, setIsAdjustingCredit] = useState(false);

  useBodyScrollLock(Boolean(passwordTarget || creditTarget));

  const summary = useMemo(() => ({
    total,
    active: users.filter((item) => item.status === 'active').length,
    pending: users.filter((item) => item.status === 'pending_email_verification').length,
    admins: users.filter((item) => item.role === 'admin').length
  }), [total, users]);

  const load = useCallback(async () => {
    setError('');
    try {
      const payload = await listAdminUsers({
        search: filters.search,
        role: filters.role,
        status: filters.status,
        page,
        pageSize: userPageSize
      });
      setUsers(payload.items);
      setPage(payload.page);
      setTotal(payload.total);
      setTotalPages(payload.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取用户失败');
    }
  }, [filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters({ search: search.trim(), role, status });
  }

  function resetFilters() {
    setSearch('');
    setRole('');
    setStatus('');
    setPage(1);
    setFilters(emptyUserFilters);
  }

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
    <div className="page adminUsersPage">
      <header className="pageHeader">
        <div>
          <h1>用户管理</h1>
        </div>
      </header>

      <section className="adminUserStats">
        <div className="adminUserStat">
          <UsersRound size={18} />
          <span>总用户</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="adminUserStat active">
          <UserCheck size={18} />
          <span>活跃用户</span>
          <strong>{summary.active}</strong>
        </div>
        <div className="adminUserStat pending">
          <Shield size={18} />
          <span>待验证</span>
          <strong>{summary.pending}</strong>
        </div>
        <div className="adminUserStat admin">
          <Shield size={18} />
          <span>管理员</span>
          <strong>{summary.admins}</strong>
        </div>
      </section>

      <form className="adminUserToolbar" onSubmit={submitSearch}>
        <label className="adminUserSearch">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索邮箱或昵称" />
        </label>
        <SelectField
          value={role}
          options={[
            { label: '全部角色', value: '' },
            { label: '普通用户', value: 'user' },
            { label: '管理员', value: 'admin' }
          ]}
          onChange={setRole}
        />
        <SelectField
          value={status}
          options={[
            { label: '全部状态', value: '' },
            { label: '活跃', value: 'active' },
            { label: '待验证', value: 'pending_email_verification' },
            { label: '已禁用', value: 'disabled' }
          ]}
          onChange={setStatus}
        />
        <button className="primaryButton compact" type="submit">
          <Search size={16} />
          搜索
        </button>
        <button className="ghostButton compact resetButton" type="button" onClick={resetFilters}>
          <RotateCcw size={16} />
          重置
        </button>
      </form>

      {error && <div className="errorBox">{error}</div>}

      <div className="panel tablePanel adminUsersPanel">
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>角色</th>
              <th>状态</th>
              <th>积分</th>
              <th>图片</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => {
              const isSelf = item.id === currentUser?.id;
              const cannotDemoteSelf = isSelf && item.role === 'admin';
              const cannotDisableSelf = isSelf && item.status !== 'disabled';
              return (
                <tr key={item.id}>
                  <td>
                    <div className="adminUserIdentity">
                      <strong>{item.email}</strong>
                      <span>{item.displayName || '-'}</span>
                    </div>
                  </td>
                  <td><span className={`adminUserPill role ${item.role}`}>{roleLabel(item.role)}</span></td>
                  <td><span className={`adminUserPill status ${item.status}`}>{statusLabel(item.status)}</span></td>
                  <td>
                    <div className="adminUserMetric">
                      <Coins size={15} />
                      <strong>{item.creditBalance}</strong>
                    </div>
                  </td>
                  <td>
                    <div className="adminUserMetric">
                      <Image size={15} />
                      <strong>{item.imageCount}</strong>
                    </div>
                  </td>
                  <td>
                    <div className="adminUserActions">
                      <button
                        className="ghostButton"
                        type="button"
                        disabled={cannotDemoteSelf}
                        title={cannotDemoteSelf ? '不能降级当前登录管理员' : undefined}
                        onClick={() => void patchUser(item.id, { role: item.role === 'admin' ? 'user' : 'admin' })}
                      >
                        <Shield size={14} />
                        {item.role === 'admin' ? '降级' : '设管理员'}
                      </button>
                      <button
                        className="dangerButton"
                        type="button"
                        disabled={cannotDisableSelf}
                        title={cannotDisableSelf ? '不能禁用当前登录管理员' : undefined}
                        onClick={() => void patchUser(item.id, { status: item.status === 'disabled' ? 'active' : 'disabled' })}
                      >
                        <UserX size={14} />
                        {item.status === 'disabled' ? '启用' : '禁用'}
                      </button>
                      <button className="ghostButton" type="button" onClick={() => openPasswordModal(item)}>
                        <KeyRound size={14} />
                        重置密码
                      </button>
                      <button className="ghostButton" type="button" onClick={() => openCreditModal(item)}>
                        <Coins size={14} />
                        调整积分
                      </button>
                      <Link className="ghostButton" to={`/admin/users/${item.id}/generations`}>
                        生成记录
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={6}>暂无匹配用户</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

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

function roleLabel(role: UserRole) {
  return role === 'admin' ? '管理员' : '用户';
}

function statusLabel(status: UserStatus) {
  const labels: Record<UserStatus, string> = {
    active: '活跃',
    pending_email_verification: '待验证',
    disabled: '已禁用'
  };
  return labels[status];
}
