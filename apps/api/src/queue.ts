import { Redis, type RedisOptions } from 'ioredis';
import { config } from './config.js';
import { processGeneration } from './generationTask.js';

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {})
};

export const redisConnection = new Redis(config.REDIS_URL, redisOptions);

const queueKey = 'photo-sys:image-generations';
const workerConnection = new Redis(config.REDIS_URL, redisOptions);

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

  async function loop() {
    while (!stopped) {
      try {
        const item = await workerConnection.blpop(queueKey, 5);
        if (!item) continue;

        const payload = JSON.parse(item[1]) as { generationId?: unknown };
        if (typeof payload.generationId !== 'number') continue;

        await processGeneration(payload.generationId).catch((error) => {
          console.error(`Generation job ${payload.generationId} failed`, error);
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
