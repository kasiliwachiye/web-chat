import type { Message } from '@prisma/client';

export const toMessageDto = (m: Message) => ({
  id: m.id,
  conversationId: m.conversationId,
  senderId: m.senderId,
  body: m.deletedAt ? '' : m.body,
  clientMsgId: m.clientMsgId,
  createdAt: m.createdAt.toISOString(),
  editedAt: m.editedAt?.toISOString() ?? null,
  deletedAt: m.deletedAt?.toISOString() ?? null,
});
export type MessageDto = ReturnType<typeof toMessageDto>;
