import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clipboard, Edit3, MessageSquarePlus, MoreVertical, Paperclip, Pin, Plus, Send, Square, Trash2, X } from 'lucide-react';
import {
  ApiError,
  createChatConversation,
  deleteChatConversation,
  getChatBootstrap,
  listChatConversations,
  listChatMessages,
  streamChatMessage,
  updateChatConversation,
  type ChatConversation,
  type ChatMessageAttachment,
  type ChatMessage,
  type ChatModel,
  type ChatSettings
} from '../api';
import { SelectField } from '../SelectField';
import { MarkdownMessage } from '../MarkdownMessage';
import { useBodyScrollLock } from '../useBodyScrollLock';
import { useAuth } from '../auth';

type ChatBootstrapPayload = Awaited<ReturnType<typeof getChatBootstrap>>;

let chatBootstrapPromise: Promise<ChatBootstrapPayload> | null = null;

function loadChatBootstrapOnce() {
  if (!chatBootstrapPromise) {
    chatBootstrapPromise = getChatBootstrap().finally(() => {
      chatBootstrapPromise = null;
    });
  }
  return chatBootstrapPromise;
}

interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  content?: string;
  dataUrl?: string;
}

interface ConversationMenuPosition {
  top: number;
  left: number;
}

const readableAttachmentTypes = [
  'application/json',
  'application/xml',
  'application/javascript',
  'text/'
];
const typingIntervalMs = 12;
const typingChunkSize = 3;
const pinnedConversationsKey = 'pinnedChatConversationIds';

function MessageAttachments({ metadata }: { metadata: unknown }) {
  const attachments = readMessageAttachments(metadata);
  if (attachments.length === 0) return null;
  return (
    <div className="chatMessageAttachments">
      {attachments.map((item, index) => (
        <div className="chatMessageAttachment" key={`${item.name}-${index}`}>
          {item.dataUrl && item.type.startsWith('image/') ? (
            <img src={item.dataUrl} alt={item.name} />
          ) : (
            <Paperclip size={14} />
          )}
          <span>{item.name}</span>
        </div>
      ))}
    </div>
  );
}

export function ChatPage() {
  const auth = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number>(0);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [trialNotice, setTrialNotice] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTypingAssistant, setIsTypingAssistant] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingConversation, setEditingConversation] = useState<ChatConversation | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deletingConversation, setDeletingConversation] = useState<ChatConversation | null>(null);
  const [openConversationMenuId, setOpenConversationMenuId] = useState<number | null>(null);
  const [conversationMenuPosition, setConversationMenuPosition] = useState<ConversationMenuPosition | null>(null);
  const [pinnedConversationIds, setPinnedConversationIds] = useState<number[]>(() => readPinnedConversationIds());
  const abortRef = useRef<AbortController | null>(null);
  const submitLockRef = useRef(false);
  const shouldRestoreInputFocusRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const messageCacheRef = useRef(new Map<number, ChatMessage[]>());
  const activeConversationIdRef = useRef<number | null>(null);
  const typingQueueRef = useRef('');
  const typingTimerRef = useRef<number | null>(null);
  const pendingFinalAssistantRef = useRef<ChatMessage | null>(null);

  const activeConversation = conversations.find((item) => item.id === activeConversationId) || null;
  const modelOptions = useMemo(() => models.map((item) => ({ label: item.name, value: String(item.id) })), [models]);
  const pinnedConversationIdSet = useMemo(() => new Set(pinnedConversationIds), [pinnedConversationIds]);
  const visibleConversations = useMemo(() => {
    return [...conversations].sort((first, second) => {
      const firstPinned = pinnedConversationIdSet.has(first.id);
      const secondPinned = pinnedConversationIdSet.has(second.id);
      if (firstPinned !== secondPinned) return firstPinned ? -1 : 1;
      return 0;
    });
  }, [conversations, pinnedConversationIdSet]);
  const openConversationMenu = openConversationMenuId
    ? visibleConversations.find((item) => item.id === openConversationMenuId) || null
    : null;
  const isAnswering = isStreaming || isTypingAssistant;

  useBodyScrollLock(Boolean(editingConversation || deletingConversation));

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    window.localStorage.setItem(pinnedConversationsKey, JSON.stringify(pinnedConversationIds));
  }, [pinnedConversationIds]);

  useEffect(() => {
    if (openConversationMenuId === null) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest('.chatConversationMenuWrap')) return;
      setOpenConversationMenuId(null);
      setConversationMenuPosition(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [openConversationMenuId]);

  useEffect(() => {
    if (openConversationMenuId === null) return;
    function closeConversationMenu() {
      setOpenConversationMenuId(null);
      setConversationMenuPosition(null);
    }
    window.addEventListener('resize', closeConversationMenu);
    window.addEventListener('scroll', closeConversationMenu, true);
    return () => {
      window.removeEventListener('resize', closeConversationMenu);
      window.removeEventListener('scroll', closeConversationMenu, true);
    };
  }, [openConversationMenuId]);

  useEffect(() => {
    if (isAnswering || !shouldRestoreInputFocusRef.current) return;
    shouldRestoreInputFocusRef.current = false;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [isAnswering]);

  function setCachedMessages(conversationId: number | null, next: ChatMessage[]) {
    setMessages(next);
    if (conversationId) {
      messageCacheRef.current.set(conversationId, next);
    }
  }

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setError('');
      try {
        if (!auth.user) await auth.ensureGuestSession();
        const payload = await loadChatBootstrapOnce();
        if (!isMounted) return;
        setSettings(payload.settings);
        setModels(payload.models.items);
        setConversations(payload.conversations.items);
        const defaultId = payload.models.defaultModelId || payload.models.items[0]?.id || 0;
        setSelectedModelId((current) => current || defaultId);
        if (activeConversationIdRef.current) return;
        if (payload.activeConversationId) {
          messageCacheRef.current.set(payload.activeConversationId, payload.messages.items);
          setActiveConversationId(payload.activeConversationId);
          setCachedMessages(payload.activeConversationId, payload.messages.items);
        } else {
          setCachedMessages(null, []);
        }
      } catch (err) {
        if (isMounted) {
          showChatError(err);
        }
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [auth]);

  useEffect(() => {
    document.documentElement.classList.add('chatBodyLocked');
    document.body.classList.add('chatBodyLocked');
    return () => {
      document.documentElement.classList.remove('chatBodyLocked');
      document.body.classList.remove('chatBodyLocked');
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isStreaming]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (!(event.target instanceof Node) || !document.querySelector('.chatPage')?.contains(event.target)) return;
      const files = Array.from(event.clipboardData?.files || []);
      if (files.length > 0) void addFiles(files);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    if (!isAttachMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && attachMenuRef.current?.contains(event.target)) return;
      setIsAttachMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isAttachMenuOpen]);

  useEffect(() => {
    function openChatHistory() {
      setIsHistoryOpen(true);
    }
    window.addEventListener('photo-sys:open-chat-history', openChatHistory);
    return () => window.removeEventListener('photo-sys:open-chat-history', openChatHistory);
  }, []);

  useEffect(() => () => clearTypingTimer(), []);

  useEffect(() => {
    if (!trialNotice) return;
    const timer = window.setTimeout(() => setTrialNotice(''), 10000);
    return () => window.clearTimeout(timer);
  }, [trialNotice]);

  async function selectConversation(id: number) {
    setActiveConversationId(id);
    activeConversationIdRef.current = id;
    setIsHistoryOpen(false);
    setOpenConversationMenuId(null);
    setConversationMenuPosition(null);
    setError('');
    const cachedMessages = messageCacheRef.current.get(id);
    if (cachedMessages) {
      setCachedMessages(id, cachedMessages);
    } else {
      setCachedMessages(id, []);
    }
    try {
      const payload = await listChatMessages(id);
      if (activeConversationIdRef.current !== id) return;
      setCachedMessages(id, payload.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取消息失败');
    }
  }

  async function startConversation() {
    setError('');
    setMessage('');
    try {
      if (!auth.user) await auth.ensureGuestSession();
      const payload = await createChatConversation();
      setConversations((current) => [payload.item, ...current]);
      setActiveConversationId(payload.item.id);
      activeConversationIdRef.current = payload.item.id;
      messageCacheRef.current.set(payload.item.id, []);
      setMessages([]);
      setIsHistoryOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建对话失败');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitLockRef.current) return;
    if (isAnswering) return;
    if (!settings?.enabled) {
      setError('AI 对话当前不可用');
      return;
    }
    if (!selectedModelId) {
      setError('请先选择可用模型');
      return;
    }
    const content = input.trim() || firstAttachmentPrompt(attachments);
    if (!content) return;
    if (settings.maxInputChars && content.length > settings.maxInputChars) {
      setError(`消息不能超过 ${settings.maxInputChars} 个字符`);
      return;
    }

    setError('');
    setMessage('');
    submitLockRef.current = true;
    let conversationId = activeConversationId;
    let shouldRefreshMessages = true;
    try {
      if (!auth.user) await auth.ensureGuestSession();
      if (!conversationId) {
        const payload = await createChatConversation();
        conversationId = payload.item.id;
        setActiveConversationId(conversationId);
        activeConversationIdRef.current = conversationId;
        setConversations((current) => [payload.item, ...current]);
      }

      setInput('');
      setAttachments([]);
      setIsStreaming(true);
      resetTypingState();
      const controller = new AbortController();
      abortRef.current = controller;

      await streamChatMessage({
        conversationId,
        content,
        attachments: attachments.map(toMessageAttachment),
        chatModelId: selectedModelId,
        signal: controller.signal,
        onEvent: (eventPayload) => {
          if (eventPayload.event === 'message_created') {
            setMessages((current) => {
              const conversationMessages = messageCacheRef.current.get(eventPayload.data.userMessage.conversationId) || current;
              const next = [
                ...conversationMessages,
                eventPayload.data.userMessage,
                eventPayload.data.assistantMessage
              ];
              const uniqueNext = uniqueMessagesById(next);
              messageCacheRef.current.set(eventPayload.data.userMessage.conversationId, uniqueNext);
              return activeConversationIdRef.current === eventPayload.data.userMessage.conversationId ? uniqueNext : current;
            });
          }
          if (eventPayload.event === 'delta') {
            enqueueAssistantDelta(eventPayload.data.delta);
          }
          if (eventPayload.event === 'completed') {
            shouldRefreshMessages = false;
            pendingFinalAssistantRef.current = eventPayload.data.assistantMessage;
            if (typingQueueRef.current) {
              setIsTypingAssistant(true);
              scheduleAssistantTyping();
            } else {
              commitPendingFinalAssistant();
            }
            setConversations((current) => upsertConversation(current, eventPayload.data.conversation));
          }
          if (eventPayload.event === 'failed') {
            flushAssistantTyping();
            const failedAssistantMessage = eventPayload.data.assistantMessage;
            if (failedAssistantMessage) {
              setMessages((current) => {
                const next = current.map((item) =>
                  item.id === failedAssistantMessage.id ? failedAssistantMessage : item
                );
                messageCacheRef.current.set(failedAssistantMessage.conversationId, next);
                return next;
              });
            }
            showChatError(eventPayload.data.error || 'AI 回复失败');
          }
        }
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        showChatError(err);
      }
    } finally {
      submitLockRef.current = false;
      setIsStreaming(false);
      abortRef.current = null;
      void refreshConversations();
      if (conversationId && shouldRefreshMessages) {
        void refreshConversationMessages(conversationId);
      }
      shouldRestoreInputFocusRef.current = true;
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

  async function refreshConversationMessages(conversationId: number) {
    try {
      const payload = await listChatMessages(conversationId);
      messageCacheRef.current.set(conversationId, payload.items);
      if (activeConversationIdRef.current === conversationId) {
        setMessages(payload.items);
      }
    } catch {
      return;
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
    submitLockRef.current = false;
    shouldRestoreInputFocusRef.current = true;
    flushAssistantTyping();
    setMessage('已停止生成');
  }

  function showChatError(errorValue: unknown) {
    const text = errorValue instanceof Error ? errorValue.message : String(errorValue || '发送消息失败');
    if (errorValue instanceof ApiError && errorValue.code === 'TRIAL_IP_LIMIT_EXCEEDED') {
      setError('');
      setTrialNotice('当前网络的游客试用创建次数过多，请稍后再试！');
      return;
    }
    if ((errorValue instanceof ApiError && errorValue.code === 'TRIAL_LIMIT_EXCEEDED') || text.includes('AI对话试用次数已用完')) {
      setError('');
      setTrialNotice('AI对话试用次数已用完，请前往注册页面注册登录使用！');
      return;
    }
    setError(text);
  }

  function clearTypingTimer() {
    if (typingTimerRef.current === null) return;
    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
  }

  function resetTypingState() {
    clearTypingTimer();
    typingQueueRef.current = '';
    pendingFinalAssistantRef.current = null;
    setIsTypingAssistant(false);
  }

  function enqueueAssistantDelta(delta: string) {
    if (!delta) return;
    typingQueueRef.current += delta;
    setIsTypingAssistant(true);
    scheduleAssistantTyping();
  }

  function scheduleAssistantTyping() {
    if (typingTimerRef.current !== null) return;
    typingTimerRef.current = window.setTimeout(tickAssistantTyping, typingIntervalMs);
  }

  function tickAssistantTyping() {
    typingTimerRef.current = null;
    const nextChunk = typingQueueRef.current.slice(0, typingChunkSize);
    typingQueueRef.current = typingQueueRef.current.slice(nextChunk.length);
    if (nextChunk) {
      setMessages((current) => {
        const next = updateLastAssistant(current, nextChunk);
        cacheMessagesForActiveConversation(next);
        return next;
      });
    }

    if (typingQueueRef.current) {
      scheduleAssistantTyping();
      return;
    }

    commitPendingFinalAssistant();
    setIsTypingAssistant(false);
  }

  function flushAssistantTyping() {
    clearTypingTimer();
    const queued = typingQueueRef.current;
    typingQueueRef.current = '';
    if (queued) {
      setMessages((current) => {
        const next = updateLastAssistant(current, queued);
        cacheMessagesForActiveConversation(next);
        return next;
      });
    }
    commitPendingFinalAssistant();
    setIsTypingAssistant(false);
  }

  function commitPendingFinalAssistant() {
    const finalAssistant = pendingFinalAssistantRef.current;
    if (!finalAssistant) return;
    pendingFinalAssistantRef.current = null;
    setMessages((current) => {
      const next = current.map((item) =>
        item.id === finalAssistant.id ? finalAssistant : item
      );
      messageCacheRef.current.set(finalAssistant.conversationId, next);
      return next;
    });
  }

  function cacheMessagesForActiveConversation(next: ChatMessage[]) {
    const conversationId = next[0]?.conversationId || activeConversationId;
    if (conversationId) {
      messageCacheRef.current.set(conversationId, next);
    }
  }

  async function copyMessage(content: string) {
    if (!content.trim()) return;
    try {
      await navigator.clipboard.writeText(content);
      setMessage('已复制');
    } catch {
      setError('复制失败');
    }
  }

  function editMessage(item: ChatMessage) {
    setInput(item.content);
    setAttachments([]);
  }

  async function addFiles(files: File[]) {
    const next = await Promise.all(files.slice(0, 6).map(async (file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      type: file.type || 'unknown',
      size: file.size,
      dataUrl: file.type.startsWith('image/') ? await readFileAsDataUrl(file).catch(() => undefined) : undefined,
      content: isReadableAttachment(file) ? await file.text().catch(() => undefined) : undefined
    })));
    setAttachments((current) => [...current, ...next].slice(0, 6));
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((item) => item.id !== id));
  }

  function openRename(conversation: ChatConversation) {
    setOpenConversationMenuId(null);
    setConversationMenuPosition(null);
    setEditingConversation(conversation);
    setEditingTitle(conversation.title);
  }

  function togglePinnedConversation(id: number) {
    setPinnedConversationIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [id, ...current]
    ));
    setOpenConversationMenuId(null);
    setConversationMenuPosition(null);
  }

  function toggleConversationMenu(id: number, button: HTMLButtonElement) {
    setOpenConversationMenuId((current) => {
      if (current === id) {
        setConversationMenuPosition(null);
        return null;
      }
      setConversationMenuPosition(getConversationMenuPosition(button));
      return id;
    });
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
      {error && <div className="errorBox">{error}</div>}
      {message && <div className="toastNotice" role="status">{message}</div>}
      {trialNotice && <div className="toastNotice chatTrialNotice" role="status">{trialNotice}</div>}

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
            {visibleConversations.map((item) => (
              <div
                className={item.id === activeConversationId ? 'chatConversationItem active' : 'chatConversationItem'}
                role="button"
                tabIndex={0}
                key={item.id}
                onClick={() => void selectConversation(item.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  void selectConversation(item.id);
                }}
              >
                <span>{pinnedConversationIdSet.has(item.id) ? '固定 · ' : ''}{item.title}</span>
                <small>{formatDate(item.lastMessageAt || item.updatedAt)}</small>
                <span className="chatConversationActions chatConversationMenuWrap" onClick={(event) => event.stopPropagation()}>
                  <button
                    className="chatConversationMenuButton"
                    type="button"
                    onClick={(event) => toggleConversationMenu(item.id, event.currentTarget)}
                    aria-label="打开对话操作菜单"
                    aria-expanded={openConversationMenuId === item.id}
                  >
                    <MoreVertical size={17} />
                  </button>
                </span>
              </div>
            ))}
            {conversations.length === 0 && <div className="emptyLine">暂无对话</div>}
          </div>
        </aside>

        {isHistoryOpen && <button className="chatHistoryBackdrop" type="button" aria-label="关闭历史" onClick={() => setIsHistoryOpen(false)} />}

        {openConversationMenu && conversationMenuPosition && createPortal(
          <div
            className="chatConversationMenu chatConversationMenuWrap"
            role="menu"
            style={{
              top: conversationMenuPosition.top,
              left: conversationMenuPosition.left
            }}
          >
            <button type="button" role="menuitem" onClick={() => togglePinnedConversation(openConversationMenu.id)}>
              <Pin size={14} />
              {pinnedConversationIdSet.has(openConversationMenu.id) ? '取消固定' : '固定'}
            </button>
            <button type="button" role="menuitem" onClick={() => openRename(openConversationMenu)}>
              <Edit3 size={14} />
              重命名
            </button>
            <button className="danger" type="button" role="menuitem" onClick={() => {
              setOpenConversationMenuId(null);
              setConversationMenuPosition(null);
              setDeletingConversation(openConversationMenu);
            }}>
              <Trash2 size={14} />
              删除
            </button>
          </div>,
          document.body
        )}

        <section className="panel chatPanel">
          <div className={messages.length === 0 ? 'chatMessageList empty' : 'chatMessageList'}>
            {settings && !settings.enabled && (
              <div className="chatEmptyState">
                <strong>AI 对话当前已关闭</strong>
                <p>请在后台启用对话功能后再使用。</p>
              </div>
            )}

            {messages.map((item) => (
              <article className={`chatMessage ${item.role}`} key={item.id}>
                <div className="chatMessageBubble">
                  {item.role === 'assistant' ? (
                    <div className="chatMarkdown">
                      <MarkdownMessage
                        content={item.content || (item.status === 'streaming' ? '生成中...' : '')}
                      />
                    </div>
                  ) : (
                    <p>{item.content || (item.status === 'streaming' ? '生成中...' : '')}</p>
                  )}
                  {item.role === 'user' && <MessageAttachments metadata={item.metadata} />}
                  {item.errorMessage && <span className="chatMessageError">{item.errorMessage}</span>}
                  <div className="chatMessageTools">
                    <button className="iconButton" type="button" onClick={() => void copyMessage(item.content)} aria-label="复制">
                      <Clipboard size={14} />
                    </button>
                    {item.role === 'user' && (
                      <button className="iconButton" type="button" onClick={() => editMessage(item)} aria-label="修改">
                        <Edit3 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
            <div ref={bottomRef} />
          </div>

          <form className="chatComposer" onSubmit={submit}>
            {attachments.length > 0 && (
              <div className="chatAttachmentList">
                {attachments.map((item) => (
                  <span className="chatAttachmentChip" key={item.id}>
                    {item.name}
                    <button type="button" onClick={() => removeAttachment(item.id)} aria-label="移除附件">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={inputRef}
              value={input}
              placeholder="输入消息..."
              disabled={isAnswering || !settings?.enabled || models.length === 0}
              maxLength={settings?.maxInputChars || undefined}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
            />
            <div className="chatComposerActions">
              <div className="chatAttachWrap" ref={attachMenuRef}>
                <button className="iconButton chatAttachButton" type="button" onClick={() => setIsAttachMenuOpen((current) => !current)} aria-label="上传附件" aria-expanded={isAttachMenuOpen}>
                  <Plus size={18} />
                </button>
                {isAttachMenuOpen && (
                  <div className="chatAttachMenu">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAttachMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                    >
                      <Paperclip size={15} />
                      添加照片和文件
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  void addFiles(Array.from(event.target.files || []));
                  event.target.value = '';
                }}
              />
              <span>{settings?.messageCreditCost ? `每条 ${settings.messageCreditCost} 积分` : '免费使用'}</span>
              <div className="chatComposerModel">
                <SelectField
                  value={String(selectedModelId || '')}
                  options={modelOptions}
                  onChange={(value) => setSelectedModelId(Number(value))}
                />
              </div>
              {isAnswering ? (
                <button className="dangerButton" type="button" onClick={stopStreaming} aria-label="停止">
                  <Square size={16} />
                </button>
              ) : (
                <button className="primaryButton compact" type="submit" disabled={(!input.trim() && attachments.length === 0) || !settings?.enabled || !selectedModelId} aria-label="发送">
                  <Send size={16} />
                </button>
              )}
            </div>
          </form>
        </section>
      </div>

      {editingConversation && (
        <div className="modalBackdrop" role="dialog" aria-modal="true">
          <form className="confirmModal renameConversationModal" onSubmit={submitRename}>
            <h2>重命名对话</h2>
            <label className="field">
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

function uniqueMessagesById(items: ChatMessage[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function upsertConversation(items: ChatConversation[], item: ChatConversation) {
  return [item, ...items.filter((current) => current.id !== item.id)]
    .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt).getTime() - new Date(a.lastMessageAt || a.updatedAt).getTime());
}

function getConversationMenuPosition(button: HTMLButtonElement): ConversationMenuPosition {
  const rect = button.getBoundingClientRect();
  const menuWidth = 132;
  const menuHeight = 120;
  const gap = 6;
  const viewportPadding = 8;
  const top = rect.bottom + gap + menuHeight > window.innerHeight - viewportPadding
    ? Math.max(viewportPadding, rect.top - gap - menuHeight)
    : rect.bottom + gap;
  const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
  const left = Math.min(
    maxLeft,
    Math.max(viewportPadding, rect.right - menuWidth)
  );
  return { top, left };
}

function isReadableAttachment(file: File) {
  return readableAttachmentTypes.some((type) => file.type.startsWith(type))
    || /\.(csv|json|log|md|txt|xml|yaml|yml)$/i.test(file.name);
}

function firstAttachmentPrompt(attachments: ChatAttachment[]) {
  if (attachments.length === 0) return '';
  const imageCount = attachments.filter((item) => item.type.startsWith('image/')).length;
  if (imageCount > 0) return imageCount === 1 ? '请分析这张图片。' : `请分析这 ${imageCount} 张图片。`;
  return `请分析附件：${attachments.map((item) => item.name).join('、')}`;
}

function toMessageAttachment(item: ChatAttachment): ChatMessageAttachment {
  return {
    name: item.name,
    type: item.type || 'application/octet-stream',
    size: item.size,
    dataUrl: item.dataUrl,
    content: item.content?.slice(0, 12000)
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Read file failed'));
    reader.readAsDataURL(file);
  });
}

function readPinnedConversationIds() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(pinnedConversationsKey) || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is number => Number.isInteger(item)) : [];
  } catch {
    return [];
  }
}

function readMessageAttachments(metadata: unknown): ChatMessageAttachment[] {
  const parsed = typeof metadata === 'string' ? safeJson(metadata) : metadata;
  if (!parsed || typeof parsed !== 'object') return [];
  const raw = (parsed as { attachments?: unknown }).attachments;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is ChatMessageAttachment => Boolean(item && typeof item === 'object' && 'name' in item));
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
