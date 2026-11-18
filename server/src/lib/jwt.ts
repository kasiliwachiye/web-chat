import jwt from 'jsonwebtoken';
import { env, isProd } from './env';
import type { CookieOptions } from 'express';

export interface JwtUser {
  sub: string;
  username: string;
}

export const TOKEN_COOKIE = 'token';
const TTL_SECONDS = 8 * 60 * 60;

export function signToken(user: { id: string; username: string }): string {
  return jwt.sign({ sub: user.id, username: user.username }, env.JWT_SECRET, {
    expiresIn: TTL_SECONDS,
    algorithm: 'HS256',
  });
}

export function verifyToken(token: string): JwtUser {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as JwtUser;
}

export const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  maxAge: TTL_SECONDS * 1000,
  path: '/',
};
