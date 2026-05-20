import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Trash2 } from 'lucide-react';
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
                <button className="dangerButton" onClick={() => void remove(item.id)}>
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
    </div>
  );
}

function statusLabel(status: Generation['status']) {
  const labels: Record<Generation['status'], string> = {
    pending: '等待中',
    processing: '处理中',
    succeeded: '成功',
    failed: '失败'
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
