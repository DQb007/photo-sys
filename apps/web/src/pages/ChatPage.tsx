import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, Menu, MessageSquarePlus, Send, Square, Trash2, X } from 'lucide-react';
import {
  createChatConversation,
  deleteChatConversation,
  getChatSettings,
  listChatConversations,
  listChatMessages,
  listChatModels,
  streamChatMessage,
  updateChatConversation,
  type ChatConversation,
  type ChatMessage,
  type ChatModel,
  type ChatSettings
} from '../api';
import { SelectField } from '../SelectField';

export function ChatPage() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number>(0);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingConversation, setEditingConversation] = useState<ChatConversation | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deletingConversation, setDeletingConversation] = useState<ChatConversation | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = conversations.find((item) => item.id === activeConversationId) || null;
  const modelOptions = useMemo(() => models.map((item) => ({ label: item.name, value: String(item.id) })), [models]);

  const load = useCallback(async () => {
    setError('');
    try {
      const [settingsPayload, modelsPayload, conversationsPayload] = await Promise.all([
        getChatSettings(),
        listChatModels(),
        listChatConversations()
      ]);
      setSettings(settingsPayload);
      setModels(modelsPayload.items);
      setConversations(conversationsPayload.items);
      const defaultId = modelsPayload.defaultModelId || modelsPayload.items[0]?.id || 0;
      setSelectedModelId((current) => current || defaultId);
      const firstConversation = conversationsPayload.items[0] || null;
      if (firstConversation && !activeConversationId) {
        setActiveConversationId(firstConversation.id);
        const messagesPayload = await listChatMessages(firstConversation.id);
        setMessages(messagesPayload.items);
      } else if (!firstConversation) {
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取 AI 对话数据失败');
    }
  }, [activeConversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isStreaming]);

  async function selectConversation(id: number) {
    setActiveConversationId(id);
    setIsHistoryOpen(false);
    setError('');
    try {
      const payload = await listChatMessages(id);
      setMessages(payload.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取消息失败');
    }
  }

  async function startConversation() {
    setError('');
    setMessage('');
    try {
      const payload = await createChatConversation();
      setConversations((current) => [payload.item, ...current]);
      setActiveConversationId(payload.item.id);
      setMessages([]);
      setIsHistoryOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建对话失败');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!settings?.enabled) {
      setError('AI 对话当前不可用');
      return;
    }
    if (!selectedModelId) {
      setError('请先选择可用模型');
      return;
    }
    const content = input.trim();
    if (!content) return;
    if (settings.maxInputChars && content.length > settings.maxInputChars) {
      setError(`消息不能超过 ${settings.maxInputChars} 个字符`);
      return;
    }

    setError('');
    setMessage('');
    let conversationId = activeConversationId;
    try {
      if (!conversationId) {
        const payload = await createChatConversation();
        conversationId = payload.item.id;
        setActiveConversationId(conversationId);
        setConversations((current) => [payload.item, ...current]);
      }

      setInput('');
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      await streamChatMessage({
        conversationId,
        content,
        chatModelId: selectedModelId,
        signal: controller.signal,
        onEvent: (eventPayload) => {
          if (eventPayload.event === 'message_created') {
            setMessages((current) => [
              ...current,
              eventPayload.data.userMessage,
              eventPayload.data.assistantMessage
            ]);
          }
          if (eventPayload.event === 'delta') {
            setMessages((current) => updateLastAssistant(current, eventPayload.data.delta));
          }
          if (eventPayload.event === 'completed') {
            setMessages((current) => current.map((item) =>
              item.id === eventPayload.data.assistantMessage.id ? eventPayload.data.assistantMessage : item
            ));
            setConversations((current) => upsertConversation(current, eventPayload.data.conversation));
          }
          if (eventPayload.event === 'failed') {
            if (eventPayload.data.assistantMessage) {
              setMessages((current) => current.map((item) =>
                item.id === eventPayload.data.assistantMessage?.id ? eventPayload.data.assistantMessage : item
              ));
            }
            setError(eventPayload.data.error || 'AI 回复失败');
          }
        }
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : '发送消息失败');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      void refreshConversations();
    }
  }

  async function refreshConversations() {
    try {
      const payload = await listChatConversations();
      setConversations(payload.items);
    } catch {
      return;
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
    setMessage('已停止生成');
  }

  function openRename(conversation: ChatConversation) {
    setEditingConversation(conversation);
    setEditingTitle(conversation.title);
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!editingConversation) return;
    setError('');
    try {
      const payload = await updateChatConversation(editingConversation.id, editingTitle);
      setConversations((current) => upsertConversation(current, payload.item));
      setEditingConversation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名失败');
    }
  }

  async function confirmDelete() {
    if (!deletingConversation) return;
    setError('');
    try {
      await deleteChatConversation(deletingConversation.id);
      setConversations((current) => current.filter((item) => item.id !== deletingConversation.id));
      if (activeConversationId === deletingConversation.id) {
        setActiveConversationId(null);
        setMessages([]);
      }
      setDeletingConversation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }

  return (
    <div className="page chatPage">
      <header className="pageHeader chatPageHeader">
        <div>
          <h1>AI 对话</h1>
        </div>
        <div className="chatHeaderActions">
          <button className="ghostButton chatHistoryToggle" type="button" onClick={() => setIsHistoryOpen(true)}>
            <Menu size={16} />
            历史
          </button>
        </div>
      </header>

      {error && <div className="errorBox">{error}</div>}
      {message && <div className="toastNotice" role="status">{message}</div>}

      <div className="chatLayout">
        <aside className={isHistoryOpen ? 'chatSidebar open' : 'chatSidebar'}>
          <button className="iconButton chatSidebarClose" type="button" onClick={() => setIsHistoryOpen(false)} aria-label="关闭历史">
            <X size={16} />
          </button>
          <button className="primaryButton compact fullWidth" type="button" onClick={() => void startConversation()}>
            <MessageSquarePlus size={16} />
            新建对话
          </button>
          <div className="chatConversationList">
            {conversations.map((item) => (
              <button
                className={item.id === activeConversationId ? 'chatConversationItem active' : 'chatConversationItem'}
                type="button"
                key={item.id}
                onClick={() => void selectConversation(item.id)}
              >
                <span>{item.title}</span>
                <small>{formatDate(item.lastMessageAt || item.updatedAt)}</small>
                <span className="chatConversationActions" onClick={(event) => event.stopPropagation()}>
                  <button className="iconButton" type="button" onClick={() => openRename(item)} aria-label="重命名">
                    <Edit3 size={14} />
                  </button>
                  <button className="iconButton" type="button" onClick={() => setDeletingConversation(item)} aria-label="删除">
                    <Trash2 size={14} />
                  </button>
                </span>
              </button>
            ))}
            {conversations.length === 0 && <div className="emptyLine">暂无对话</div>}
          </div>
        </aside>

        {isHistoryOpen && <button className="chatHistoryBackdrop" type="button" aria-label="关闭历史" onClick={() => setIsHistoryOpen(false)} />}

        <section className="panel chatPanel">
          <div className="chatPanelHeader">
            <div className="chatPanelTitle">
              <h2>{activeConversation?.title || '新对话'}</h2>
            </div>
          </div>

          <div className={messages.length === 0 ? 'chatMessageList empty' : 'chatMessageList'}>
            {!settings?.enabled && (
              <div className="chatEmptyState">
                <strong>AI 对话当前已关闭</strong>
                <p>请在后台启用对话功能后再使用。</p>
              </div>
            )}

            {messages.map((item) => (
              <article className={`chatMessage ${item.role}`} key={item.id}>
                <div className="chatMessageBubble">
                  <p>{item.content || (item.status === 'streaming' ? '生成中...' : '')}</p>
                  {item.errorMessage && <span className="chatMessageError">{item.errorMessage}</span>}
                  {item.role === 'assistant' && item.modelNameSnapshot && (
                    <small>{item.modelNameSnapshot} · {statusLabel(item.status)}</small>
                  )}
                </div>
              </article>
            ))}
            <div ref={bottomRef} />
          </div>

          <form className="chatComposer" onSubmit={submit}>
            <textarea
              value={input}
              placeholder="输入消息..."
              disabled={isStreaming || !settings?.enabled || models.length === 0}
              maxLength={settings?.maxInputChars || undefined}
              onChange={(event) => setInput(event.target.value)}
            />
            <div className="chatComposerActions">
              <span>{input.length}{settings?.maxInputChars ? ` / ${settings.maxInputChars}` : ''}</span>
              <span>{settings?.messageCreditCost ? `每条 ${settings.messageCreditCost} 积分` : '免费使用'}</span>
              <div className="chatComposerModel">
                <SelectField
                  value={String(selectedModelId || '')}
                  options={modelOptions}
                  onChange={(value) => setSelectedModelId(Number(value))}
                />
              </div>
              {isStreaming ? (
                <button className="dangerButton" type="button" onClick={stopStreaming}>
                  <Square size={16} />
                  停止
                </button>
              ) : (
                <button className="primaryButton compact" type="submit" disabled={!input.trim() || !settings?.enabled || !selectedModelId}>
                  <Send size={16} />
                  发送
                </button>
              )}
            </div>
          </form>
        </section>
      </div>

      {editingConversation && (
        <div className="modalBackdrop" role="dialog" aria-modal="true">
          <form className="confirmModal" onSubmit={submitRename}>
            <h2>重命名对话</h2>
            <label className="field">
              <span>标题</span>
              <input value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} autoFocus />
            </label>
            <div className="modalActions">
              <button className="ghostButton" type="button" onClick={() => setEditingConversation(null)}>取消</button>
              <button className="primaryButton compact" type="submit">保存</button>
            </div>
          </form>
        </div>
      )}

      {deletingConversation && (
        <div className="modalBackdrop" role="dialog" aria-modal="true">
          <div className="confirmModal danger">
            <h2>删除对话？</h2>
            <p>删除后这个对话将不会在历史中显示。</p>
            <div className="modalActions">
              <button className="ghostButton" type="button" onClick={() => setDeletingConversation(null)}>取消</button>
              <button className="dangerButton strong" type="button" onClick={() => void confirmDelete()}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function updateLastAssistant(items: ChatMessage[], delta: string) {
  const next = [...items];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const item = next[index];
    if (item.role === 'assistant') {
      next[index] = { ...item, content: item.content + delta };
      break;
    }
  }
  return next;
}

function upsertConversation(items: ChatConversation[], item: ChatConversation) {
  return [item, ...items.filter((current) => current.id !== item.id)]
    .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt).getTime() - new Date(a.lastMessageAt || a.updatedAt).getTime());
}

function statusLabel(status: ChatMessage['status']) {
  const labels: Record<ChatMessage['status'], string> = {
    streaming: '生成中',
    completed: '完成',
    failed: '失败',
    cancelled: '已停止'
  };
  return labels[status];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
