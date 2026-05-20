import express from 'express';
import { config, getMissingConfig } from '../config.js';
import { pingDatabase } from '../db.js';
import { redisConnection } from '../queue.js';
import { testRelayConnection } from '../relay.js';
import { ensureStorageDirs } from '../storage.js';

const router = express.Router();

router.get('/status', async (_req, res) => {
  const missing = getMissingConfig();

  res.json({
    model: config.IMAGE_MODEL,
    configured: missing.length === 0,
    missing,
    storageDir: config.storageDir
  });
});

router.post('/test', async (_req, res) => {
  const checks = {
    database: await runCheck(() => pingDatabase()),
    redis: await runCheck(async () => {
      await redisConnection.ping();
    }),
    storage: await runCheck(() => ensureStorageDirs()),
    relay: await runCheck(() => testRelayConnection())
  };

  const ok = Object.values(checks).every((check) => check.ok);
  res.status(ok ? 200 : 503).json({
    ok,
    model: config.IMAGE_MODEL,
    checks
  });
});

async function runCheck(fn: () => Promise<void>) {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export { router as settingsRouter };
