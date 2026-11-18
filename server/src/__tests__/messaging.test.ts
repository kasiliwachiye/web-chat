/**
 * Integration tests against the dev Postgres (docker compose up -d; prisma migrate dev).
 * Each run creates its own throwaway users so it doesn't disturb seed data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { assertMember, createGroup, getOrCreateDirect } from '../services/conversationService';
import { history, sendMessage } from '../services/messageService';
import { HttpError } from '../lib/errors';
import { InMemoryPresenceStore } from '../services/presence';

const tag = randomUUID().slice(0, 8);
let a: string, b: string, outsider: string, dmId: string;

beforeAll(async () => {
  const mk = (n: string) =>
    prisma.user.create({ data: { username: `t_${n}_${tag}`, displayName: n, passwordHash: 'x' } });
  [a, b, outsider] = (await Promise.all([mk('a'), mk('b'), mk('o')])).map((u) => u.id);
  dmId = (await getOrCreateDirect(a, b)).conversation.id;
});

afterAll(async () => {
  await prisma.conversation.deleteMany({ where: { members: { some: { userId: { in: [a, b, outsider] } } } } });
  await prisma.user.deleteMany({ where: { id: { in: [a, b, outsider] } } });
  await prisma.$disconnect();
});

describe('membership authorization', () => {
  it('allows members', async () => {
    await expect(assertMember(a, dmId)).resolves.toMatchObject({ userId: a });
  });

  it('rejects non-members with 403 on read and write', async () => {
    await expect(assertMember(outsider, dmId)).rejects.toMatchObject({ status: 403 });
    await expect(history(outsider, dmId, { limit: 10 })).rejects.toBeInstanceOf(HttpError);
    await expect(
      sendMessage(outsider, { conversationId: dmId, body: 'hi', clientMsgId: randomUUID() }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('direct conversations are unique per pair (idempotent create)', async () => {
    const again = await getOrCreateDirect(b, a);
    expect(again.created).toBe(false);
    expect(again.conversation.id).toBe(dmId);
  });

  it('group creator is OWNER and members can be authorized', async () => {
    const g = await createGroup(a, `g-${tag}`, [b]);
    expect(g.members.find((m) => m.id === a)?.role).toBe('OWNER');
    await expect(assertMember(b, g.id)).resolves.toBeTruthy();
    await expect(assertMember(outsider, g.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe('message send / ack path', () => {
  it('persists and returns the server message', async () => {
    const clientMsgId = randomUUID();
    const r = await sendMessage(a, { conversationId: dmId, body: '  hello  ', clientMsgId });
    expect(r.created).toBe(true);
    expect(r.message).toMatchObject({ conversationId: dmId, senderId: a, body: 'hello', clientMsgId });
  });

  it('is idempotent on (sender, clientMsgId): retry returns the same row, created=false', async () => {
    const clientMsgId = randomUUID();
    const first = await sendMessage(a, { conversationId: dmId, body: 'once', clientMsgId });
    const retry = await sendMessage(a, { conversationId: dmId, body: 'once', clientMsgId });
    expect(retry.created).toBe(false);
    expect(retry.message.id).toBe(first.message.id);
    const count = await prisma.message.count({ where: { senderId: a, clientMsgId } });
    expect(count).toBe(1);
  });

  it('rejects empty and over-long bodies', async () => {
    await expect(sendMessage(a, { conversationId: dmId, body: '   ', clientMsgId: randomUUID() })).rejects.toMatchObject({ status: 400 });
    await expect(
      sendMessage(a, { conversationId: dmId, body: 'x'.repeat(4001), clientMsgId: randomUUID() }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('history paginates with a keyset cursor in ascending order', async () => {
    for (let i = 0; i < 5; i++) await sendMessage(b, { conversationId: dmId, body: `p${i}`, clientMsgId: randomUUID() });
    const page1 = await history(a, dmId, { limit: 3 });
    expect(page1.messages.map((m) => m.body)).toEqual(['p2', 'p3', 'p4']);
    expect(page1.nextCursor).toBe(page1.messages[0].id);
    const page2 = await history(a, dmId, { limit: 3, cursor: page1.nextCursor! });
    expect(page2.messages.at(-1)!.body).toBe('p1');
    const after = await history(a, dmId, { limit: 10, after: page2.messages.at(-1)!.id });
    expect(after.messages.map((m) => m.body)).toEqual(['p2', 'p3', 'p4']);
  });
});

describe('presence store', () => {
  it('goes offline only when the last socket disconnects', async () => {
    const p = new InMemoryPresenceStore();
    expect(await p.connect('u')).toBe(true);
    expect(await p.connect('u')).toBe(false); // second tab
    expect(await p.disconnect('u')).toBe(false);
    expect(await p.isOnline('u')).toBe(true);
    expect(await p.disconnect('u')).toBe(true);
    expect(await p.isOnline('u')).toBe(false);
  });
});
