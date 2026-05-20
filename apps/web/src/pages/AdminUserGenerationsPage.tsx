import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Trash2, X } from 'lucide-react';
import Lightbox from 'yet-another-react-lightbox';
import DownloadPlugin from 'yet-another-react-lightbox/plugins/download';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { deleteGeneration, downloadUrl, getAdminUserGenerations, type Generation, type User } from '../api';

export function AdminUserGenerationsPage() {
  const params = useParams();
  const userId = Number(params.id);
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Generation[]>([]);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ item: Generation; index: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Generation | null>(null);

  async function load() {
    setError('');
    try {
      const payload = await getAdminUserGenerations(userId);
      setUser(payload.user);
      setItems(payload.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取生成记录失败');
    }
  }

  useEffect(() => {
    if (Number.isInteger(userId) && userId > 0) void load();
  }, [userId]);

  async function remove(id: number) {
    await deleteGeneration(id);
    setDeleteTarget(null);
    await load();
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>{user ? `${user.email} 的生成记录` : '用户生成记录'}</h1>
        </div>
        <Link className="ghostButton" to="/admin/users">
          <ArrowLeft size={16} />
          返回用户管理
        </Link>
      </header>
      {error && <div className="errorBox">{error}</div>}
      {!items.length && !error && <div className="panel emptyState">暂无生成记录</div>}
      <div className="historyGrid adminGenerationGrid">
        {items.map((item) => (
          <article className="historyCard adminGenerationCard" key={item.id}>
            <div className="adminThumbGrid">
              {item.images.length ? (
                item.images.slice(0, 4).map((image, index) => (
                  <button
                    className="adminThumbButton"
                    type="button"
                    key={image.id}
                    onClick={() => setPreview({ item, index })}
                    aria-label={`查看第 ${index + 1} 张图片`}
                  >
                    <img src={image.url} alt={`${item.prompt} - ${index + 1}`} />
                  </button>
                ))
              ) : (
                <div className="thumbFallback">{item.status}</div>
              )}
            </div>
            <div className="historyBody">
              <div className="historyMeta">
                <span className={`statusTag ${item.status}`}>{statusLabel(item.status)}</span>
                <span>{formatDate(item.createdAt)}</span>
              </div>
              <div className="promptPreview"><p>{item.prompt}</p></div>
              <dl>
                <div><dt>尺寸</dt><dd>{item.size || '-'}</dd></div>
                <div><dt>质量</dt><dd>{item.quality || '-'}</dd></div>
                <div><dt>图片</dt><dd>{item.images.length}</dd></div>
              </dl>
              <div className="cardActions">
                {item.images[0] && (
                  <a className="ghostButton" href={downloadUrl(item.images[0].url)}>
                    <Download size={15} />
                    下载
                  </a>
                )}
                <button className="dangerButton" onClick={() => setDeleteTarget(item)}>
                  <Trash2 size={15} />
                  删除
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {preview && (
        <Lightbox
          open
          close={() => setPreview(null)}
          index={preview.index}
          slides={preview.item.images.map((image, index) => ({
            src: image.url,
            alt: `${preview.item.prompt} - ${index + 1}`,
            download: downloadUrl(image.url)
          }))}
          plugins={[Zoom, DownloadPlugin]}
          carousel={{ finite: true }}
          controller={{ closeOnBackdropClick: true }}
          zoom={{
            maxZoomPixelRatio: 4,
            scrollToZoom: true,
            zoomInMultiplier: 1.25,
            doubleTapDelay: 280
          }}
        />
      )}
      {deleteTarget && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="admin-delete-title">
          <div className="confirmModal">
            <div className="modalHeader">
              <h2 id="admin-delete-title">确认删除</h2>
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
    </div>
  );
}

function statusLabel(status: Generation['status']) {
  const labels: Record<Generation['status'], string> = {
    pending: '等待中',
    processing: '处理中',
    succeeded: '成功',
    failed: '失败',
    cancelled: '已取消'
  };
  return labels[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
