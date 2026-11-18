import { Prisma, type ConversationMember } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { presence } from './presence';
import { toPublicUser } from './userService';
import { toMessageDto } from './messageDto';

const include = {
  members: { include: { user: true } },
  messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
} satisfies Prisma.ConversationInclude;

type ConversationWithRelations = Prisma.ConversationGetPayload<{ include: typeof include }>;

export const directKeyFor = (a: string, b: string) => [a, b].sort().join(':');

/** Server-side authorization: throws 403 unless userId is a member of conversationId. */
export async function assertMember(userId: string, conversationId: string): Promise<ConversationMember> {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) throw forbidden('not a member of this conversation');
  return member;
}

export async function memberConversationIds(userId: string): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({ where: { userId }, select: { conversationId: true } });
  return rows.map((r) => r.conversationId);
}

export async function memberIds(conversationId: string): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

async function unreadCount(userId: string, conversationId: string, lastReadMessageId: string | null) {
  let since: Date | undefined;
  if (lastReadMessageId) {
    const last = await prisma.message.findUnique({ where: { id: lastReadMessageId }, select: { createdAt: true } });
    since = last?.createdAt;
  }
  return prisma.message.count({
    where: {
      conversationId,
      senderId: { not: userId },
      deletedAt: null,
      ...(since ? { createdAt: { gt: since } } : {}),
    },
  });
}

async function toDto(conv: ConversationWithRelations, userId: string) {
  const online = await presence.onlineSet(conv.members.map((m) => m.userId));
  const me = conv.members.find((m) => m.userId === userId);
  return {
    id: conv.id,
    type: conv.type,
    name: conv.name,
    createdBy: conv.createdBy,
    updatedAt: conv.updatedAt.toISOString(),
    members: conv.members.map((m) => ({ ...toPublicUser(m.user, online.has(m.userId)), role: m.role })),
    lastMessage: conv.messages[0] ? toMessageDto(conv.messages[0]) : null,
    lastReadMessageId: me?.lastReadMessageId ?? null,
    unreadCount: me ? await unreadCount(userId, conv.id, me.lastReadMessageId) : 0,
  };
}
export type ConversationDto = Awaited<ReturnType<typeof toDto>>;

export async function listForUser(userId: string) {
  const convs = await prisma.conversation.findMany({
    where: { members: { some: { userId } } },
    include,
    orderBy: { updatedAt: 'desc' },
  });
  return Promise.all(convs.map((c) => toDto(c, userId)));
}

export async function getForUser(userId: string, conversationId: string) {
  await assertMember(userId, conversationId);
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, include });
  if (!conv) throw notFound();
  return toDto(conv, userId);
}

/** Idempotent: returns the existing DM for the pair if there is one. */
export async function getOrCreateDirect(userId: string, otherUserId: string) {
  if (userId === otherUserId) throw badRequest('cannot DM yourself');
  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!other) throw notFound('user not found');
  const directKey = directKeyFor(userId, otherUserId);

  const existing = await prisma.conversation.findUnique({ where: { directKey }, include });
  if (existing) return { conversation: await toDto(existing, userId), created: false };

  try {
    const conv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        directKey,
        createdBy: userId,
        members: { create: [{ userId, role: 'OWNER' }, { userId: otherUserId, role: 'MEMBER' }] },
      },
      include,
    });
    return { conversation: await toDto(conv, userId), created: true };
  } catch (e) {
    // A concurrent create won the race on the unique direct_key: return the winner.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const conv = await prisma.conversation.findUniqueOrThrow({ where: { directKey }, include });
      return { conversation: await toDto(conv, userId), created: false };
    }
    throw e;
  }
}

export async function createGroup(userId: string, name: string, memberIdsInput: string[]) {
  const ids = [...new Set(memberIdsInput.filter((id) => id !== userId))];
  if (ids.length < 1) throw badRequest('a group needs at least one other member');
  const found = await prisma.user.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw badRequest('unknown member id');
  const conv = await prisma.conversation.create({
    data: {
      type: 'GROUP',
      name,
      createdBy: userId,
      members: {
        create: [
          { userId, role: 'OWNER' as const },
          ...ids.map((id) => ({ userId: id, role: 'MEMBER' as const })),
        ],
      },
    },
    include,
  });
  return toDto(conv, userId);
}
