import type { Server } from 'socket.io';
import { getForUser, memberIds } from '../services/conversationService';

export const userRoom = (id: string) => `user:${id}`;
export const convRoom = (id: string) => `conv:${id}`;

/** Thin facade so REST routes can push realtime events without knowing Socket.IO details. */
export function createRealtime(io: Server) {
  return {
    /** Join all members' live sockets to the new room and tell each of them about it. */
    async conversationCreated(conversationId: string) {
      const ids = await memberIds(conversationId);
      await Promise.all(
        ids.map(async (uid) => {
          io.in(userRoom(uid)).socketsJoin(convRoom(conversationId));
          io.to(userRoom(uid)).emit('conversation:new', { conversation: await getForUser(uid, conversationId) });
        }),
      );
    },
  };
}
export type Realtime = ReturnType<typeof createRealtime>;
