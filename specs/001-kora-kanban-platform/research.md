# Research & Decisions: Kora

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-11-10

Decisions marked **(PO)** were chosen by the product owner during `/speckit-plan`. The rest are
supporting choices that follow from them; each can be revisited before implementation starts.

---

## Part A — Stack decisions confirmed by the product owner

### A1. Language: TypeScript full-stack (PO)
- **Decision**: TypeScript (strict) on frontend and backend; Node.js 22 LTS runtime.
- **Rationale**: Shared types and validation between client and server; real-time event
  payloads and offline mutation queues are defined once.
- **Alternatives**: Python/Go/Java/C# backends: rejected because of duplicated types and two toolchains.

### A2. Frontend: React + Vite SPA (PO)
- **Decision**: React 19 single-page app built with Vite; client-side routing with TanStack Router.
- **Rationale**: Highly interactive, logged-in app; SPA simplifies offline (service worker serves the
  shell) and has the largest drag-and-drop/i18n ecosystem.
- **Alternatives**: Next.js (SSR adds little behind login, complicates offline), Vue/Nuxt, SvelteKit.

### A3. Database: PostgreSQL 17 (PO)
- **Decision**: PostgreSQL as the single system of record.
- **Rationale**: Relational model (workspace → board → column → card), transactions for atomic
  moves (Constitution I), built-in full-text search, JSONB for custom fields and automation rules.
- **Alternatives**: MySQL (weaker FTS/JSON), MongoDB (multi-document atomic moves harder).

### A4. Hosting: Docker Compose on a single VPS (PO)
- **Decision**: `docker compose` stack: Caddy (TLS + static web), `api`, `worker`, `postgres`,
  `redis`. Object storage external (R2).
- **Rationale**: Cheap, fully controllable, good learning value; fits SC-007 (≥100 concurrent users).
- **Alternatives**: PaaS, Vercel + managed services, AWS/GCP.

### A5. Backend framework: NestJS 11 (PO)
- **Decision**: NestJS on the Express adapter, organized as one module per domain area.
- **Rationale**: Modules + DI suit a large phased codebase; Guards enforce authorization on every
  route (Constitution II); first-class WebSocket gateways and BullMQ integration.
- **Alternatives**: Fastify, Express, Hono.

### A6. Data access: Prisma (PO)
- **Decision**: Prisma ORM + Prisma Migrate (versioned migrations, Constitution workflow).
- **Rationale**: Generated types, easy migrations. Full-text search and fractional reordering
  queries use `$queryRaw` with typed results where Prisma's query API falls short.
- **Alternatives**: Drizzle, TypeORM, Kysely.

### A7. Real-time: Socket.IO self-hosted (PO)
- **Decision**: Socket.IO server in the `api` process, `@socket.io/redis-adapter` so multiple API
  instances can share rooms later.
- **Rationale**: Auto-reconnect, rooms per board, acknowledgements, cookie auth on handshake.
- **Alternatives**: raw `ws`, Pusher/Ably.

### A8. Object storage: Cloudflare R2 (PO)
- **Decision**: R2 bucket via the S3-compatible API (`@aws-sdk/client-s3` + presigner).
- **Rationale**: No egress fees, free tier; S3 API keeps provider portable.
- **Alternatives**: AWS S3, MinIO, local disk.

### A9. UI: Tailwind CSS v4 + shadcn/ui (PO)
- **Decision**: Tailwind with CSS variables for themes; shadcn/ui (Radix primitives) components.
- **Rationale**: Accessible primitives, trivial light/dark/system themes (FR-152), full control.
- **Alternatives**: Mantine, MUI, Chakra.

### A10. Sessions: server-side sessions in httpOnly cookies (PO)
- **Decision**:
  - On sign-in, generate a 256-bit random session ID; store **only its SHA-256 hash** in the
    `Session` table (userId, expiresAt, lastSeenAt, userAgent, ip).
  - Cookie `kora_sid`: `HttpOnly; Secure; SameSite=Lax; Path=/`; 30-day sliding expiry,
    refreshed at most once per hour.
  - Session lookup per request from Postgres with a short Redis cache (60 s) to keep lookups cheap;
    cache is invalidated on sign-out.
  - "Sign out all devices" (FR-007) deletes all of the user's sessions and disconnects their sockets.
  - Session ID is rotated on sign-in and on privilege-sensitive changes (password change).
- **Rationale**: Instant revocation, no token exposure to JS, automatic on Socket.IO handshake.
  Matches how Atlassian/Trello web apps work (see conversation comparison).
- **Alternatives**: JWT access+refresh (hard revocation), auth library (less learning value).

### A11. Email: Resend (PO)
- **Decision**: Resend API; templates written with React Email in the API package; sending always
  happens in the worker via a queue (retries, digest batching).
- **Alternatives**: Amazon SES, generic SMTP.

### A12. Repo layout: pnpm monorepo + Turborepo (PO)
- **Decision**: `apps/web`, `apps/api`, `packages/shared`, `packages/config`; Turborepo for
  cached build/test/lint pipelines.
- **Rationale**: Shared types/schemas/event contracts compiled once; one PR per feature.
- **Alternatives**: two repos (type drift), single folder (mixed build targets).

### A13. Client data: TanStack Query + Zustand (PO)
- **Decision**: TanStack Query for all server state (cache, optimistic updates with rollback,
  offline-paused mutations persisted to IndexedDB); Zustand for local UI state (open dialogs,
  drag state, active timer UI).
- **Alternatives**: Redux Toolkit + RTK Query, local-first sync engine.

### A14. Testing: Vitest + Playwright (PO)
- **Decision**: Vitest for unit/integration (web + api), Supertest for HTTP integration,
  Testcontainers (real Postgres + Redis) for API integration tests, Playwright for E2E incl.
  two-browser real-time tests and keyboard drag-and-drop. NestJS configured with SWC so Vitest
  supports decorators.
- **Alternatives**: Jest + Cypress, Jest + Playwright.

### A15. Jobs & search: Redis + BullMQ, Postgres full-text search (PO)
- **Decision**: Redis 7 for BullMQ queues, Socket.IO adapter, rate limits, session cache.
  BullMQ queues run in a separate `worker` process (same codebase, different entrypoint).
  Search via Postgres FTS.
- **Alternatives**: Meilisearch (extra service), pg-boss (no Redis).

---

## Part B — Supporting decisions (derived; open to review)

### B1. Password hashing
- **Decision**: Argon2id via `@node-rs/argon2` (memory 19 MiB, iterations 2, parallelism 1 —
  OWASP minimum). Password rules: min 10 chars, checked against a small breached-password list.
- **Alternatives**: bcrypt (older, 72-byte limit), scrypt.

### B2. OAuth (Google, GitHub)
- **Decision**: Authorization-code flow with PKCE using the lightweight `arctic` library (no
  Passport). `state` + `code_verifier` stored in a short-lived signed cookie. Account linking only
  when the provider reports a **verified** email equal to an existing account (FR-003).
- **Rationale**: Keeps the hand-written session model (A10) transparent; Passport's session
  integration adds indirection.
- **Alternatives**: Passport strategies.

### B3. CSRF protection
- **Decision**: `SameSite=Lax` cookie + strict `Origin` header check on all state-changing
  requests + double-submit CSRF token (`kora_csrf` cookie echoed in `X-CSRF-Token` header).
- **Scope** (confirmed 2026-11-15): applies to **all** non-GET/HEAD/OPTIONS requests, including
  public ones such as login and register (prevents login CSRF). Exempt only: requests using
  Bearer tokens, and signature-verified inbound webhooks marked `@SkipCsrf()` (`/hooks/*`).
- **Rationale**: Defense in depth for cookie-based sessions.

### B4. Validation & shared contracts
- **Decision**: Zod schemas in `packages/shared` used by the web forms (react-hook-form resolver),
  by NestJS (via a Zod validation pipe), and for Socket.IO event payloads. OpenAPI generated from
  the schemas for the public API docs (FR-130).

### B5. Ordering of columns and cards
- **Decision**: Fractional indexing (string keys, `fractional-indexing` library). A move updates
  one row (`columnId`, `position`) in a single transaction. If keys grow too long (> 50 chars),
  a background job rebalances the column.
- **Rationale**: Constant-cost moves; no renumbering; deterministic order for concurrent inserts
  (ties broken by card id).
- **Alternatives**: integer positions with renumbering (many-row writes per move), linked lists.

### B6. Concurrency & real-time consistency (Constitution III)
- **Decision**:
  - Every board has a monotonically increasing `version` (bigint), incremented in the same
    transaction as any change; each change emits an event `{boardVersion, type, payload, actorId}`.
  - **Transactional outbox**: events are written to an `OutboxEvent` table inside the transaction;
    a dispatcher publishes them to Socket.IO room `board:{id}` (via Redis), then to webhooks,
    automations, and notifications. This prevents "saved but never broadcast" bugs.
  - **Field-level last-write-wins**: card updates send only changed fields; the server applies
    them in arrival order. If a field was changed by someone else since the client's
    `baseVersion`, the response flags it so the UI can tell the user they overwrote/were overwritten
    (spec US5 scenario 2).
  - **Catch-up**: on reconnect the client sends its last seen `boardVersion`; the server replays
    events from the outbox (kept 24 h) or replies `resync` → client refetches the board.
- **Alternatives**: CRDTs (overkill for structured data), OT.

### B7. Drag & drop
- **Decision**: `@dnd-kit` (core + sortable) with keyboard sensors and screen-reader announcements;
  plus a "Move to…" menu (Constitution: accessibility). Virtualized columns via
  `@tanstack/react-virtual` to meet the 500-card target (SC-003).
- **Alternatives**: `@hello-pangea/dnd` (less flexible for swimlanes/calendar).

### B8. Rich text
- **Decision**: Tiptap editor; content stored as ProseMirror JSON plus a server-derived
  plain-text copy for search. Rendered from JSON (no raw HTML), so stored XSS is not possible
  through descriptions/comments. Mentions via Tiptap mention extension.

### B9. Attachments
- **Decision**: Client requests an upload slot → API checks permission and size (≤ 10 MB,
  FR-032) → returns a presigned PUT URL with signed `Content-Length` → client uploads directly
  to R2 → client confirms → API verifies object size via HEAD before creating the `Attachment`.
  Downloads via short-lived (5 min) presigned GET URLs after a permission check. Unconfirmed
  uploads are deleted by a daily job.

### B10. Search (Postgres FTS)
- **Decision**: Generated `tsvector` column (`simple` config — language-neutral, since content
  may be in any of 6 languages) over title + description text, GIN indexed; comments indexed the
  same way. `pg_trgm` trigram index for substring/fuzzy matches and for Chinese text, which
  `simple` does not tokenize well. Results always filtered by the user's accessible boards in SQL.
- **Risk**: Chinese search quality is basic; acceptable for MVP, revisit with Meilisearch if needed.

### B11. Notifications
- **Decision**: In-app via Socket.IO user room `user:{id}` + `Notification` table. Email via Resend
  (instant or daily digest, FR-052). Browser push via the Web Push protocol with VAPID keys
  (`web-push` library); subscriptions stored per device. Due-soon/overdue reminders are BullMQ
  delayed jobs re-scheduled when due dates change.

### B12. Offline / installable app (FR-150)
- **Decision**: `vite-plugin-pwa` (Workbox) for app-shell caching and install prompt. TanStack
  Query cache persisted to IndexedDB; mutations made offline are queued (paused) and replayed in
  order on reconnect, each with a client-generated id for idempotency. Server rejects (e.g., lost
  access, workflow violation) are surfaced to the user (spec US16 scenario 2).
- **Scope**: Offline editing is limited to boards opened at least once while online.

### B13. Internationalization
- **Decision**: `i18next` + `react-i18next`, namespaced JSON files per language, lazy-loaded.
  Languages: `en` (fallback), `es`, `fr`, `de`, `zh-CN`, `vi` (FR-151). Dates/numbers via `Intl`.
  Emails rendered in the recipient's language. CI check fails on missing keys in `en`.

### B14. Rate limiting & abuse protection
- **Decision**: `@nestjs/throttler` with Redis storage: sign-in/reset endpoints (FR-005),
  per-token public API limits (FR-136, default 100 req/min), invite sending.

### B15. Charts (reports, FR-090)
- **Decision**: Recharts for CFD, throughput, cycle-time scatter, burndown/burnup. Metrics are
  computed from `ActivityEvent` column-transition history; a nightly job materializes daily
  snapshots (`BoardDailySnapshot`) for fast CFD queries.

### B16. Calendar & Timeline views (FR-072)
- **Decision**: Calendar built on a lightweight in-house month/week grid using `date-fns` with
  dnd-kit for rescheduling; Timeline as a custom horizontal grid. Avoids heavy commercial
  scheduler libraries. Re-evaluate if effort grows.

### B17. Automation engine (FR-120/121)
- **Decision**: Rules stored as JSON (trigger, conditions, actions) validated by Zod. Executed by
  the worker from outbox events. Loop protection: each event carries an `automationDepth`;
  actions caused by automation increment it; execution stops at depth 3 and the rule run is
  logged as "loop prevented".

### B18. Integrations
- **Slack**: Slack app with OAuth install per workspace; posts via `chat.postMessage` to chosen
  channels (FR-132).
- **GitHub**: GitHub App (installation per org/repo), webhook events for push/PR; card references
  in the form `KORA-123` (board key + card number). **GitLab**: project webhooks with secret
  token (FR-133).
- **Google Drive**: Google Picker with incremental `drive.file` scope; stored as link attachments
  (FR-134). **Google Calendar**: per-user OAuth with `calendar.events` scope; a dedicated
  "Kora" calendar is created and kept in sync by worker jobs (FR-135).
- **Outbound webhooks**: HMAC-SHA256 signed (`X-Kora-Signature`), retry with exponential backoff
  (up to 8 attempts over ~24 h), delivery log (FR-131).
- All third-party tokens encrypted at rest (AES-256-GCM, key from environment).

### B19. Public API (FR-130)
- **Decision**: REST under `/api/v1`, authenticated by personal access tokens
  (`kora_pat_…`, stored hashed, scoped: `read`, `write`, `admin`). OpenAPI docs served at
  `/api/v1/docs`. The web app uses the same endpoints with cookie sessions (one API, two auth
  methods).

### B20. Export / import (FR-140/141)
- **Decision**: Kora export = versioned JSON (`formatVersion: 1`) zipped with a manifest;
  CSV export for cards only. Import runs as a worker job inside a single DB transaction
  (all-or-nothing); attachments are referenced by URL in the export and re-copied on import.

### B21. Observability & ops
- **Decision**: Structured JSON logs (`pino` via `nestjs-pino`) with request IDs; health endpoint
  `/healthz`; nightly `pg_dump` uploaded to R2 (7 daily + 4 weekly retention). Error tracking
  (e.g., Sentry) optional, not required.

---

## Unresolved items

None. All Technical Context items are resolved.
