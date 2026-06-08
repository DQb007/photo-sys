import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Copy, Heart, Loader2, RotateCcw, Search, Send, Sparkles, X } from 'lucide-react';
import {
  favoritePromptTemplate,
  listPromptTemplates,
  recordPromptTemplateUse,
  unfavoritePromptTemplate,
  type PromptTemplate,
  type PromptTemplateVariable
} from '../api';
import { Pagination } from '../Pagination';
import { useBodyScrollLock } from '../useBodyScrollLock';

type PromptScope = 'all' | 'favorites';
const pageSize = 12;

export function PromptLibraryPage() {
  const navigate = useNavigate();
  const pageTopRef = useRef<HTMLDivElement | null>(null);
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
  const [previewCopied, setPreviewCopied] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUsing, setIsUsing] = useState(false);

  useBodyScrollLock(Boolean(activeTemplate || previewTemplate));

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

  const renderedPrompt = useMemo(() => {
    if (!activeTemplate) return '';
    return renderPrompt(activeTemplate.promptText, variables);
  }, [activeTemplate, variables]);

  const missingVariables = activeTemplate?.variables.filter((item) => !item.defaultValue && !variables[item.name]?.trim()) ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
  const previewItems = useMemo(() => items.filter((item) => item.exampleImageUrl), [items]);
  const previewIndex = previewTemplate ? previewItems.findIndex((item) => item.id === previewTemplate.id) : -1;
  const canNavigatePreview = previewItems.length > 1 && previewIndex >= 0;

  const showAdjacentPreview = useCallback((direction: -1 | 1) => {
    if (!previewTemplate || previewItems.length <= 1) return;
    const currentIndex = previewItems.findIndex((item) => item.id === previewTemplate.id);
    if (currentIndex < 0) return;
    const nextIndex = (currentIndex + direction + previewItems.length) % previewItems.length;
    setPreviewTemplate(previewItems[nextIndex]);
    setPreviewCopied(false);
  }, [previewItems, previewTemplate]);

  useEffect(() => {
    if (!previewTemplate) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPreviewTemplate(null);
      } else if (event.key === 'ArrowLeft') {
        showAdjacentPreview(-1);
      } else if (event.key === 'ArrowRight') {
        showAdjacentPreview(1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewTemplate, showAdjacentPreview]);

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

  function resetFilters() {
    setSearch('');
    setCategory('');
    setScope('all');
    setPage(1);
  }

  function openPreview(template: PromptTemplate) {
    setPreviewTemplate(template);
    setPreviewCopied(false);
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    window.requestAnimationFrame(() => {
      pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
      setActiveTemplate((current) => current?.id === template.id ? { ...current, isFavorite: !current.isFavorite } : current);
      setPreviewTemplate((current) => current?.id === template.id ? { ...current, isFavorite: !current.isFavorite } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新收藏失败');
    }
  }

  function openUseModal(template: PromptTemplate) {
    setActiveTemplate(template);
    setVariables(Object.fromEntries(template.variables.map((item) => [item.name, ''])));
    setMessage('');
    setError('');
  }

  async function copyPrompt() {
    if (!activeTemplate || missingVariables.length > 0) return;
    await navigator.clipboard.writeText(renderedPrompt);
    setMessage('提示词已复制');
  }

  async function copyPreviewPrompt(template: PromptTemplate) {
    if (previewCopied) return;
    await navigator.clipboard.writeText(template.promptText);
    setPreviewCopied(true);
  }

  async function applyInGenerate() {
    if (!activeTemplate || missingVariables.length > 0) return;
    setIsUsing(true);
    setError('');
    try {
      await recordPromptTemplateUse(activeTemplate.id);
      sessionStorage.setItem('reusePrompt', renderedPrompt);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      flushSync(() => setActiveTemplate(null));
      window.requestAnimationFrame(() => navigate('/generate'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '使用提示词失败');
      setIsUsing(false);
    }
  }

  return (
    <div className="page" ref={pageTopRef}>
      <header className="pageHeader">
        <div>
          <h1>提示词库</h1>
        </div>
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
          <button className="ghostButton compact resetButton" type="button" onClick={resetFilters}>
            <RotateCcw size={16} />
            重置
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

      {error && <div className="errorBox" role="alert">{error}</div>}

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
                onClick={() => openPreview(item)}
              >
                <img className="promptExampleImage" src={item.exampleImageUrl} alt={`${item.title} 示例图`} />
                <span className="promptExampleOverlay" aria-hidden="true">查看详情</span>
              </button>
            ) : (
              <div className="promptExamplePlaceholder">
                <Sparkles size={24} />
                <span>暂无示例图</span>
              </div>
            )}
            <div className="promptCardHeader">
              <div className="promptTitleLine">
                <h2>{item.title}</h2>
                <span className="promptCategoryTag">{item.category || '未分类'}</span>
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

      <Pagination
        className="promptPagination"
        page={page}
        totalPages={totalPages}
        total={items.length}
        onPageChange={changePage}
      />

      {activeTemplate && (
        <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="prompt-template-title">
          <div className="promptTemplateModal">
            <div className="modalHeader">
              <div className="promptTitleLine">
                <h2 id="prompt-template-title">{activeTemplate.title}</h2>
                <span className="promptCategoryTag">{activeTemplate.category || '未分类'}</span>
              </div>
              <button className="iconButton" type="button" onClick={() => setActiveTemplate(null)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            <div className="promptTemplateModalBody">
              {activeTemplate.description && <p className="modalIntro">{activeTemplate.description}</p>}

              {activeTemplate.variables.length > 0 ? (
                <div className="variableGrid">
                  {activeTemplate.variables.map((item) => (
                    <label className="field" key={item.name}>
                      <span>{item.name}</span>
                      <input
                        value={variables[item.name] || ''}
                        onChange={(event) => setVariables((current) => ({ ...current, [item.name]: event.target.value }))}
                        placeholder={item.defaultValue ? `默认: ${item.defaultValue}` : `填写${item.name}`}
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

              {message && <div className="toastNotice" role="status">{message}</div>}
            </div>

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
          <button className="promptPreviewClose" type="button" onClick={() => setPreviewTemplate(null)} aria-label="关闭">
            <X size={28} />
          </button>
          {canNavigatePreview && (
            <>
              <button className="promptPreviewNav promptPreviewNavPrevious" type="button" onClick={() => showAdjacentPreview(-1)} aria-label="上一张">
                <ChevronLeft size={28} />
              </button>
              <button className="promptPreviewNav promptPreviewNavNext" type="button" onClick={() => showAdjacentPreview(1)} aria-label="下一张">
                <ChevronRight size={28} />
              </button>
            </>
          )}
          <div className="promptPreviewModal">
            <div className="promptPreviewLayout">
              <section className="promptPreviewImagePanel">
                <img src={previewTemplate.exampleImageUrl || ''} alt={`${previewTemplate.title} 示例图`} />
              </section>
              <aside className="promptPreviewDetails">
                <header className="promptPreviewHeader">
                  <strong>{previewTemplate.category || '未分类'}</strong>
                  <button
                    className={previewTemplate.isFavorite ? 'promptPreviewFavorite active' : 'promptPreviewFavorite'}
                    type="button"
                    onClick={() => void toggleFavorite(previewTemplate)}
                    aria-label={previewTemplate.isFavorite ? '取消收藏' : '收藏'}
                  >
                    <Heart size={18} fill={previewTemplate.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </header>
                <section className="promptPreviewSummary">
                  <h2 id="prompt-preview-title">{previewTemplate.title}</h2>
                  {previewTemplate.description && <p>{previewTemplate.description}</p>}
                </section>
                <div className="promptPreviewPromptMeta">
                  <span>GPT-IMAGE-2 PROMPT</span>
                  <small>{formatPromptTemplateDate(previewTemplate.createdAt)} · {previewTemplate.promptText.length} 字</small>
                </div>
                <div className="promptPreviewPrompt">
                  <p>{previewTemplate.promptText}</p>
                </div>
                <footer className="promptPreviewFooter">
                  {previewCopied && (
                    <div className="toastNotice" role="status">
                      复制成功
                    </div>
                  )}
                  <button className="promptPreviewCopyButton" type="button" disabled={previewCopied} onClick={() => void copyPreviewPrompt(previewTemplate)}>
                    {previewCopied ? <Check size={16} /> : <Copy size={16} />}
                    {previewCopied ? '已复制' : '复制提示词'}
                  </button>
                </footer>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatPromptTemplateDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderPrompt(promptText: string, values: Record<string, string>) {
  return promptText.replace(/\{\s*([^{}]+?)\s*\}/gu, (match, rawToken: string) => {
    const variable = parsePromptVariableToken(rawToken.trim());
    if (!variable) return match;
    const value = values[variable.name]?.trim();
    return value || variable.defaultValue || match;
  });
}

function parsePromptVariableToken(token: string): PromptTemplateVariable | null {
  if (/^[\p{L}\p{N}_-]+$/u.test(token)) {
    return { name: token, defaultValue: '' };
  }
  const argumentMatch = token.match(/^argument\b([\s\S]*)$/u);
  if (!argumentMatch) return null;
  const attrs: Record<string, string> = {};
  for (const match of (argumentMatch[1] || '').matchAll(/([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1]] = match[2] ?? match[3] ?? '';
  }
  const name = attrs.name?.trim();
  if (!name) return null;
  return {
    name,
    defaultValue: attrs.default?.trim() || ''
  };
}
