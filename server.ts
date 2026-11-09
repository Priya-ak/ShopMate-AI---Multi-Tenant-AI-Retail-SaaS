import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.ts';
import { ensureApp } from './server/bootstrap.ts';
import { seedDatabase } from './server/seed.ts';
import { driver } from './server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createApp();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // 1. Initialize the database (SQLite locally, PostgreSQL when DATABASE_URL is set) & seed
  await ensureApp();
  seedDatabase();

  // 2. The API (CORS, body parsing, routes, error handling) is created in server/app.ts and shared
  //    with the Vercel serverless function.

  // 4. Vite Dev Middleware or Static File Serving
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite development server middleware mounted.');
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 ShopMate AI Server running on http://0.0.0.0:${PORT}`);
    console.log(`   Database: ${driver === 'postgres' ? 'PostgreSQL' : '/data/shopmate.db'}`);
    console.log(`   API Endpoint: http://localhost:${PORT}/api`);
    console.log(`=======================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
