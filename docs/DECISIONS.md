# Decisions log

Defaults chosen during the timed build, so they can be challenged in review.

| # | Decision | Why |
|---|---|---|
| 1 | **PostgreSQL 16 in Docker**, exposed on host port **5455** | Docker was available (started Docker Desktop). 5433 was already taken by another local container, so the compose file maps 5455→5432. No SQLite fallback needed. |
| 2 | **Prisma 6** (not 7) | Prisma 7 requires driver adapters and a `prisma.config.ts`; 6 is the stable, well-known path and the schema is identical. |
| 3 | `bcryptjs` instead of native `bcrypt` | Same algorithm, no native build step on Windows/CI. Cost factor 10. |
| 4 | JWT (HS256, 8h) in an **httpOnly, SameSite=Lax** cookie; `Secure` in production | Not readable by JS (XSS can't steal it). `/auth/me` also returns the token so the socket handshake can send `auth.token` when the API is cross-origin. |
| 5 | **Vite dev proxy** (`/api`, `/socket.io` → :4000) | Keeps the cookie same-origin in dev so no third-party-cookie/CORS issues; mirrors a production setup where the SPA and API sit behind one ingress. |
| 6 | Socket.IO with `transports: ['websocket']` | No long-polling means no sticky sessions needed once the Redis adapter is added. |
| 7 | Messages are **sent over the socket** (with ack), history over REST | Lowest latency for send; REST stays the source of truth for backfill. |
| 8 | Idempotency key `UNIQUE(sender_id, client_msg_id)`; retry returns the stored row and is **not re-broadcast** | At-least-once from the client + dedup on the server = effectively once. |
| 9 | DM uniqueness via `direct_key = sorted(userA,userB)` with a unique index | Simple, portable, race-safe (P2002 → return the winner). |
| 10 | Keyset pagination on `(created_at, id)`; `cursor` = older-than, `after` = newer-than | Stable under concurrent inserts, no OFFSET scans; `after` powers reconnect backfill. |
| 11 | Presence: in-memory `Map<userId, socketCount>` behind a `PresenceStore` interface | Multi-tab correct; Redis implementation can be dropped in for multi-node. `last_seen_at` persisted on final disconnect. |
| 12 | Presence audience = users who share a conversation | Avoids broadcasting to the whole company; matches "contacts". |
| 13 | Unread count = messages from others after `last_read_message_id` | Read pointer per member is cheap; computed per conversation (N+1, fine for the prototype — see gaps). |
| 14 | Rate limits: login 20/15min/IP (express-rate-limit), API 300/min/IP, socket send token bucket (burst 10, 2/s per user), typing 1/s | In-memory; move to Redis for multi-node. |
| 15 | Message body max 4000 chars, enforced in zod, the service and the DB column (`varchar(4000)`) | Defence in depth. Text rendered as React text only (no `dangerouslySetInnerHTML`). |
| 16 | **shadcn/ui (Radix base, "nova" preset, neutral base color, CSS variables)** for the client | Requested change. Setup took ~6 minutes, inside the 10-minute time box, so no plain-Tailwind fallback was needed. |
| 17 | Replaced the generated `import { cn } from "cn"` with the standard local `@/lib/utils` (`clsx` + `tailwind-merge`) and **uninstalled the `cn` npm package** | The current shadcn CLI emitted imports from an unfamiliar third-party package. I didn't want an unreviewed dependency in every component, so I used the canonical local helper. |
| 18 | Mobile: list full-screen until a conversation is chosen, then chat with the list in a `Sheet` | Satisfies both "views switch on mobile" and "sidebar becomes a Sheet". |
| 19 | No refresh tokens / server-side session revocation | Time box. Listed in gaps with the production approach. |
| 20 | Seed resets the database (deletes all rows) | Deterministic demo. Never run against a real environment. |

Environment note: this machine has `NODE_TLS_REJECT_UNAUTHORIZED=0` set globally (Node prints a warning on every `npx` call). Not caused by this project, but it disables TLS verification for every Node process on the machine and should be removed.
