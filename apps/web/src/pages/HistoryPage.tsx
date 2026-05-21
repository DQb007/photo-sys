import { useCallback, useEffect, useState } from 'react';
import { CopyPlus, RefreshCcw, RotateCw, Trash2, X } from 'lucide-react';
import Lightbox from 'yet-another-react-lightbox';
import DownloadPlugin from 'yet-another-react-lightbox/plugins/download';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import {
  deleteGeneration,
  downloadUrl,
  getGenerationSummary,
  listGenerationsWithFilter,
  retryGeneration,
  type Generation
} from '../api';
import { formatDuration, generationElapsedMs } from '../time';

export function HistoryPage({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const [items, setItems] = useState<Generation[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [summary, setSummary] = useState<{ statusCounts: Record<string, number>; queue: { waiting: number } } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Generation | null>(null);
  const [detailTarget, setDetailTarget] = useState<Generation | null>(null);
  const [promptTarget, setPromptTarget] = useState<Generation | null>(null);
  const [copyState, setCopyState] = useState('');
  const [preview, setPreview] = useState<{ url: string; prompt: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (nextPage = page, nextStatus = statusFilter) => {
    setIsLoading(true);
    setError('');
    try {
      const data = await listGenerationsWithFilter(nextPage, nextStatus);
      setItems(data.items);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setSummary(await getGenerationSummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取历史失败');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [page, statusFilter]);

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
      void load(page, statusFilter);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [items, load, page, statusFilter]);

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>{mode === 'admin' ? '图片管理' : '生成历史'}</h1>
        </div>
        <button className="ghostButton" onClick={() => void load()}>
          <RefreshCcw size={16} />
          刷新
        </button>
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
        <div className="queueSummary">
          {isLoading ? '刷新中...' : `队列中 ${summary?.queue.waiting ?? 0} · 生成中 ${summary?.statusCounts.processing ?? 0}`}
        </div>
      </section>

      {error && <div className="errorBox">{error}</div>}

      {!isLoading && items.length === 0 && (
        <div className="panel emptyState">还没有生成记录。</div>
      )}

      <div className={isLoading && hasLoadedOnce ? 'historyGrid refreshing' : 'historyGrid'}>
        {items.map((item) => (
          <article className="historyCard" key={item.id}>
            <div className="thumbStrip">
              {item.images[0] ? (
                <button
                  className="thumbButton"
                  type="button"
                  onClick={() => {
                    setPreview({ url: item.images[0].url, prompt: item.prompt });
                  }}
                >
                  <img src={item.images[0].url} alt="历史生成图" />
                </button>
              ) : (
                <div className="thumbFallback">{item.status}</div>
              )}
              </div>
              <div className="historyBody">
              <div className="historyMeta">
                {item.errorMessage ? (
                  <button className={`statusTag statusButton ${item.status}`} onClick={() => setDetailTarget(item)}>
                    {item.status}
                  </button>
                ) : (
                  <span className={`statusTag ${item.status}`}>{item.status}</span>
                )}
              </div>
              <button className="promptPreview" onClick={() => {
                setPromptTarget(item);
                setCopyState('');
              }}>
                <p>{item.prompt}</p>
              </button>
              <dl>
                <div><dt>尺寸</dt><dd>{item.size || '-'}</dd></div>
                <div><dt>质量</dt><dd>{item.quality || '-'}</dd></div>
                <div><dt>耗时</dt><dd>{formatDuration(generationElapsedMs(item, now))}</dd></div>
              </dl>
              <div className="cardActions">
                <button
                  className="ghostButton"
                  onClick={() => {
                    sessionStorage.setItem('reusePrompt', item.prompt);
                    window.location.href = '/generate';
                  }}
                >
                  <CopyPlus size={15} />
                  复用
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
                      await load(1, statusFilter);
                    }}
                  >
                    <RotateCw size={15} />
                    重试
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {items.length > 0 && (
        <div className="paginationBar">
          <button className="ghostButton" disabled={page <= 1} onClick={() => void load(page - 1, statusFilter)}>
            上一页
          </button>
          <span>第 {page} / {totalPages} 页</span>
          <button className="ghostButton" disabled={page >= totalPages} onClick={() => void load(page + 1, statusFilter)}>
            下一页
          </button>
        </div>
      )}

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
                    <img src={url} alt={`参考图 ${index + 1}`} key={url} />
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
              <button className="iconButton" onClick={() => setPromptTarget(null)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="promptFullText">{promptTarget.prompt}</div>
            <div className="modalActions">
              <span className="copyState">{copyState}</span>
              <button
                className="ghostButton"
                onClick={async () => {
                  await navigator.clipboard.writeText(promptTarget.prompt);
                  setCopyState('已复制');
                }}
              >
                <CopyPlus size={15} />
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
          slides={[{ src: preview.url, alt: preview.prompt, download: downloadUrl(preview.url) }]}
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
