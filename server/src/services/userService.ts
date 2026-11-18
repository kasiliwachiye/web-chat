import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { presence } from './presence';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  lastSeenAt: string | null;
  online?: boolean;
}

export const toPublicUser = (u: User, online?: boolean): PublicUser => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
  ...(online !== undefined ? { online } : {}),
});

export async function searchUsers(currentUserId: string, search?: string) {
  const users = await prisma.user.findMany({
    where: {
      id: { not: currentUserId },
      ...(search
        ? {
            OR: [
              { username: { contains: search, mode: 'insensitive' as const } },
              { displayName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { displayName: 'asc' },
    take: 50,
  });
  const online = await presence.onlineSet(users.map((u) => u.id));
  return users.map((u) => toPublicUser(u, online.has(u.id)));
}

/** All users who share at least one conversation with userId (presence audience). */
export async function contactIds(userId: string): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({
    where: { conversation: { members: { some: { userId } } }, userId: { not: userId } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((r) => r.userId);
}

export async function touchLastSeen(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
}
