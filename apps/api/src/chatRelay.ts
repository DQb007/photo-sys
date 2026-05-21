import { type ChatModelWithSecret } from './chatModels.js';
import { type ChatMessageRow } from './db.js';

export interface ChatRelayMessage {
  role: 'system' | 'user' | 'assistant';
  content: ChatRelayContent;
}

export type ChatRelayContent = string | Array<
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
>;

export interface ChatMessageAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  content?: string;
}

export async function* streamChatCompletion(input: {
  model: ChatModelWithSecret;
  messages: ChatRelayMessage[];
  timeoutMs: number;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const abortListener = () => controller.abort();
  input.signal?.addEventListener('abort', abortListener);

  try {
    const response = await fetch(new URL('/v1/chat/completions', input.model.base_url).toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.model.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: input.model.model_key,
        messages: input.messages,
        stream: true
      }),
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      const detail = errorDetail(text);
      throw new Error(detail ? `Chat model failed with ${response.status}: ${detail}` : `Chat model failed with ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      for (const frame of frames) {
        const delta = parseSseFrame(frame);
        if (delta) yield delta;
      }
    }

    if (buffer.trim()) {
      const delta = parseSseFrame(buffer);
      if (delta) yield delta;
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Chat model request was interrupted');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener('abort', abortListener);
  }
}

export function buildRelayMessages(input: {
  systemPrompt: string;
  history: ChatMessageRow[];
  maxHistoryMessages: number;
}): ChatRelayMessage[] {
  const messages: ChatRelayMessage[] = [];
  if (input.systemPrompt.trim()) {
    messages.push({ role: 'system', content: input.systemPrompt.trim() });
  }
  for (const item of input.history.slice(-input.maxHistoryMessages)) {
    if (item.role === 'system') continue;
    if (!item.content.trim()) continue;
    messages.push({ role: item.role, content: buildMessageContent(item.content, readAttachments(item.metadata_json)) });
  }
  return messages;
}

function buildMessageContent(content: string, attachments: ChatMessageAttachment[]): ChatRelayContent {
  if (attachments.length === 0) return content;
  const parts: Exclude<ChatRelayContent, string> = [];
  if (content.trim()) parts.push({ type: 'text', text: content.trim() });
  for (const item of attachments) {
    if (item.dataUrl && item.type.startsWith('image/')) {
      parts.push({ type: 'image_url', image_url: { url: item.dataUrl } });
      continue;
    }
    const header = `附件：${item.name}（${item.type || 'unknown'}）`;
    parts.push({ type: 'text', text: item.content ? `${header}\n${item.content}` : header });
  }
  return parts.length > 0 ? parts : content;
}

function readAttachments(metadata: unknown): ChatMessageAttachment[] {
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

function parseSseFrame(frame: string) {
  const dataLines = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());
  if (dataLines.length === 0) return '';
  const data = dataLines.join('\n');
  if (data === '[DONE]') return '';

  try {
    const payload = JSON.parse(data) as {
      choices?: Array<{
        delta?: { content?: string };
        message?: { content?: string };
        text?: string;
      }>;
    };
    return payload.choices?.[0]?.delta?.content
      || payload.choices?.[0]?.message?.content
      || payload.choices?.[0]?.text
      || '';
  } catch {
    return '';
  }
}

function errorDetail(text: string) {
  if (!text) return '';
  try {
    const payload = JSON.parse(text) as { error?: { message?: string } };
    if (payload.error?.message) return payload.error.message.slice(0, 500);
  } catch {
    return text.replace(/\s+/g, ' ').trim().slice(0, 500);
  }
  return '';
}
