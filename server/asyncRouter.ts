import { Router } from 'express';

/**
 * Express 4 does not catch rejected promises from async handlers (the request would hang, or on
 * serverless the invocation would crash). This router forwards them to the app error handler.
 */
export function asyncRouter(): Router {
  const router = Router();
  for (const method of ['get', 'post', 'put', 'delete'] as const) {
    const original = (router as any)[method].bind(router);
    (router as any)[method] = (path: any, ...handlers: any[]) =>
      original(
        path,
        ...handlers.map((h) =>
          typeof h === 'function' ? (req: any, res: any, next: any) => Promise.resolve(h(req, res, next)).catch(next) : h
        )
      );
  }
  return router;
}
