import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Edit3, FileText, Plus, RefreshCcw, Save, Tags, Trash2, X, XCircle } from 'lucide-react';
import {
  createAdminPromptTemplate,
  deleteAdminPromptTemplate,
  listAdminPromptTemplates,
  updateAdminPromptTemplate,
  type PromptTemplate,
  type PromptTemplateStatus
} from '../api';
import { SelectField } from '../SelectField';

const emptyForm = {
  title: '',
  category: '',
  description: '',
  promptText: '',
  exampleImageUrl: '',
  sortOrder: 0,
  status: 'active' as PromptTemplateStatus
};

const statusFilterOptions = [
  { label: '全部状态', value: '' },
  { label: '启用', value: 'active' },
  { label: '停用', value: 'disabled' }
];

const statusOptions = statusFilterOptions.slice(1);

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

  const activeCount = items.filter((item) => item.status === 'active').length;
  const disabledCount = items.filter((item) => item.status === 'disabled').length;
  const totalUsageCount = items.reduce((sum, item) => sum + item.usageCount, 0);
  const totalVariables = items.reduce((sum, item) => sum + item.variables.length, 0);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 2200);
    return () => window.clearTimeout(timer);
  }, [message]);

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
      exampleImageUrl: item.exampleImageUrl || '',
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
      <header className="pageHeader promptAdminHeader">
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
      {message && <div className="toastNotice" role="status">{message}</div>}

      <section className="promptAdminStats" aria-label="提示词模板统计">
        <div className="panel statCard">
          <span>模板总数</span>
          <strong>{items.length}</strong>
        </div>
        <div className="panel statCard">
          <span>启用中</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="panel statCard">
          <span>已停用</span>
          <strong>{disabledCount}</strong>
        </div>
        <div className="panel statCard">
          <span>变量 / 使用</span>
          <strong>{totalVariables} / {totalUsageCount}</strong>
        </div>
      </section>

      <section className="panel tablePanel promptAdminTable">
        <div className="tableHeader">
          <div>
            <h2>模板列表</h2>
            <span>维护用户可选择、可收藏、可套用的提示词模板</span>
          </div>
          <form
            className="tableActions promptAdminFilters"
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索模板" />
            <SelectField value={status} options={statusFilterOptions} onChange={setStatus} />
            <button className="ghostButton" type="submit">筛选</button>
          </form>
        </div>
        <table>
          <thead>
            <tr>
              <th>模板</th>
              <th>示例图</th>
              <th>状态</th>
              <th>变量</th>
              <th>使用</th>
              <th>排序</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="templateTitleCell">
                    <strong>{item.title}</strong>
                    <div className="templateMetaLine">
                      <span><Tags size={12} />{item.category || '未分类'}</span>
                      {item.description && <span><FileText size={12} />{item.description}</span>}
                    </div>
                    <p>{item.promptText}</p>
                  </div>
                </td>
                <td>
                  {item.exampleImageUrl ? (
                    <img className="templateExampleThumb" src={item.exampleImageUrl} alt={`${item.title} 示例图`} />
                  ) : (
                    <span className="mutedDash">未设置</span>
                  )}
                </td>
                <td>
                  <span className={item.status === 'active' ? 'adminStatusPill active' : 'adminStatusPill disabled'}>
                    {item.status === 'active' ? '启用' : '停用'}
                  </span>
                </td>
                <td>
                  <div className="variableCountPill">
                    <strong>{item.variables.length}</strong>
                    <span>变量</span>
                  </div>
                </td>
                <td>
                  <div className="usageMetric">{item.usageCount}</div>
                </td>
                <td>
                  <code className="sortCode">{item.sortOrder}</code>
                </td>
                <td>
                  <div className="tableActions promptRowActions">
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
                <td colSpan={7}>
                  <div className="emptyTableState">
                    <FileText size={24} />
                    <strong>{isLoading ? '加载中...' : '暂无模板'}</strong>
                    <span>{isLoading ? '正在读取提示词模板' : '点击右上角“新建模板”创建第一条提示词'}</span>
                  </div>
                </td>
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
                  placeholder="示例: 一张{主体}在{场景}中的照片, 使用{风格}风格"
                />
              </label>
              <label className="field">
                <span>示例图片 URL</span>
                <input
                  value={form.exampleImageUrl}
                  onChange={(event) => setForm({ ...form, exampleImageUrl: event.target.value })}
                  placeholder="填写这条模板生成出的示例图片地址"
                />
              </label>
              {form.exampleImageUrl && (
                <div className="exampleImagePreview">
                  <img src={form.exampleImageUrl} alt="示例图片预览" />
                </div>
              )}
              <div className="variableHelp">
                <p>变量写法: 在提示词正文中输入 <code>{'{变量名}'}</code>, 用户使用模板时会填写这些变量。</p>
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
              <SelectField
                label="状态"
                value={form.status}
                options={statusOptions}
                onChange={(value) => setForm({ ...form, status: value as PromptTemplateStatus })}
              />
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
            <p>是否删除“{deleteTarget.title}”? 删除后用户侧将不可见。</p>
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
    exampleImageUrl: form.exampleImageUrl.trim(),
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
