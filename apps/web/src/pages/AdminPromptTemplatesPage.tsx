import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Edit3, Plus, RefreshCcw, Save, Trash2, X, XCircle } from 'lucide-react';
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

type TemplateForm = typeof emptyForm;

export function AdminPromptTemplatesPage() {
  const [items, setItems] = useState<PromptTemplate[]>([]);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [editingItem, setEditingItem] = useState<PromptTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  function openCreateModal() {
    setEditingItem(null);
    setForm(emptyForm);
    setIsFormOpen(true);
    setMessage('');
    setError('');
  }

  function openEditModal(item: PromptTemplate) {
    setEditingItem(item);
    setForm({
      title: item.title,
      category: item.category || '',
      description: item.description || '',
      promptText: item.promptText,
      sortOrder: item.sortOrder,
      status: item.status
    });
    setIsFormOpen(true);
    setMessage('');
    setError('');
  }

  function closeFormModal() {
    setIsFormOpen(false);
    setEditingItem(null);
    setForm(emptyForm);
    setError('');
  }

  const detectedVariables = parseTemplateVariables(form.promptText);

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
      if (editingItem) {
        await updateAdminPromptTemplate(editingItem.id, normalizeForm(form));
      } else {
        await createAdminPromptTemplate(normalizeForm(form));
      }
      setMessage(editingItem ? '模板已更新' : '模板已创建');
      closeFormModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存提示词模板失败');
    } finally {
      setIsSaving(false);
    }
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

  async function confirmDelete() {
    if (!deleteTarget) return;
    setError('');
    setMessage('');
    setIsDeleting(true);
    try {
      await deleteAdminPromptTemplate(deleteTarget.id);
      setDeleteTarget(null);
      setMessage('模板已删除');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除模板失败');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>提示词管理</h1>
        </div>
        <div className="pageHeaderActions">
          <button className="ghostButton" type="button" disabled={isLoading} onClick={() => void load()}>
            <RefreshCcw size={16} />
            刷新
          </button>
          <button className="primaryButton compact" type="button" onClick={openCreateModal}>
            <Plus size={16} />
            新建模板
          </button>
        </div>
      </header>

      {error && <div className="errorBox">{error}</div>}
      {message && <div className="hintBox">{message}</div>}

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
                    <button className="ghostButton" type="button" onClick={() => openEditModal(item)}>
                      <Edit3 size={14} />
                      编辑
                    </button>
                    <button className="ghostButton" type="button" onClick={() => void toggleStatus(item)}>
                      <XCircle size={14} />
                      {item.status === 'active' ? '停用' : '启用'}
                    </button>
                    <button className="dangerButton" type="button" onClick={() => setDeleteTarget(item)}>
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7}>{isLoading ? '加载中...' : '暂无模板'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {isFormOpen && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="prompt-admin-form-title">
          <div className="promptAdminModal">
            <div className="modalHeader">
              <h2 id="prompt-admin-form-title">{editingItem ? `编辑 #${editingItem.id}` : '新建模板'}</h2>
              <button className="iconButton" type="button" onClick={closeFormModal} aria-label="关闭">
                <X size={18} />
              </button>
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
                <textarea
                  value={form.promptText}
                  onChange={(event) => setForm({ ...form, promptText: event.target.value })}
                  placeholder="示例：一张{主体}在{场景}中的照片，使用{风格}风格"
                />
              </label>
              <div className="variableHelp">
                <p>变量写法：在提示词正文中输入 <code>{'{变量名}'}</code>，用户使用模板时会填写这些变量。</p>
                <div className="variablePreview">
                  <span>已识别变量</span>
                  {detectedVariables.length > 0 ? (
                    <div>
                      {detectedVariables.map((item) => (
                        <strong key={item}>{item}</strong>
                      ))}
                    </div>
                  ) : (
                    <em>暂无变量</em>
                  )}
                </div>
              </div>
              <label className="field">
                <span>状态</span>
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as PromptTemplateStatus })}>
                  <option value="active">启用</option>
                  <option value="disabled">停用</option>
                </select>
              </label>
              <div className="modalActions">
                <button className="ghostButton" type="button" onClick={closeFormModal}>
                  取消
                </button>
                <button className="primaryButton compact" type="submit" disabled={isSaving}>
                  <Save size={16} />
                  {isSaving ? '保存中' : '保存模板'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="prompt-delete-title">
          <div className="confirmModal">
            <div className="modalHeader">
              <h2 id="prompt-delete-title">确认删除</h2>
              <button className="iconButton" type="button" onClick={() => setDeleteTarget(null)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <p>是否删除“{deleteTarget.title}”？删除后用户侧将不可见。</p>
            <div className="modalActions">
              <button className="ghostButton" type="button" onClick={() => setDeleteTarget(null)}>
                取消
              </button>
              <button className="dangerButton strong" type="button" disabled={isDeleting} onClick={() => void confirmDelete()}>
                <Trash2 size={15} />
                {isDeleting ? '删除中' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeForm(form: TemplateForm) {
  return {
    title: form.title.trim(),
    category: form.category.trim(),
    description: form.description.trim(),
    promptText: form.promptText.trim(),
    sortOrder: Number(form.sortOrder) || 0,
    status: form.status
  };
}

function parseTemplateVariables(promptText: string) {
  const variables: string[] = [];
  const seen = new Set<string>();
  for (const match of promptText.matchAll(/\{\s*([\p{L}\p{N}_-]+)\s*\}/gu)) {
    const name = match[1]?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    variables.push(name);
  }
  return variables;
}
