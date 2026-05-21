import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { verifyEmail } from '../api';
import { AuthLayout } from './LoginPage';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'succeeded' | 'failed'>('loading');
  const [error, setError] = useState('');
  const verifiedTokenRef = useRef('');

  useEffect(() => {
    const token = params.get('token') || '';
    if (!token) {
      setStatus('failed');
      setError('验证链接缺少 token。');
      return;
    }
    if (verifiedTokenRef.current === token) return;
    verifiedTokenRef.current = token;
    verifyEmail(token)
      .then(() => setStatus('succeeded'))
      .catch((err) => {
        setStatus('failed');
        setError(err instanceof Error ? err.message : '验证失败');
      });
  }, [params]);

  return (
    <AuthLayout title="邮箱验证" eyebrow="Verify" subtitle="完成验证后即可开始创作">
      <div className="authResult">
        {status === 'loading' && <Loader2 className="spin" size={28} />}
        {status === 'succeeded' && <CheckCircle2 size={32} />}
        {status === 'failed' && <XCircle size={32} />}
        <p>
          {status === 'loading' && '正在验证邮箱...'}
          {status === 'succeeded' && '邮箱验证成功，现在可以登录。'}
          {status === 'failed' && error}
        </p>
        <Link className="ghostButton" to="/login">返回登录</Link>
      </div>
    </AuthLayout>
  );
}
