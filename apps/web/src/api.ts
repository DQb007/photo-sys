const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const tokenKey = 'photoSysAuthToken';
const guestTokenKey = 'photoSysGuestToken';

export type GenerationStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
export type UserRole = 'user' | 'admin';
export type UserStatus = 'pending_email_verification' | 'active' | 'disabled';
export type PromptTemplateStatus = 'active' | 'disabled';
export type ChatModelStatus = 'active' | 'disabled';
export type ChatMessageStatus = 'streaming' | 'completed' | 'failed' | 'cancelled';
export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface User {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  creditBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface GuestSession {
  id: number;
  generationLimit: number;
  generationUsed: number;
  generationRemaining: number;
  chatLimit: number;
  chatUsed: number;
  chatRemaining: number;
  expiresAt: string;
  trial: {
    enabled: boolean;
    allowReferenceImages: boolean;
    maxImagesPerGeneration: number;
  };
}

export interface GenerationImage {
  id: number;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface Generation {
  id: number;
  userId: number | null;
  guestSessionId: number | null;
  ownerEmail: string | null;
  prompt: string;
  model: string;
  status: GenerationStatus;
  size: string | null;
  quality: string | null;
  count: number;
  referenceImageUrl: string | null;
  referenceImageUrls: string[];
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
  images: GenerationImage[];
}

export interface SettingsStatus {
  model: string;
  configured: boolean;
  missing: string[];
  storageDir: string;
}

export interface SettingsTestResult {
  ok: boolean;
  model: string;
  checks: Record<string, { ok: boolean; error?: string }>;
}

export interface AppSettings {
  registration: {
    enabled: boolean;
    emailVerificationRequired: boolean;
    resendVerificationEnabled: boolean;
    verificationTokenTtlHours: number;
    defaultUserStatusWhenVerificationDisabled: 'active';
  };
  mail: {
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPassword: string;
    fromName: string;
    fromAddress: string;
    verificationSubject: string;
    verificationTemplate: string;
  };
  credits: {
    enabled: boolean;
    costPerImage: number;
    initialBalance: number;
    refundOnFailure: boolean;
  };
  generation: {
    imageConcurrency: number;
  };
  chat: {
    enabled: boolean;
    messageCreditCost: number;
    systemPrompt: string;
    maxInputChars: number;
    maxHistoryMessages: number;
    requestTimeoutMs: number;
  };
  trial: {
    enabled: boolean;
    generationLimit: number;
    chatLimit: number;
    sessionTtlHours: number;
    maxSessionsPerIpPerDay: number;
    allowReferenceImages: boolean;
    maxImagesPerGeneration: number;
  };
}

export interface AdminUser extends User {
  generationCount: number;
  succeededCount: number;
  failedCount: number;
  imageCount: number;
}

export interface CreditTransaction {
  id: number;
  userId: number;
  type:
    | 'initial_grant'
    | 'admin_adjustment'
    | 'generation_debit'
    | 'generation_refund'
    | 'redeem_code_credit'
    | 'generation_cancel_refund';
  amount: number;
  balanceAfter: number;
  generationId: number | null;
  actorUserId: number | null;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface RedeemPackage {
  id: number;
  name: string;
  credits: number;
  status: 'active' | 'disabled';
  description: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RedeemCodeBatch {
  id: number;
  packageId: number | null;
  packageNameSnapshot: string;
  creditsSnapshot: number;
  quantity: number;
  activeCount: number;
  redeemedCount: number;
  disabledCount: number;
  expiresAt: string | null;
  note: string | null;
  createdBy: number | null;
  createdAt: string;
}

export interface RedeemCode {
  id: number;
  batchId: number;
  codeSuffix: string;
  credits: number;
  status: 'active' | 'disabled' | 'redeemed';
  redeemedBy: number | null;
  redeemedEmail: string | null;
  redeemedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface PromptTemplate {
  id: number;
  title: string;
  description: string | null;
  promptText: string;
  exampleImageUrl: string | null;
  category: string | null;
  status: PromptTemplateStatus;
  sortOrder: number;
  usageCount: number;
  createdBy: number | null;
  updatedBy: number | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  variables: PromptTemplateVariable[];
}

export interface PromptTemplateVariable {
  name: string;
  defaultValue: string;
}

export interface AuditLog {
  id: number;
  actor_user_id: number | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_user_id: number | null;
  metadata_json: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface ChatModel {
  id: number;
  name: string;
  modelKey: string;
  baseUrl?: string;
  status: ChatModelStatus;
  isDefault: boolean;
  sortOrder: number;
  description: string | null;
  hasApiKey: boolean;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSettings {
  enabled: boolean;
  messageCreditCost: number;
  systemPrompt?: string;
  maxInputChars: number;
  maxHistoryMessages: number;
  requestTimeoutMs?: number;
}

export interface ChatConversation {
  id: number;
  userId: number | null;
  guestSessionId: number | null;
  title: string;
  titleIsAuto: boolean;
  status: 'active' | 'deleted';
  lastMessageAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  userId: number | null;
  guestSessionId: number | null;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  errorMessage: string | null;
  chatModelId: number | null;
  modelNameSnapshot: string | null;
  modelKeySnapshot: string | null;
  creditCost: number;
  creditTransactionId: number | null;
  creditRefundedAt: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  content?: string;
}

export type ChatStreamEvent =
  | { event: 'message_created'; data: { userMessage: ChatMessage; assistantMessage: ChatMessage } }
  | { event: 'delta'; data: { delta: string } }
  | { event: 'completed'; data: { assistantMessage: ChatMessage; conversation: ChatConversation } }
  | { event: 'failed'; data: { error: string; assistantMessage?: ChatMessage; refund?: CreditTransaction | null } };

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getAuthToken() {
  return localStorage.getItem(tokenKey);
}

export function setAuthToken(token: string) {
  localStorage.setItem(tokenKey, token);
}

export function clearAuthToken() {
  localStorage.removeItem(tokenKey);
}

export function getGuestToken() {
  return localStorage.getItem(guestTokenKey);
}

export function setGuestToken(token: string) {
  localStorage.setItem(guestTokenKey, token);
}

export function clearGuestToken() {
  localStorage.removeItem(guestTokenKey);
}

export async function createGuestSession() {
  const payload = await request<{ token: string; session: GuestSession }>('/guest/session', { method: 'POST' }, false);
  setGuestToken(payload.token);
  return payload.session;
}

export async function getGuestSession() {
  return request<{ session: GuestSession }>('/guest/session');
}

export async function register(input: { email: string; password: string; displayName?: string }) {
  return request<{ ok: boolean; verificationRequired: boolean; token?: string; user?: User }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input)
  }, false);
}

export async function login(input: { email: string; password: string }) {
  return request<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input)
  }, false);
}

export async function verifyEmail(token: string) {
  return request<{ ok: boolean; user: User }>('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token })
  }, false);
}

export async function resendVerification(email: string) {
  return request<{ ok: boolean }>('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email })
  }, false);
}

export async function logout() {
  return request<{ ok: boolean }>('/auth/logout', { method: 'POST' });
}

export async function changePassword(input: {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return request<{ ok: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function getMe() {
  return request<{ user: User | null }>('/auth/me');
}

export async function getCreditBalance() {
  return request<{ balance: number; credits: AppSettings['credits'] }>('/credits/balance');
}

export async function listCreditTransactions(page = 1, pageSize = 20) {
  return request<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    items: CreditTransaction[];
  }>(`/credits/transactions?page=${page}&pageSize=${pageSize}`);
}

export async function redeemCode(code: string) {
  return request<{ credits: number; balance: number; transaction: CreditTransaction }>('/redeem-codes/redeem', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
}

export async function createGeneration(formData: FormData) {
  const response = await fetch(`${API_BASE_URL}/generations`, {
    method: 'POST',
    headers: authOnlyHeaders(),
    body: formData
  });
  const payload = await parseResponse(response);
  return withFileTokens(payload.generation as Generation);
}

export async function listGenerations(page = 1) {
  return listGenerationsWithFilter(page, '');
}

export async function listGenerationsWithFilter(page = 1, status = '', userId?: number, ownerType: 'user' | 'guest' | '' = '') {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '12'
  });
  if (status) params.set('status', status);
  if (userId) params.set('userId', String(userId));
  if (ownerType) params.set('ownerType', ownerType);
  const payload = await request<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    items: Generation[];
  }>(`/generations?${params.toString()}`);
  return { ...payload, items: payload.items.map(withFileTokens) };
}

export async function getGeneration(id: number) {
  const payload = await request<{ generation: Generation }>(`/generations/${id}`);
  return withFileTokens(payload.generation);
}

export async function retryGeneration(id: number) {
  const payload = await request<{ generation: Generation }>(`/generations/${id}/retry`, { method: 'POST' });
  return withFileTokens(payload.generation);
}

export async function cancelGeneration(id: number) {
  const payload = await request<{ generation: Generation; removedQueueItems: number }>(`/generations/${id}/cancel`, {
    method: 'POST'
  });
  return { ...payload, generation: withFileTokens(payload.generation) };
}

export async function getGenerationSummary() {
  return request<{
    statusCounts: Record<string, number>;
    queue: { waiting: number };
  }>('/generations/meta/summary');
}

export async function deleteGeneration(id: number) {
  await request(`/generations/${id}`, { method: 'DELETE' });
}

export function downloadUrl(url: string) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}download=1`;
}

export function downloadFilename(url: string) {
  const pathname = new URL(url, window.location.origin).pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || 'image.png');
}

export async function getSettingsStatus() {
  return request<SettingsStatus>('/settings/status');
}

export async function testSettings() {
  return request<SettingsTestResult>('/settings/test', { method: 'POST' });
}

export async function getAdminOverview() {
  return request<{
    users: Record<string, number>;
    generations: Record<string, number>;
    images: number;
  }>('/admin/overview');
}

export async function getAdminSettings() {
  return request<{ settings: AppSettings }>('/admin/settings');
}

export async function updateAdminSettings(settings: Partial<AppSettings>) {
  return request<{ settings: AppSettings }>('/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
}

export async function testAdminEmail(to: string) {
  return request<{ ok: boolean }>('/admin/settings/test-email', {
    method: 'POST',
    body: JSON.stringify({ to })
  });
}

export async function resetAdminSettings() {
  return request<{ settings: AppSettings }>('/admin/settings/reset-defaults', { method: 'POST' });
}

export async function listAdminUsers(params: {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.role) query.set('role', params.role);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  return request<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    items: AdminUser[];
  }>(`/admin/users?${query.toString()}`);
}

export async function updateAdminUser(id: number, patch: Partial<Pick<User, 'role' | 'status' | 'displayName'>>) {
  return request<{ user: User }>(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export async function resetAdminUserPassword(input: {
  id: number;
  password: string;
  confirmPassword: string;
}) {
  return request<{ ok: boolean }>(`/admin/users/${input.id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({
      password: input.password,
      confirmPassword: input.confirmPassword
    })
  });
}

export async function adjustAdminUserCredits(input: { id: number; amount: number; reason: string }) {
  return request<{ balance: number; transaction: CreditTransaction }>(`/admin/users/${input.id}/credits/adjust`, {
    method: 'POST',
    body: JSON.stringify({
      amount: input.amount,
      reason: input.reason
    })
  });
}

export async function listAdminUserCreditTransactions(id: number, page = 1, pageSize = 20) {
  return request<{
    user: User;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    items: CreditTransaction[];
  }>(`/admin/users/${id}/credits/transactions?page=${page}&pageSize=${pageSize}`);
}

export async function getAdminUserGenerations(id: number) {
  const payload = await request<{ user: User; items: Generation[] }>(`/admin/users/${id}/generations`);
  return { ...payload, items: payload.items.map(withFileTokens) };
}

export async function listAuditLogs(input: { action?: string; page?: number; pageSize?: number } = {}) {
  const params = new URLSearchParams();
  if (input.action) params.set('action', input.action);
  if (input.page) params.set('page', String(input.page));
  if (input.pageSize) params.set('pageSize', String(input.pageSize));
  return request<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    items: AuditLog[];
  }>(`/admin/audit-logs?${params.toString()}`);
}

export async function listRedeemPackages() {
  return request<{ items: RedeemPackage[] }>('/admin/redeem-packages');
}

export async function createRedeemPackage(input: {
  name: string;
  credits: number;
  status?: RedeemPackage['status'];
  description?: string;
}) {
  return request<{ item: RedeemPackage }>('/admin/redeem-packages', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function updateRedeemPackage(id: number, input: Partial<{
  name: string;
  credits: number;
  status: RedeemPackage['status'];
  description: string;
}>) {
  return request<{ item: RedeemPackage }>(`/admin/redeem-packages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
}

export async function listRedeemBatches() {
  return request<{ items: RedeemCodeBatch[] }>('/admin/redeem-code-batches');
}

export async function createRedeemBatch(input: {
  packageId: number;
  quantity: number;
  expiresAt?: string | null;
  note?: string;
}) {
  return request<{ batch: RedeemCodeBatch; codes: string[] }>('/admin/redeem-code-batches', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function listRedeemCodesForBatch(batchId: number) {
  return request<{ items: RedeemCode[] }>(`/admin/redeem-code-batches/${batchId}/codes`);
}

export async function disableRedeemCode(id: number) {
  return request<{ item: RedeemCode }>(`/admin/redeem-codes/${id}/disable`, { method: 'POST' });
}

export async function listPromptTemplates(params: {
  scope?: 'all' | 'favorites';
  category?: string;
  search?: string;
} = {}) {
  const query = new URLSearchParams();
  if (params.scope) query.set('scope', params.scope);
  if (params.category) query.set('category', params.category);
  if (params.search) query.set('search', params.search);
  return request<{ items: PromptTemplate[]; categories: string[] }>(`/prompt-templates?${query.toString()}`);
}

export async function favoritePromptTemplate(id: number) {
  return request<{ ok: boolean }>(`/prompt-templates/${id}/favorite`, { method: 'POST' });
}

export async function unfavoritePromptTemplate(id: number) {
  return request<{ ok: boolean }>(`/prompt-templates/${id}/favorite`, { method: 'DELETE' });
}

export async function recordPromptTemplateUse(id: number) {
  return request<{ item: PromptTemplate }>(`/prompt-templates/${id}/use`, { method: 'POST' });
}

export async function listAdminPromptTemplates(params: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  return request<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    items: PromptTemplate[];
  }>(`/admin/prompt-templates?${query.toString()}`);
}

export async function createAdminPromptTemplate(input: {
  title: string;
  description?: string;
  promptText: string;
  exampleImageUrl?: string;
  category?: string;
  status?: PromptTemplateStatus;
  sortOrder?: number;
}) {
  return request<{ item: PromptTemplate }>('/admin/prompt-templates', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function updateAdminPromptTemplate(id: number, input: Partial<{
  title: string;
  description: string;
  promptText: string;
  exampleImageUrl: string;
  category: string;
  status: PromptTemplateStatus;
  sortOrder: number;
}>) {
  return request<{ item: PromptTemplate }>(`/admin/prompt-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
}

export async function deleteAdminPromptTemplate(id: number) {
  await request(`/admin/prompt-templates/${id}`, { method: 'DELETE' });
}

export async function getChatSettings() {
  return request<ChatSettings>('/chat/settings');
}

export async function getChatBootstrap() {
  return request<{
    settings: ChatSettings;
    models: { items: ChatModel[]; defaultModelId: number | null };
    conversations: { items: ChatConversation[] };
    activeConversationId: number | null;
    messages: { items: ChatMessage[] };
  }>('/chat/bootstrap');
}

export async function listChatModels() {
  return request<{ items: ChatModel[]; defaultModelId: number | null }>('/chat/models');
}

export async function listChatConversations() {
  return request<{ items: ChatConversation[] }>('/chat/conversations');
}

export async function createChatConversation(title?: string) {
  return request<{ item: ChatConversation }>('/chat/conversations', {
    method: 'POST',
    body: JSON.stringify({ title: title || '' })
  });
}

export async function updateChatConversation(id: number, title: string) {
  return request<{ item: ChatConversation }>(`/chat/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title })
  });
}

export async function deleteChatConversation(id: number) {
  await request(`/chat/conversations/${id}`, { method: 'DELETE' });
}

export async function listChatMessages(conversationId: number) {
  return request<{ items: ChatMessage[] }>(`/chat/conversations/${conversationId}/messages`);
}

export async function streamChatMessage(input: {
  conversationId: number;
  content: string;
  chatModelId: number;
  attachments?: ChatMessageAttachment[];
  signal?: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}) {
  const response = await fetch(`${API_BASE_URL}/chat/conversations/${input.conversationId}/messages/stream`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      content: input.content,
      chatModelId: input.chatModelId,
      attachments: input.attachments || []
    }),
    signal: input.signal
  });

  if (!response.ok || !response.body) {
    await parseResponse(response);
    return;
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
      const event = parseSseFrame(frame);
      if (event) input.onEvent(event);
    }
  }
  if (buffer.trim()) {
    const event = parseSseFrame(buffer);
    if (event) input.onEvent(event);
  }
}

export async function getAdminChatSettings() {
  return request<{ settings: Required<ChatSettings> }>('/admin/chat-settings');
}

export async function updateAdminChatSettings(settings: Partial<Required<ChatSettings>>) {
  return request<{ settings: Required<ChatSettings> }>('/admin/chat-settings', {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
}

export async function listAdminChatModels() {
  return request<{ items: ChatModel[] }>('/admin/chat-models');
}

export async function createAdminChatModel(input: {
  name: string;
  modelKey: string;
  baseUrl: string;
  apiKey?: string;
  status?: ChatModelStatus;
  isDefault?: boolean;
  sortOrder?: number;
  description?: string;
}) {
  return request<{ item: ChatModel }>('/admin/chat-models', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function updateAdminChatModel(id: number, input: Partial<{
  name: string;
  modelKey: string;
  baseUrl: string;
  apiKey: string;
  status: ChatModelStatus;
  isDefault: boolean;
  sortOrder: number;
  description: string;
}>) {
  return request<{ item: ChatModel }>(`/admin/chat-models/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
}

export async function disableAdminChatModel(id: number) {
  return request<{ item: ChatModel }>(`/admin/chat-models/${id}`, { method: 'DELETE' });
}

export async function testAdminChatModel(id: number) {
  return request<{ ok: boolean }>(`/admin/chat-models/${id}/test`, { method: 'POST' });
}

async function request<T = unknown>(path: string, init: RequestInit = {}, includeAuth = true): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...authHeaders(includeAuth),
      ...(init.headers || {})
    }
  });
  return parseResponse(response) as Promise<T>;
}

function authHeaders(includeAuth = true) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const token = getAuthToken();
  if (includeAuth && token) headers.Authorization = `Bearer ${token}`;
  const guestToken = getGuestToken();
  if (includeAuth && guestToken) headers['X-Guest-Token'] = guestToken;
  return headers;
}

function authOnlyHeaders() {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const guestToken = getGuestToken();
  if (guestToken) headers['X-Guest-Token'] = guestToken;
  return headers;
}

async function parseResponse(response: Response) {
  if (response.status === 204) return {};
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      clearAuthToken();
      if (payload?.code === 'GUEST_SESSION_EXPIRED') clearGuestToken();
    }
    throw new ApiError(payload?.error || '请求失败', response.status, payload?.code);
  }
  return payload;
}

function withFileTokens(generation: Generation): Generation {
  return {
    ...generation,
    referenceImageUrl: generation.referenceImageUrl ? appendToken(generation.referenceImageUrl) : null,
    referenceImageUrls: generation.referenceImageUrls.map(appendToken),
    images: generation.images.map((image) => ({ ...image, url: appendToken(image.url) }))
  };
}

function appendToken(url: string) {
  const guestToken = getGuestToken();
  if (url.includes('token=') || url.includes('guestToken=')) return url;
  if (getAuthToken() || !guestToken) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}guestToken=${encodeURIComponent(guestToken)}`;
}

function parseSseFrame(frame: string): ChatStreamEvent | null {
  const eventLine = frame.split(/\r?\n/).find((line) => line.startsWith('event:'));
  const event = eventLine?.slice(6).trim();
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');
  if (!event || !data) return null;
  try {
    return { event, data: JSON.parse(data) } as ChatStreamEvent;
  } catch {
    return null;
  }
}
