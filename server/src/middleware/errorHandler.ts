import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../lib/errors';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(JSON.stringify({ level: 'error', msg: 'unhandled', err: String(err) }));
  res.status(500).json({ error: 'internal error' });
}
