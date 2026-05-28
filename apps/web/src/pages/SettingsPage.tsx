import { FormEvent, useEffect, useState } from 'react';
import { Gift, KeyRound, Palette, ShoppingCart } from 'lucide-react';
import { changePassword, getCreditBalance, listCreditTransactions, redeemCode, type CreditTransaction } from '../api';
import { useTheme, type AppTheme } from '../theme';

const creditPageSize = 10;

const emptyPasswordForm = {
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
};

export function SettingsPage() {
  const { theme, setTheme, themeLabels } = useTheme();
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditItems, setCreditItems] = useState<CreditTransaction[]>([]);
  const [creditPage, setCreditPage] = useState(1);
  const [creditTotal, setCreditTotal] = useState(0);
  const [creditTotalPages, setCreditTotalPages] = useState(1);
  const [isLoadingMoreCredits, setIsLoadingMoreCredits] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemMessage, setRedeemMessage] = useState('');
  const [redeemError, setRedeemError] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    loadCredits()
      .catch(() => undefined);
  }, []);

  async function loadCredits() {
    const [balancePayload, transactionsPayload] = await Promise.all([
      getCreditBalance(),
      listCreditTransactions(1, creditPageSize)
    ]);
    setCreditBalance(balancePayload.balance);
    setCreditItems(transactionsPayload.items);
    setCreditPage(transactionsPayload.page);
    setCreditTotal(transactionsPayload.total);
    setCreditTotalPages(transactionsPayload.totalPages);
  }

  async function loadMoreCredits() {
    if (isLoadingMoreCredits || creditPage >= creditTotalPages) return;

    setIsLoadingMoreCredits(true);
    try {
      const payload = await listCreditTransactions(creditPage + 1, creditPageSize);
      setCreditItems((current) => [...current, ...payload.items]);
      setCreditPage(payload.page);
      setCreditTotal(payload.total);
      setCreditTotalPages(payload.totalPages);
    } finally {
      setIsLoadingMoreCredits(false);
    }
  }

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

  async function submitRedeem(event: FormEvent) {
    event.preventDefault();
    setRedeemError('');
    setRedeemMessage('');
    const code = redeemInput.trim();
    if (!code) {
      setRedeemError('请输入兑换码');
      return;
    }

    setIsRedeeming(true);
    try {
      const payload = await redeemCode(code);
      setRedeemInput('');
      setRedeemMessage(`兑换成功，已增加 ${payload.credits} 积分。当前余额 ${payload.balance}`);
      await loadCredits();
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : '兑换失败');
    } finally {
      setIsRedeeming(false);
    }
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>账号设置</h1>
        </div>
      </header>

      <section className="panel settingsPanel themeSettingsPanel">
        <div className="panelTitle">
          <div>
            <h2>主题样式</h2>
            <span>选择你偏好的视觉方向，会自动保存到当前浏览器。</span>
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
        {passwordMessage && <div className="toastNotice" role="status">{passwordMessage}</div>}
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
        <form className="redeemForm" onSubmit={submitRedeem}>
          <label className="field">
            <span>兑换码充值</span>
            <input
              value={redeemInput}
              onChange={(event) => setRedeemInput(event.target.value)}
              placeholder="PS-XXXX-XXXX-XXXX"
              autoComplete="off"
            />
          </label>
          <div className="redeemActions">
            <button className="primaryButton compact" type="submit" disabled={isRedeeming}>
              <Gift size={16} />
              {isRedeeming ? '兑换中' : '兑换'}
            </button>
            <a className="ghostButton" href="https://shop.x2boot.com" target="_blank" rel="noreferrer">
              <ShoppingCart size={16} />
              购买兑换码
            </a>
          </div>
        </form>
        {redeemError && <div className="inlineError">{redeemError}</div>}
        {redeemMessage && <div className="toastNotice" role="status">{redeemMessage}</div>}
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
        {creditItems.length > 0 && (
          <div className="creditListFooter">
            <span>
              已显示 {creditItems.length} / {creditTotal}
            </span>
            {creditPage < creditTotalPages && (
              <button className="ghostButton compact" type="button" onClick={loadMoreCredits} disabled={isLoadingMoreCredits}>
                {isLoadingMoreCredits ? '加载中' : '查看更多'}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function creditTypeLabel(type: CreditTransaction['type']) {
  const labels: Record<CreditTransaction['type'], string> = {
    initial_grant: '初始发放',
    admin_adjustment: '管理员调整',
    generation_debit: '生成扣费',
    generation_refund: '失败退款',
    redeem_code_credit: '兑换码充值',
    generation_cancel_refund: '取消退款'
  };
  return labels[type];
}
