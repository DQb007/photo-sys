import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, RefreshCcw, Save, Trash2, XCircle } from 'lucide-react';
import {
  createAdminPromptTemplate,
  deleteAdminPromptTemplate,
  listAdminPromptTemplates,
  updateAdminPromptTemplate,
  type PromptTemplate,
  type PromptTemplateStatus
} from '../api';

const emptyForm = {
  title: '',
  category: '',
  description: '',
  promptText: '',
  sortOrder: 0,
  status: 'active' as PromptTemplateStatus
};

export function AdminPromptTemplatesPage() {
  const [items, setItems] = useState<PromptTemplate[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const editingItem = useMemo(() => items.find((item) => item.id === editingId) || null, [editingId, items]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const payload = await listAdminPromptTemplates({ search: search.trim(), status });
      setItems(payload.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取提示词模板失败');
    } finally {
      setIsLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitTemplate(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!form.title.trim()) {
      setError('请填写标题');
      return;
    }
    if (!form.promptText.trim()) {
      setError('请填写提示词正文');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        await updateAdminPromptTemplate(editingId, normalizeForm());
      } else {
        await createAdminPromptTemplate(normalizeForm());
      }
      setMessage(editingId ? '模板已更新' : '模板已创建');
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存提示词模板失败');
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(item: PromptTemplate) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      category: item.category || '',
      description: item.description || '',
      promptText: item.promptText,
      sortOrder: item.sortOrder,
      status: item.status
    });
    setMessage('');
    setError('');
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage('');
    setError('');
  }

  async function toggleStatus(item: PromptTemplate) {
    setError('');
    setMessage('');
    try {
      await updateAdminPromptTemplate(item.id, {
        status: item.status === 'active' ? 'disabled' : 'active'
      });
      setMessage(item.status === 'active' ? '模板已停用' : '模板已启用');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新模板状态失败');
    }
  }

  async function remove(item: PromptTemplate) {
    if (!window.confirm(`确认删除“${item.title}”？`)) return;
    setError('');
    setMessage('');
    try {
      await deleteAdminPromptTemplate(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (editingId === item.id) resetForm();
      setMessage('模板已删除');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除模板失败');
    }
  }

  function normalizeForm() {
    return {
      title: form.title.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      promptText: form.promptText.trim(),
      sortOrder: Number(form.sortOrder) || 0,
      status: form.status
    };
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>提示词管理</h1>
        </div>
        <button className="ghostButton" type="button" disabled={isLoading} onClick={() => void load()}>
          <RefreshCcw size={16} />
          刷新
        </button>
      </header>

      {error && <div className="errorBox">{error}</div>}
      {message && <div className="hintBox">{message}</div>}

      <div className="promptAdminGrid">
        <section className="panel formPanel">
          <div className="panelTitle">
            <h2>{editingItem ? `编辑 #${editingItem.id}` : '新建模板'}</h2>
            {editingItem && (
              <button className="ghostButton" type="button" onClick={resetForm}>
                取消编辑
              </button>
            )}
          </div>
          <form className="compactStack" onSubmit={submitTemplate}>
            <label className="field">
              <span>标题</span>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <div className="formRow two">
              <label className="field">
                <span>分类</span>
                <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
              </label>
              <label className="field">
                <span>排序值</span>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
                />
              </label>
            </div>
            <label className="field">
              <span>简介</span>
              <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
            <label className="field">
              <span>提示词正文</span>
              <textarea value={form.promptText} onChange={(event) => setForm({ ...form, promptText: event.target.value })} />
            </label>
            <label className="field">
              <span>状态</span>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as PromptTemplateStatus })}>
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
            <button className="primaryButton compact" type="submit" disabled={isSaving}>
              {editingItem ? <Save size={16} /> : <Plus size={16} />}
              {isSaving ? '保存中' : editingItem ? '保存模板' : '创建模板'}
            </button>
          </form>
        </section>

        <section className="panel tablePanel promptAdminTable">
          <div className="tableHeader">
            <h2>模板列表</h2>
            <form className="tableActions" onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索模板" />
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">全部状态</option>
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
              <button className="ghostButton" type="submit">筛选</button>
            </form>
          </div>
          <table>
            <thead>
              <tr>
                <th>模板</th>
                <th>状态</th>
                <th>变量</th>
                <th>使用</th>
                <th>排序</th>
                <th>更新</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.title}</strong>
                    <span>{item.category || '未分类'}</span>
                    {item.description && <span>{item.description}</span>}
                  </td>
                  <td>{item.status === 'active' ? '启用' : '停用'}</td>
                  <td>{item.variables.length}</td>
                  <td>{item.usageCount}</td>
                  <td>{item.sortOrder}</td>
                  <td>{new Date(item.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="tableActions">
                      <button className="ghostButton" type="button" onClick={() => startEdit(item)}>
                        <Edit3 size={14} />
                        编辑
                      </button>
                      <button className="ghostButton" type="button" onClick={() => void toggleStatus(item)}>
                        <XCircle size={14} />
                        {item.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button className="dangerButton" type="button" onClick={() => void remove(item)}>
                        <Trash2 size={14} />
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7}>暂无模板</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
