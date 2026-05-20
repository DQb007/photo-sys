import { FormEvent, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { changePassword, getCreditBalance, listCreditTransactions, type CreditTransaction } from '../api';

const emptyPasswordForm = {
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
};

export function SettingsPage() {
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditItems, setCreditItems] = useState<CreditTransaction[]>([]);

  useEffect(() => {
    getCreditBalance()
      .then((payload) => setCreditBalance(payload.balance))
      .catch(() => undefined);
    listCreditTransactions(1, 10)
      .then((payload) => setCreditItems(payload.items))
      .catch(() => undefined);
  }, []);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    if (!passwordForm.oldPassword) {
      setPasswordError('请输入旧密码');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('新密码至少 8 位');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('两次新密码输入不一致');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(passwordForm);
      setPasswordForm(emptyPasswordForm);
      setPasswordMessage('密码已修改。');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : '修改密码失败');
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Account</p>
          <h1>账号设置</h1>
        </div>
      </header>

      <form className="panel settingsPanel passwordSettingsPanel" onSubmit={submitPassword}>
        <div className="panelTitle">
          <h2>修改密码</h2>
        </div>
        <div className="passwordFields">
          <label className="field">
            <span>旧密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={passwordForm.oldPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, oldPassword: event.target.value })}
            />
          </label>
          <label className="field">
            <span>新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
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
        {passwordMessage && <div className="hintBox">{passwordMessage}</div>}
        <button className="primaryButton compact" type="submit" disabled={isChangingPassword}>
          <KeyRound size={16} />
          {isChangingPassword ? '修改中' : '修改密码'}
        </button>
      </form>

      <section className="panel settingsPanel creditSettingsPanel">
        <div className="panelTitle">
          <h2>积分余额</h2>
          <span>{creditBalance ?? '-'} 积分</span>
        </div>
        <div className="creditList">
          {creditItems.length === 0 && <div className="emptyLine">暂无积分流水</div>}
          {creditItems.map((item) => (
            <div className="creditItem" key={item.id}>
              <div>
                <strong>{creditTypeLabel(item.type)}</strong>
                <span>{item.reason || '-'}</span>
              </div>
              <div>
                <strong>{item.amount > 0 ? `+${item.amount}` : item.amount}</strong>
                <span>余额 {item.balanceAfter}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function creditTypeLabel(type: CreditTransaction['type']) {
  const labels: Record<CreditTransaction['type'], string> = {
    initial_grant: '初始发放',
    admin_adjustment: '管理员调整',
    generation_debit: '生成扣费',
    generation_refund: '失败退款'
  };
  return labels[type];
}
