import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { requireAuth, userId } from '../middleware/auth';
import { loginLimiter } from '../middleware/rateLimiters';
import { TOKEN_COOKIE, cookieOptions, signToken } from '../lib/jwt';
import * as auth from '../services/authService';

const router = Router();

const registerSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{3,32}$/, '3-32 chars: a-z 0-9 _ . -'),
  displayName: z.string().trim().min(1).max(64),
  password: z.string().min(8).max(128),
});
const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(32),
  password: z.string().min(1).max(128),
});

router.post('/register', loginLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const user = await auth.register(res.locals.body);
    res.cookie(TOKEN_COOKIE, signToken(user), cookieOptions).status(201).json({ user });
  } catch (e) {
    next(e);
  }
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = res.locals.body;
    const user = await auth.login(username, password);
    res.cookie(TOKEN_COOKIE, signToken(user), cookieOptions).json({ user });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(TOKEN_COOKIE, { ...cookieOptions, maxAge: undefined }).status(204).end();
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await auth.getUser(userId(req));
    // Token is returned so the SPA can pass it in the socket handshake when the cookie
    // isn't sent (e.g. API on a different origin). It's the same token as the cookie.
    res.json({ user, token: signToken(user) });
  } catch (e) {
    next(e);
  }
});

export default router;
