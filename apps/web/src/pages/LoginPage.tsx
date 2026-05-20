import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, Mail } from 'lucide-react';
import { ApiError, resendVerification } from '../api';
import { useAuth } from '../auth';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/generate';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsLoading(true);
    try {
      await auth.signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        setError('请先完成邮箱验证。');
      } else {
        setError(err instanceof Error ? err.message : '登录失败');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function resend() {
    setNotice('');
    setError('');
    try {
      await resendVerification(email);
      setNotice('验证邮件已发送，请检查邮箱。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    }
  }

  return (
    <AuthLayout title="登录" eyebrow="Account">
      <form className="authForm" onSubmit={onSubmit}>
        <label className="field">
          <span>邮箱</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label className="field">
          <span>密码</span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {error && <div className="errorBox">{error}</div>}
        {notice && <div className="hintBox">{notice}</div>}
        <button className="primaryButton" disabled={isLoading}>
          <LogIn size={18} />
          {isLoading ? '登录中' : '登录'}
        </button>
        {error.includes('邮箱验证') && (
          <button className="ghostButton fullWidth" type="button" onClick={() => void resend()}>
            <Mail size={16} />
            重新发送验证邮件
          </button>
        )}
        <p className="authSwitch">没有账号？<Link to="/register">注册</Link></p>
      </form>
    </AuthLayout>
  );
}

export function AuthLayout({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="authPage">
      <section className="panel authPanel">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children}
      </section>
    </div>
  );
}
