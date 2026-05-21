import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ImagePlus, Layers3, LogIn, Mail, ShieldCheck, Sparkles } from 'lucide-react';
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
      <section className="authShell">
        <div className="authHero">
          <div className="authBrandLockup">
            <img src="/brand-icon.png" alt="" />
            <div>
              <strong>炫步 AI</strong>
              <span>AI image studio</span>
            </div>
          </div>
          <div className="authHeroCopy">
            <p className="eyebrow">Creative engine</p>
            <h1>把提示词、参考图和灵感变成可管理的作品库</h1>
            <p>
              面向内容创作者和运营团队的 AI 生图工作台，支持提示词模板、变量填写、积分消耗、历史管理和后台审计。
            </p>
          </div>
          <div className="authFeatureGrid">
            <div>
              <Sparkles size={18} />
              <span>提示词模板</span>
              <strong>变量化复用</strong>
            </div>
            <div>
              <ImagePlus size={18} />
              <span>参考图生成</span>
              <strong>作品可追溯</strong>
            </div>
            <div>
              <Layers3 size={18} />
              <span>历史图库</span>
              <strong>批量管理</strong>
            </div>
            <div>
              <ShieldCheck size={18} />
              <span>后台治理</span>
              <strong>审计与配置</strong>
            </div>
          </div>
          <div className="authFlow">
            <span>选择模板</span>
            <ArrowRight size={14} />
            <span>填写变量</span>
            <ArrowRight size={14} />
            <span>生成图片</span>
            <ArrowRight size={14} />
            <span>沉淀历史</span>
          </div>
        </div>

        <div className="panel authPanel">
          <div className="authPanelHeader">
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <span><CheckCircle2 size={14} /> 安全登录后继续创作</span>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
