import type { Request, Response, NextFunction } from 'express';
import { TOKEN_COOKIE, verifyToken } from '../lib/jwt';
import { unauthorized } from '../lib/errors';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; username: string };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token =
    req.cookies?.[TOKEN_COOKIE] ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  if (!token) return next(unauthorized());
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    next(unauthorized('invalid or expired token'));
  }
}

export const userId = (req: Request): string => {
  if (!req.user) throw unauthorized();
  return req.user.id;
};
