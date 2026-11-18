/**
 * End-to-end smoke test against a running server (npm run dev).
 * Usage: npm run smoke
 */
import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'crypto';

const API = process.env.API_URL ?? 'http://localhost:4000';

async function login(username: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'Password123!' }),
  });
  if (!res.ok) throw new Error(`login ${username}: ${res.status}`);
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  return { cookie, user: (await res.json()).user };
}

const get = (path: string, cookie: string) => fetch(`${API}${path}`, { headers: { cookie } });

function connect(cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(API, { extraHeaders: { cookie }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function check(cond: unknown, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const alice = await login('alice');
  const bob = await login('bob');
  const eve = await login('eve');

  const convs = (await (await get('/conversations', alice.cookie)).json()).conversations;
  check(convs.length === 2, `alice sees 2 conversations (got ${convs.length})`);
  const group = convs.find((c: any) => c.type === 'GROUP');
  check(group?.lastMessage, 'group has last message');

  const dm1 = await fetch(`${API}/conversations/direct`, {
    method: 'POST',
    headers: { cookie: alice.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ userId: bob.user.id }),
  }).then((r) => r.json());
  const dm = convs.find((c: any) => c.type === 'DIRECT');
  check(dm1.conversation.id === dm.id, 'POST /conversations/direct is idempotent');

  const forbidden = await get(`/conversations/${group.id}/messages`, eve.cookie);
  check(forbidden.status === 403, `non-member history -> 403 (got ${forbidden.status})`);

  const hist = await (await get(`/conversations/${group.id}/messages?limit=4`, alice.cookie)).json();
  check(hist.messages.length === 4 && hist.nextCursor, 'history page of 4 with cursor');
  const older = await (await get(`/conversations/${group.id}/messages?limit=4&cursor=${hist.nextCursor}`, alice.cookie)).json();
  check(older.messages.length === 2 && older.nextCursor === null, 'older page has remaining 2');

  const sa = await connect(alice.cookie);
  const sb = await connect(bob.cookie);
  const se = await connect(eve.cookie);

  const received = new Promise<any>((r) => sb.once('message:new', r));
  const clientMsgId = randomUUID();
  const ack: any = await sa.emitWithAck('message:send', { conversationId: dm.id, body: 'hello from smoke', clientMsgId });
  check(ack.ok && ack.message.id, 'send acked with server id');
  const got = await received;
  check(got.message.id === ack.message.id, 'bob received message:new in real time');

  const retry: any = await sa.emitWithAck('message:send', { conversationId: dm.id, body: 'hello from smoke', clientMsgId });
  check(retry.ok && retry.message.id === ack.message.id, 'retry with same clientMsgId deduped');

  const evil: any = await se.emitWithAck('message:send', { conversationId: dm.id, body: 'sneaky', clientMsgId: randomUUID() });
  check(!evil.ok && evil.error.includes('not a member'), 'non-member send rejected');

  const tooLong: any = await sa.emitWithAck('message:send', { conversationId: dm.id, body: 'x'.repeat(4001), clientMsgId: randomUUID() });
  check(!tooLong.ok, 'message > 4000 chars rejected');

  const after = await (await get(`/conversations/${dm.id}/messages?after=${hist.messages[0].id}`, alice.cookie)).json().catch(() => null);
  check(after === null || after.error, 'after cursor from another conversation rejected');

  const added = new Promise<any>((r) => se.once('conversation:new', r));
  const gr = await fetch(`${API}/conversations/group`, {
    method: 'POST',
    headers: { cookie: alice.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke group', memberIds: [eve.user.id] }),
  }).then((r) => r.json());
  const evt = await added;
  check(evt.conversation.id === gr.conversation.id, 'new member receives conversation:new live');
  const groupMsg = new Promise<any>((r) => se.once('message:new', r));
  await sa.emitWithAck('message:send', { conversationId: gr.conversation.id, body: 'hi eve', clientMsgId: randomUUID() });
  check((await groupMsg).message.body === 'hi eve', 'new member joined the room and gets group messages');

  const offline = new Promise<any>((r) => sa.once('presence:update', r));
  sb.disconnect();
  const p = await offline;
  check(p.userId === bob.user.id && p.online === false && p.lastSeenAt, 'bob offline broadcast with lastSeenAt');

  sa.disconnect();
  se.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
