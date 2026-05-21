import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Feather, LogIn, Mail, Orbit, Sparkles, WandSparkles } from 'lucide-react';
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
  const typedTitle = useTypewriter(HERO_TITLE, 140);

  return (
    <div className="authPage">
      <div className="authMotionLayer" aria-hidden="true">
        <span className="authBeam authBeamOne" />
        <span className="authBeam authBeamTwo" />
        <span className="authPulse authPulseOne" />
        <span className="authPulse authPulseTwo" />
        <span className="authParticle authParticleOne" />
        <span className="authParticle authParticleTwo" />
        <span className="authParticle authParticleThree" />
      </div>
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
            <h1 className="typewriterTitle" aria-label={HERO_TITLE}>
              <span aria-hidden="true">{typedTitle}</span>
              <span className="typewriterCursor" aria-hidden="true" />
            </h1>
            <p>
              把想象交给 AI，把惊喜留给作品。每一次生成，都是一次新的风格实验。
            </p>
          </div>
          <div className="authSlogan">一张图，打开一个新世界</div>
          <div className="authFeatureGrid authCopyGrid">
            <div>
              <WandSparkles size={18} />
              <strong>更快抵达画面感</strong>
              <span>让脑海里的画面，不再停在描述里。</span>
            </div>
            <div>
              <Orbit size={18} />
              <strong>更适合反复打磨</strong>
              <span>灵感不会一次定稿，好作品值得多试几次。</span>
            </div>
            <div>
              <Feather size={18} />
              <strong>更容易沉淀风格</strong>
              <span>把喜欢的方向留下来，下一次更接近你想要的样子。</span>
            </div>
          </div>
          <div className="authFlow">
            <span>想象</span>
            <ArrowRight size={14} />
            <span>生成</span>
            <ArrowRight size={14} />
            <span>收藏</span>
            <ArrowRight size={14} />
            <span>再创作</span>
          </div>
        </div>

        <div className="panel authPanel">
          <div className="authPanelHeader">
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title === '登录' ? '欢迎回来' : title}</h2>
            <span><CheckCircle2 size={14} /> 继续你的下一张作品</span>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

function useTypewriter(text: string, speedMs: number) {
  const [visibleLength, setVisibleLength] = useState(0);

  useEffect(() => {
    setVisibleLength(0);
    const letters = Array.from(text);
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleLength(index);
      if (index >= letters.length) {
        window.clearInterval(timer);
      }
    }, speedMs);

    return () => window.clearInterval(timer);
  }, [text, speedMs]);

  return Array.from(text).slice(0, visibleLength).join('');
}
