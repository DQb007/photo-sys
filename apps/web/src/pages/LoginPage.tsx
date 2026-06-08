import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, LogIn, Mail } from 'lucide-react';
import { ApiError, resendVerification } from '../api';
import { useAuth } from '../auth';

const HERO_TITLE = '让灵感先一步成画';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
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
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            required
          />
        </label>
        <label className="field">
          <span>密码</span>
          <div className="authPasswordField">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={isPasswordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="输入登录密码"
              required
            />
            <button
              type="button"
              aria-label={isPasswordVisible ? '隐藏密码' : '显示密码'}
              aria-pressed={isPasswordVisible}
              onClick={() => setIsPasswordVisible((value) => !value)}
            >
              {isPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
        {error && <div className="errorBox" role="alert">{error}</div>}
        {notice && <div className="hintBox">{notice}</div>}
        <button className="primaryButton" disabled={isLoading} aria-busy={isLoading}>
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

export function AuthLayout({
  title,
  eyebrow,
  subtitle = '继续你的下一张作品',
  children,
}: {
  title: string;
  eyebrow: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="authPage">
      <section className="authShell">
        <div className="authHero">
          <div className="authBrandLockup">
            <img src="/brand-icon.png" alt="" />
            <div>
              <strong>炫步 AI</strong>
              <span>Imagination lab</span>
            </div>
          </div>
          <div className="authHeroCopy">
            <p className="eyebrow">Step into creation</p>
            <h1 aria-label={HERO_TITLE}>
              <span aria-hidden="true">让灵感</span>
              <span aria-hidden="true">先一步成画</span>
            </h1>
            <p>
              把想象交给 AI，把惊喜留给作品。每一次生成，都是一次新的风格实验。
            </p>
          </div>
        </div>

        <div className="panel authPanel">
          <div className="authPanelHeader">
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title === '登录' ? '欢迎回来' : title}</h2>
            <span><CheckCircle2 size={14} /> {subtitle}</span>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
