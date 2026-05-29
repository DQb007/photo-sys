import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Download, ImageUp, Loader2, PlusCircle, Sparkles, Wand2, XCircle } from 'lucide-react';
import { ApiError, cancelGeneration, createGeneration, downloadFilename, downloadUrl, getCreditBalance, getGeneration, type Generation } from '../api';
import { useAuth } from '../auth';
import { SelectField } from '../SelectField';
import { formatDuration, generationElapsedMs } from '../time';

const qualities = ['auto', 'high', 'medium', 'low'];
const sizeOptions = [
  { label: '方图 1:1', value: '1024x1024' },
  { label: '竖图 2:3', value: '1024x1536' },
  { label: '横图 3:2', value: '1536x1024' }
];
const sizes = sizeOptions.map((item) => item.value);
const qualityOptions = qualities.map((item) => ({ label: item, value: item }));
const activeGenerationKey = 'activeGenerationId';
const generationWaitMessage = '生成大约需要2-3mins，请耐心等候，您可以进行其他操作';

export function GeneratePage() {
  const { user } = useAuth();
  const auth = useAuth();
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState(sizes[0]);
  const [quality, setQuality] = useState(qualities[0]);
  const [count, setCount] = useState(1);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [trialNotice, setTrialNotice] = useState('');
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [creditBalance, setCreditBalance] = useState(user?.creditBalance ?? 0);
  const [costPerImage, setCostPerImage] = useState(1);
  const [creditsEnabled, setCreditsEnabled] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [isCancelling, setIsCancelling] = useState(false);
  const isActiveGeneration = Boolean(generation && ['pending', 'processing'].includes(generation.status));
  const estimatedCreditCost = creditsEnabled ? count * costPerImage : 0;

  const previewUrl = useMemo(() => {
    return referenceImages.map((file) => ({
      file,
      url: URL.createObjectURL(file)
    }));
  }, [referenceImages]);

  useEffect(() => {
    const reusePrompt = sessionStorage.getItem('reusePrompt');
    if (reusePrompt) {
      setPrompt(reusePrompt);
      sessionStorage.removeItem('reusePrompt');
    }
    const activeGenerationId = Number(sessionStorage.getItem(activeGenerationKey));
    if (Number.isInteger(activeGenerationId) && activeGenerationId > 0) {
      getGeneration(activeGenerationId)
        .then((restoredGeneration) => {
          setGeneration(restoredGeneration);
          restoreFormFromGeneration(restoredGeneration);
          if (!['pending', 'processing'].includes(restoredGeneration.status)) {
            sessionStorage.removeItem(activeGenerationKey);
          }
        })
        .catch(() => {
          sessionStorage.removeItem(activeGenerationKey);
        });
    }
  }, []);

  useEffect(() => {
    if (!user) {
      void auth.ensureGuestSession().catch(showGenerationError);
      return;
    }
    getCreditBalance()
      .then((payload) => {
        setCreditBalance(payload.balance);
        setCostPerImage(payload.credits.costPerImage);
        setCreditsEnabled(payload.credits.enabled);
      })
      .catch(() => undefined);
  }, [user?.id]);

  useEffect(() => {
    if (!generation || !['pending', 'processing'].includes(generation.status)) return;

    const timer = window.setInterval(async () => {
      setNow(Date.now());
      try {
        const latest = await getGeneration(generation.id);
        setGeneration(latest);
        setPollError('');
        if (!['pending', 'processing'].includes(latest.status)) {
          sessionStorage.removeItem(activeGenerationKey);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '读取生成任务失败');
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [generation]);

  useEffect(() => {
    if (generation && !['pending', 'processing'].includes(generation.status)) {
      setError('');
      setPollError('');
    }
  }, [generation?.id, generation?.status]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!trialNotice) return;
    const timer = window.setTimeout(() => setTrialNotice(''), 10000);
    return () => window.clearTimeout(timer);
  }, [trialNotice]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    setPollError('');
    setIsLoading(true);

    const formData = new FormData();
    formData.set('prompt', prompt);
    formData.set('size', size);
    formData.set('quality', quality);
    formData.set('count', String(count));
    for (const image of referenceImages) {
      formData.append('referenceImages', image);
    }

    try {
      if (!user) await auth.ensureGuestSession();
      const nextGeneration = await createGeneration(formData);
      setGeneration(nextGeneration);
      setMessage(generationWaitMessage);
      restoreFormFromGeneration(nextGeneration);
      sessionStorage.setItem(activeGenerationKey, String(nextGeneration.id));
      if (user) {
        getCreditBalance()
          .then((payload) => {
            setCreditBalance(payload.balance);
            setCostPerImage(payload.credits.costPerImage);
            setCreditsEnabled(payload.credits.enabled);
          })
          .catch(() => undefined);
      } else {
        await auth.refreshGuestSession().catch(() => undefined);
      }
    } catch (err) {
      const typed = err as Error & { generation?: Generation };
      setMessage('');
      showGenerationError(err);
      if (typed.generation) setGeneration(typed.generation);
    } finally {
      setIsLoading(false);
    }
  }

  async function cancelActiveGeneration() {
    if (!generation || generation.status !== 'pending') return;
    setMessage('');
    setError('');
    setPollError('');
    setIsCancelling(true);
    try {
      const payload = await cancelGeneration(generation.id);
      setGeneration(payload.generation);
      sessionStorage.removeItem(activeGenerationKey);
      const balancePayload = await getCreditBalance();
      setCreditBalance(balancePayload.balance);
      setCostPerImage(balancePayload.credits.costPerImage);
      setCreditsEnabled(balancePayload.credits.enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消生成失败');
    } finally {
      setIsCancelling(false);
    }
  }

  const elapsedLabel = generation ? formatDuration(generationElapsedMs(generation, now)) : '';
  const canShowFormError = !generation || ['pending', 'processing'].includes(generation.status);
  const formError = canShowFormError ? error || pollError : '';
  const placeholderCount = Math.max(1, generation?.count ?? count);

  function restoreFormFromGeneration(restoredGeneration: Generation) {
    setPrompt(restoredGeneration.prompt);
    if (restoredGeneration.size) setSize(restoredGeneration.size);
    if (restoredGeneration.quality) setQuality(restoredGeneration.quality);
    setCount(restoredGeneration.count);
  }

  function startNewTask() {
    sessionStorage.removeItem(activeGenerationKey);
    setGeneration(null);
    setReferenceImages([]);
    setMessage('');
    setTrialNotice('');
    setError('');
    setPollError('');
    setPrompt('');
    setSize(sizes[0]);
    setQuality(qualities[0]);
    setCount(1);
  }

  function showGenerationError(errorValue: unknown) {
    const text = errorValue instanceof Error ? errorValue.message : String(errorValue || '生成失败');
    if (errorValue instanceof ApiError && errorValue.code === 'TRIAL_IP_LIMIT_EXCEEDED') {
      setError('');
      setTrialNotice('当前网络的游客试用创建次数过多，请稍后再试！');
      return;
    }
    if ((errorValue instanceof ApiError && errorValue.code === 'TRIAL_LIMIT_EXCEEDED') || text.includes('图片试用次数已用完')) {
      setError('');
      setTrialNotice('图片试用次数已用完，请前往注册页面注册登录使用！');
      return;
    }
    setError(text);
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>图片生成</h1>
        </div>
        <div className="statusPill">
          <Sparkles size={16} />
          {user
            ? (creditsEnabled ? `${creditBalance} 积分` : '积分未启用')
            : (auth.guestSession ? `游客剩余 ${auth.guestSession.generationRemaining} 次` : '游客试用')}
        </div>
      </header>

      {!user && (
        <div className="hintBox trialHintBox">
          <Sparkles size={16} />
          <span>游客可试用图片生成，次数用完后请登录或注册继续使用。</span>
        </div>
      )}

      {message && <div className="toastNotice generationWaitNotice" role="status">{message}</div>}
      {trialNotice && <div className="toastNotice generationTrialNotice" role="status">{trialNotice}</div>}

      <div className="generateGrid">
        <form className="panel formPanel" onSubmit={onSubmit}>
          <label className="field">
            <span>提示词</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="描述你要生成的画面、主体、风格、构图和输出要求"
              disabled={isActiveGeneration}
              required
            />
          </label>

          <div className="formRow">
            <SelectField label="尺寸" value={size} options={sizeOptions} disabled={isActiveGeneration} onChange={setSize} />
            <SelectField label="质量" value={quality} options={qualityOptions} disabled={isActiveGeneration} onChange={setQuality} />
            <label className="field">
              <span>数量</span>
              <input
                type="number"
                min={1}
                max={4}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                disabled={isActiveGeneration}
              />
            </label>
          </div>

          <label className="uploadBox">
            <ImageUp size={22} />
            <span>{referenceImages.length ? `已选择 ${referenceImages.length} 张参考图` : '上传参考图，可选，最多 4 张'}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={isActiveGeneration}
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                setReferenceImages((current) => [...current, ...files].slice(0, 4));
                event.target.value = '';
              }}
            />
          </label>

          {referenceImages.length >= 4 && (
            <div className="hintBox">最多只能上传 4 张参考图。</div>
          )}

          {previewUrl.length > 0 && (
            <div className="referencePreviewGrid">
              {previewUrl.map((item, index) => (
                <div className="referencePreviewItem" key={`${item.file.name}-${index}`}>
                  <img src={item.url} alt={`参考图 ${index + 1}`} />
                  <button
                    type="button"
                    onClick={() => setReferenceImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          )}

          {previewUrl.length === 0 && generation?.referenceImageUrls.length ? (
            <div className="referencePreviewGrid">
              {generation.referenceImageUrls.map((url, index) => (
                <div className="referencePreviewItem" key={url}>
                  <img src={url} alt={`参考图 ${index + 1}`} />
                </div>
              ))}
            </div>
          ) : null}

          {formError && <div className="errorBox">{formError}</div>}

          <div className="creditSummary">
            <span>当前余额 {creditBalance}</span>
            <strong>预计消耗 {estimatedCreditCost}</strong>
          </div>

          <button className="primaryButton" type="submit" disabled={isLoading || isActiveGeneration}>
            {isLoading ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
            {isActiveGeneration ? '任务生成中' : isLoading ? '提交中' : '开始生成'}
          </button>

          {generation?.status === 'pending' && (
            <button className="dangerButton fullWidth" type="button" disabled={isCancelling} onClick={() => void cancelActiveGeneration()}>
              {isCancelling ? <Loader2 className="spin" size={16} /> : <XCircle size={16} />}
              {isCancelling ? '取消中' : '取消生成'}
            </button>
          )}

          {generation && !isActiveGeneration && (
            <button className="ghostButton fullWidth" type="button" onClick={startNewTask}>
              <PlusCircle size={16} />
              开始新任务
            </button>
          )}
        </form>

        <section className="panel resultPanel">
          <div className="panelTitle">
            <h2>生成结果</h2>
            {generation && <span>{generation.status} · {elapsedLabel}</span>}
          </div>

          {!generation && (
            <div className="emptyState">
              <Wand2 size={28} />
              <p>提交提示词后，生成图会显示在这里。</p>
            </div>
          )}

          {generation && ['pending', 'processing'].includes(generation.status) && (
            <div className="generationProgress" aria-live="polite">
              <div className="progressBox compact">
                <Loader2 className="spin" size={20} />
                <div>
                  <strong>{generation.status === 'pending' ? '排队中' : '生成中'}</strong>
                  <span>已耗时 {elapsedLabel}</span>
                </div>
              </div>
              <div className="generationSkeletonGrid" aria-label="图片正在生成中">
                {Array.from({ length: placeholderCount }).map((_, index) => (
                  <div className="generationSkeletonTile" key={index}>
                    <div className="generationSkeletonGlow" />
                    <div className="generationSkeletonLabel">正在生成图片 {index + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {generation?.status === 'cancelled' && (
            <div className="progressBox cancelled">
              <XCircle size={20} />
              <div>
                <strong>已取消</strong>
                <span>本次任务未发送到第三方生成接口。</span>
              </div>
            </div>
          )}

          {generation?.errorMessage && (
            <div className="errorBox">{generation.errorMessage}</div>
          )}

          <div className="imageGrid">
            {generation?.images.map((image) => (
              <figure className="imageTile" key={image.id}>
                <img src={image.url} alt={`生成图 ${image.id}`} />
                <a href={downloadUrl(image.url)} download={downloadFilename(image.url)}>
                  <Download size={16} />
                  下载
                </a>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
