const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export type GenerationStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

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

export async function createGeneration(formData: FormData) {
  const response = await fetch(`${API_BASE_URL}/generations`, {
    method: 'POST',
    body: formData
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || '生成失败');
    (error as Error & { generation?: Generation }).generation = payload?.generation;
    throw error;
  }

  return payload.generation as Generation;
}

export async function listGenerations(page = 1) {
  const response = await fetch(`${API_BASE_URL}/generations?page=${page}&pageSize=12`);
  if (!response.ok) throw new Error('读取历史失败');
  return await response.json() as {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    items: Generation[];
  };
}

export async function listGenerationsWithFilter(page = 1, status = '') {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '12'
  });
  if (status) params.set('status', status);
  const response = await fetch(`${API_BASE_URL}/generations?${params.toString()}`);
  if (!response.ok) throw new Error('读取历史失败');
  return await response.json() as {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    items: Generation[];
  };
}

export async function getGeneration(id: number) {
  const response = await fetch(`${API_BASE_URL}/generations/${id}`);
  if (!response.ok) throw new Error('读取生成任务失败');
  const payload = await response.json() as { generation: Generation };
  return payload.generation;
}

export async function retryGeneration(id: number) {
  const response = await fetch(`${API_BASE_URL}/generations/${id}/retry`, { method: 'POST' });
  if (!response.ok) throw new Error('重试失败');
  const payload = await response.json() as { generation: Generation };
  return payload.generation;
}

export async function getGenerationSummary() {
  const response = await fetch(`${API_BASE_URL}/generations/meta/summary`);
  if (!response.ok) throw new Error('读取队列状态失败');
  return await response.json() as {
    statusCounts: Record<string, number>;
    queue: { waiting: number };
  };
}

export async function deleteGeneration(id: number) {
  const response = await fetch(`${API_BASE_URL}/generations/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('删除失败');
}

export function downloadUrl(url: string) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}download=1`;
}

export async function getSettingsStatus() {
  const response = await fetch(`${API_BASE_URL}/settings/status`);
  if (!response.ok) throw new Error('读取设置失败');
  return await response.json() as SettingsStatus;
}

export async function testSettings() {
  const response = await fetch(`${API_BASE_URL}/settings/test`, { method: 'POST' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return payload as SettingsTestResult;
  }
  return payload as SettingsTestResult;
}

export interface SettingsTestResult {
  ok: boolean;
  model: string;
  checks: Record<string, { ok: boolean; error?: string }>;
}
