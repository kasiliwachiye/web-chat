# Design explained: interview talking points

## Why Socket.IO (vs raw WebSocket or SSE)
- Bidirectional: we need client→server events (send, typing, read), so SSE (server→client only) would push sends back onto REST.
- Socket.IO gives us what raw WS makes us build: **acks** (send/ack with server id), **rooms** (`user:{id}`, `conv:{id}`), automatic **reconnect with backoff**, heartbeats, handshake middleware for auth, and a **Redis adapter** for multi-node fan-out.
- Cost: a protocol layer on top of WS (clients must use socket.io-client) and a bit more overhead per frame. Acceptable for chat; at very high scale you could move to raw WS + your own broker protocol.

## Why PostgreSQL
- Chat data is relational: users ↔ memberships ↔ conversations ↔ messages, with real constraints we rely on (unique DM per pair, unique idempotency key, FK cascades).
- Strong consistency for "persist then fan-out", transactions (insert message + bump conversation), and mature ops (managed offerings, PITR, read replicas, encryption at rest).
- Scales further than people expect: keyset index on `(conversation_id, created_at, id)`, then **partitioning by conversation_id** (or Citus) when one node isn't enough. A wide-column store (Cassandra/Scylla) is the next step only at very large message volume.

## REST + WebSocket split
- **REST** for commands with request/response semantics and for reads: login, user search, create DM/group, paginated history. Cacheable, easy to rate limit, easy to test, and it's the source of truth for **backfill**.
- **WebSocket** for things that must be pushed or are latency-sensitive: new messages, typing, presence, read pointers, "you were added to a conversation".
- Message send goes over the socket with an ack for latency, but it is persisted before broadcast, so REST and WS never disagree.

## JWT cookie vs server session
- Chosen: stateless JWT in an **httpOnly, SameSite=Lax, Secure** cookie. No session store needed on any node, so WS and API nodes scale horizontally; the same token authenticates the socket handshake.
- httpOnly: JS (and XSS) can't read it. SameSite=Lax blocks most CSRF; the API only accepts JSON bodies, and in prod we'd add a CSRF token or `SameSite=Strict`.
- Trade-off: **revocation**. A stolen JWT is valid until expiry (8h here). Production fix: short-lived access token (5–15 min) + rotating refresh token stored server-side (revocable), or a server session in Redis. With SSO, the IdP session + token lifetime policies drive this.
- Long-lived sockets: re-validate on reconnect, and the server should disconnect sockets when a user is deprovisioned (SCIM event → `io.in('user:{id}').disconnectSockets()`).

## Delivery semantics and ordering
- **At-least-once from the client + idempotent server = effectively once.** Each message has a client-generated `client_msg_id`; `UNIQUE(sender_id, client_msg_id)` makes retries safe. A retry returns the stored row and is not re-broadcast.
- Client states: `pending` (optimistic) → `sent` (ack with server id) → or `failed` after a 10s ack timeout, with retry using the **same** id.
- Pending messages are re-emitted on reconnect; dedup makes that safe.
- **Ordering**: per conversation by `(created_at, id)`, assigned by the server/DB (not client clocks). No global order across conversations (not needed). Clients sort by that key and dedup by id/clientMsgId, so out-of-order delivery during reconnect still renders correctly.

## Failure handling
- **DB down**: send ack returns an error, the client marks the message failed and lets you retry; `/health` reports `db: down` so the load balancer can pull the node. Nothing is broadcast that isn't persisted.
- **WS node crash**: clients auto-reconnect (backoff) to another node; on `connect` the client refetches conversations and calls `GET /messages?after=<last id>` for every open thread (**backfill**), then re-sends pending messages. Presence in Redis uses TTL heartbeats so a dead node's counts expire.
- **Client offline / flaky network**: socket.io buffers emits; ack timeout → failed → retry. "Reconnecting… / Back online" toasts keep the user informed.
- **Slow consumers / big groups**: move fan-out to a queue (below).

## Scaling path
1. Multiple stateless nodes behind the LB + **Socket.IO Redis adapter** (cross-node rooms). WebSocket-only transport means no sticky sessions.
2. Presence and rate limits move to **Redis** (the `PresenceStore` interface and limiter seams already exist).
3. Postgres **read replicas** for history and conversation lists; PgBouncer for connection pooling.
4. **Partition messages by conversation_id** (hash partitioning / Citus); archive cold history to cheaper storage.
5. **Kafka (or similar) event bus**: `message.created` → fan-out workers, **push notifications** (FCM/APNs/Web Push for offline users), **search indexing** (OpenSearch), audit/eDiscovery export, analytics. Decouples the write path from slow side effects.
6. **Caching**: membership checks and conversation lists in Redis, invalidated on membership change; unread counts kept as counters instead of COUNT queries.

## Security and data protection
- **In transit**: TLS everywhere (HTTPS + WSS), HSTS; TLS or mTLS between services and to the DB.
- **At rest**: encrypted DB volumes / managed DB encryption with KMS-managed keys; encrypted backups; optional per-tenant keys.
- **AuthN**: corporate **SSO via OIDC (Azure AD / Entra ID)** with **MFA** enforced by the IdP; SCIM for joiner/mover/leaver so access is removed immediately.
- **AuthZ**: every REST call and socket event checks conversation membership server-side (`assertMember`); conversation ids from clients are never trusted. Next: **RBAC** (admin, compliance officer, member), group roles (OWNER/MEMBER already modelled).
- **Input handling**: zod validation, 4000-char cap at three layers, plain-text rendering (no `dangerouslySetInnerHTML`), helmet headers, CORS allow-list, JSON body size limit, rate limits on login and send, constant-time-ish login (dummy bcrypt compare for unknown users).
- **Audit logs**: append-only log of security events (logins, membership changes, exports, admin access) shipped to a SIEM.
- **Retention**: configurable retention per org/conversation type; legal hold overrides deletion; soft delete (`deleted_at`) then purge jobs.
- **Kenya Data Protection Act 2019**: lawful basis and purpose limitation (internal business communication), data minimisation, data subject rights (access, rectification, erasure subject to legal hold), breach notification to the ODPC within 72 hours, a DPIA for monitoring features, registration with the ODPC as controller/processor, and data residency / cross-border transfer safeguards (s.48–50) when choosing the cloud region.
- **Why not E2EE (yet)**: enterprises usually need **compliance, eDiscovery, legal hold, DLP and retention**, which require the server (or an escrow) to read content. E2EE also complicates search, multi-device sync, key recovery when employees leave, and moderation. A middle ground: encryption at rest with customer-managed keys (BYOK/HYOK), strict admin access controls and full audit of compliance access.

## Observability
- **Structured JSON logs** (connect/disconnect, errors) with request/socket ids, no message bodies or secrets. Next step: pino + correlation ids.
- **Metrics** (Prometheus/OpenTelemetry): connected sockets per node, messages/sec, ack latency p50/p95/p99, send error rate, DB query latency, reconnect rate, event-loop lag.
- **Tracing** (OpenTelemetry): REST request → DB → fan-out spans; propagate trace id in socket events.
- **SLOs and alerts**: send-ack p99 < 300ms, delivery success > 99.9%, health checks wired to the LB.

## Gaps vs production
- Attachments (object storage + presigned URLs + AV scanning), message edit/delete UI (schema supports it), message search, push/email notifications, read receipts per message in groups.
- Refresh-token rotation and session revocation; SSO/MFA; account lockout; password policy.
- Redis adapter, Redis presence and rate limits (interfaces ready); unread counts are N+1 queries.
- Test coverage: service-level integration tests and an E2E smoke script exist; need unit tests for the client, socket-level tests in CI, load tests (k6/Artillery), and security tests (OWASP ZAP).
- CI/CD (lint, typecheck, test, build, migrate), container images, **Kubernetes** (HPA on connections/CPU, PodDisruptionBudgets, graceful drain of sockets on deploy), secrets in a vault, infrastructure as code, backups and DR drills.
- Accessibility audit, i18n, dark-mode toggle (tokens already support it).

## Why shadcn/ui
- **You own the component code**: components are copied into `src/components/ui` and can be changed freely; no fighting a library's API or waiting for upstream fixes.
- **Accessible by default**: built on **Radix** primitives (focus management, keyboard navigation, ARIA for Dialog, DropdownMenu, Sheet, Tooltip, Command).
- **No runtime lock-in**: not a dependency you upgrade wholesale; just React + Tailwind + small primitives. Easy to replace piece by piece.
- **Fast and consistent UI**: theme tokens (`bg-background`, `text-muted-foreground`, `bg-primary`…) via CSS variables give a coherent look, dark mode for free, and quick re-theming to corporate branding.
