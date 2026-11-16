# Implementation Plan: Kora — Kanban Project Management Platform

**Branch**: `001-kora-kanban-platform` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-kora-kanban-platform/spec.md`

## Summary

Kora is a Kanban project management web app with Trello-style boards and Jira-level structure,
delivered in four phases:

- **P1 (MVP):** accounts, workspaces and roles, boards, columns and cards with drag-and-drop,
  card details, real-time collaboration, notifications.
- **P2:** flow controls, search and views.
- **P3:** time tracking and reports.
- **P4:** issue types, sprints, automation, integrations, export, offline and i18n.

**Technical approach:**

- **Code layout:** a TypeScript pnpm monorepo with a React + Vite SPA (`apps/web`), a NestJS API
  plus a background worker (`apps/api`), and shared Zod schemas, event contracts and permission
  rules (`packages/shared`).
- **Data:** PostgreSQL through Prisma is the single source of truth.
- **Real-time:**
  - Every change bumps a per-board version and writes an event to a transactional outbox in the
    same transaction.
  - The outbox broadcasts each event through Socket.IO (with a Redis adapter).
  - Concurrent edits are resolved with field-level last-write-wins.
- **Supporting services:** Redis also backs the BullMQ jobs (email, reminders, webhooks,
  automations), rate limits and the session cache.
- **Sessions:** server-side sessions in httpOnly cookies.
- **External services:** attachments go to Cloudflare R2 and email goes through Resend.
- **Deployment:** Docker Compose on one VPS behind Caddy.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 22 LTS (API, worker) and modern browsers (web)

**Primary Dependencies**:
- Web:
  - App framework: React 19, Vite, TanStack Router, TanStack Query (+ IndexedDB persister),
    Zustand
  - UI: Tailwind CSS v4, shadcn/ui (Radix), dnd-kit, Tiptap, react-hook-form, Recharts
  - i18n, offline and real-time: i18next, vite-plugin-pwa (Workbox), socket.io-client
- API and worker:
  - Framework and data: NestJS 11 (Express adapter), Prisma, Zod
  - Real-time and jobs: Socket.IO with `@socket.io/redis-adapter`, BullMQ
  - Auth and security: `@node-rs/argon2`, `arctic` (OAuth), `@nestjs/throttler`
  - External services: `@aws-sdk/client-s3` (R2), Resend + React Email, `web-push`
  - Logging: `nestjs-pino`
- Shared: Zod, `fractional-indexing`
- Tooling: pnpm workspaces, Turborepo, ESLint, Prettier

**Storage**:
- PostgreSQL 17, the system of record. Full-text search uses `tsvector` + `pg_trgm`.
- Redis 7: queues, Socket.IO adapter, rate limits, session cache.
- Cloudflare R2: attachments, export files, database backups.

**Testing**:
- Vitest for unit tests (web and api), with SWC for decorators.
- Vitest + Supertest + Testcontainers (real Postgres and Redis) for API integration tests.
- Playwright for E2E, including two-browser real-time, keyboard drag-and-drop and offline specs.

**Target Platform**:
- Server: Linux VPS running Docker Compose (Caddy, api, worker, postgres, redis).
- Clients: the latest 2 versions of Chrome, Firefox, Safari and Edge, as an installable PWA,
  with responsive layouts down to mobile widths.

**Project Type**: Web application. The monorepo has a frontend SPA, a backend API, a background
worker and shared packages.

**Performance Goals**:
- Board changes reach other viewers in ≤ 2 s for 95% of events (SC-002).
- A 500-card board loads in < 3 s with smooth drag (SC-003).
- Search returns in < 1 s at 10k cards (SC-006).
- Offline changes sync within 10 s of reconnecting (SC-009).

**Constraints**:
- Attachments are limited to 10 MB.
- Every permission check happens on the server.
- Card moves are atomic.
- Every drag action has a keyboard alternative.
- The UI ships in 6 languages (en, es, fr, de, zh-CN, vi).
- Boards opened while online stay usable offline.
- Third-party tokens are encrypted at rest.

**Scale/Scope**:
- Sized for 100 or more concurrent users on one VPS (SC-007). This is a personal learning project
  with open sign-up.
- Spec size: 16 user stories, about 90 FRs, about 30 entities and about 40 screens across
  4 phases.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*
Constitution v1.1.0.

| # | Principle / Section | How the design complies | Pre | Post |
|---|---|---|:-:|:-:|
| I | **Kanban Domain Integrity** | Fixed hierarchy Workspace → Board → Column → Card. A move updates (`columnId`, `position`) in a single transaction using fractional indexing, so a card can't be lost or duplicated. Archiving is the default action, and permanent deletion needs confirmation (data-model §2–3, rest-api `/move`, `/archive`). | ✅ | ✅ |
| II | **Secure by Default** | Every route except auth and invite preview requires a session or token. NestJS guards check permissions from the shared matrix ([permissions.md](./contracts/permissions.md)), and non-members get `404`. Passwords use Argon2id and sessions are stored hashed. CSRF is covered by SameSite cookies, an Origin check and a double-submit token. Input goes through Zod; rich text is stored as JSON and never as raw HTML. Secrets come from the environment. | ✅ | ✅ |
| III | **Real-Time Consistency** | The server is the source of truth, and the per-board `version` plus the outbox give ordered, at-least-once broadcasts. Optimistic UI rolls back when the server rejects a change. Field-level last-write-wins with an `overwritten` flag lets clients converge, and reconnecting clients replay or resync ([realtime-events.md](./contracts/realtime-events.md)). | ✅ | ✅ |
| IV | **Tested Critical Paths** | Required suites: an allow and a deny test for every permission row; move/reorder/archive integration tests against real Postgres; a two-browser real-time Playwright spec. CI blocks merges when they fail ([quickstart.md](./quickstart.md)). | ✅ | ✅ |
| V | **Simplicity & Phased Delivery** | The master spec is approved for P1–P4, and implementation follows phase order. One deployable API codebase (the worker is a second entrypoint, not a separate service), and Postgres search instead of a search engine. The extra infrastructure (Redis, R2) is justified below. | ✅ | ✅ |
| TC | **Technical Constraints** | Browser targets and responsive layout ✅. Durable server-side storage ✅. Every row records who created or changed it and when, plus `ActivityEvent` ✅. 500-card performance through virtualization ✅. Keyboard alternative for drag-and-drop via dnd-kit and a "Move to…" menu ✅. | ✅ | ✅ |
| WF | **Development Workflow** | Work follows spec → plan → tasks. Versioned Prisma migrations. PR review with CI tests. | ✅ | ✅ |

**Result: PASS.** There are no violations. The table below records the infrastructure choices
that Principle V asks to be justified.

## Project Structure

### Documentation (this feature)

```text
specs/001-kora-kanban-platform/
├── spec.md              # Master phased specification
├── plan.md              # This file
├── research.md          # Phase 0: stack decisions + rationale
├── data-model.md        # Phase 1: entities, fields, rules, state machines
├── quickstart.md        # Phase 1: setup + validation scenarios per phase
├── contracts/
│   ├── rest-api.md          # HTTP endpoints (web + public API)
│   ├── realtime-events.md   # Socket.IO events
│   ├── permissions.md       # Role → permission matrix
│   └── webhooks.md          # Outbound webhook format
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
kora/
├── apps/
│   ├── api/                          # NestJS API + worker
│   │   ├── prisma/
│   │   │   ├── schema/           # multi-file Prisma schema, one file per domain
│   │   │   ├── migrations/
│   │   │   └── seed/                 # demo, history (reports), large (perf) seeds
│   │   ├── src/
│   │   │   ├── main.ts               # HTTP + Socket.IO entrypoint
│   │   │   ├── worker.ts             # BullMQ worker entrypoint
│   │   │   ├── common/               # guards (auth, permission, csrf), pipes (zod), filters, i18n errors
│   │   │   ├── infra/                # prisma, redis, storage (R2), mail (Resend + templates), push, crypto, outbox
│   │   │   └── modules/
│   │   │       ├── auth/             # P1 sessions, password, OAuth, verification
│   │   │       ├── users/            # P1 profile, preferences
│   │   │       ├── workspaces/       # P1 workspaces, members, invitations
│   │   │       ├── boards/           # P1 boards, board members, labels, archive
│   │   │       ├── columns/          # P1 (+ P2 WIP, policies)
│   │   │       ├── cards/            # P1 cards, moves, assignees, checklists, activity
│   │   │       ├── attachments/      # P1
│   │   │       ├── comments/         # P1
│   │   │       ├── realtime/         # P1 Socket.IO gateway, presence, catch-up
│   │   │       ├── notifications/    # P1 in-app, email, push, reminders, digests
│   │   │       ├── search/           # P2 search, saved views, my tasks
│   │   │       ├── flow/             # P2 swimlanes, aging, blocked
│   │   │       ├── time-tracking/    # P3 timers, pomodoro, recurrence
│   │   │       ├── reports/          # P3 CFD, cycle time, throughput, snapshots
│   │   │       ├── structure/        # P4 issue types, backlog, links, custom fields, workflows
│   │   │       ├── sprints/          # P4
│   │   │       ├── automation/       # P4 rules engine, templates
│   │   │       ├── integrations/     # P4 slack, github, gitlab, google
│   │   │       ├── public-api/       # P4 access tokens, OpenAPI
│   │   │       ├── webhooks/         # P4
│   │   │       └── data-transfer/    # P4 export / import
│   │   └── test/
│   │       ├── integration/          # Supertest + Testcontainers, per module
│   │       └── permissions/          # allow/deny matrix tests (Constitution IV)
│   └── web/                          # React + Vite SPA (PWA)
│       ├── public/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── routes/               # TanStack Router file routes
│       │   ├── features/             # auth, workspaces, board, card, notifications, search,
│       │   │                         # views, time, reports, sprints, automation, integrations, settings
│       │   ├── components/ui/        # shadcn/ui components
│       │   ├── lib/                  # api client, query client + persister, socket, offline queue
│       │   ├── stores/               # Zustand stores
│       │   ├── i18n/locales/{en,es,fr,de,zh-CN,vi}/
│       │   └── sw.ts                 # service worker (Workbox)
│       └── tests/                    # Vitest component/unit tests
├── packages/
│   ├── shared/                       # Zod schemas, types, permissions matrix, event contracts,
│   │   └── src/                      # ordering helpers, constants, error codes
│   └── config/                       # shared tsconfig, eslint, prettier presets
├── e2e/                              # Playwright specs (multi-browser real-time, dnd, offline)
├── infra/
│   ├── docker-compose.yml            # production: caddy, api, worker, postgres, redis
│   ├── docker-compose.dev.yml        # local: postgres, redis (+ optional minio, mailpit)
│   ├── Caddyfile
│   └── backup/                       # pg_dump → R2 script + cron
├── .github/workflows/ci.yml          # lint, typecheck, test, e2e, i18n check
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

**Structure Decision**: a pnpm + Turborepo monorepo with two apps, `apps/web` and `apps/api`,
plus `packages/shared`. The API and worker share one codebase and run from two entrypoints, so
domain logic never has to be duplicated. Backend modules map one-to-one to spec areas and are
tagged by phase, so each phase adds modules without restructuring the code (Constitution V:
every phase can ship on its own).

## Delivery Phases (implementation order)

| Phase | Modules / features | Exit criteria |
|---|---|---|
| **0. Foundation** | Monorepo, CI, Docker dev stack, Prisma setup, shared package, i18n scaffolding (en only at first), design system, error handling, logging | `pnpm dev`, `pnpm test` and CI are green; `/healthz` responds |
| **P1 MVP** | auth, users, workspaces, boards, columns, cards, attachments, comments, realtime, notifications | Quickstart steps 1–7 pass; permission matrix and real-time suites are green; SC-001–005 met |
| **P2 v1** | flow (WIP, swimlanes, aging, blocked, policies), search, views (List, Calendar, Timeline), my tasks | Quickstart 8–11; SC-006 |
| **P3 v2** | time-tracking, pomodoro, recurrence, reports | Quickstart 12–13; SC-011 |
| **P4 Later** | structure, sprints, automation and templates, public API and webhooks, integrations, export/import, offline PWA, the remaining 5 languages, themes and shortcuts | Quickstart 14–19; SC-008–010 |

Some groundwork lands early but stays inactive until its phase:

- The i18n framework is built in Phase 0, so P1 has no hard-coded strings.
- `Board.mode` exists from P1.
- The outbox from P1 later feeds webhooks and automations.

## Key Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Offline sync conflicts (P4) | Lost or confusing edits | Idempotent mutations with client ids, field-level LWW, conflicts surfaced to the user. Scope limited to boards already opened online |
| P4 scope (integrations, sprints, automation) is very large for a solo learning project | The schedule slips | Phase gates: P4 items are separate milestones and can be cut without affecting P1–P3 |
| Chinese full-text search quality with Postgres | Weak search for zh-CN content | `pg_trgm` fallback. Revisit Meilisearch if users complain |
| Third-party OAuth apps (Slack, GitHub, Google) need review before public use | Integrations limited to test users | Use development/test modes during the learning phase; document the verification steps |
| A single VPS is a single point of failure | Downtime | Nightly backups to R2, documented restore drill, health checks plus a restart policy |

## Complexity Tracking

> Under Principle V, any added service or dependency must be justified. None of these is a
> constitutional violation.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Redis (additional service) | BullMQ jobs (reminders, digests, webhooks with retries), the Socket.IO adapter, rate limits, session cache | pg-boss alone covers jobs but not the Socket.IO adapter or fast rate limiting. The product owner chose Redis + BullMQ |
| Separate worker process | Email, webhooks, automations, imports and reports must not slow down API requests | Running jobs inside the API process would make response times depend on job load |
| Transactional outbox table | Guarantees every committed change is broadcast (Constitution III) and feeds webhooks and automations from one source | Emitting directly after commit can lose events if the process crashes between the commit and the emit |
| Cloudflare R2 (external) | Durable attachment storage that isn't tied to the VPS disk, plus backups | Local disk is lost with the VPS and harder to back up. The product owner chose R2 |
| Turborepo | Cached builds and tests across 3+ packages | Plain pnpm scripts rebuild everything on every run; acceptable, but slower CI |
