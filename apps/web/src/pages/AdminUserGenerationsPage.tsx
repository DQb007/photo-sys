import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Trash2 } from 'lucide-react';
import { deleteGeneration, downloadUrl, getAdminUserGenerations, type Generation, type User } from '../api';

export function AdminUserGenerationsPage() {
  const params = useParams();
  const userId = Number(params.id);
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Generation[]>([]);
  const [error, setError] = useState('');

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
      </header>
      {error && <div className="errorBox">{error}</div>}
      <div className="historyGrid">
        {items.map((item) => (
          <article className="historyCard" key={item.id}>
            <div className="thumbStrip">
              {item.images[0] ? <img src={item.images[0].url} alt={item.prompt} /> : <div className="thumbFallback">{item.status}</div>}
            </div>
            <div className="historyBody">
              <div className="historyMeta"><span className={`statusTag ${item.status}`}>{item.status}</span></div>
              <button className="promptPreview"><p>{item.prompt}</p></button>
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
    </div>
  );
}
