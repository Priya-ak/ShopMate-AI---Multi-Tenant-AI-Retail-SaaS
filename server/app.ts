import express, { NextFunction, Request, Response } from 'express';
import { apiRouter } from './routes.js';
import { captureWebhookBody } from './whatsapp.js';
import { ensureApp } from './bootstrap.js';
import { DatabaseNotConfiguredError, driver, schemaReport } from './db.js';

/**
 * Builds the Express application (API only). It is used by the local/AI Studio server (server.ts)
 * and by the Vercel serverless function (api/index.ts).
 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-business-id');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });
  // Webhooks need the exact raw bytes for signature checks, so they are read before the JSON parser.
  app.use('/api/webhooks', captureWebhookBody);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check: never touches the database so it can be used to diagnose configuration problems.
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      app: 'ShopMate AI',
      timestamp: new Date().toISOString(),
      database: driver === 'postgres' ? 'PostgreSQL' : 'SQLite (node:sqlite)',
      databaseConfigured: driver === 'postgres' || !process.env.VERCEL,
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      googleConfigured: !!process.env.GOOGLE_CLIENT_ID,
      superAdminConfigured: !!process.env.SUPERADMIN_EMAIL,
      whatsappConfigured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_CONFIG_ID),
      whatsappWebhookConfigured: !!(process.env.META_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN),
    });
  });

  // Schema self-check: lists declared columns that the connected database is still missing (names only, no data).
  app.get('/api/health/schema', async (_req, res) => {
    try {
      const r = await schemaReport();
      res.json({ ok: r.missing.length === 0, ...r });
    } catch (err: any) {
      if (err instanceof DatabaseNotConfiguredError) return res.status(503).json({ ok: false, error: 'Database not configured' });
      console.error('[health] schema check failed:', err?.message);
      res.status(500).json({ ok: false, error: 'Schema check failed. See server logs.' });
    }
  });

  // Make sure the database is migrated before any API route runs.
  app.use('/api', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await ensureApp();
      next();
    } catch (err: any) {
      if (err instanceof DatabaseNotConfiguredError) {
        return res.status(503).json({ error: 'The server database is not configured yet. Please contact the site administrator.', code: 'DATABASE_NOT_CONFIGURED' });
      }
      console.error('[app] startup failed:', err?.message || err);
      res.status(503).json({ error: 'The service is temporarily unavailable. Please try again shortly.', code: 'STARTUP_FAILED' });
    }
  });

  app.use('/api', apiRouter);

  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.originalUrl} not found` });
  });

  // Last-resort error handler: log details server-side, return a generic message.
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    console.error('[api] unhandled error:', err?.stack || err);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });

  return app;
}
