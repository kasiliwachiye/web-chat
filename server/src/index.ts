import http from 'http';
import { env } from './lib/env';
import { prisma } from './lib/prisma';
import { createApp } from './app';
import { createSocketServer } from './socket';

const server = http.createServer();
const { io, realtime } = createSocketServer(server);
server.on('request', createApp(realtime));

server.listen(env.PORT, () => {
  console.log(JSON.stringify({ level: 'info', msg: `server listening on :${env.PORT}` }));
});

async function shutdown(signal: string) {
  console.log(JSON.stringify({ level: 'info', msg: 'shutting down', signal }));
  io.close();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
