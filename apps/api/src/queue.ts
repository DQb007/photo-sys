import { Redis, type RedisOptions } from 'ioredis';
import { config } from './config.js';
import { processGeneration } from './generationTask.js';
import { getAppSettings } from './settingsService.js';

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {})
};

export const redisConnection = new Redis(config.REDIS_URL, redisOptions);

const queueKey = 'photo-sys:image-generations';
const workerConnection = new Redis(config.REDIS_URL, redisOptions);
const workerPollTimeoutSeconds = 2;

export async function enqueueGeneration(generationId: number) {
  await redisConnection.rpush(queueKey, JSON.stringify({ generationId }));
}

export async function removeGenerationFromQueue(generationId: number) {
  const items = await redisConnection.lrange(queueKey, 0, -1);
  let removed = 0;
  for (const item of items) {
    try {
      const payload = JSON.parse(item) as { generationId?: unknown };
      if (payload.generationId === generationId) {
        removed += await redisConnection.lrem(queueKey, 1, item);
      }
    } catch {
      // Ignore malformed queue items here; the worker already skips them.
    }
  }
  return removed;
}

export async function getQueueSummary() {
  const waiting = await redisConnection.llen(queueKey);
  return { waiting };
}

export function startGenerationWorker() {
  let stopped = false;
  let activeJobs = 0;

  async function loop() {
    while (!stopped) {
      try {
        const concurrency = await getConfiguredConcurrency();
        if (activeJobs >= concurrency) {
          await sleep(500);
          continue;
        }

        const item = await workerConnection.blpop(queueKey, workerPollTimeoutSeconds);
        if (!item) {
          continue;
        }

        const payload = JSON.parse(item[1]) as { generationId?: unknown };
        if (typeof payload.generationId !== 'number') continue;

        activeJobs += 1;
        void processGeneration(payload.generationId)
          .catch((error) => {
            console.error(`Generation job ${payload.generationId} failed`, error);
          })
          .finally(() => {
            activeJobs -= 1;
          });
      } catch (error) {
        console.error('Generation worker loop failed', error);
        await sleep(2000);
      }
    }
  }

  void loop();

  return {
    close() {
      stopped = true;
      workerConnection.disconnect();
    }
  };
}

async function getConfiguredConcurrency() {
  try {
    const settings = await getAppSettings({ includeSecrets: true });
    return settings.generation.imageConcurrency;
  } catch (error) {
    console.error('Failed to read image generation concurrency setting', error);
    return 10;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
