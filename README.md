# Enterprise Web Chat

Real-time employee chat: authentication, 1:1 and group messaging, history with infinite scroll, online/offline presence, typing indicators, unread counts and a responsive UI.

- **Server**: Node 20+, TypeScript, Express, Socket.IO, Prisma, PostgreSQL, zod, JWT in an httpOnly cookie, helmet, CORS, rate limiting
- **Client**: Vite, React, TypeScript, Tailwind v4, shadcn/ui (Radix), socket.io-client, React Router

Docs: [High-level design](docs/HLD.md) · [Low-level design, ERD, API, events](docs/LLD.md) · [Design explained (trade-offs, scaling, security)](docs/DESIGN_EXPLAINED.md) · [Decisions log](docs/DECISIONS.md)

## Prerequisites
- Node.js 20+ and npm
- Docker Desktop (for PostgreSQL)

## Setup

```bash
# 1. Database (Postgres 16 on localhost:5455)
docker compose up -d

# 2. Server
cd server
npm install
cp .env.example .env          # then set JWT_SECRET to a long random string
npx prisma migrate dev        # creates the schema
npm run seed                  # 5 demo users, 1 group, 1 DM (resets all data)
npm run dev                   # http://localhost:4000

# 3. Client (new terminal)
cd client
npm install
npm run dev                   # http://localhost:5173
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

The Vite dev server proxies `/api` and `/socket.io` to the API, so the auth cookie is same-origin.

## Demo accounts
| Username | Password |
|---|---|
| alice, bob, carol, dave, eve | `Password123!` |

Seeded data: group **Project Phoenix** (alice, bob, carol, dave) and a DM between alice and bob. Eve is in no conversations (useful to show authorization and starting a new chat).

## Tests

```bash
cd server
npm test          # integration tests: membership authorization, send/ack + idempotency, pagination, presence
npm run smoke     # end-to-end against the running server: REST + sockets (15 checks)
```

## Demo script (≈8 minutes)
1. **Login**: open http://localhost:5173 in a normal window, sign in as **alice**. Open an incognito window, sign in as **bob**.
2. **Presence**: alice's sidebar shows a green dot on Bob. Close bob's window → dot turns grey, header shows "last seen just now". Reopen and sign in → green again. Open bob in two tabs and close one: he stays online (socket counting).
3. **Real-time DM**: in the alice↔bob DM, type in bob's window → alice sees "Bob is typing…". Send → appears instantly on both sides; the sender's bubble goes clock → check (pending → sent via ack).
4. **Unread badges**: while alice has the group open, bob sends in the DM → unread badge on alice's DM and it jumps to the top. Open it → badge clears.
5. **Group**: alice clicks the new-chat icon → **Group** → name "Security review", picks carol and eve → creates it. Sign in as eve (another incognito/browser): the group appears live without refresh. Messages fan out to all members.
6. **History**: in Project Phoenix, scroll up to load older messages (cursor pagination; run the smoke script a few times or send many messages to see paging).
7. **Security**: send `<b>hi</b>` → shown as text. Explain server-side membership checks (eve can't read alice↔bob: `npm run smoke` shows the 403 and socket rejection).
8. **Resilience**: stop the server (Ctrl+C) → "Reconnecting…" toast; send a message → it shows failed with retry. Restart → "Back online", conversations and missed messages backfill, retry succeeds without duplicates.
9. **Responsive**: narrow the window / phone view → list first, then chat with the list in a slide-out sheet (☰).

## Project layout
```
docker-compose.yml
docs/                 HLD, LLD (ERD, API, events, sequences), DESIGN_EXPLAINED, DECISIONS
server/
  prisma/             schema.prisma, migrations, seed.ts
  scripts/            smoke.ts (E2E checks), bot.ts (scripted user for demos)
  src/
    lib/              env, prisma, jwt, errors, token bucket
    middleware/       auth, zod validate, rate limiters, error handler
    routes/           auth, users, conversations
    services/         auth, users, conversations, messages, presence (PresenceStore)
    socket/           Socket.IO server, handshake auth, events, realtime facade
    __tests__/        vitest integration tests
client/src/
  components/ui/      shadcn/ui components (owned code)
  components/chat/    Sidebar, ConversationItem, NewChatDialog, ChatPane, MessageList, MessageBubble, Composer, UserMenu, UserAvatar
  pages/              LoginPage, ChatPage
  hooks/              useAuth, useSocket, useChat, useIsMobile
  lib/                api client, types, formatting, cn
```

## Environment variables (server/.env)
| Name | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://chat:chat@localhost:5455/chat?schema=public` | matches docker-compose |
| `JWT_SECRET` | 64 hex chars | required, ≥16 chars |
| `PORT` | `4000` | |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allow-list |
| `NODE_ENV` | `development` | `production` sets the `Secure` cookie flag |
