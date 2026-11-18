import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest } from '../lib/errors';
import { assertMember } from './conversationService';
import { toMessageDto, type MessageDto } from './messageDto';

export const MAX_BODY = 4000;

/**
 * Persist a message. Idempotent on (senderId, clientMsgId): a retried send returns
 * the originally stored message with created=false, so the caller doesn't re-broadcast.
 */
export async function sendMessage(
  senderId: string,
  input: { conversationId: string; body: string; clientMsgId: string },
): Promise<{ message: MessageDto; created: boolean }> {
  await assertMember(senderId, input.conversationId);
  const body = input.body.trim();
  if (!body) throw badRequest('empty message');
  if (body.length > MAX_BODY) throw badRequest('message too long');

  try {
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: { conversationId: input.conversationId, senderId, body, clientMsgId: input.clientMsgId },
      }),
      prisma.conversation.update({ where: { id: input.conversationId }, data: { updatedAt: new Date() } }),
    ]);
    return { message: toMessageDto(message), created: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await prisma.message.findUniqueOrThrow({
        where: { senderId_clientMsgId: { senderId, clientMsgId: input.clientMsgId } },
      });
      if (existing.conversationId !== input.conversationId) throw badRequest('clientMsgId reused');
      return { message: toMessageDto(existing), created: false };
    }
    throw e;
  }
}

/**
 * Keyset pagination, results always ascending.
 * `cursor`: messages older than this id (scroll up). `after`: messages newer than this id (reconnect backfill).
 */
export async function history(
  userId: string,
  conversationId: string,
  opts: { cursor?: string; after?: string; limit: number },
) {
  await assertMember(userId, conversationId);
  const pivotId = opts.cursor ?? opts.after;
  let pivot: { createdAt: Date; id: string } | null = null;
  if (pivotId) {
    pivot = await prisma.message.findFirst({
      where: { id: pivotId, conversationId },
      select: { createdAt: true, id: true },
    });
    if (!pivot) throw badRequest('invalid cursor');
  }

  if (opts.after && pivot) {
    const rows = await prisma.message.findMany({
      where: {
        conversationId,
        OR: [{ createdAt: { gt: pivot.createdAt } }, { createdAt: pivot.createdAt, id: { gt: pivot.id } }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: opts.limit,
    });
    return { messages: rows.map(toMessageDto), nextCursor: null };
  }

  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      ...(pivot
        ? { OR: [{ createdAt: { lt: pivot.createdAt } }, { createdAt: pivot.createdAt, id: { lt: pivot.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
  });
  const hasMore = rows.length > opts.limit;
  const page = rows.slice(0, opts.limit).reverse();
  return { messages: page.map(toMessageDto), nextCursor: hasMore ? page[0].id : null };
}

export async function markRead(userId: string, conversationId: string, messageId: string) {
  await assertMember(userId, conversationId);
  const msg = await prisma.message.findFirst({ where: { id: messageId, conversationId } });
  if (!msg) throw badRequest('message not in conversation');
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadMessageId: messageId },
  });
}
