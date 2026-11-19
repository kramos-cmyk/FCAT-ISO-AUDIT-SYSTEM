import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { initWebSocketServer } from './server/realtime.js';
import { createApiRouter } from './server/routes.js';
import { initializeDataStore } from './server/storeManager.js';

async function startServer() {
  await initializeDataStore();

  const app = express();
  const port = Number(process.env.PORT || 3000);
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || './data/uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // Serve uploaded evidence and announcement images
  app.use('/uploads', express.static(uploadDir));

  // API routes
  app.use('/api', createApiRouter());

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  initWebSocketServer(server);

  server.listen(port, '0.0.0.0', () => {
    console.log(`FCAT ISO Audit Management System listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
