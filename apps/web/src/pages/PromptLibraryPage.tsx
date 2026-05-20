import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Heart, Loader2, RefreshCcw, Search, Send, Sparkles, X } from 'lucide-react';
import {
  favoritePromptTemplate,
  listPromptTemplates,
  recordPromptTemplateUse,
  unfavoritePromptTemplate,
  type PromptTemplate
} from '../api';

type PromptScope = 'all' | 'favorites';
const pageSize = 12;

export function PromptLibraryPage() {
  const [items, setItems] = useState<PromptTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [scope, setScope] = useState<PromptScope>('all');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [activeTemplate, setActiveTemplate] = useState<PromptTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<PromptTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUsing, setIsUsing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const payload = await listPromptTemplates({ scope, category, search: search.trim() });
      setItems(payload.items);
      setCategories(payload.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取提示词模板失败');
    } finally {
      setIsLoading(false);
    }
  }, [category, scope, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!previewTemplate) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreviewTemplate(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewTemplate]);

  const renderedPrompt = useMemo(() => {
    if (!activeTemplate) return '';
    return renderPrompt(activeTemplate.promptText, variables);
  }, [activeTemplate, variables]);

  const missingVariables = activeTemplate?.variables.filter((item) => !variables[item]?.trim()) ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [category, scope]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    await load();
  }

  async function toggleFavorite(template: PromptTemplate) {
    setError('');
    try {
      if (template.isFavorite) {
        await unfavoritePromptTemplate(template.id);
      } else {
        await favoritePromptTemplate(template.id);
      }
      setItems((current) => current.map((item) =>
        item.id === template.id ? { ...item, isFavorite: !item.isFavorite } : item
      ).filter((item) => scope !== 'favorites' || item.isFavorite));
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新收藏失败');
    }
  }

  function openUseModal(template: PromptTemplate) {
    setActiveTemplate(template);
    setVariables(Object.fromEntries(template.variables.map((item) => [item, ''])));
    setMessage('');
    setError('');
  }

  async function copyPrompt() {
    if (!activeTemplate || missingVariables.length > 0) return;
    await navigator.clipboard.writeText(renderedPrompt);
    setMessage('提示词已复制');
  }

  async function applyInGenerate() {
    if (!activeTemplate || missingVariables.length > 0) return;
    setIsUsing(true);
    setError('');
    try {
      await recordPromptTemplateUse(activeTemplate.id);
      sessionStorage.setItem('reusePrompt', renderedPrompt);
      window.location.href = '/generate';
    } catch (err) {
      setError(err instanceof Error ? err.message : '使用提示词失败');
    } finally {
      setIsUsing(false);
    }
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>提示词库</h1>
        </div>
        <button className="ghostButton" type="button" disabled={isLoading} onClick={() => void load()}>
          <RefreshCcw size={16} />
          刷新
        </button>
      </header>

      <section className="promptLibraryToolbar">
        <form className="promptSearch" onSubmit={submitSearch}>
          <label className="field">
            <span>搜索提示词</span>
            <div className="searchInputWrap">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="标题、分类、简介或提示词正文"
              />
            </div>
          </label>
          <button className="primaryButton compact" type="submit">
            搜索
          </button>
        </form>

        <div className="filterGroup promptFilters">
          {[
            { label: '全部模板', value: 'all' },
            { label: '我的收藏', value: 'favorites' }
          ].map((filter) => (
            <button
              key={filter.value}
              className={scope === filter.value ? 'filterButton active' : 'filterButton'}
              type="button"
              onClick={() => setScope(filter.value as PromptScope)}
            >
              {filter.label}
            </button>
          ))}
          <button
            className={category === '' ? 'filterButton active' : 'filterButton'}
            type="button"
            onClick={() => setCategory('')}
          >
            全部分类
          </button>
          {categories.map((item) => (
            <button
              key={item}
              className={category === item ? 'filterButton active' : 'filterButton'}
              type="button"
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="errorBox">{error}</div>}

      {!isLoading && items.length === 0 && (
        <div className="panel emptyState">暂无可用提示词模板。</div>
      )}

      <div className={isLoading ? 'promptTemplateGrid refreshing' : 'promptTemplateGrid'}>
        {pageItems.map((item) => (
          <article className="promptTemplateCard" key={item.id}>
            {item.exampleImageUrl ? (
              <button
                className="promptExampleButton"
                type="button"
                onClick={() => setPreviewTemplate(item)}
              >
                <img className="promptExampleImage" src={item.exampleImageUrl} alt={`${item.title} 示例图`} />
                <span>查看大图</span>
              </button>
            ) : (
              <div className="promptExamplePlaceholder">
                <Sparkles size={24} />
                <span>暂无示例图</span>
              </div>
            )}
            <div className="promptCardHeader">
              <div>
                <h2>{item.title}</h2>
                <span>{item.category || '未分类'}</span>
              </div>
              <button
                className={item.isFavorite ? 'iconButton favoriteActive' : 'iconButton'}
                type="button"
                onClick={() => void toggleFavorite(item)}
                aria-label={item.isFavorite ? '取消收藏' : '收藏'}
              >
                <Heart size={17} fill={item.isFavorite ? 'currentColor' : 'none'} />
              </button>
            </div>
            {item.description && <p className="promptDescription">{item.description}</p>}
            <div className="promptCardMeta">
              <span>{item.variables.length} 个变量</span>
              <span>使用 {item.usageCount}</span>
            </div>
            <button className="primaryButton compact" type="button" onClick={() => openUseModal(item)}>
              <Sparkles size={16} />
              使用
            </button>
          </article>
        ))}
      </div>

      {items.length > pageSize && (
        <div className="paginationBar promptPagination">
          <button className="ghostButton" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            上一页
          </button>
          <span>第 {page} / {totalPages} 页，共 {items.length} 个模板</span>
          <button className="ghostButton" type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
            下一页
          </button>
        </div>
      )}

      {activeTemplate && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="prompt-template-title">
          <div className="promptTemplateModal">
            <div className="modalHeader">
              <div>
                <h2 id="prompt-template-title">{activeTemplate.title}</h2>
                <span>{activeTemplate.category || '未分类'}</span>
              </div>
              <button className="iconButton" type="button" onClick={() => setActiveTemplate(null)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            {activeTemplate.description && <p className="modalIntro">{activeTemplate.description}</p>}
            {activeTemplate.exampleImageUrl && (
              <img className="promptModalExampleImage" src={activeTemplate.exampleImageUrl} alt={`${activeTemplate.title} 示例图`} />
            )}

            {activeTemplate.variables.length > 0 ? (
              <div className="variableGrid">
                {activeTemplate.variables.map((item) => (
                  <label className="field" key={item}>
                    <span>{item}</span>
                    <input
                      value={variables[item] || ''}
                      onChange={(event) => setVariables((current) => ({ ...current, [item]: event.target.value }))}
                      placeholder={`填写${item}`}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <div className="hintBox">这个模板没有变量，可直接复制或使用。</div>
            )}

            <div className="renderedPromptBox">
              <div className="panelTitle">
                <h2>最终提示词</h2>
                {missingVariables.length > 0 && <span>还有 {missingVariables.length} 项未填写</span>}
              </div>
              <p>{renderedPrompt}</p>
            </div>

            {message && <div className="hintBox">{message}</div>}

            <div className="modalActions">
              <button className="ghostButton" type="button" disabled={missingVariables.length > 0} onClick={() => void copyPrompt()}>
                {message ? <Check size={16} /> : <Copy size={16} />}
                复制提示词
              </button>
              <button className="primaryButton compact" type="button" disabled={missingVariables.length > 0 || isUsing} onClick={() => void applyInGenerate()}>
                {isUsing ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                使用并跳转生图
              </button>
            </div>
          </div>
        </div>
      )}

      {previewTemplate && (
        <div className="modalBackdrop promptPreviewBackdrop" role="dialog" aria-modal="true" aria-labelledby="prompt-preview-title">
          <button className="promptPreviewScrim" type="button" aria-label="关闭预览" onClick={() => setPreviewTemplate(null)} />
          <div className="promptPreviewModal">
            <div className="modalHeader">
              <div>
                <span>{previewTemplate.category || '未分类'}</span>
                <h2 id="prompt-preview-title">{previewTemplate.title}</h2>
              </div>
              <button className="iconButton" type="button" onClick={() => setPreviewTemplate(null)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="promptPreviewLayout">
              <section className="promptPreviewText">
                {previewTemplate.description && <p>{previewTemplate.description}</p>}
                <div className="promptPreviewMeta">
                  <span>{previewTemplate.variables.length} 个变量</span>
                  <span>使用 {previewTemplate.usageCount}</span>
                </div>
                <div className="promptPreviewPrompt">
                  <div className="panelTitle">
                    <h2>提示词正文</h2>
                  </div>
                  <p>{previewTemplate.promptText}</p>
                </div>
                <button className="primaryButton compact" type="button" onClick={() => {
                  openUseModal(previewTemplate);
                  setPreviewTemplate(null);
                }}>
                  <Sparkles size={16} />
                  使用模板
                </button>
              </section>
              <section className="promptPreviewImagePanel">
                <img src={previewTemplate.exampleImageUrl || ''} alt={`${previewTemplate.title} 示例图`} />
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderPrompt(promptText: string, values: Record<string, string>) {
  return promptText.replace(/\{\s*([\p{L}\p{N}_-]+)\s*\}/gu, (match, rawName: string) => {
    const value = values[rawName.trim()];
    return value?.trim() || match;
  });
}
