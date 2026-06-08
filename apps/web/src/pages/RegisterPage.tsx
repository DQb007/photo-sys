import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { register } from '../api';
import { useAuth } from '../auth';
import { AuthLayout } from './LoginPage';

export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const payload = await register({ email, password, displayName });
      if (payload.token && payload.user) {
        auth.setSession(payload.token, payload.user);
        navigate('/generate', { replace: true });
        return;
      }
      setMessage('注册成功，请检查邮箱完成验证。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout title="注册" eyebrow="Create account" subtitle="开启你的第一张作品">
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
          <span>昵称</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="nickname"
            placeholder="给自己起个名字"
          />
        </label>
        <label className="field">
          <span>密码</span>
          <div className="authPasswordField">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={isPasswordVisible ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="至少 8 位字符"
              minLength={8}
              aria-describedby="register-password-hint"
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
          <small className="fieldHint" id="register-password-hint">至少 8 位字符，建议包含字母和数字。</small>
        </label>
        {error && <div className="errorBox" role="alert">{error}</div>}
        {message && <div className="toastNotice" role="status">{message}</div>}
        <button className="primaryButton" disabled={isLoading} aria-busy={isLoading}>
          <UserPlus size={18} />
          {isLoading ? '注册中' : '注册'}
        </button>
        <p className="authSwitch">已有账号？<Link to="/login">登录</Link></p>
      </form>
    </AuthLayout>
  );
}
