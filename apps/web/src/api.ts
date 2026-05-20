const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const tokenKey = 'photoSysAuthToken';

export type GenerationStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
export type UserRole = 'user' | 'admin';
export type UserStatus = 'pending_email_verification' | 'active' | 'disabled';

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
  userId: number;
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

export async function listGenerationsWithFilter(page = 1, status = '', userId?: number) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '12'
  });
  if (status) params.set('status', status);
  if (userId) params.set('userId', String(userId));
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

export async function listAdminUsers(params: { search?: string; role?: string; status?: string } = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.role) query.set('role', params.role);
  if (params.status) query.set('status', params.status);
  return request<{ items: AdminUser[] }>(`/admin/users?${query.toString()}`);
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

export async function listAuditLogs(action = '') {
  const params = new URLSearchParams();
  if (action) params.set('action', action);
  return request<{ items: AuditLog[] }>(`/admin/audit-logs?${params.toString()}`);
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

async function request<T = unknown>(path: string, init: RequestInit = {}, includeAuth = true): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
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
  return headers;
}

function authOnlyHeaders() {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseResponse(response: Response) {
  if (response.status === 204) return {};
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) clearAuthToken();
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
  const token = getAuthToken();
  if (!token || url.includes('token=')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}
