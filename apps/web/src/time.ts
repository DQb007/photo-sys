export function formatDuration(ms: number) {
  const safeMs = Math.max(ms, 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function generationElapsedMs(generation: {
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
}, nowMs = Date.now()) {
  if (generation.durationMs != null) return generation.durationMs;
  if (generation.status === 'pending') {
    return nowMs - new Date(generation.createdAt).getTime();
  }
  if (generation.startedAt) {
    return nowMs - new Date(generation.startedAt).getTime();
  }
  return 0;
}
