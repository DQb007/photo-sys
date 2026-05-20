import express from 'express';
import mime from 'mime-types';
import { keyFromFileRoute, resolveStorageKey } from '../storage.js';

const router = express.Router();

router.get('/:folder/:filename', (req, res, next) => {
  try {
    const folder = req.params.folder;
    if (folder !== 'uploads' && folder !== 'generated') {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const key = keyFromFileRoute(folder, req.params.filename);
    const absolutePath = resolveStorageKey(key);
    res.type(mime.lookup(absolutePath) || 'application/octet-stream');
    if (req.query.download === '1') {
      res.attachment(req.params.filename);
    }
    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
});

export { router as filesRouter };
