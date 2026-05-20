import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Download, ImageUp, Loader2, PlusCircle, Sparkles, Wand2, XCircle } from 'lucide-react';
import { cancelGeneration, createGeneration, downloadUrl, getCreditBalance, getGeneration, type Generation } from '../api';
import { useAuth } from '../auth';
import { formatDuration, generationElapsedMs } from '../time';

const sizes = ['1024x1024', '1024x1536', '1536x1024'];
const qualities = ['auto', 'high', 'medium', 'low'];
const activeGenerationKey = 'activeGenerationId';

export function GeneratePage() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState(sizes[0]);
  const [quality, setQuality] = useState(qualities[0]);
  const [count, setCount] = useState(1);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
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
        if (!['pending', 'processing'].includes(latest.status)) {
          sessionStorage.removeItem(activeGenerationKey);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '读取生成任务失败');
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [generation]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
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
      const nextGeneration = await createGeneration(formData);
      setGeneration(nextGeneration);
      restoreFormFromGeneration(nextGeneration);
      sessionStorage.setItem(activeGenerationKey, String(nextGeneration.id));
      getCreditBalance()
        .then((payload) => {
          setCreditBalance(payload.balance);
          setCostPerImage(payload.credits.costPerImage);
          setCreditsEnabled(payload.credits.enabled);
        })
        .catch(() => undefined);
    } catch (err) {
      const typed = err as Error & { generation?: Generation };
      setError(typed.message);
      if (typed.generation) setGeneration(typed.generation);
    } finally {
      setIsLoading(false);
    }
  }

  async function cancelActiveGeneration() {
    if (!generation || generation.status !== 'pending') return;
    setError('');
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
    setError('');
    setPrompt('');
    setSize(sizes[0]);
    setQuality(qualities[0]);
    setCount(1);
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>图片生成</h1>
        </div>
        <div className="statusPill">
          <Sparkles size={16} />
          {creditsEnabled ? `${creditBalance} 积分` : '积分未启用'}
        </div>
      </header>

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
            <label className="field">
              <span>尺寸</span>
              <select value={size} onChange={(event) => setSize(event.target.value)} disabled={isActiveGeneration}>
                {sizes.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="field">
              <span>质量</span>
              <select value={quality} onChange={(event) => setQuality(event.target.value)} disabled={isActiveGeneration}>
                {qualities.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
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

          {error && <div className="errorBox">{error}</div>}

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
            <div className="progressBox">
              <Loader2 className="spin" size={20} />
              <div>
                <strong>{generation.status === 'pending' ? '排队中' : '生成中'}</strong>
                <span>已耗时 {elapsedLabel}</span>
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
                <a href={downloadUrl(image.url)}>
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
