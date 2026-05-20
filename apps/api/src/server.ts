import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { filesRouter } from './routes/files.js';
import { generationsRouter } from './routes/generations.js';
import { settingsRouter } from './routes/settings.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { startGenerationWorker } from './queue.js';
import { ensureStorageDirs } from './storage.js';
import { ensureAdminSeed } from './users.js';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: config.IMAGE_MODEL });
});

app.use('/api/generations', generationsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/files', filesRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as { status: unknown }).status)
    : 500;
  const message = error instanceof Error ? error.message : 'Internal server error';

  res.status(Number.isInteger(status) && status >= 400 ? status : 500).json({ error: message });
});

await ensureStorageDirs();
await ensureAdminSeed();
startGenerationWorker();

app.listen(config.PORT, () => {
  console.log(`API server listening on http://localhost:${config.PORT}`);
});
