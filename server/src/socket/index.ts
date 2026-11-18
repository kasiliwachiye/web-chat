import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { parseCookie } from 'cookie';
import { z } from 'zod';
import { env } from '../lib/env';
import { TOKEN_COOKIE, verifyToken } from '../lib/jwt';
import { HttpError } from '../lib/errors';
import { TokenBucket } from '../lib/tokenBucket';
import { assertMember, memberConversationIds } from '../services/conversationService';
import { MAX_BODY, markRead, sendMessage } from '../services/messageService';
import { presence } from '../services/presence';
import { contactIds, touchLastSeen } from '../services/userService';
import { convRoom, createRealtime, userRoom } from './realtime';

interface SocketData {
  userId: string;
  username: string;
}
type AppSocket = Socket<any, any, any, SocketData>;
type Ack = (res: { ok: true; [k: string]: unknown } | { ok: false; error: string }) => void;

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(MAX_BODY),
  clientMsgId: z.string().min(8).max(64),
});
const convSchema = z.object({ conversationId: z.string().uuid() });
const readSchema = z.object({ conversationId: z.string().uuid(), messageId: z.string().uuid() });

const sendLimiter = new TokenBucket(10, 2); // burst 10, then 2 msg/s per user
const typingLimiter = new TokenBucket(5, 1);

const errMsg = (e: unknown) => (e instanceof HttpError ? e.message : 'internal error');
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), msg, ...extra }));

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    maxHttpBufferSize: 64 * 1024,
  });

  // Handshake auth: httpOnly cookie (same-site) or auth.token (cross-origin fallback).
  io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const token = cookies[TOKEN_COOKIE] ?? (socket.handshake.auth?.token as string | undefined);
    if (!token) return next(new Error('unauthorized'));
    try {
      const p = verifyToken(token);
      socket.data.userId = p.sub;
      socket.data.username = p.username;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  async function broadcastPresence(uid: string, online: boolean) {
    const lastSeenAt = online ? null : (await touchLastSeen(uid)).lastSeenAt?.toISOString();
    const contacts = await contactIds(uid);
    const payload = { userId: uid, online, lastSeenAt };
    for (const c of contacts) io.to(userRoom(c)).emit('presence:update', payload);
  }

  io.on('connection', async (socket: AppSocket) => {
    const uid = socket.data.userId;
    try {
      socket.join(userRoom(uid));
      const convIds = await memberConversationIds(uid);
      socket.join(convIds.map(convRoom));
      if (await presence.connect(uid)) await broadcastPresence(uid, true);
      log('socket connected', { userId: uid, socketId: socket.id, rooms: convIds.length });
    } catch (e) {
      log('socket connect error', { err: String(e) });
    }

    socket.on('message:send', async (raw: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === 'function' ? ack : () => {};
      const parsed = sendSchema.safeParse(raw);
      if (!parsed.success) return reply({ ok: false, error: 'invalid payload' });
      if (!sendLimiter.take(uid)) return reply({ ok: false, error: 'rate limited' });
      try {
        const { message, created } = await sendMessage(uid, parsed.data);
        reply({ ok: true, message });
        // Broadcast once; on an idempotent retry the original was already broadcast.
        if (created) io.to(convRoom(message.conversationId)).emit('message:new', { message });
      } catch (e) {
        reply({ ok: false, error: errMsg(e) });
      }
    });

    const typing = (isTyping: boolean) => async (raw: unknown) => {
      const parsed = convSchema.safeParse(raw);
      if (!parsed.success || !typingLimiter.take(uid + isTyping)) return;
      try {
        await assertMember(uid, parsed.data.conversationId);
        socket
          .to(convRoom(parsed.data.conversationId))
          .emit('typing', { conversationId: parsed.data.conversationId, userId: uid, isTyping });
      } catch {
        /* not a member: drop silently */
      }
    };
    socket.on('typing:start', typing(true));
    socket.on('typing:stop', typing(false));

    socket.on('conversation:read', async (raw: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === 'function' ? ack : () => {};
      const parsed = readSchema.safeParse(raw);
      if (!parsed.success) return reply({ ok: false, error: 'invalid payload' });
      try {
        await markRead(uid, parsed.data.conversationId, parsed.data.messageId);
        io.to(userRoom(uid)).emit('conversation:read', { ...parsed.data, userId: uid });
        reply({ ok: true });
      } catch (e) {
        reply({ ok: false, error: errMsg(e) });
      }
    });

    socket.on('disconnect', async (reason) => {
      try {
        if (await presence.disconnect(uid)) await broadcastPresence(uid, false);
        log('socket disconnected', { userId: uid, reason });
      } catch (e) {
        log('socket disconnect error', { err: String(e) });
      }
    });
  });

  return { io, realtime: createRealtime(io) };
}
