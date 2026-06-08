import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CopyPlus, FileText, RotateCcw, RotateCw, Trash2, X } from 'lucide-react';
import Lightbox from 'yet-another-react-lightbox';
import DownloadPlugin from 'yet-another-react-lightbox/plugins/download';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import {
  ApiError,
  deleteGeneration,
  downloadFilename,
  downloadUrl,
  getGenerationSummary,
  listGenerationsWithFilter,
  retryGeneration,
  type Generation
} from '../api';
import { Pagination } from '../Pagination';
import { formatDuration, generationElapsedMs } from '../time';
import { useBodyScrollLock } from '../useBodyScrollLock';
import { useAuth } from '../auth';

export function HistoryPage({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const auth = useAuth();
  const pageTopRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<Generation[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<'user' | 'guest'>('user');
  const [summary, setSummary] = useState<{ statusCounts: Record<string, number>; queue: { waiting: number } } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Generation | null>(null);
  const [detailTarget, setDetailTarget] = useState<Generation | null>(null);
  const [promptTarget, setPromptTarget] = useState<Generation | null>(null);
  const [isPromptCopied, setIsPromptCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [trialNotice, setTrialNotice] = useState('');
  const [preview, setPreview] = useState<{ url: string; prompt: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const hasLoadedOnceRef = useRef(false);
  const loadRequestRef = useRef(0);

  useBodyScrollLock(Boolean(deleteTarget || detailTarget || promptTarget || preview));

  const load = useCallback(async (nextPage = page, nextStatus = statusFilter, nextOwner = ownerFilter) => {
    const requestId = ++loadRequestRef.current;
    setIsLoading(true);
    setError('');
    try {
      if (mode !== 'admin' && !auth.user) await auth.ensureGuestSession();
      const data = await listGenerationsWithFilter(nextPage, nextStatus, undefined, mode === 'admin' ? nextOwner : '');
      if (requestId !== loadRequestRef.current) return;
      setItems(data.items);
      setPage(data.page);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      void getGenerationSummary()
        .then((nextSummary) => {
          if (requestId === loadRequestRef.current) setSummary(nextSummary);
        })
        .catch(() => undefined);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      showHistoryError(err);
    } finally {
      if (requestId !== loadRequestRef.current) return;
      setIsLoading(false);
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
    }
  }, [auth, mode, ownerFilter, page, statusFilter]);

  async function remove(id: number) {
    await deleteGeneration(id);
    setItems((current) => current.filter((item) => item.id !== id));
    setDeleteTarget(null);
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!items.some((item) => item.status === 'pending' || item.status === 'processing')) return;

    const timer = window.setInterval(() => {
      setNow(Date.now());
      void load(page, statusFilter, ownerFilter);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [items, load, ownerFilter, page, statusFilter]);

  useEffect(() => {
    if (!trialNotice) return;
    const timer = window.setTimeout(() => setTrialNotice(''), 10000);
    return () => window.clearTimeout(timer);
  }, [trialNotice]);

  function showHistoryError(errorValue: unknown) {
    const message = errorValue instanceof Error ? errorValue.message : '读取历史失败';
    if (errorValue instanceof ApiError && errorValue.code === 'TRIAL_IP_LIMIT_EXCEEDED') {
      setError('');
      setTrialNotice('当前网络的游客试用创建次数过多，请稍后再试！');
      return;
    }
    setError(message.includes('请先登录') ? '' : message);
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    window.requestAnimationFrame(() => {
      pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <div className={mode === 'admin' ? 'page historyPage adminHistoryPage' : 'page historyPage'} ref={pageTopRef}>
      <header className="pageHeader">
        <div>
          <h1>{mode === 'admin' ? '图片管理' : '生成历史'}</h1>
        </div>
      </header>

      <section className="historyToolbar">
        <div className="filterGroup">
          {[
            { label: '全部', value: '' },
            { label: '成功', value: 'succeeded' },
            { label: '失败', value: 'failed' },
            { label: '生成中', value: 'processing' },
            { label: '排队中', value: 'pending' },
            { label: '已取消', value: 'cancelled' }
          ].map((filter) => (
            <button
              key={filter.label}
              className={statusFilter === filter.value ? 'filterButton active' : 'filterButton'}
              onClick={() => {
                setPage(1);
                setStatusFilter(filter.value);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        {mode === 'admin' && (
          <div className="filterGroup ownerFilterGroup">
            {[
              { label: '注册用户', value: 'user' },
              { label: '游客', value: 'guest' }
            ].map((filter) => (
              <button
                key={filter.value}
                className={ownerFilter === filter.value ? 'filterButton active' : 'filterButton'}
                type="button"
                onClick={() => {
                  const nextOwner = filter.value as typeof ownerFilter;
                  setPage(1);
                  setOwnerFilter(nextOwner);
                  void load(1, statusFilter, nextOwner);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
        <div className="queueSummary">
          {isLoading ? '刷新中...' : `队列中 ${summary?.queue.waiting ?? 0} · 生成中 ${summary?.statusCounts.processing ?? 0}`}
        </div>
        <button
          className="ghostButton compact resetButton"
          type="button"
          onClick={() => {
            setPage(1);
            setStatusFilter('');
            setOwnerFilter('user');
            void load(1, '', 'user');
          }}
        >
          <RotateCcw size={16} />
          重置
        </button>
      </section>

      {error && <div className="errorBox" role="alert">{error}</div>}
      {toastMessage && <div className="toastNotice" role="status">{toastMessage}</div>}
      {trialNotice && <div className="toastNotice chatTrialNotice" role="status">{trialNotice}</div>}

      {!isLoading && items.length === 0 && (
        <div className="panel emptyState">还没有生成记录。</div>
      )}

      <div className={isLoading && hasLoadedOnce ? 'historyGrid refreshing' : 'historyGrid'}>
        {items.map((item, index) => {
          const shouldPrioritizeImage = index < 4;
          return (
          <article className={mode === 'admin' ? 'historyCard adminGenerationCard' : 'historyCard'} key={item.id}>
            <div className="thumbStrip">
              {item.images[0] ? (
                <button
                  className="thumbButton"
                  type="button"
                  onClick={() => {
                    setPreview({ url: item.images[0].url, prompt: item.prompt });
                  }}
                >
                  <img
                    src={item.images[0].url}
                    alt="历史生成图"
                    loading={shouldPrioritizeImage ? 'eager' : 'lazy'}
                    decoding="async"
                    fetchPriority={shouldPrioritizeImage ? 'high' : 'low'}
                  />
                </button>
              ) : (
                <div className="thumbFallback">{item.status}</div>
              )}
            </div>
            <div className="historyBody">
              <div className="historyMeta">
                {mode === 'admin' && <span className={item.guestSessionId ? 'ownerTag guest' : 'ownerTag user'}>{ownerLabel(item)}</span>}
                {item.errorMessage ? (
                  <button className={`statusTag statusButton ${item.status}`} onClick={() => setDetailTarget(item)}>
                    {generationStatusLabel(item.status)}
                  </button>
                ) : item.status !== 'succeeded' ? (
                  <span className={`statusTag ${item.status}`}>{generationStatusLabel(item.status)}</span>
                ) : null}
              </div>
              <dl>
                <div><dt>尺寸</dt><dd>{item.size || '-'}</dd></div>
                <div><dt>质量</dt><dd>{item.quality || '-'}</dd></div>
                <div><dt>耗时</dt><dd>{formatDuration(generationElapsedMs(item, now))}</dd></div>
              </dl>
              <div className="cardActions">
                {mode !== 'admin' && (
                  <button
                    className="ghostButton"
                    onClick={() => {
                      sessionStorage.setItem('reusePrompt', item.prompt);
                      if (item.size) sessionStorage.setItem('reuseSize', item.size);
                      if (item.quality) sessionStorage.setItem('reuseQuality', item.quality);
                      window.location.href = '/generate';
                    }}
                  >
                    <CopyPlus size={15} />
                    复用
                  </button>
                )}
                <button className="ghostButton historyPromptButton" type="button" onClick={() => {
                  setPromptTarget(item);
                  setIsPromptCopied(false);
                }}>
                  <FileText size={15} />
                  提示词
                </button>
                <button className="dangerButton" onClick={() => setDeleteTarget(item)}>
                  <Trash2 size={15} />
                  删除
                </button>
                {item.status === 'failed' && (
                  <button
                    className="ghostButton"
                    onClick={async () => {
                      const next = await retryGeneration(item.id);
                      sessionStorage.setItem('activeGenerationId', String(next.id));
                      await load(1, statusFilter, ownerFilter);
                    }}
                  >
                    <RotateCw size={15} />
                    重试
                  </button>
                )}
              </div>
            </div>
          </article>
          );
        })}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={changePage} />

      {deleteTarget && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="confirmModal">
            <div className="modalHeader">
              <h2 id="delete-title">确认删除</h2>
              <button className="iconButton" onClick={() => setDeleteTarget(null)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <p>是否确认删除？</p>
            <div className="modalActions">
              <button className="ghostButton" onClick={() => setDeleteTarget(null)}>
                取消
              </button>
              <button className="dangerButton strong" onClick={() => void remove(deleteTarget.id)}>
                <Trash2 size={15} />
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {detailTarget && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="detail-title">
          <div className="confirmModal">
            <div className="modalHeader">
              <h2 id="detail-title">生成详情</h2>
              <button className="iconButton" onClick={() => setDetailTarget(null)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="detailBlock">
              <span>状态</span>
              <strong>{detailTarget.status}</strong>
            </div>
            <div className="detailBlock">
              <span>耗时</span>
              <strong>{formatDuration(generationElapsedMs(detailTarget, now))}</strong>
            </div>
            <div className="detailBlock">
              <span>参考图</span>
              {detailTarget.referenceImageUrls.length ? (
                <div className="detailReferenceGrid">
                  {detailTarget.referenceImageUrls.map((url, index) => (
                    <img src={url} alt={`参考图 ${index + 1}`} key={url} loading="lazy" decoding="async" />
                  ))}
                </div>
              ) : (
                <strong>无</strong>
              )}
            </div>
            <div className="detailBlock">
              <span>失败原因</span>
              <p>{detailTarget.errorMessage || '无'}</p>
            </div>
          </div>
        </div>
      )}

      {promptTarget && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="prompt-title">
          <div className="promptModal">
            <div className="modalHeader">
              <h2 id="prompt-title">完整提示词</h2>
              <button className="iconButton" onClick={() => {
                setPromptTarget(null);
                setIsPromptCopied(false);
              }} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="promptFullText">{promptTarget.prompt}</div>
            <div className="modalActions">
              <button
                className="ghostButton"
                onClick={async () => {
                  await navigator.clipboard.writeText(promptTarget.prompt);
                  setIsPromptCopied(true);
                  setToastMessage('复制成功');
                  window.setTimeout(() => setToastMessage(''), 1000);
                }}
              >
                {isPromptCopied ? <Check size={15} /> : <CopyPlus size={15} />}
                复制提示词
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <Lightbox
          open
          close={() => setPreview(null)}
          slides={[{ src: preview.url, alt: preview.prompt, download: { url: downloadUrl(preview.url), filename: downloadFilename(preview.url) } }]}
          plugins={[Zoom, DownloadPlugin]}
          carousel={{ finite: true }}
          controller={{ closeOnBackdropClick: true }}
          zoom={{
            maxZoomPixelRatio: 4,
            scrollToZoom: true,
            zoomInMultiplier: 1.25,
            doubleTapDelay: 280
          }}
          render={{
            buttonPrev: () => null,
            buttonNext: () => null
          }}
        />
      )}
    </div>
  );
}

function generationStatusLabel(status: Generation['status']) {
  const labels: Record<Generation['status'], string> = {
    pending: '排队中',
    processing: '生成中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消'
  };
  return labels[status] || status;
}

function ownerLabel(item: Generation) {
  if (item.guestSessionId) return `游客 #${item.guestSessionId}`;
  if (item.ownerEmail) return item.ownerEmail;
  if (item.userId) return `用户 #${item.userId}`;
  return '未知来源';
}
