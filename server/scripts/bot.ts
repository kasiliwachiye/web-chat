/**
 * Demo helper: logs in as a seeded user, comes online, types and sends a message to their
 * DM with alice, then stays connected for a while. Usage: npx tsx scripts/bot.ts bob "hi" 30
 */
import { io } from 'socket.io-client';
import { randomUUID } from 'crypto';

const API = process.env.API_URL ?? 'http://localhost:4000';
const [username = 'bob', text = 'Hi Alice, real-time check!', stay = '30'] = process.argv.slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'Password123!' }),
  });
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  const { conversations } = await (await fetch(`${API}/conversations`, { headers: { cookie } })).json();
  const dm = conversations.find(
    (c: any) => c.type === 'DIRECT' && c.members.some((m: any) => m.username === 'alice'),
  );
  const s = io(API, { extraHeaders: { cookie }, transports: ['websocket'] });
  s.on('message:new', ({ message }) => console.log('received:', message.body));
  await new Promise((r) => s.on('connect', r));
  console.log(`${username} online`);
  await sleep(3000);
  s.emit('typing:start', { conversationId: dm.id });
  console.log('typing...');
  await sleep(3000);
  const ack = await s.emitWithAck('message:send', { conversationId: dm.id, body: text, clientMsgId: randomUUID() });
  console.log('sent, ack ok =', ack.ok);
  await sleep(Number(stay) * 1000);
  s.disconnect();
  console.log(`${username} offline`);
}
main();
