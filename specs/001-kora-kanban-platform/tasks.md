---

description: "Task list for Kora — Kanban Project Management Platform"
---

# Tasks: Kora — Kanban Project Management Platform

**Input**: Design documents from `/specs/001-kora-kanban-platform/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: The spec does not ask for TDD. **Constitution Principle IV does require** automated tests for
(a) authentication and permission checks, including denied cases, (b) board/column/card create, update, archive and move/reorder, and
(c) real-time event delivery. Those test tasks are included below. Other stories get targeted
integration tests only where a rule is easy to get wrong.

**Organization**: Tasks are grouped by user story. MVP = Phases 1–8 (US1–US6).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: User story from spec.md (US1–US16)

## Path Conventions (from plan.md)

- API + worker: `apps/api/src/...`. Prisma multi-file schema: `apps/api/prisma/schema/*.prisma`
- API tests: `apps/api/test/integration/`, `apps/api/test/permissions/`
- Web SPA: `apps/web/src/...`
- Shared code: `packages/shared/src/...`
- End-to-end tests: `e2e/`
- Infra: `infra/`

**Rules that apply to every task**:

- Every mutation endpoint uses the Zod schema from `packages/shared`.
- Every route declares `@RequirePermission(...)` from `packages/shared/src/permissions`.
- Every board mutation runs through `BoardTxService`, which bumps `Board.version` and writes
  `ActivityEvent` + `OutboxEvent` in one transaction.
- Every user-facing string goes through i18next. No hard-coded UI text.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo, tooling, local dev stack

- [x] T001 Create the monorepo root with these files:
  - `package.json`: `"private": true`, `packageManager` pnpm@10, and scripts `dev`, `build`, `lint`, `typecheck`, `test`, `e2e`, `i18n:check` that delegate to `turbo`.
  - `pnpm-workspace.yaml`: packages `apps/*`, `packages/*`, `e2e`.
  - `turbo.json`: pipelines `build`, `dev` (persistent, no cache), `lint`, `typecheck`, `test`.
  - `.gitignore`, `.nvmrc` (`22`), `.editorconfig`.
- [x] T002 [P] Create `packages/config` with:
  - `tsconfig.base.json`: strict, `noUncheckedIndexedAccess`, ES2023, moduleResolution `bundler`.
  - `eslint.config.js`: flat config with typescript-eslint and react-hooks.
  - `prettier.config.js`.
  - A `package.json` exporting all three.
- [x] T003 [P] Scaffold `packages/shared` with `package.json` (name `@kora/shared`, tsup build to ESM+CJS, `exports` map), `tsconfig.json` extending `@kora/config`, and `src/index.ts`. Add dependencies `zod`, `fractional-indexing`.
- [x] T004 [P] Scaffold the NestJS 11 app in `apps/api`:
  - Entrypoint `src/main.ts`: Express adapter, `cookie-parser`, global prefix `api/v1` (`/healthz` excluded), listens on `PORT` (default 3000).
  - Also create `src/app.module.ts`, `nest-cli.json` with the SWC builder, `tsconfig.json`, and a `package.json` that depends on `@kora/shared` via `workspace:*`.
- [x] T005 [P] Scaffold the React 19 + Vite SPA in `apps/web` using `@tanstack/react-router` with the file-based route plugin. Create `src/main.tsx`, `src/routes/__root.tsx`, `vite.config.ts`, `index.html` and `tsconfig.json`, and depend on `@kora/shared` via `workspace:*`.
- [x] T006 [P] Configure Tailwind CSS v4 and initialize shadcn/ui in `apps/web` (`components.json`, `src/styles/globals.css`):
  - Theme tokens as CSS variables, with both `:root` and `.dark` palettes.
  - The 12 label color tokens: `red, orange, amber, yellow, lime, green, teal, cyan, blue, indigo, purple, pink`.
- [x] T007 [P] Create `infra/docker-compose.dev.yml` with these services:
  - `postgres:17` on 5432, with a volume.
  - `redis:7` on 6379.
  - `axllent/mailpit` on 8025/1025.
  - Optional `minio` under the `profiles: [minio]` profile.
- [x] T008 [P] Create `.env.example` at the repo root with these variables:
  - `DATABASE_URL`, `REDIS_URL`, `APP_URL`, `API_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` (32-byte base64)
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `S3_ENDPOINT` (override for MinIO)
  - `RESEND_API_KEY`, `MAIL_FROM`
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  - Placeholders for P4 integrations: `SLACK_*`, `GITHUB_APP_*`, `GITLAB_WEBHOOK_SECRET`
- [x] T009 [P] Configure Vitest:
  - `apps/api/vitest.config.ts`: `unplugin-swc` for decorators, test globs `src/**/*.spec.ts` and `test/**/*.spec.ts`.
  - `apps/web/vitest.config.ts`: jsdom, `@testing-library/react`.
  - `packages/shared/vitest.config.ts`.
- [x] T010 [P] Create the Playwright package `e2e/`:
  - `package.json` and `playwright.config.ts`.
  - `webServer` runs `pnpm dev`, `baseURL` is `http://localhost:5173`.
  - Projects: chromium, firefox, webkit.
  - Add a `fixtures.ts` stub.
- [x] T011 [P] Create the GitHub Actions workflow `.github/workflows/ci.yml`:
  - Service containers: postgres 17 and redis 7.
  - Steps: `pnpm install --frozen-lockfile`, lint, typecheck, test, `i18n:check`, Playwright e2e on chromium.
- [x] T012 Configure the dev proxy in `apps/web/vite.config.ts`: `/api` and `/rt` (with `ws: true`) forward to `http://localhost:3000`, so cookies are same-origin in development.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure used by every story. **No user-story work starts until this phase is done.**

### Shared package

- [ ] T013 [P] Create `packages/shared/src/constants.ts`:
  - `LOCALES = ['en','es','fr','de','zh-CN','vi'] as const`, `DEFAULT_LOCALE = 'en'`
  - Length limits: `CARD_TITLE_MAX = 200`, `BOARD_NAME_MAX = 100`, `COLUMN_NAME_MAX = 60`, `WORKSPACE_NAME_MAX = 80`, `LABEL_NAME_MAX = 40`, `USER_NAME_MAX = 100`, `CHECKLIST_TITLE_MAX = 100`, `CHECKLIST_ITEM_MAX = 300`, `BLOCKED_REASON_MAX = 500`
  - `ATTACHMENT_MAX_BYTES = 10_485_760`, `PASSWORD_MIN = 10`
  - `LABEL_COLORS` (the 12 tokens from T006)
- [ ] T014 [P] Create `packages/shared/src/errors.ts`. Export an `ErrorCode` enum (`UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION, CONFLICT, RATE_LIMITED, PAYLOAD_TOO_LARGE, WIP_LIMIT, WORKFLOW_VIOLATION, LAST_OWNER, SESSION_REVOKED`) and the `ApiError` envelope type `{ error: { code, message, details? } }`.
- [ ] T015 [P] Create the permissions module in `packages/shared/src/permissions/`:
  - `roles.ts`: `WorkspaceRole = OWNER|ADMIN|MEMBER|VIEWER`, `BoardRole = ADMIN|MEMBER|VIEWER`.
  - `matrix.ts`: `Permission` string union plus maps `workspacePermissions: Record<WorkspaceRole, Permission[]>` and `boardPermissions: Record<BoardRole, Permission[]>`. Copy every row of `specs/001-kora-kanban-platform/contracts/permissions.md` verbatim.
  - `effective-role.ts`: `effectiveBoardRole({workspaceRole, boardVisibility, boardMemberRole})`, implementing the "Effective board role" rules in permissions.md exactly.
  - `index.ts`: re-exports.
- [ ] T016 [P] Unit-test `effectiveBoardRole` and the permission matrix in `packages/shared/src/permissions/effective-role.spec.ts`. Cover all five rule lines in permissions.md, including "workspace VIEWER → board VIEWER at most" and "non-workspace member → null".
- [ ] T017 [P] Create `packages/shared/src/ordering.ts` wrapping `fractional-indexing`:
  - `positionBetween(before?: string, after?: string): string`
  - `needsRebalance(key: string)`: true when `key.length > 50`
  - `rebalance(count)`: returns evenly spaced keys
  - Unit tests in `ordering.spec.ts`
- [ ] T018 [P] Create `packages/shared/src/events/envelope.ts` with the Zod `BoardEventEnvelope` `{boardId, boardVersion: bigint-as-string, type, actorId|null, clientMutationId|null, at, payload}` and the `UserEvent` envelope, exactly as specified in `contracts/realtime-events.md`.
- [ ] T019 [P] Create `packages/shared/src/schemas/common.ts`: `uuid`, `cursorQuery` `{cursor?: string, limit: 1..100 default 50}`, `paginated<T>()`, `localeSchema = z.enum(LOCALES)`, and `richTextDoc` (ProseMirror JSON: `{type:'doc', content: array}`).

### API infrastructure

- [ ] T020 Configure the Prisma multi-file schema in `apps/api/prisma/schema/base.prisma`: `generator client` (with `prismaSchemaFolder` if the installed Prisma version needs it), `datasource db` postgresql. Add scripts `prisma:migrate`, `prisma:generate`, `db:seed` to `apps/api/package.json`.
- [ ] T021 Define `User` and `Session` in `apps/api/prisma/schema/identity.prisma`, following data-model.md §1:
  - `User` fields:
    - `id` uuid v7, `email` citext unique, `emailVerifiedAt?`, `passwordHash?`
    - `name` ("1–100 chars"), `avatarUrl?`
    - `locale` enum `en|es|fr|de|zh_CN|vi` default `en`, `theme` enum `light|dark|system` default `system`, `timezone` default `UTC`
    - `deletedAt?`, `createdAt`, `updatedAt`
  - `Session` fields: `id`, `userId`, `tokenHash` unique, `expiresAt`, `lastSeenAt`, `userAgent?`, `ip?`, `createdAt`. Index on `userId`.
  - Enable the `citext` extension, then run the first migration `init_identity`.
- [ ] T022 [P] Create `apps/api/src/infra/config/env.ts`, a Zod-validated env loader covering every variable in `.env.example`. P4-only variables are optional. Fail fast on boot when a variable is invalid. Expose it through `ConfigModule` in `apps/api/src/infra/config/config.module.ts`.
- [ ] T023 [P] Create `PrismaService` (`onModuleInit` connects, uses `uuidv7` ids via a client extension) and a global `PrismaModule` in `apps/api/src/infra/prisma/`.
- [ ] T024 [P] Create a global `RedisModule` in `apps/api/src/infra/redis/redis.module.ts` providing an `ioredis` client (token `REDIS`) from `REDIS_URL`.
- [ ] T025 [P] Create `apps/api/src/infra/crypto/crypto.service.ts` with these methods:
  - `randomToken(bytes=32)`: base64url
  - `sha256(value)`: hex
  - `encrypt(plaintext)` / `decrypt(ciphertext)`: AES-256-GCM using `ENCRYPTION_KEY`, output format `iv.tag.data`
  - `timingSafeEqual`
  - Unit test: `crypto.service.spec.ts`.
- [ ] T026 [P] Configure structured logging with `nestjs-pino` in `apps/api/src/app.module.ts`: JSON output, a request id from the `X-Request-Id` header or generated, and redaction of the `cookie`, `authorization` and `x-csrf-token` headers.
- [ ] T027 [P] Create `ZodValidationPipe` in `apps/api/src/common/pipes/zod-validation.pipe.ts` plus decorators `@ZodBody(schema)` and `@ZodQuery(schema)`. Validation failures respond `422` with `code: VALIDATION` and `details` from the flattened Zod error.
- [ ] T028 [P] Create the global exception filter `apps/api/src/common/filters/api-exception.filter.ts` and a `DomainError(code, status, details?)` class in `apps/api/src/common/errors/domain-error.ts`:
  - Map every error to the `ApiError` envelope.
  - Localize `message` using `Accept-Language` (or the user's locale) with JSON files in `apps/api/src/common/i18n/messages/en.json`.
  - Unknown errors return 500 with a generic message, and the stack is logged.
- [ ] T029 Implement `SessionService` in `apps/api/src/modules/auth/session.service.ts` (research A10):
  - `create(userId, req)`: random token, store `sha256` only, 30-day expiry.
  - `validate(token)`: Redis cache key `sess:{hash}` with a 60 s TTL, falling back to Postgres. Slide `expiresAt` and `lastSeenAt` at most once per hour.
  - `revoke(token)`, `revokeAllForUser(userId)` (also deletes the cache keys), `rotate()`.
  - Cookie helper `setSessionCookie(res, token)`: `kora_sid`, `HttpOnly; Secure (prod); SameSite=Lax; Path=/; Max-Age=30d`.
- [ ] T030 Implement the global `SessionAuthGuard` in `apps/api/src/common/guards/session-auth.guard.ts`. It reads the `kora_sid` cookie, sets `req.user` and `req.session`, and returns 401 `UNAUTHENTICATED`. Routes opt out with `@Public()`. Add the `@CurrentUser()` decorator in `apps/api/src/common/decorators/current-user.decorator.ts`.
- [ ] T031 Implement `CsrfGuard` in `apps/api/src/common/guards/csrf.guard.ts` (research B3). It applies to **all** non-GET/HEAD/OPTIONS requests, including `@Public()` ones such as login and register, unless the request uses Bearer auth or the route is marked `@SkipCsrf()`:
  - Require the `Origin` header to equal `APP_URL`.
  - Require the `X-CSRF-Token` header to equal the `kora_csrf` cookie.
  - Skip when the request is authenticated with a Bearer token, or the route has `@SkipCsrf()` (decorator in `apps/api/src/common/decorators/skip-csrf.decorator.ts`; only for signature-verified inbound webhooks).
  - Add `GET /auth/csrf` (public) in `apps/api/src/modules/auth/csrf.controller.ts` to issue the cookie and token.
- [ ] T032 Implement the permission framework:
  - Decorator `@RequirePermission(permission, {resource: 'workspace'|'board'|'card'|'column'|..., param: 'wid'|'bid'|'id'})` in `apps/api/src/common/decorators/require-permission.decorator.ts`.
  - `PermissionGuard` in `apps/api/src/common/guards/permission.guard.ts`. It calls a `ResourceAccessRegistry` (in `apps/api/src/common/access/resource-access.registry.ts`) where each module registers a resolver `(id, userId) => {workspaceRole?, boardRole?} | null`.
  - A `null` result throws 404 `NOT_FOUND`. A missing permission throws 403 `FORBIDDEN`.
- [ ] T033 [P] Configure rate limiting in `apps/api/src/infra/throttler/throttler.module.ts`: `@nestjs/throttler` with Redis storage (`@nest-lab/throttler-storage-redis`). Named throttlers are `auth` (10/min keyed by IP+email) and `api-token` (100/min keyed by token id). A 429 response includes the `Retry-After` header.
- [ ] T034 [P] Create the BullMQ infrastructure in `apps/api/src/infra/queue/queue.module.ts`: register queue names from `apps/api/src/infra/queue/queues.ts` (`email`, `notifications`, `reminders`, `outbox`, `maintenance`, `webhooks`, `automation`, `integrations`, `data-transfer`, `reports`). Create the worker entrypoint `apps/api/src/worker.ts`, which boots a `WorkerModule` (no HTTP) and registers processors. Add the script `dev:worker`.
- [ ] T035 [P] Create the mail infrastructure in `apps/api/src/infra/mail/`:
  - `MailService.send({to, template, props, locale})` enqueues on the `email` queue.
  - `email.processor.ts` renders React Email templates from `apps/api/src/infra/mail/templates/` and sends with Resend. When `RESEND_API_KEY` is empty, it falls back to SMTP to Mailpit (dev).
  - Base `layout.tsx` template, localized by the `locale` prop.
- [ ] T036 [P] Add `GET /healthz` (public) in `apps/api/src/modules/health/health.controller.ts`. It checks Prisma `SELECT 1`, Redis `PING` and BullMQ connection, and returns `{status:'ok', checks}` or 503.
- [ ] T037 Wire the global providers in `apps/api/src/app.module.ts`: `ConfigModule`, `PrismaModule`, `RedisModule`, `QueueModule`, `MailModule`, `ThrottlerModule`, plus `APP_GUARD` entries in order SessionAuthGuard → CsrfGuard → PermissionGuard, and the `APP_FILTER` from T028.

### API test harness

- [ ] T038 Create the integration test harness `apps/api/test/setup/test-app.ts`:
  - Start Testcontainers `postgres:17` and `redis:7` once per worker.
  - Run `prisma migrate deploy` and build the Nest app with `Test.createTestingModule(AppModule)`.
  - Export `createTestApp()`, `resetDb()` (truncates all tables), and `agentFor(user)`: a Supertest agent that holds a signed-in session cookie plus CSRF token.
- [ ] T039 [P] Create test factories in `apps/api/test/setup/factories.ts`: `createUser()`, `createWorkspace(owner)`, `addWorkspaceMember(ws, user, role)`, `createBoard(ws, opts)`, `addBoardMember(board, user, role)`, `createColumn()`, `createCard()`. Extend them as later stories add entities.

### Web infrastructure

- [ ] T040 [P] Create the API client `apps/web/src/lib/api-client.ts`:
  - `apiFetch<T>(path, {method, body, query, clientMutationId?})` uses `credentials: 'include'` and prefixes `/api/v1`.
  - It attaches `X-CSRF-Token` (calling `GET /auth/csrf` lazily the first time), `Accept-Language` and `X-Client-Mutation-Id`.
  - It parses the `ApiError` envelope into an `ApiError` class.
  - On 401 it redirects to `/login?next=`.
- [ ] T041 [P] Create the TanStack Query client `apps/web/src/lib/query-client.ts`: default `staleTime` 30 s, retry 2 except on 4xx, and a global `onError` toast for mutation errors (using `sonner`).
- [ ] T042 [P] Set up i18n:
  - `apps/web/src/i18n/index.ts`: i18next + react-i18next, lazy backend loading `locales/{lng}/{ns}.json`, fallback `en`, namespaces `common, auth, workspace, board, card, notifications, settings`.
  - Create `apps/web/src/i18n/locales/en/*.json`.
  - Create the script `scripts/i18n-check.ts` (root `i18n:check`). It fails when any key in `en` is missing from another locale folder that exists, or when the code (`t('...')` calls) uses a key that's missing from `en`.
- [ ] T043 [P] Install the shadcn/ui components into `apps/web/src/components/ui/`: button, input, textarea, label, dialog, sheet, dropdown-menu, popover, command, tooltip, avatar, badge, tabs, select, checkbox, calendar, form, separator, skeleton, scroll-area. Add the `sonner` toaster.
- [ ] T044 [P] Create the theme provider `apps/web/src/components/theme-provider.tsx`: light, dark or system, applying the `.dark` class on `<html>`, persisted to localStorage and later synced from the profile.
- [ ] T045 Build the app shell and route guards:
  - `apps/web/src/routes/__root.tsx`: providers for QueryClient, i18n, theme and Toaster.
  - `apps/web/src/routes/_auth.tsx`: public layout for the login and register pages.
  - `apps/web/src/routes/_app.tsx`: authenticated layout, loads `GET /me`, redirects to `/login` on 401, includes a sidebar placeholder and a top bar.
- [ ] T046 [P] Create Playwright fixtures in `e2e/fixtures.ts`:
  - `signUpAndLogin(page, {email,name})` via the API, and `twoUsers` (two independent browser contexts).
  - `resetDb` calls a test-only endpoint `POST /api/v1/__test/reset`, enabled only when `NODE_ENV=test`.
  - Implement that endpoint in `apps/api/src/modules/health/test-reset.controller.ts`.

**Checkpoint**: `pnpm dev` boots web, api and worker. `/healthz` is green. CI passes with the empty suites.

---

## Phase 3: User Story 1 — Account & Sign-in (Priority: P1) 🎯 MVP

**Goal**: Sign-up and sign-in with email + password, Google or GitHub; email verification; password reset; throttling; profile editing; sign out of one device or all devices.

**Independent Test**: Register by each method, sign out, sign in again, reset the password, edit the profile, and use "sign out everywhere" (quickstart steps 1–2).

### Tests for User Story 1 (Constitution IV) ⚠️

- [ ] T047 [P] [US1] Integration tests in `apps/api/test/integration/auth.spec.ts`:
  - Register creates the user and enqueues a verify email.
  - Duplicate email → 422.
  - Login sets an `HttpOnly` `kora_sid` cookie.
  - Wrong password → 401.
  - The 11th attempt within a minute → 429.
  - Logout invalidates the cookie.
  - `logout-all` invalidates every session for the user.
  - Forgot-password returns 204 for unknown emails too.
  - A reset token is single-use and expires after 1 h.
  - Changing the password rotates sessions.
  - A non-GET without `X-CSRF-Token` → 403.
  - `POST /auth/login` and `POST /auth/register` without a CSRF token → 403 (login CSRF protection).
- [ ] T048 [P] [US1] Integration tests in `apps/api/test/integration/oauth.spec.ts`, with the arctic providers mocked:
  - First Google login creates a user.
  - A GitHub login with a **verified** email matching an existing password account links an `OAuthAccount` and creates no new user (FR-003).
  - An **unverified** provider email is not auto-linked.
  - A state or PKCE mismatch → 400.

### Implementation for User Story 1

- [ ] T049 [P] [US1] Add `OAuthAccount` and `VerificationToken` to `apps/api/prisma/schema/identity.prisma`:
  - `OAuthAccount`: `id, userId, provider enum google|github, providerUserId, email, emailVerified bool, createdAt`, unique (`provider`,`providerUserId`).
  - `VerificationToken`: `id, userId, type enum email_verify|password_reset, tokenHash unique, expiresAt, usedAt?`.
  - Run migration `auth_tokens`.
- [ ] T050 [P] [US1] Create Zod schemas in `packages/shared/src/schemas/auth.ts`:
  - `registerSchema` `{email: email().toLowerCase(), password: string min PASSWORD_MIN(10) max 200, name: 1–100 chars}`
  - `loginSchema`
  - `forgotSchema`
  - `resetSchema` `{token, password}`
  - `changePasswordSchema`
  - `updateMeSchema` `{name?, avatarUrl?, locale?, theme?: light|dark|system, timezone?: IANA string}`
- [ ] T051 [P] [US1] Implement `PasswordService` in `apps/api/src/modules/auth/password.service.ts`:
  - Argon2id via `@node-rs/argon2` with "memory 19 MiB, iterations 2, parallelism 1".
  - `hash`, `verify`, `isBreached(password)` checked against `apps/api/src/modules/auth/data/common-passwords.txt` (top 10k list).
  - Registration and reset reject breached passwords with 422.
- [ ] T052 [US1] Implement `VerificationService` in `apps/api/src/modules/auth/verification.service.ts`: `issue(userId, type)` stores only the sha256 hash, with expiry "email_verify 24 h, password_reset 1 h". `consume(token, type)` is single-use (sets `usedAt`) and rejects expired or used tokens.
- [ ] T053 [P] [US1] Add the email templates `verify-email.tsx` and `reset-password.tsx` in `apps/api/src/infra/mail/templates/`. Both take `{name, url, locale}`, with English strings drawn from `apps/api/src/common/i18n/messages/en.json`.
- [ ] T054 [US1] Implement `AuthService` and `AuthController` in `apps/api/src/modules/auth/`, with all routes `@Public()` except logout, logout-all and password change:
  - `POST /auth/register` → 201 and sends the verify email.
  - `POST /auth/verify-email`.
  - `POST /auth/login` (uses the `auth` throttler).
  - `POST /auth/logout`.
  - `POST /auth/logout-all` (also triggers socket disconnect through `SessionRevokedEvent`, which is consumed in US5).
  - `POST /auth/password/forgot`: always 204, no account enumeration.
  - `POST /auth/password/reset`: revokes all sessions.
- [ ] T055 [US1] Implement `OAuthService` and `OAuthController` in `apps/api/src/modules/auth/oauth/` with `arctic` Google and GitHub (research B2):
  - `GET /auth/oauth/:provider` stores `state` + `code_verifier` in a 10-min signed `kora_oauth` cookie and redirects.
  - The callback validates state, fetches the profile and verified email (GitHub: `/user/emails`, primary + verified), then either finds the `OAuthAccount`, links it to an existing user by verified email (FR-003), or creates a user with `emailVerifiedAt=now`.
  - It creates a session and redirects to `APP_URL/` (or `next`).
- [ ] T056 [US1] Implement `UsersController` in `apps/api/src/modules/users/users.controller.ts`:
  - `GET /me`: user + linked providers + workspaces placeholder `[]`, filled in by US2.
  - `PATCH /me`.
  - `PUT /me/password`: verifies the current password, rotates sessions.
  - `DELETE /me`: soft delete via `deletedAt`, revokes sessions. The sole-owner check is added in US2.
- [ ] T057 [P] [US1] Create the web auth API hooks in `apps/web/src/features/auth/api.ts`: `useMe`, `useLogin`, `useRegister`, `useLogout`, `useLogoutAll`, `useForgotPassword`, `useResetPassword`, `useVerifyEmail`, `useUpdateMe`, `useChangePassword`.
- [ ] T058 [P] [US1] Build the login and register pages:
  - Pages: `apps/web/src/routes/_auth/login.tsx` and `apps/web/src/routes/_auth/register.tsx`.
  - Forms use react-hook-form + the shared Zod schemas.
  - "Continue with Google" and "Continue with GitHub" buttons link to `/api/v1/auth/oauth/:provider`.
  - Show a throttled-error message on 429.
- [ ] T059 [P] [US1] Build `apps/web/src/routes/_auth/verify-email.tsx`, `forgot-password.tsx` and `reset-password.tsx`, each reading `?token=`.
- [ ] T060 [US1] Build the profile settings page `apps/web/src/routes/_app/settings/profile.tsx`:
  - Name, avatar URL, language select (only `en` enabled until US16), timezone and theme fields.
  - Password change form.
  - Linked sign-in methods list.
  - "Sign out of all devices" and "Delete account" actions with confirm dialogs.
- [ ] T061 [P] [US1] E2E test `e2e/auth.spec.ts`: register → read the verify link from Mailpit API `http://localhost:8025/api/v1/messages` → verify → logout → login → forgot/reset → login with the new password.

**Checkpoint**: Quickstart steps 1–2 pass. T047, T048 and T061 are green.

---

## Phase 4: User Story 2 — Workspaces, Members & Roles (Priority: P1) 🎯 MVP

**Goal**: Workspaces with Owner, Admin, Member and Viewer roles; invites by email or link; at least one Owner at all times.

**Independent Test**: Create a workspace, invite a second user as Viewer, check the role restrictions, change the role and remove the member (quickstart step 3).

### Tests for User Story 2 (Constitution IV) ⚠️

- [ ] T062 [P] [US2] Permission tests in `apps/api/test/permissions/workspace.permissions.spec.ts`. Every row of the "Workspace permissions" table in `contracts/permissions.md` gets one allowed and one denied case for each role. A non-member gets 404 on `GET /workspaces/:wid` (SC-005).
- [ ] T063 [P] [US2] Integration tests in `apps/api/test/integration/workspaces.spec.ts`:
  - The creator becomes OWNER.
  - The last OWNER cannot leave or downgrade (409 `LAST_OWNER`).
  - An Admin cannot remove an Owner.
  - An email invite accept adds the member with the invited role.
  - An invite to an existing account's email attaches to that account.
  - A link invite works for several users until revoked.
  - An expired invite (>7 d) is rejected.
  - `DELETE /me` is blocked for a sole Owner.

### Implementation for User Story 2

- [ ] T064 [P] [US2] Create `apps/api/prisma/schema/workspace.prisma`:
  - `Workspace`: `id, name ("1–80"), slug unique url-safe, createdById, createdAt, updatedAt`.
  - `WorkspaceMember`: PK (`workspaceId`,`userId`), `role enum OWNER|ADMIN|MEMBER|VIEWER`, `joinedAt`.
  - `Invitation`: `id, workspaceId, email? (null = link invite), role, tokenHash unique, invitedById, expiresAt (7 d), status enum PENDING|ACCEPTED|REVOKED|EXPIRED, acceptedById?`.
  - Run migration `workspaces`.
- [ ] T065 [P] [US2] Create Zod schemas in `packages/shared/src/schemas/workspace.ts`: `createWorkspaceSchema` `{name 1–80}`, `updateWorkspaceSchema`, `updateMemberRoleSchema` `{role}`, `createInvitationSchema` `{email?: email, role: ADMIN|MEMBER|VIEWER}` (OWNER cannot be invited directly), and response types.
- [ ] T066 [US2] Implement `WorkspaceAccessResolver` in `apps/api/src/modules/workspaces/workspace-access.resolver.ts`. It registers the `workspace` resource with `ResourceAccessRegistry` and returns `{workspaceRole}`, or null for non-members.
- [ ] T067 [US2] Implement `WorkspacesService` and `WorkspacesController` in `apps/api/src/modules/workspaces/`:
  - `GET/POST /workspaces`: slug generated from the name with a uniqueness suffix.
  - `GET/PATCH/DELETE /workspaces/:wid`: DELETE is Owner-only and requires `{confirm: name}`.
  - Extend `GET /me` to include `workspaces: [{id,name,slug,role}]`.
- [ ] T068 [US2] Implement `MembersService` and `MembersController` in `apps/api/src/modules/workspaces/members/`:
  - `GET /workspaces/:wid/members`.
  - `PATCH /workspaces/:wid/members/:uid`: Admins cannot touch Owners, and only an Owner can promote someone to Owner.
  - `DELETE /workspaces/:wid/members/:uid`.
  - Enforce the "≥ 1 OWNER per workspace" invariant (FR-016) inside a transaction with `SELECT … FOR UPDATE`.
  - Removing a member also deletes their `BoardMember` rows in the workspace and emits `WorkspaceAccessChangedEvent`, which is consumed in US5.
- [ ] T069 [US2] Implement `InvitationsService` and `InvitationsController` in `apps/api/src/modules/workspaces/invitations/`:
  - `GET/POST /workspaces/:wid/invitations`.
  - `DELETE /workspaces/:wid/invitations/:iid` (revoke).
  - `GET /invitations/:token` (public preview: workspace name, inviter, role).
  - `POST /invitations/:token/accept`: an email invite requires the signed-in user's email to match.
  - Email invites go out with the template `apps/api/src/infra/mail/templates/invitation.tsx`.
  - A daily `maintenance` job marks `EXPIRED`.
- [ ] T070 [US2] Add the sole-Owner check to `DELETE /me` in `apps/api/src/modules/users/users.service.ts`: reject with 409 `LAST_OWNER` and list the affected workspaces.
- [ ] T071 [P] [US2] Create the web API hooks in `apps/web/src/features/workspaces/api.ts`: workspaces, members, invitations CRUD, `useAcceptInvitation`.
- [ ] T072 [P] [US2] Build the sidebar workspace switcher and "Create workspace" dialog in `apps/web/src/features/workspaces/workspace-switcher.tsx`, and mount them in `apps/web/src/routes/_app.tsx`.
- [ ] T073 [US2] Build the workspace settings members page `apps/web/src/routes/_app/w/$workspaceSlug/settings/members.tsx`:
  - Members table with a role select and remove action, hidden or disabled according to `packages/shared` permissions.
  - Invite dialog with an email + role mode and a "copy invite link" mode.
  - Pending invites list with revoke.
- [ ] T074 [P] [US2] Build the invite acceptance route `apps/web/src/routes/invite/$token.tsx`. It shows the preview; unauthenticated visitors are sent to register or login with `next` and then come back to accept.
- [ ] T075 [P] [US2] Build the workspace home `apps/web/src/routes/_app/w/$workspaceSlug/index.tsx`, a placeholder board list that US3 fills in, plus the general settings page (rename, delete for the Owner).

**Checkpoint**: Quickstart step 3, up to the board-related checks, passes. T062 and T063 are green.

---

## Phase 5: User Story 3 — Boards, Columns & Cards with Drag-and-Drop (Priority: P1) 🎯 MVP

**Goal**: Boards (blank or default columns), columns (create, rename, reorder, archive), cards (create, archive, delete), atomic drag-and-drop moves with a keyboard alternative, board visibility, and an archive view.

**Independent Test**: Create a board, add columns and cards, drag between columns, reload and confirm the order is kept, move a card with the keyboard, and archive and restore a column (quickstart step 4).

### Tests for User Story 3 (Constitution IV) ⚠️

- [ ] T076 [P] [US3] Integration tests in `apps/api/test/integration/card-move.spec.ts`:
  - A move within a column and across columns persists `position` order.
  - `afterCardId`/`beforeCardId` from a different column → 422.
  - **20 concurrent moves of different cards plus 10 concurrent moves of the same card** leave every card in exactly one column with no duplicates (SC-004).
  - `Board.version` increases by exactly 1 per mutation.
  - An `ActivityEvent` and an `OutboxEvent` are written in the same transaction (simulate a failure and assert neither row exists).
  - Moving into a DONE-category column sets `completedAt`, and moving out clears it.
  - A replayed `X-Client-Mutation-Id` returns the original result without applying the move twice.
  - Every endpoint in the board, column and card controllers produces exactly one `ActivityEvent` with a non-null `actorId` (or a system actor plus `data.automationRuleId` for automations), and sets `updatedById`.
- [ ] T077 [P] [US3] Integration tests in `apps/api/test/integration/boards.spec.ts`:
  - Creating with `template:"default"` makes To Do / In Progress / Done with categories TODO / IN_PROGRESS / DONE.
  - Archiving a column archives its cards, and restoring brings both back.
  - Permanently deleting a card requires the card to be archived first.
  - Deleting a board requires `{confirm: board name}`.
  - Every name and title length limit returns 422 when exceeded.
- [ ] T078 [P] [US3] Permission tests in `apps/api/test/permissions/board.permissions.spec.ts`:
  - Every P1 row of "Board permissions" in `contracts/permissions.md`, allowed and denied, for Admin, Member and Viewer. Later rows are covered by each phase's permission spec.
  - The effective-role cases: workspace OWNER/ADMIN is an implicit board ADMIN; a PRIVATE board gives 404 to a non-member workspace MEMBER; a WORKSPACE board defaults to MEMBER; a workspace VIEWER is capped at VIEWER.
  - A workspace MEMBER creates a PRIVATE board, then can view it and change its settings; a second workspace MEMBER gets 404.
  - The role ceiling: a workspace MEMBER can be made board ADMIN; making a workspace VIEWER board MEMBER or ADMIN → 422.

### Implementation for User Story 3

- [ ] T079 [P] [US3] Create `apps/api/prisma/schema/board.prisma`:
  - `Board`: `id, workspaceId, name ("1–100 chars"), visibility enum PRIVATE|WORKSPACE, mode enum KANBAN|SCRUM default KANBAN, version BigInt default 0, nextCardNumber Int default 1, createdById, updatedById, archivedAt?, archivedById?, createdAt, updatedAt`.
  - `BoardMember`: PK (`boardId`,`userId`), `role enum ADMIN|MEMBER|VIEWER`.
  - `Column`: `id, boardId, name ("1–60"), position String, category enum TODO|IN_PROGRESS|DONE, createdById, updatedById, archivedAt?, archivedById?, createdAt, updatedAt`.
  - `Label`: `id, boardId, name ("0–40"), color (one of 12 palette tokens)`.
- [ ] T080 [P] [US3] Create `apps/api/prisma/schema/card.prisma` with the P1 core of `Card`:
  - Fields: `id, boardId, number Int, columnId String? , position String, title ("1–200 chars"), description Json?, descriptionText String default "", priority enum NONE|LOW|MEDIUM|HIGH|URGENT default NONE, startDate?, dueDate?, completedAt?, createdById, updatedById, archivedAt?, archivedById?, createdAt, updatedAt`.
  - Unique (`boardId`,`number`).
  - Index (`columnId`,`position`).
  - Index (`boardId`,`dueDate`).
- [ ] T081 [P] [US3] Create `apps/api/prisma/schema/activity.prisma`:
  - `ActivityEvent` (immutable): `id, boardId, cardId?, actorId?, type String, data Json, boardVersion BigInt, createdAt`, with indexes (`boardId`,`createdAt`) and (`cardId`,`createdAt`).
  - `OutboxEvent`: `id BigInt autoincrement, boardId?, userId?, topic, payload Json, boardVersion BigInt?, createdAt, dispatchedAt?`, with indexes (`boardId`,`boardVersion`) and a partial index on `dispatchedAt IS NULL` via raw SQL in the migration.
  - `ProcessedMutation`: `clientMutationId uuid PK, userId, response Json, createdAt`.
  - Run migration `boards_cards_activity`.
- [ ] T082 [P] [US3] Create Zod schemas in `packages/shared/src/schemas/board.ts`:
  - `createBoardSchema` `{name 1–100, visibility: PRIVATE|WORKSPACE default PRIVATE, template: 'default'|'blank' default 'default'}`
  - `updateBoardSchema`
  - `createColumnSchema` `{name 1–60, afterColumnId?}`
  - `updateColumnSchema` `{name?, position?, category?}`
  - `boardMemberSchema`
  - Snapshot response types `BoardSnapshot` `{board, columns, labels, members, cards: CardSummary[], boardVersion}`
- [ ] T083 [P] [US3] Create Zod schemas in `packages/shared/src/schemas/card.ts`:
  - `createCardSchema` `{title 1–200 trimmed, afterCardId?}`
  - `moveCardSchema` `{toColumnId: uuid, afterCardId?: uuid, beforeCardId?: uuid, toSwimlaneId?: uuid}`
  - `CardSummary` type (id, number, title, columnId, position, priority, dueDate, assigneeIds, labelIds, checklistProgress, commentCount, attachmentCount, isBlocked)
- [ ] T084 [US3] Implement `BoardTxService` in `apps/api/src/modules/boards/board-tx.service.ts` (research B6). `run(boardId, actorId, clientMutationId|null, fn(tx) => {result, activity[], events[]})`:
  - Opens `prisma.$transaction`.
  - If `clientMutationId` already exists in `ProcessedMutation`, returns the stored response.
  - Otherwise runs `fn`, then `UPDATE Board SET version = version + 1 RETURNING version`.
  - Inserts the `ActivityEvent`s and `OutboxEvent`s (topic `board.event`, payload = envelope) with that version.
  - `fn` MUST return at least one `ActivityEvent`; otherwise `run()` throws `Error('mutation without activity')` (Constitution: auditability).
  - `run()` sets `updatedById = actorId` on the touched Board, Column or Card.
  - Stores `ProcessedMutation`, and returns `{result, boardVersion}`.
- [ ] T085 [US3] Implement `BoardAccessResolver` and `CardAccessResolver` in `apps/api/src/modules/boards/board-access.resolver.ts`. Register the resources `board`, `column`, `card` and `label`; each resolves to its board, then applies `effectiveBoardRole` from `packages/shared`. Return null (404) for non-members of private boards. Cache per request.
- [ ] T086 [US3] Implement `BoardsService` and `BoardsController` in `apps/api/src/modules/boards/`:
  - `GET/POST /workspaces/:wid/boards`: lists only accessible boards; create adds the default columns and inserts `BoardMember(creatorId, ADMIN)` in the same transaction.
  - `GET /boards/:bid`: snapshot with non-archived columns and cards ordered by `position`.
  - `PATCH /boards/:bid`.
  - `POST /boards/:bid/archive`, `POST /boards/:bid/restore`.
  - `DELETE /boards/:bid`: requires `{confirm}` equal to the board name.
  - `GET /boards/:bid/archive-items`.
- [ ] T087 [P] [US3] Implement `BoardMembersController` in `apps/api/src/modules/boards/board-members.controller.ts`: `GET/PUT/DELETE /boards/:bid/members[/:uid]`. Validate that the user is a workspace member and that the board role does not exceed the ceiling in the "Role ceiling" table of `contracts/permissions.md` (FR-014): OWNER/ADMIN → ADMIN, MEMBER → ADMIN, VIEWER → VIEWER.
- [ ] T088 [US3] Implement `ColumnsService` and `ColumnsController` in `apps/api/src/modules/columns/`, all through `BoardTxService` and emitting `column.*` events:
  - `POST /boards/:bid/columns`: position via `positionBetween`.
  - `PATCH /columns/:cid`: rename, reorder, category.
  - `POST /columns/:cid/archive`: archives the column and its cards in one transaction.
  - `POST /columns/:cid/restore`.
- [ ] T089 [US3] Implement `CardsService` and `CardsController` (core) in `apps/api/src/modules/cards/`:
  - `POST /columns/:cid/cards`: number = `nextCardNumber++`, position at the end or after `afterCardId`.
  - `GET /cards/:id`.
  - `PATCH /cards/:id`: title only for now.
  - `POST /cards/:id/archive`, `POST /cards/:id/restore`.
  - `DELETE /cards/:id`: only when archived; otherwise 409.
  - All through `BoardTxService`, emitting `card.created/updated/archived/restored/deleted`.
- [ ] T090 [US3] Implement `CardMoveService` and `POST /cards/:id/move` in `apps/api/src/modules/cards/card-move.service.ts`:
  - Lock the card row with `SELECT … FOR UPDATE` and validate the target column is on the same board and not archived (archived → 409 per the spec edge case).
  - Compute `position = positionBetween(before, after)`, breaking ties by card id.
  - Set `completedAt` when the target category is DONE, and clear it otherwise.
  - Emit `card.moved` with `{cardId, fromColumnId, toColumnId, position}`, and return `{position, boardVersion}`.
  - Schedule a `maintenance` rebalance job when `needsRebalance` is true.
- [ ] T091 [P] [US3] Implement the column rebalance processor `apps/api/src/modules/cards/rebalance.processor.ts`. It rewrites the positions of every card in the column with `rebalance(count)` through `BoardTxService` and emits a single `column.rebalanced` event with the new positions.
- [ ] T092 [P] [US3] Create the web board API hooks in `apps/web/src/features/board/api.ts`:
  - `useBoards(wid)`, `useBoard(bid)` (snapshot query key `['board', bid]`).
  - Create, update, archive and delete for boards, columns and cards.
  - `useMoveCard`: an optimistic update of the snapshot cache, rolled back with an error toast on failure; it sends a `clientMutationId`.
- [ ] T093 [P] [US3] Build the board list and create-board dialog in `apps/web/src/routes/_app/w/$workspaceSlug/index.tsx` and `apps/web/src/features/board/create-board-dialog.tsx`, with a name, visibility and default/blank template.
- [ ] T094 [US3] Build the board page `apps/web/src/routes/_app/b/$boardId/index.tsx` and `apps/web/src/features/board/board-view.tsx`:
  - Horizontal scrolling columns.
  - `@dnd-kit/core` + `@dnd-kit/sortable` with pointer and keyboard sensors for both columns and cards.
  - Screen-reader announcements from i18n strings.
  - Each column virtualized with `@tanstack/react-virtual` (SC-003).
- [ ] T095 [P] [US3] Build the column components in `apps/web/src/features/board/column.tsx` and `column-menu.tsx`: header with inline rename, menu items (Rename, Set category, Archive with confirm), and an "Add card" inline composer at the bottom.
- [ ] T096 [P] [US3] Build the card tile in `apps/web/src/features/board/card-tile.tsx` showing title, number, priority badge, and placeholder slots for labels, assignees, due date and checklist progress (filled by US4). It is focusable, opens the card on Enter, and starts a keyboard drag on Space.
- [ ] T097 [P] [US3] Build the "Move to…" dialog `apps/web/src/features/board/move-to-dialog.tsx` (column select + position select, top or bottom or after a card), reachable from the card context menu. It satisfies the constitution's accessibility rule.
- [ ] T098 [P] [US3] Build the board header and settings in `apps/web/src/features/board/board-header.tsx` and `board-settings-dialog.tsx`: rename, visibility toggle, board members management, archive and delete board. Controls are hidden by permission.
- [ ] T099 [P] [US3] Build the archive panel `apps/web/src/features/board/archive-sheet.tsx`, listing archived columns and cards with restore and (Admin) permanent delete with confirm.
- [ ] T100 [US3] Create the demo seed `apps/api/prisma/seed/demo.ts` (script `db:seed`): the user `demo@kora.local` / `demo-password-123` (verified), workspace "Demo", a board with the default columns and 8 cards.
- [ ] T101 [P] [US3] E2E test `e2e/board-dnd.spec.ts`:
  - Create a board and add 5 cards.
  - Mouse-drag a card from To Do to In Progress, reload, and check the position persists.
  - Keyboard move (Tab, Space, ArrowRight, Space), reload, and check it persists.
  - Move via the "Move to…" dialog.
  - Archive a column, restore it, and check its cards come back.

**Checkpoint**: Quickstart step 4 passes. T076, T077, T078 and T101 are green. SC-004 is verified.

---

## Phase 6: User Story 4 — Card Details & Collaboration (Priority: P1) 🎯 MVP

**Goal**: Rich description, assignees, start and due dates, labels, priority, checklists, attachments (≤10 MB), comments with @mentions, watchers, activity history, overdue indicators.

**Independent Test**: Fill in every card field, add a checklist and an attachment, comment with an @mention, and check the activity history (quickstart step 5).

### Tests for User Story 4 ⚠️

- [ ] T102 [P] [US4] Integration tests in `apps/api/test/integration/card-details.spec.ts`:
  - A label from another board → 422.
  - Assigning a user without board access → 422.
  - `dueDate < startDate` → 422.
  - Checklist progress counts.
  - Upload-url with `sizeBytes` 10 485 761 → 413.
  - Confirm when the stored object is bigger than declared → 422, and the attachment is deleted.
  - Only the author can edit or delete a comment.
  - Mentions create `CommentMention` rows.
  - Every mutation creates an `ActivityEvent` with actor, change (old/new) and timestamp.
  - A Viewer gets 403 on every write.

### Implementation for User Story 4

- [ ] T103 [P] [US4] Create `apps/api/prisma/schema/card-details.prisma`:
  - `CardAssignee`: PK (`cardId`,`userId`), `assignedById`, `assignedAt`.
  - `CardLabel`: PK (`cardId`,`labelId`).
  - `CardWatcher`: PK (`cardId`,`userId`).
  - `Checklist`: `id, cardId, title ("1–100"), position`.
  - `ChecklistItem`: `id, checklistId, text ("1–300"), isDone, position`.
  - `Attachment`: `id, cardId, kind enum FILE|LINK|GDRIVE, name, url?, storageKey?, mimeType?, sizeBytes Int?, status enum PENDING|READY, uploadedById, createdAt`.
  - `Comment`: `id, cardId, authorId, body Json, bodyText, editedAt?, deletedAt?, createdAt`.
  - `CommentMention`: PK (`commentId`,`userId`).
  - Run migration `card_details`.
- [ ] T104 [P] [US4] Create Zod schemas in `packages/shared/src/schemas/card-details.ts`:
  - `updateCardSchema` `{title?, description?: richTextDoc|null, priority?, startDate?: datetime|null, dueDate?: datetime|null, baseVersion?: string}`, refined so that "dueDate ≥ startDate".
  - `labelSchema` `{name 0–40, color: LABEL_COLORS}`.
  - `checklistSchema` `{title 1–100}`, `checklistItemSchema` `{text 1–300, isDone?, position?}`.
  - `uploadUrlSchema` `{name 1–255, mimeType, sizeBytes: int 1..ATTACHMENT_MAX_BYTES}`, `linkAttachmentSchema` `{url: url, name?}`.
  - `commentSchema` `{body: richTextDoc}`.
- [ ] T105 [P] [US4] Create the rich-text helpers in `packages/shared/src/richtext/`:
  - `toPlainText(doc)`
  - `extractMentions(doc): userId[]` (reads Tiptap `mention` nodes `attrs.id`)
  - `validateDoc(doc)`: allow-list of node and mark types, max 50k characters
  - Unit tests in `richtext.spec.ts`
- [ ] T106 [US4] Extend `CardsService.update` in `apps/api/src/modules/cards/cards.service.ts`:
  - Apply all fields from `updateCardSchema`.
  - Derive `descriptionText` with `toPlainText`.
  - Record an `ActivityEvent` `card.updated` with `{fields: {name: {old,new}}}`.
  - Emit `card.updated` with only the changed fields.
- [ ] T107 [P] [US4] Implement `LabelsController` in `apps/api/src/modules/boards/labels.controller.ts`: `GET/POST /boards/:bid/labels`, `PATCH/DELETE /labels/:lid`. Deleting a label removes its `CardLabel` rows and emits `label.changed`.
- [ ] T108 [US4] Implement the card relation endpoints in `apps/api/src/modules/cards/card-relations.controller.ts`, each emitting the `card.assignees.changed` / `card.labels.changed` events:
  - `PUT/DELETE /cards/:id/assignees/:uid`: assignees auto-watch the card (FR-036) and must have board access.
  - `PUT/DELETE /cards/:id/labels/:lid`: the label must belong to the same board.
  - `PUT/DELETE /cards/:id/watch`.
  - The card creator auto-watches on create (update `CardsService.create`).
- [ ] T109 [US4] Implement `ChecklistsService` and `ChecklistsController` in `apps/api/src/modules/cards/checklists/`: `POST /cards/:id/checklists`, `PATCH/DELETE /checklists/:id`, `POST /checklists/:id/items`, `PATCH/DELETE /checklist-items/:id`. Every change emits `checklist.changed` with `{progress: {done,total}}`.
- [ ] T110 [P] [US4] Implement `StorageService` in `apps/api/src/infra/storage/storage.service.ts` with `@aws-sdk/client-s3` pointed at R2 (`https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, or `S3_ENDPOINT`):
  - `presignPut(key, contentType, contentLength, 10 min)`: signs `Content-Length`.
  - `presignGet(key, filename, 5 min)`.
  - `head(key)`, `delete(key)`.
- [ ] T111 [US4] Implement `AttachmentsService` and `AttachmentsController` in `apps/api/src/modules/attachments/` (research B9):
  - `POST /cards/:id/attachments/upload-url`: over 10 MB → 413 `PAYLOAD_TOO_LARGE`; otherwise creates a PENDING row with key `att/{boardId}/{cardId}/{uuid}`.
  - `POST /attachments/:id/confirm`: HEAD check that the size is ≤ declared and ≤ 10 MB, then READY plus an `attachment.added` event.
  - `POST /cards/:id/attachments/link`.
  - `GET /attachments/:id/download`: 302 to a presigned GET.
  - `DELETE /attachments/:id`.
  - A daily `maintenance` job deletes PENDING attachments older than 24 h and their objects.
- [ ] T112 [US4] Implement `CommentsService` and `CommentsController` in `apps/api/src/modules/comments/`:
  - `GET/POST /cards/:id/comments` (cursor pagination, newest first).
  - `PATCH/DELETE /comments/:id`: author only, soft delete via `deletedAt`, sets `editedAt`.
  - Mentions come from `extractMentions`, filtered to users with board access, and stored in `CommentMention`.
  - Emits `comment.added/updated/deleted`. Mentioned users are emitted as part of the outbox payload for US6.
- [ ] T113 [P] [US4] Implement the card activity endpoint `GET /cards/:id/activity` (cursor pagination) in `apps/api/src/modules/cards/activity.controller.ts`. Each `ActivityEvent` is returned with its actor summary (a deleted user shows as "Deleted user").
- [ ] T114 [US4] Update the `CardSummary` projection in `apps/api/src/modules/boards/board-snapshot.query.ts` to include `assigneeIds`, `labelIds`, `checklistProgress {done,total}`, `commentCount`, `attachmentCount`, `dueDate` and `startDate`, using a single query per board with aggregated sub-selects to meet the 500-card target.
- [ ] T115 [P] [US4] Create the web card API hooks in `apps/web/src/features/card/api.ts`: `useCard(id)`, `useUpdateCard`, assignees, labels, watch, checklists, attachments (upload: get URL → `PUT` to R2 with progress → confirm), comments, activity (infinite query).
- [ ] T116 [US4] Build the card detail dialog route `apps/web/src/routes/_app/b/$boardId/c/$cardNumber.tsx` and layout `apps/web/src/features/card/card-dialog.tsx`: the board stays visible behind it, and the dialog has a title editor, a sidebar of fields, and tabs for Comments and Activity.
- [ ] T117 [P] [US4] Build the description editor `apps/web/src/features/card/description-editor.tsx`: Tiptap StarterKit, Link, TaskList and Mention (member suggestions), saved on blur.
- [ ] T118 [P] [US4] Build the field pickers in `apps/web/src/features/card/fields/`:
  - `assignees-picker.tsx`
  - `labels-picker.tsx` (create and edit labels inline)
  - `priority-select.tsx`
  - `date-fields.tsx` (start and due dates with time, validated so "dueDate ≥ startDate")
- [ ] T119 [P] [US4] Build `apps/web/src/features/card/checklists.tsx`: add and remove checklists and items, toggle done, reorder items with dnd-kit, and a progress bar. Items can also be reordered with the dnd-kit keyboard sensor (Space, arrows, Space) and "Move up"/"Move down" menu items.
- [ ] T120 [P] [US4] Build `apps/web/src/features/card/attachments.tsx`: file picker and drop zone, client-side 10 MB check with an i18n error, upload progress, link attachments, image thumbnails, download and delete.
- [ ] T121 [P] [US4] Build `apps/web/src/features/card/comments.tsx` (Tiptap composer with @mention, list, edit and delete own comments) and `activity-list.tsx` (renders each `ActivityEvent.type` as a localized sentence).
- [ ] T122 [US4] Update `apps/web/src/features/board/card-tile.tsx` to show label chips, assignee avatars, a due-date badge (overdue = red when `dueDate < now` and not DONE; due soon = amber within 24 h), checklist progress `3/5`, and comment/attachment counts.

**Checkpoint**: Quickstart step 5 passes, except the notification check, which needs US6. T102 is green.

---

## Phase 7: User Story 5 — Real-time Collaboration (Priority: P1) 🎯 MVP

**Goal**: Board changes reach other viewers in ≤ 2 s without a refresh, with presence, catch-up after reconnecting, field-level last-write-wins with an overwrite notice, and rollback when the server rejects a change.

**Independent Test**: Open the same board in two browsers, make changes in one, and see them in the other within 2 s; go offline and come back, and the board catches up (quickstart step 6).

### Tests for User Story 5 (Constitution IV) ⚠️

- [ ] T123 [P] [US5] Integration tests in `apps/api/test/integration/realtime.spec.ts` using `socket.io-client`:
  - A handshake without a valid `kora_sid` → `connect_error UNAUTHENTICATED`.
  - `board:join` on a private board without membership → `{ok:false}`.
  - After a card move over HTTP, a joined client receives a `card.moved` envelope with `boardVersion` = previous + 1.
  - `board:join` with a recent `sinceVersion` → `mode:"replay"` with the missing events in order.
  - With `sinceVersion` older than the outbox window → `mode:"resync"`.
  - `POST /auth/logout-all` → the socket receives `session:revoked` and is disconnected.
  - Removing a workspace member → `member.changed` with role null to that user.
- [ ] T124 [P] [US5] Integration test in `apps/api/test/integration/lww.spec.ts`: two `PATCH /cards/:id` calls changing `title` with the same `baseVersion` → the second response has `overwritten: ["title"]`, and the final title is the second value.
- [ ] T125 [P] [US5] E2E test `e2e/realtime.spec.ts` with the `twoUsers` fixture:
  - user1 moves a card, adds a card and renames a column; user2 sees each change within 2000 ms.
  - user2 goes offline with `context.setOffline(true)` for 5 s while user1 makes 3 changes, then comes back online; user2's board matches without a reload.
  - Presence avatars show both users.

### Implementation for User Story 5

- [ ] T126 [P] [US5] Create the typed event contracts in `packages/shared/src/events/board-events.ts` and `user-events.ts`: a discriminated union of every P1 `type` in `contracts/realtime-events.md` with Zod payload schemas, plus the client→server event schemas (`board:join`, `board:leave`, `presence:update`).
- [ ] T127 [US5] Implement `RealtimeGateway` in `apps/api/src/modules/realtime/realtime.gateway.ts`:
  - Namespace `/rt`; the Socket.IO server uses `@socket.io/redis-adapter`.
  - The handshake parses the `kora_sid` cookie through `SessionService.validate`, and the socket joins `user:{id}` and `session:{sessionId}`.
  - `board:join` checks `board.view` through `ResourceAccessRegistry` and joins `board:{id}`.
  - `board:leave`.
- [ ] T128 [US5] Implement catch-up in `apps/api/src/modules/realtime/catch-up.service.ts`. `board:join {sinceVersion}` returns `{mode:'replay', events}` from `OutboxEvent` where `boardId` matches and `boardVersion > sinceVersion`, if the oldest retained version ≤ `sinceVersion + 1` and fewer than 500 events are missing. Otherwise it returns `{mode:'resync', boardVersion}`.
- [ ] T129 [US5] Implement `OutboxDispatcher` in the worker, `apps/api/src/modules/realtime/outbox.dispatcher.ts`:
  - A loop wakes on Postgres `LISTEN outbox` (with a `pg_notify` trigger added in a migration) and also polls every 500 ms as a fallback.
  - It selects undispatched rows `FOR UPDATE SKIP LOCKED` in `id` order, publishes `board.event` to `board:{id}` and user events to `user:{id}` through `@socket.io/redis-emitter`, sets `dispatchedAt`, and fans out to the internal consumers (`notifications` queue now; `automation` and `webhooks` queues later).
  - A `maintenance` job deletes dispatched rows older than 24 h.
- [ ] T130 [US5] Implement presence in `apps/api/src/modules/realtime/presence.service.ts`. A Redis hash `presence:board:{id}` maps `userId` to `{cardId, socketCount, ts}`. It updates on join, leave, disconnect and `presence:update`, and broadcasts `presence.changed`. Stale entries (>60 s without a heartbeat) are pruned.
- [ ] T131 [US5] Handle revocations in `apps/api/src/modules/realtime/revocation.listener.ts`:
  - On `SessionRevokedEvent`: emit `session:revoked` to the `session:{id}` room and disconnect it, or every socket for the user after logout-all.
  - On `WorkspaceAccessChangedEvent` and board-member removal: emit `member.changed` and `workspace.access.changed`, and remove the user's sockets from the affected `board:*` rooms.
- [ ] T132 [US5] Add field-level last-write-wins detection to `CardsService.update` in `apps/api/src/modules/cards/cards.service.ts`. When `baseVersion` is provided, look up `ActivityEvent card.updated` for this card with `boardVersion > baseVersion` by another actor. Return `overwritten: string[]` for the intersecting fields (FR-042).
- [ ] T133 [P] [US5] Create the socket client `apps/web/src/lib/socket.ts`: a singleton `io('/rt', {withCredentials: true})` with typed `emit` and `on` from `packages/shared` events and reconnect backoff. On `session:revoked` it clears the query cache and redirects to `/login`.
- [ ] T134 [US5] Implement `useBoardRealtime(boardId)` in `apps/web/src/features/board/use-board-realtime.ts`:
  - Join on mount with the cached `boardVersion`.
  - Apply each event to the `['board', bid]` query cache through a reducer in `apps/web/src/features/board/apply-board-event.ts`. Skip events with `boardVersion ≤` the current version and events whose `clientMutationId` matches one of this client's own.
  - On a gap (`version > current+1`), re-join with `sinceVersion`. On `resync`, refetch.
  - Re-join on reconnect.
  - Invalidate the `['card', id]` query when an open card changes.
- [ ] T135 [P] [US5] Build presence avatars in `apps/web/src/features/board/presence-bar.tsx` (header) and the card-level viewer avatars in `card-tile.tsx`. Send `presence:update` when a card dialog opens or closes.
- [ ] T136 [P] [US5] Add the conflict and rejection UX in `apps/web/src/features/card/use-update-card.ts`. Send `baseVersion` with every PATCH. When `overwritten` is non-empty, show a toast like "Your change to {field} replaced an edit by another member". On a rejected optimistic mutation, roll back and show the localized server message (FR-041).
- [ ] T137 [US5] Handle lost access in `apps/web/src/features/board/board-view.tsx`: on `member.changed` with role null for the current user, or a 404 on refetch, close the board and show the localized message "You no longer have access to this board". Handle `card.deleted` for an open card by closing the dialog with the message "This card was deleted".

**Checkpoint**: Quickstart step 6 passes. T123, T124 and T125 are green. SC-002 is verified.

---

## Phase 8: User Story 6 — Notifications (Priority: P1) 🎯 MVP

**Goal**: In-app, email (instant or daily digest) and browser push notifications for assignment, @mention, watched-card changes, due soon, overdue and invitations, configurable per type and channel.

**Independent Test**: Assign and @mention user B and check every channel; turn email off and confirm none is sent; use the digest mode (quickstart step 7).

### Tests for User Story 6 ⚠️

- [ ] T138 [P] [US6] Integration tests in `apps/api/test/integration/notifications.spec.ts`:
  - Assignment creates a `Notification` for the assignee but not for the actor (no self-notify).
  - An @mention notifies the mentioned user.
  - A watched-card change notifies the watchers.
  - Preferences decide email (OFF/INSTANT/DIGEST) and push.
  - The digest job sends one email that aggregates unread, un-emailed notifications.
  - The due-soon reminder fires once, 24 h before; it is re-scheduled when `dueDate` changes and skipped if the card is in a DONE column or archived.
  - Marking read works; read-all works.

### Implementation for User Story 6

- [ ] T139 [P] [US6] Create `apps/api/prisma/schema/notifications.prisma`:
  - `Notification`: `id, userId, type enum assigned|mentioned|watched_card_changed|due_soon|overdue|invited, cardId?, boardId?, actorId?, data Json, readAt?, emailedAt?, createdAt`, with an index on (`userId`, `readAt`, `createdAt` desc).
  - `NotificationPreference`: PK (`userId`,`type`), `inApp Boolean, email enum OFF|INSTANT|DIGEST, push Boolean`.
  - `PushSubscription`: `id, userId, endpoint unique, p256dh, auth, userAgent?, createdAt, lastUsedAt?`.
  - Run migration `notifications`.
- [ ] T140 [P] [US6] Create Zod schemas in `packages/shared/src/schemas/notifications.ts`: `NotificationType`, `preferencesSchema` (an array of `{type, inApp, email, push}`), `pushSubscriptionSchema` (the standard `PushSubscriptionJSON`), and the `NotificationDto` type. Add `DEFAULT_PREFERENCES`: "all in-app on, email INSTANT for assigned/mentioned/invited, push on".
- [ ] T141 [US6] Implement `NotificationsService` in `apps/api/src/modules/notifications/notifications.service.ts`. `notify({userIds, type, actorId, cardId?, boardId?, data})`:
  - Drops the actor and users without board access.
  - Loads preferences (defaults when no row exists).
  - Inserts `Notification` rows for `inApp`, emits `notification.new` with the unread count to `user:{id}` through the outbox, enqueues an `email` job for INSTANT, and enqueues a `push` job.
- [ ] T142 [US6] Implement the outbox consumer `apps/api/src/modules/notifications/notification-triggers.processor.ts` on the `notifications` queue. It maps board events to notifications:
  - `card.assignees.changed` added ids → `assigned`.
  - `comment.added` mentions → `mentioned`.
  - Any `card.*` or `comment.added` → `watched_card_changed` for watchers, excluding users already notified for the same event.
  - The invitation created in US2 → `invited`, for existing users.
- [ ] T143 [US6] Implement the due reminders in `apps/api/src/modules/notifications/due-reminders.service.ts`:
  - When `dueDate` changes, upsert BullMQ delayed jobs `due_soon:{cardId}` (at `dueDate - 24h`) and `overdue:{cardId}` (at `dueDate`), and remove them when the due date is cleared or the card is archived.
  - The processor re-checks that the card is not in a DONE column and not archived before notifying assignees.
- [ ] T144 [P] [US6] Implement `PushService` in `apps/api/src/infra/push/push.service.ts` using `web-push` with VAPID from env, plus a `push` processor that sends to every subscription of the user, deletes subscriptions on 404/410, and updates `lastUsedAt`.
- [ ] T145 [P] [US6] Add the email templates `notification.tsx` (single event, with a deep link `APP_URL/b/{boardId}/c/{number}`) and `digest.tsx` (grouped by board) in `apps/api/src/infra/mail/templates/`. Implement the daily digest job in `apps/api/src/modules/notifications/digest.processor.ts`: a repeatable job every hour that sends to users for whom it is 08:00 in their `timezone` and who have DIGEST notifications where `emailedAt IS NULL`, then sets `emailedAt`.
- [ ] T146 [US6] Implement `NotificationsController` and `PreferencesController` in `apps/api/src/modules/notifications/`: `GET /notifications?unread=&cursor=`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET/PUT /me/notification-preferences`, `POST/DELETE /me/push-subscriptions`.
- [ ] T147 [P] [US6] Build the notification bell and popover in `apps/web/src/features/notifications/notification-bell.tsx`: an unread badge that updates live from `notification.new` on the socket, a list rendered with i18n per type, a click that marks the item read and navigates to the card, and a "Mark all read" action.
- [ ] T148 [P] [US6] Build the notification settings page `apps/web/src/routes/_app/settings/notifications.tsx`: a table of types × channels (in-app toggle, email select Off/Instant/Daily digest, push toggle), plus an "Enable browser notifications" button that requests permission and subscribes.
- [ ] T149 [US6] Create a minimal service worker `apps/web/src/sw.ts` with `push` (shows a notification with title, body and URL) and `notificationclick` (focuses or opens the URL) handlers, registered in `apps/web/src/lib/push.ts` with `subscribe()` using `VAPID_PUBLIC_KEY` from `GET /me` config. US16 extends this file with Workbox.
- [ ] T150 [P] [US6] E2E test `e2e/notifications.spec.ts`: user1 assigns and @mentions user2; user2's bell shows 2 unread; the Mailpit inbox has the emails; after switching email to Daily digest, a new assignment sends no instant email.

**Checkpoint**: 🎯 **MVP complete**. Quickstart steps 1–7 pass. SC-001 to SC-005 are met. All Constitution IV suites are green. Deploy (see Polish T253–T257) and demo before continuing.

---

## Phase 9: User Story 7 — Kanban Flow Controls (Priority: P2)

**Goal**: WIP limits (warn only), swimlanes (by assignee, priority, epic or custom), a blocked flag with a reason, card aging, and column policies.

**Independent Test**: Set a WIP limit of 3, move a 4th card in and see the warning; switch swimlanes to by-assignee; block a card (quickstart steps 8–10).

- [ ] T151 [P] [US7] Migration `flow_controls`:
  - In `apps/api/prisma/schema/board.prisma`, add `Column.wipLimit Int?` ("≥ 1"), `Column.policy Json?`, `Board.agingThresholdDays Int default 7` and `Board.swimlaneMode enum NONE|ASSIGNEE|PRIORITY|EPIC|CUSTOM default NONE`, plus the model `Swimlane` `{id, boardId, name, position}`.
  - In `card.prisma`, add `Card.lastMovedAt DateTime default now()`, `Card.isBlocked Boolean default false`, `Card.blockedReason String?` and `Card.swimlaneId String?`.
- [ ] T152 [P] [US7] Extend the shared schemas in `packages/shared/src/schemas/board.ts` and `card-details.ts`: `wipLimit: int ≥ 1 | null`, `policy: richTextDoc | null`, `agingThresholdDays: int 1..365`, `swimlaneMode`, `swimlaneSchema {name 1–60}`, and the card fields `isBlocked` and `blockedReason` ("reason required when blocked (1–500)", enforced with a refine).
- [ ] T153 [P] [US7] Integration tests in `apps/api/test/integration/flow.spec.ts`:
  - A move into a full column succeeds and returns `wipExceeded: true` and emits `column.wip.exceeded`.
  - Lowering the WIP limit below the current count emits `column.wip.exceeded` immediately.
  - Setting `isBlocked` without a reason → 422.
  - `lastMovedAt` updates on cross-column moves only.
  - A custom swimlane move sets `swimlaneId`.
- [ ] T154 [P] [US7] Permission tests in `apps/api/test/permissions/flow.permissions.spec.ts` (Constitution IV), allowed and denied for each role: WIP limit, policy, swimlane mode and aging settings (board Admin only); swimlane CRUD and the blocked flag (Admin and Member; Viewer denied).
- [ ] T155 [US7] Update `CardMoveService` in `apps/api/src/modules/cards/card-move.service.ts`:
  - Set `lastMovedAt` when the column changes.
  - Accept `toSwimlaneId` when the board is in CUSTOM mode, or translate it into an assignee or priority change in ASSIGNEE or PRIORITY mode (US7 scenario 2).
  - Compute `wipExceeded`.
- [ ] T156 [US7] Extend `ColumnsService` and `BoardsService` with the WIP limit, policy, aging threshold and swimlane mode updates, emitting `column.wip.exceeded` when the count exceeds the limit. Add `SwimlanesController` (`GET/POST /boards/:bid/swimlanes`, `PATCH/DELETE /swimlanes/:id`) in `apps/api/src/modules/flow/swimlanes.controller.ts`.
- [ ] T157 [P] [US7] Build the column settings dialog `apps/web/src/features/board/column-settings-dialog.tsx` (WIP limit, category, policy editor using Tiptap). Show `count/limit` in the column header in red when exceeded, and display the policy in an info popover.
- [ ] T158 [US7] Build swimlane rendering in `apps/web/src/features/board/swimlanes.tsx`:
  - Rows grouped by assignee (with an "Unassigned" row), by priority, or by custom lanes; EPIC mode stays hidden until US11.
  - A collapse toggle for each row.
  - Drag between lanes using dnd-kit droppable ids `{columnId, laneKey}`.
  - Keyboard: the "Move to…" dialog gains a lane select when swimlanes are active.
  - A mode switcher in the board header.
- [ ] T159 [P] [US7] Build the blocked flag UI in `apps/web/src/features/card/fields/blocked-toggle.tsx` (toggle + reason textarea) and the blocked indicator (icon + red border) with a reason tooltip in `card-tile.tsx`.
- [ ] T160 [P] [US7] Add the aging indicator in `apps/web/src/features/board/card-tile.tsx`: when `now - lastMovedAt > agingThresholdDays`, show faded styling and a "Not moved in N days" tooltip. Add the aging threshold setting to `board-settings-dialog.tsx`.

**Checkpoint**: Quickstart steps 8–10 pass.

---

## Phase 10: User Story 8 — Search, Filters & Views (Priority: P2)

**Goal**: Full-text search across accessible boards, board filters, saved views, List/Calendar/Timeline views, and a My tasks page.

**Independent Test**: Search for a word that appears only in a comment, save a filter, and reschedule a card in the Calendar view (quickstart step 11).

- [ ] T161 [P] [US8] Raw SQL migration `search` in `apps/api/prisma/migrations/`:
  - `CREATE EXTENSION pg_trgm`.
  - `Card.searchVector tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce("descriptionText",''))) STORED`, the same on `Comment.bodyText`.
  - GIN indexes on both vectors and a GIN `gin_trgm_ops` index on `Card.title` and `Comment.bodyText`.
  - Declare the columns as `Unsupported("tsvector")?` in the Prisma models.
- [ ] T162 [P] [US8] Add the model `SavedView` `{id, boardId, ownerId, name 1–60, viewType enum BOARD|LIST|CALENDAR|TIMELINE, filters Json, isShared Boolean default false, createdAt, updatedAt}` in `apps/api/prisma/schema/views.prisma`, with a migration.
- [ ] T163 [P] [US8] Create shared schemas in `packages/shared/src/schemas/search.ts`:
  - `searchQuerySchema` `{q 1–200, workspaceId?, type?: card|comment|board, cursor?, limit?}`
  - `boardFiltersSchema` `{assigneeIds?, labelIds?, priorities?, due?: overdue|today|week|none, mine?: boolean}`
  - `savedViewSchema`
- [ ] T164 [P] [US8] Integration tests in `apps/api/test/integration/search.spec.ts`:
  - A word found only in a comment returns the card.
  - Results never include private boards the user can't access, or other workspaces (FR-070, SC-005).
  - A Chinese substring matches through the trigram index.
  - Every filter combination returns the right cards.
  - A shared view is visible to board members; a personal view only to its owner.
- [ ] T165 [P] [US8] Permission tests in `apps/api/test/permissions/search.permissions.spec.ts` (Constitution IV), allowed and denied for each role: personal saved views (all roles); shared views (Admin and Member; Viewer denied); search never returns boards the caller can't access.
- [ ] T166 [US8] Implement `SearchService` and `SearchController` (`GET /search`) in `apps/api/src/modules/search/`:
  - One SQL query with `$queryRaw` that combines `websearch_to_tsquery('simple', q)` with a trigram `similarity`/`ILIKE` fallback.
  - The query joins an accessible-boards CTE built from `WorkspaceMember` and `BoardMember` with the `effectiveBoardRole` rules.
  - Results are ranked with `ts_rank` and include highlighted snippets (`ts_headline`).
- [ ] T167 [US8] Implement the filtered card list `GET /boards/:bid/cards` (filters + `view` param; CALENDAR and TIMELINE require a `from`/`to` range) in `apps/api/src/modules/search/board-cards.controller.ts`, and `GET /me/tasks` (assigned to me, non-archived, across accessible boards, sorted by due date) in `apps/api/src/modules/search/my-tasks.controller.ts`.
- [ ] T168 [P] [US8] Implement `SavedViewsController` in `apps/api/src/modules/search/saved-views.controller.ts`: `GET/POST /boards/:bid/views`, `PATCH/DELETE /views/:id`. Only the owner edits; sharing requires the Member role.
- [ ] T169 [P] [US8] Build the global search palette `apps/web/src/features/search/search-palette.tsx`: shadcn `command`, opened with Ctrl/⌘+K, debounced at 200 ms, results grouped by boards, cards and comments, with highlighted snippets; Enter navigates to the result.
- [ ] T170 [US8] Build the filter bar and saved views in `apps/web/src/features/views/filter-bar.tsx` and `saved-views-menu.tsx`:
  - Filters for assignee, label, priority, due and "Only my cards", synced to URL search params.
  - The board view applies filters client-side, dimming non-matching cards.
  - "Save view", and applying a view in one click.
- [ ] T171 [P] [US8] Build the List/Table view `apps/web/src/features/views/list-view.tsx` with `@tanstack/react-table`: sortable columns (number, title, column, assignees, priority, due date, labels), inline priority and due editing, and row click to open the card.
- [ ] T172 [P] [US8] Build the Calendar view `apps/web/src/features/views/calendar-view.tsx`: month and week grids with `date-fns` in the user's timezone, cards placed on their due date, dnd-kit dragging to another day that patches `dueDate` (keeping the time of day), and an "Unscheduled" side list. Keyboard: arrow keys move focus between days; focus a card and press Enter to open a date picker.
- [ ] T173 [P] [US8] Build the Timeline view `apps/web/src/features/views/timeline-view.tsx`: a horizontal day grid with week/month zoom, a bar from `startDate` to `dueDate` for each card (a single-day marker when only one date is set), drag to move both dates, and edge drag to resize. Keyboard: on a focused bar, Shift+←/→ moves both dates by one day and Alt+←/→ changes the end date.
- [ ] T174 [P] [US8] Add the view switcher (Board | List | Calendar | Timeline) to `board-header.tsx`, persisted in the URL `?view=`. Build the My tasks page `apps/web/src/routes/_app/my-tasks.tsx`, grouped by Overdue, Today, This week, Later and No date.

**Checkpoint**: Quickstart step 11 passes. SC-006 is checked with the large seed in Polish.

---

## Phase 11: User Story 9 — Time Tracking & Estimates (Priority: P3)

**Goal**: Card timers (one active per user), manual time logs, a Pomodoro timer, per-board estimate units, and recurring cards.

**Independent Test**: Start a timer on card A, start one on card B, and check A stopped; finish a Pomodoro; a recurring card gets created (quickstart step 12).

- [ ] T175 [P] [US9] Create `apps/api/prisma/schema/time.prisma` and its migration:
  - `TimeEntry`: `id, cardId, userId, source enum TIMER|MANUAL|POMODORO, startedAt, endedAt?, durationSec Int?, note String?, createdAt`, with a raw SQL partial unique index on `("userId") WHERE "endedAt" IS NULL` ("at most one entry per user with endedAt = null").
  - `PomodoroSettings`: `userId PK, workMin default 25, shortBreakMin default 5, longBreakMin default 15, longBreakEvery default 4`.
  - Also add `Board.estimateUnit enum POINTS|HOURS default POINTS`, `Card.estimate Decimal?` ("≥ 0") and `Card.recurrence Json?`.
- [ ] T176 [P] [US9] Create shared schemas in `packages/shared/src/schemas/time.ts`:
  - `manualEntrySchema` `{startedAt, durationSec int > 0 ("Manual entries require durationSec > 0"), note? ≤500}`
  - `pomodoroSettingsSchema` (ranges: workMin 5–90, breaks 1–60, longBreakEvery 2–10)
  - `recurrenceSchema` `{freq: DAILY|WEEKLY|MONTHLY|CUSTOM, interval int ≥1, byDay?: MO..SU[], targetColumnId}`
  - `estimate: number ≥ 0 | null`
- [ ] T177 [P] [US9] Integration tests in `apps/api/test/integration/time-tracking.spec.ts`:
  - Starting a timer on B auto-stops the one on A with the duration computed.
  - Manual `durationSec` 0 → 422.
  - A Pomodoro completion logs `source=POMODORO`.
  - The recurrence job creates a copy (title, description, labels, checklists unchecked, assignees) in `targetColumnId` and advances `nextRunAt`.
  - An archived target column pauses the recurrence and notifies the owner.
- [ ] T178 [P] [US9] Permission tests in `apps/api/test/permissions/time.permissions.spec.ts` (Constitution IV), allowed and denied for each role: timer and time entries (Admin and Member; Viewer denied); editing or deleting another user's time entry is denied; the estimate unit (board Admin only).
- [ ] T179 [US9] Implement `TimerService` and controllers in `apps/api/src/modules/time-tracking/`:
  - `POST /cards/:id/timer/start`: in one transaction, stop any open entry, then create a new one.
  - `POST /me/timer/stop`, `GET /me/timer`.
  - `GET/POST /cards/:id/time-entries`, `PATCH/DELETE /time-entries/:id` (own entries only).
  - `GET/PUT /me/pomodoro-settings`.
  - Emit `timer.changed` to `user:{id}`.
- [ ] T180 [US9] Implement the recurring cards in `apps/api/src/modules/time-tracking/recurrence.service.ts`: `PUT/DELETE /cards/:id/recurrence` computes `nextRunAt` with `rrule` in the creator's timezone and schedules a BullMQ delayed job. The processor clones the card through `CardsService` (system actor) and re-schedules. If the target column is archived, it sets `recurrence.paused=true` and notifies the creator.
- [ ] T181 [P] [US9] Add the estimate setting to `board-settings-dialog.tsx` (Points or Hours) and the estimate field `apps/web/src/features/card/fields/estimate-field.tsx`. Show the estimate on `card-tile.tsx` and as a column sum in the column header.
- [ ] T182 [US9] Build the timer UI:
  - A Zustand store `apps/web/src/stores/timer-store.ts`, synced from `GET /me/timer` and the `timer.changed` socket event.
  - A start/stop button in the card dialog `apps/web/src/features/time/card-timer-button.tsx`.
  - A global active-timer pill in the top bar `apps/web/src/features/time/active-timer.tsx` showing elapsed time and the card link.
- [ ] T183 [P] [US9] Build the Pomodoro widget `apps/web/src/features/time/pomodoro.tsx`: pick a card, work and break intervals from settings, the cycle count for the long break, a browser notification and sound at the end of each interval, and `POST /cards/:id/time-entries` with `source=POMODORO` after each work interval.
- [ ] T184 [P] [US9] Build the card "Time" tab `apps/web/src/features/time/time-log.tsx` (entries list, manual add and edit, total time) and the recurrence editor `apps/web/src/features/card/fields/recurrence-editor.tsx`.

**Checkpoint**: Quickstart step 12 passes.

---

## Phase 12: User Story 10 — Reporting & Flow Metrics (Priority: P3)

**Goal**: CFD, cycle and lead time, throughput and workload reports, all computed from card history and filterable by date range.

**Independent Test**: Seed known card movements and check the reports against hand-calculated values (quickstart step 13, SC-011).

- [ ] T185 [P] [US10] Add the model `BoardDailySnapshot` `{boardId, date Date, columnId, cardCount Int, estimateSum Decimal}` with PK (`boardId`,`date`,`columnId`) in `apps/api/prisma/schema/reports.prisma`, plus a migration.
- [ ] T186 [P] [US10] Create the history seed `apps/api/prisma/seed/history.ts` (script `db:seed:history`). It writes a board with 20 cards and backdated `ActivityEvent card.moved` rows with known dates, and prints the expected throughput per week, average cycle time and lead time.
- [ ] T187 [P] [US10] Integration tests in `apps/api/test/integration/reports.spec.ts` using the history seed fixtures:
  - A card that entered IN_PROGRESS on day 1 and DONE on day 4 has a cycle time of 3 days (US10 scenario 2).
  - Throughput per week equals the cards that entered DONE in that week.
  - Lead time is creation → DONE.
  - CFD counts per day per column match the snapshots.
  - Every report respects `from`/`to`.
- [ ] T188 [US10] Implement `ReportsService` and `ReportsController` in `apps/api/src/modules/reports/`:
  - `GET /boards/:bid/reports/cfd`: from snapshots plus today computed live.
  - `/cycle-time`: per card and as p50/p85/avg, from the first IN_PROGRESS entry to DONE, with lead time from `createdAt` to DONE.
  - `/throughput?bucket=week`.
  - `/workload`: open cards and estimate sum per assignee.
  - All use SQL over `ActivityEvent` with `card.moved` and the column categories.
- [ ] T189 [US10] Implement the nightly snapshot processor `apps/api/src/modules/reports/snapshot.processor.ts`: a repeatable job at 00:15 UTC that upserts `BoardDailySnapshot` for each active board, plus a backfill command `pnpm --filter api reports:backfill --board <id>`.
- [ ] T190 [US10] Build the reports page `apps/web/src/routes/_app/b/$boardId/reports.tsx` using Recharts:
  - A date range picker.
  - Charts in `apps/web/src/features/reports/`: `cfd-chart.tsx` (stacked area per column in column order), `cycle-time-chart.tsx` (scatter + p50/p85 lines), `throughput-chart.tsx` (weekly bars), `workload-chart.tsx` (horizontal bars).
  - Light/dark aware colors, accessible table fallbacks, and i18n labels.

**Checkpoint**: Quickstart step 13 passes. SC-011 is verified.

---

## Phase 13: User Story 11 — Project Structure: Issue Types, Backlog & Workflows (Priority: P4)

**Goal**: Issue types with a parent/child hierarchy, a backlog, dependency links, custom fields, and workflow rules for column transitions.

**Independent Test**: Create an Epic with Stories, link two cards, add a custom field, and check a forbidden transition is rejected (quickstart step 14, first part).

- [ ] T191 [P] [US11] Create the migration `structure`:
  - `Board.key String?` ("2–6 uppercase letters, unique per workspace").
  - `Card.issueType enum TASK|STORY|BUG|EPIC|SUBTASK default TASK`, `Card.parentId String?`, `Card.customFields Json default {}`.
  - `CardLink {id, sourceCardId, targetCardId, type enum BLOCKS|RELATES_TO}`, unique (source,target,type), check source ≠ target.
  - `CustomField {id, boardId, name 1–60, type enum TEXT|NUMBER|DATE|SELECT|MULTI_SELECT|USER, options Json?, position}`.
  - `WorkflowRule {id, boardId, fromColumnId, toColumnId, allowed Boolean}`.
  - Files: `apps/api/prisma/schema/structure.prisma`; edit `card.prisma` and `board.prisma`.
- [ ] T192 [P] [US11] Create shared schemas in `packages/shared/src/schemas/structure.ts`:
  - `issueTypeSchema`.
  - `PARENT_RULES` `{EPIC: [], STORY: ['EPIC'], TASK: ['EPIC'], BUG: ['EPIC'], SUBTASK: ['STORY','TASK','BUG']}`, encoding "Epic→Story/Task/Bug→Subtask only".
  - `cardLinkSchema`, `customFieldSchema`, `customFieldValueSchema(field)` (a value validator per type), `workflowSchema` `{transitions: {fromColumnId, toColumnId}[]}`.
- [ ] T193 [P] [US11] Integration tests in `apps/api/test/integration/structure.spec.ts`:
  - An invalid parent type → 422.
  - Epic progress = done children / total.
  - Linking a card to itself → 422.
  - A BLOCKS link shows as "is blocked by" on the target.
  - A custom field value with the wrong type → 422.
  - When a board has workflow rules, a move not explicitly allowed → 409 `WORKFLOW_VIOLATION`.
  - Moving a backlog card to the board puts it in the first non-archived column.
- [ ] T194 [P] [US11] Permission tests in `apps/api/test/permissions/structure.permissions.spec.ts` (Constitution IV), allowed and denied for each role: backlog, issue types and card links (Admin and Member; Viewer denied); custom fields and workflow rules (board Admin only).
- [ ] T195 [US11] Extend `CardsService` and `CardMoveService`:
  - Validate `issueType` and `parentId` against `PARENT_RULES`, and `customFields` against the board's `CustomField` definitions.
  - Check `WorkflowRule` before a move.
  - Support `toColumnId: null` (to the backlog) and moves from the backlog to the first column.
  - Add `epicProgress` to `GET /cards/:id` for Epics.
  - Files: `apps/api/src/modules/cards/cards.service.ts`, `card-move.service.ts`.
- [ ] T196 [US11] Implement the controllers in `apps/api/src/modules/structure/`:
  - `GET/POST /boards/:bid/backlog`: column null, ordered by `position`.
  - `GET/POST/DELETE /cards/:id/links[/:linkId]`: emits `card.updated` for both cards.
  - `GET/POST /boards/:bid/custom-fields`, `PATCH/DELETE /custom-fields/:id`: deleting a field strips its values from cards in a background job.
  - `GET/PUT /boards/:bid/workflow`.
  - `PATCH /boards/:bid` accepts `key`.
- [ ] T197 [P] [US11] Build the issue type UI in `apps/web/src/features/card/fields/issue-type-select.tsx`, with an icon on `card-tile.tsx`. Build `apps/web/src/features/card/hierarchy-panel.tsx`: set the parent, list the children with an "add child" action, and show the Epic progress bar. Enable EPIC swimlane mode in `swimlanes.tsx`.
- [ ] T198 [P] [US11] Build the links panel `apps/web/src/features/card/links-panel.tsx` (search for a card by number or title, choose Blocks / Is blocked by / Relates to) and the custom fields editor `apps/web/src/features/card/fields/custom-fields.tsx`, which renders an input for each field type.
- [ ] T199 [P] [US11] Build the board settings tabs:
  - "Custom fields" in `apps/web/src/features/board/settings/custom-fields-settings.tsx`: create, edit and reorder fields, and manage select options.
  - "Workflow" in `apps/web/src/features/board/settings/workflow-settings.tsx`: a from×to column matrix of checkboxes plus an "allow all" reset.
- [ ] T200 [US11] Build the backlog page `apps/web/src/routes/_app/b/$boardId/backlog.tsx` and `apps/web/src/features/backlog/backlog-list.tsx`: a ranked list with drag reordering, quick add, and a "Move to board" action. Each item also has a "Move to…" menu (Board / Backlog, Top / Bottom), so dragging is never the only way. Sprint sections are added in US12.

**Checkpoint**: The first part of quickstart step 14 passes.

---

## Phase 14: User Story 12 — Scrum Sprints (Priority: P4)

**Goal**: Scrum mode with sprint planning from the backlog, start and complete, carry-over of unfinished cards, and burndown/burnup.

**Independent Test**: Plan a sprint with 5 items, start it, finish 3, complete it, and choose where the other 2 go (quickstart step 14, second part).

- [ ] T201 [P] [US12] Create `apps/api/prisma/schema/sprint.prisma` and its migration:
  - `Sprint`: `id, boardId, name ("1–80"), goal?, startDate?, endDate?, state enum PLANNED|ACTIVE|COMPLETED, startedAt?, completedAt?, position`.
  - A raw SQL partial unique index on `("boardId") WHERE state='ACTIVE'` ("Only one ACTIVE sprint per board").
  - `Card.sprintId String?`.
- [ ] T202 [P] [US12] Create shared schemas in `packages/shared/src/schemas/sprint.ts`: `createSprintSchema` `{name 1–80, goal? ≤500, startDate?, endDate?}` (refined endDate ≥ startDate), `completeSprintSchema` `{moveIncompleteTo: 'backlog' | uuid}`, and the sprint events.
- [ ] T203 [P] [US12] Integration tests in `apps/api/test/integration/sprints.spec.ts`:
  - Starting a second sprint while one is ACTIVE → 409.
  - Sprint endpoints are rejected on KANBAN boards.
  - Completion moves cards outside DONE to the backlog, or to the chosen PLANNED sprint.
  - In SCRUM mode, the snapshot returns only cards from the active sprint.
  - Burndown points are recorded per day.
- [ ] T204 [P] [US12] Permission tests in `apps/api/test/permissions/sprints.permissions.spec.ts` (Constitution IV), allowed and denied for each role: plan, start and complete sprints (Admin and Member; Viewer denied).
- [ ] T205 [US12] Implement `SprintsService` and `SprintsController` in `apps/api/src/modules/sprints/`:
  - `GET/POST /boards/:bid/sprints`, `PATCH /sprints/:id`.
  - `POST /sprints/:id/start`: puts the sprint cards in the first column.
  - `POST /sprints/:id/complete`.
  - `POST /cards/:id/move` accepts `toSprintId`.
  - Every state change emits `sprint.changed`.
  - The board snapshot (`board-snapshot.query.ts`) filters to the active sprint when `mode=SCRUM`.
- [ ] T206 [US12] Add the burndown and burnup reports `GET /sprints/:sid/reports/burndown` and `/burnup` in `apps/api/src/modules/reports/sprint-reports.controller.ts`: remaining and completed estimate per day (cards when there are no estimates), with the ideal line from `startDate` to `endDate`.
- [ ] T207 [US12] Build the sprint UI:
  - Add sprint sections to `apps/web/src/features/backlog/backlog-list.tsx`: create a sprint, drag cards between the backlog and sprints (also via the item's "Move to…" menu with Sprint X as a target), show estimate totals, and a Start dialog (name, goal, dates).
  - Board header sprint banner `apps/web/src/features/sprints/sprint-banner.tsx` with the goal, days left and a "Complete sprint" dialog (`complete-sprint-dialog.tsx`) asking where incomplete cards go.
  - Mode switch (Kanban/Scrum) in board settings.
- [ ] T208 [P] [US12] Add `burndown-chart.tsx` and `burnup-chart.tsx` in `apps/web/src/features/reports/`, shown on the reports page when the board is in SCRUM mode, with a sprint selector.

**Checkpoint**: Quickstart step 14 passes.

---

## Phase 15: User Story 13 — Automation & Templates (Priority: P4)

**Goal**: "When / if / then" rules with run history and loop protection, plus board and card templates.

**Independent Test**: Create the rule "moved to Done → add label Shipped", move a card, and check the label and run log (quickstart step 15).

- [ ] T209 [P] [US13] Create `apps/api/prisma/schema/automation.prisma` and its migration:
  - `AutomationRule`: `id, boardId, name 1–80, enabled Boolean, trigger Json, conditions Json, actions Json, createdById, disabledReason?, createdAt, updatedAt`.
  - `AutomationRun`: `id, ruleId, triggerEventId, status enum SUCCESS|FAILED|LOOP_PREVENTED|SKIPPED, error?, createdAt`.
  - `Template`: `id, workspaceId? (null = built-in), kind enum BOARD|CARD, name, content Json, createdById?`.
  - `Board.templateId String?`.
- [ ] T210 [P] [US13] Create the shared rule schema in `packages/shared/src/schemas/automation.ts`:
  - Triggers: `card.created`, `card.moved {toColumnId?}`, `card.label_added {labelId}`, `card.due_passed`, `checklist.completed`.
  - Conditions: `hasLabel`, `priorityIs`, `assigneeIs`, `inColumn`.
  - Actions: `addLabel`, `removeLabel`, `assign`, `unassign`, `moveToColumn`, `setPriority`, `completeChecklists`, `addComment {text}`, `notify {to: creator|assignees|watchers|userId}`.
  - All as a Zod discriminated union, plus the `MAX_AUTOMATION_DEPTH = 3` constant.
- [ ] T211 [P] [US13] Integration tests in `apps/api/test/integration/automation.spec.ts`:
  - A matching trigger + condition runs the actions and logs SUCCESS.
  - A non-matching condition logs SKIPPED.
  - A self-triggering rule stops at depth 3 with LOOP_PREVENTED.
  - Deleting a label the rule references sets `enabled=false` and `disabledReason`, and notifies the board admins.
  - Creating a board from a template copies its columns, labels and template cards.
- [ ] T212 [P] [US13] Permission tests in `apps/api/test/permissions/automation.permissions.spec.ts` (Constitution IV), allowed and denied for each role: automation rules CRUD and run history writes (board Admin only); workspace templates (Owner and Admin; Members for their own templates; Viewer denied).
- [ ] T213 [US13] Implement the automation engine in `apps/api/src/modules/automation/automation.processor.ts`, consuming the `automation` queue fed by `OutboxDispatcher`:
  - For each event, load the board's enabled rules and match triggers and conditions.
  - Execute the actions through the domain services as a system actor (`actorId=null`, `data.automationRuleId`), passing `automationDepth+1` in the outbox payload.
  - Skip and log LOOP_PREVENTED when the depth would exceed 3.
  - Write an `AutomationRun`.
- [ ] T214 [US13] Implement `AutomationController` in `apps/api/src/modules/automation/automation.controller.ts`: `GET/POST /boards/:bid/automations`, `PATCH/DELETE /automations/:id`, `GET /automations/:id/runs`. Add a reference guard in `apps/api/src/modules/automation/rule-reference.listener.ts` that disables rules when a referenced label or column is deleted or archived.
- [ ] T215 [US13] Implement `TemplatesService` and `TemplatesController` in `apps/api/src/modules/automation/templates/`: `GET/POST /workspaces/:wid/templates`, `POST /boards/:bid/save-as-template` (columns, labels, custom fields, automations, optional cards), `POST /cards/:id/save-as-template`. Extend board creation with `template: <templateId>`. Seed the built-in templates "Basic Kanban", "Scrum" and "Bug tracking" in `apps/api/prisma/seed/templates.ts`.
- [ ] T216 [P] [US13] Build the rule builder `apps/web/src/features/automation/rule-builder.tsx` (a When → If → Then step form driven by the shared schema) and the rule list and run history `apps/web/src/routes/_app/b/$boardId/automations.tsx`.
- [ ] T217 [P] [US13] Build the templates UI: a template gallery in `create-board-dialog.tsx`, "Save as template" in the board menu and the card dialog menu, and a "Create from template" option in the column add-card menu (`apps/web/src/features/automation/template-picker.tsx`).

**Checkpoint**: Quickstart step 15 passes.

---

## Phase 16: User Story 14 — Integrations & Public API (Priority: P4)

**Goal**: Personal access tokens and a documented public API, signed webhooks with retries, Slack, GitHub/GitLab, Google Drive and Google Calendar.

**Independent Test**: Create a card with a token through the API, receive a signed webhook, and see a Slack post on Done (quickstart steps 16–17).

- [ ] T218 [P] [US14] Create `apps/api/prisma/schema/integrations.prisma` and its migration:
  - `AccessToken`: `id, userId, name, tokenHash unique, prefix, scopes String[], lastUsedAt?, expiresAt?, revokedAt?`.
  - `Webhook`: `id, workspaceId, boardId?, url ("https only"), secret (encrypted), events String[], enabled, createdById, failingSince?`.
  - `WebhookDelivery`: `id, webhookId, eventId, attempt, status enum PENDING|SUCCESS|FAILED, responseCode?, nextAttemptAt?, createdAt`.
  - `IntegrationConnection`: `id, workspaceId?, userId?, provider enum SLACK|GITHUB|GITLAB|GOOGLE, externalId, credentials (encrypted), status enum ACTIVE|DISCONNECTED|ERROR, connectedById, settings Json`.
  - `IntegrationRoute`: `id, connectionId, boardId, channelId, events String[]`.
  - `CardExternalLink`: `id, cardId, provider enum GITHUB|GITLAB, kind enum COMMIT|PULL_REQUEST|MERGE_REQUEST, url, title, state?, externalId`, unique (provider, externalId, cardId).
- [ ] T219 [P] [US14] Integration tests in `apps/api/test/integration/public-api.spec.ts`:
  - A `kora_pat_` token with the `read` scope gets 200 on GET and 403 on POST.
  - `write` can create a card.
  - A token never exceeds the user's own permissions.
  - A revoked or expired token → 401.
  - The 101st request in a minute → 429 with `Retry-After`.
  - CSRF is not required for Bearer auth.
- [ ] T220 [P] [US14] Integration tests in `apps/api/test/integration/webhooks.spec.ts` and `inbound-hooks.spec.ts`:
  - Each delivery has a valid `X-Kora-Signature` (HMAC of `${timestamp}.${body}`).
  - The retry schedule is "1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h, 24 h" (8 attempts), then FAILED.
  - The webhook is auto-disabled after 3 days failing.
  - A GitHub push with an invalid `X-Hub-Signature-256` → 401.
  - A GitHub push with a valid signature and no CSRF token is accepted.
  - A valid push with "KORA-1 fix" creates a `CardExternalLink`.
  - A merged PR moves the card when enabled.
- [ ] T221 [P] [US14] Permission tests in `apps/api/test/permissions/integrations.permissions.spec.ts` (Constitution IV), allowed and denied for each role: webhooks and integrations (workspace Owner and Admin only); for each token scope (`read`, `write`, `admin`), the effective permission is scope ∩ the user's own permissions.
- [ ] T222 [US14] Implement access tokens in `apps/api/src/modules/public-api/`:
  - `GET/POST/DELETE /me/tokens[/:id]`: plaintext `kora_pat_<random>` shown once, only the hash stored, `prefix` = the first 8 characters.
  - `BearerTokenGuard` runs before the session guard; the effective permission is scope ∩ user permissions (`contracts/permissions.md`).
  - Uses the `api-token` throttler.
- [ ] T223 [US14] Generate the OpenAPI document from the shared Zod schemas with `@asteasolutions/zod-to-openapi` in `apps/api/src/modules/public-api/openapi.ts`, and serve Swagger UI at `/api/v1/docs` covering the boards, columns, cards, comments and members endpoints (FR-130).
- [ ] T224 [US14] Implement outbound webhooks in `apps/api/src/modules/webhooks/`:
  - CRUD controller `GET/POST /workspaces/:wid/webhooks`, `PATCH/DELETE /webhooks/:id`, `GET /webhooks/:id/deliveries`, `POST /webhooks/:id/test` (sends a `ping`).
  - A delivery processor on the `webhooks` queue, fed by `OutboxDispatcher` and filtered by the subscribed events in `contracts/webhooks.md`. It signs per that contract with a 10 s timeout and the retry schedule.
  - A daily job auto-disables webhooks that have been failing for 3 days and notifies the Admins.
- [ ] T225 [US14] Implement the Slack integration in `apps/api/src/modules/integrations/slack/`:
  - OAuth install `GET /integrations/slack/connect?workspaceId=` with callback; the bot token is stored encrypted.
  - Routes CRUD `GET/POST/DELETE /integrations/:id/routes`, with channel listing through `conversations.list`.
  - The consumer posts the routed events with `chat.postMessage` (Block Kit message with the card link).
  - `invalid_auth` marks the connection DISCONNECTED and posting stops (spec edge case).
- [ ] T226 [US14] Implement GitHub and GitLab in `apps/api/src/modules/integrations/git/`:
  - GitHub App install flow (stores `installationId`).
  - `/hooks/github` and `/hooks/gitlab` are `@Public() @SkipCsrf()`, authenticated only by their signature or token.
  - `POST /hooks/github`: verify `X-Hub-Signature-256` and handle `push` and `pull_request`.
  - `POST /hooks/gitlab`: verify `X-Gitlab-Token` and handle push and merge request.
  - Parse references with `/\b([A-Z]{2,6})-(\d+)\b/` against `Board.key` + `Card.number` and upsert `CardExternalLink`.
  - When `settings.moveOnMerge` is set, move the card to the configured column when its PR/MR merges.
- [ ] T227 [US14] Implement Google Drive and Calendar in `apps/api/src/modules/integrations/google/`:
  - Per-user incremental OAuth with the scopes `drive.file` and `calendar.events`.
  - `POST /cards/:id/attachments/gdrive` `{fileId, name, url}` creates a GDRIVE attachment.
  - `PUT/DELETE /me/calendar-sync` creates a "Kora" calendar and upserts events (`extendedProperties.private.koraCardId`) for cards assigned to the user that have due dates, through `integrations` queue jobs triggered by `card.updated`, `card.assignees.changed` and `card.archived`.
- [ ] T228 [P] [US14] Build the settings pages:
  - API tokens `apps/web/src/routes/_app/settings/tokens.tsx`: create with name, scopes and expiry, show the token once, revoke.
  - Webhooks `apps/web/src/routes/_app/w/$workspaceSlug/settings/webhooks.tsx`: CRUD, event checkboxes, deliveries log, test button.
  - Integrations `apps/web/src/routes/_app/w/$workspaceSlug/settings/integrations.tsx`: Slack, GitHub and GitLab connect cards and Slack channel routing.
- [ ] T229 [P] [US14] Build the card-level integration UI:
  - "Google Drive" in the attachment menu, using Google Picker (`apps/web/src/features/card/gdrive-picker.tsx`).
  - The external links panel listing commits and PRs/MRs with their state (`apps/web/src/features/card/external-links.tsx`).
  - A calendar sync toggle on `settings/profile.tsx`.

**Checkpoint**: Quickstart steps 16–17 pass.

---

## Phase 17: User Story 15 — Export & Re-import (Priority: P4)

**Goal**: Export a board as CSV or as a full Kora file, and import a Kora file all-or-nothing, with a report of user mappings.

**Independent Test**: Export a board, import it into another workspace, and check the content is identical (quickstart step 18, SC-010).

- [ ] T230 [P] [US15] Create the model `DataJob` `{id, workspaceId, boardId?, kind enum EXPORT_JSON|EXPORT_CSV|IMPORT, status enum QUEUED|RUNNING|SUCCEEDED|FAILED, fileKey?, report Json?, requestedById, createdAt, finishedAt?}` in `apps/api/prisma/schema/data-transfer.prisma`, plus a migration.
- [ ] T231 [P] [US15] Create the shared export format `packages/shared/src/schemas/export-format.ts`: a Zod `KoraExportV1` with `{formatVersion: 1, exportedAt, board, columns, labels, swimlanes, customFields, cards (with checklists, comments, attachments as URLs, links), users: [{id, email, name}]}`.
- [ ] T232 [P] [US15] Integration tests in `apps/api/test/integration/data-transfer.spec.ts`:
  - Export then import into another workspace gives the same columns, cards, labels, checklists and comments, compared field by field (SC-010).
  - Users not in the target workspace are dropped from assignees and listed in `report.droppedUsers`, and users with matching emails are mapped.
  - A corrupt zip, a wrong `formatVersion` or an invalid schema → FAILED with an error, and no rows are created (all-or-nothing).
  - A CSV export has one row per card.
- [ ] T233 [P] [US15] Permission tests in `apps/api/test/permissions/data-transfer.permissions.spec.ts` (Constitution IV), allowed and denied for each role: export (board Admin only); import (workspace Owner, Admin and Member; Viewer denied).
- [ ] T234 [US15] Implement export in `apps/api/src/modules/data-transfer/export.processor.ts`:
  - `POST /boards/:bid/export {format}` creates a `DataJob`.
  - The processor builds `KoraExportV1`, zips `board.json` + `manifest.json` with `archiver`, or writes CSV with `csv-stringify`, uploads to R2 under `exports/{jobId}`, and emits `job.finished` to the user.
- [ ] T235 [US15] Implement import in `apps/api/src/modules/data-transfer/import.processor.ts`:
  - `POST /workspaces/:wid/import/upload-url` and `POST /workspaces/:wid/import {fileKey}`.
  - The processor unzips and validates `KoraExportV1`, maps users by email, then creates everything in **one** `prisma.$transaction` with new ids and preserved order, and copies attachments.
  - It writes `report` and emits `job.finished`.
  - `GET /jobs/:id` returns the status, a signed download URL and the report.
- [ ] T236 [P] [US15] Build the export dialog `apps/web/src/features/data-transfer/export-dialog.tsx` (Kora file or CSV; download when `job.finished` arrives) and the import dialog `apps/web/src/features/data-transfer/import-dialog.tsx` (file upload, progress, report with dropped and mapped users), reachable from the board menu and the workspace home.

**Checkpoint**: Quickstart step 18 passes.

---

## Phase 18: User Story 16 — Platform Experience: Offline, Languages, Themes (Priority: P4)

**Goal**: An installable PWA with offline viewing and editing that syncs later, 6 UI languages, light/dark/system themes and board backgrounds, keyboard shortcuts, and mobile-friendly core flows.

**Independent Test**: Go offline and move cards, then reconnect and check they sync; switch to Vietnamese and to dark mode (quickstart step 19, SC-008, SC-009).

- [ ] T237 [P] [US16] Configure the PWA in `apps/web/vite.config.ts`:
  - `vite-plugin-pwa` with `strategies: 'injectManifest'` and `srcDir/src`, `filename: 'sw.ts'`.
  - Manifest: name "Kora", icons 192/512 + maskable in `apps/web/public/icons/`, theme colors, `display: standalone`.
- [ ] T238 [US16] Extend `apps/web/src/sw.ts`, keeping the US6 push handlers:
  - Workbox `precacheAndRoute(self.__WB_MANIFEST)`.
  - SPA navigation fallback to `index.html`.
  - A `StaleWhileRevalidate` cache for `/api/v1/me`.
  - `CacheFirst` for avatars and attachment thumbnails, with a 7-day expiry.
  - No caching of other API data (the TanStack persister handles that).
- [ ] T239 [US16] Persist the query cache to IndexedDB in `apps/web/src/lib/query-persist.ts`:
  - `@tanstack/query-async-storage-persister` with `idb-keyval`, `maxAge` 7 days, persisting only `['me']`, `['board', *]`, `['card', *]` and `['my-tasks']`.
  - Bust the cache on logout.
- [ ] T240 [US16] Implement the offline mutation queue in `apps/web/src/lib/offline-mutations.ts`:
  - Register `queryClient.setMutationDefaults` for each mutation key (move card, update card, create card, toggle checklist item, add comment) so paused mutations survive a reload.
  - Each mutation carries a `clientMutationId` (server dedupe through `ProcessedMutation`).
  - `onlineManager` resumes them in order on reconnect.
  - Rejections (403/404/409) roll back and are collected for a notice.
- [ ] T241 [P] [US16] Build the sync status UI in `apps/web/src/features/platform/sync-status.tsx`: an offline banner, a "N changes pending sync" badge, and after sync a dialog listing rejected or overridden changes with reasons (US16 scenario 2). Mount it in `_app.tsx`.
- [ ] T242 [P] [US16] E2E test `e2e/offline.spec.ts`:
  - Open the board, `context.setOffline(true)`, move 3 cards, check the pending badge shows 3.
  - Reload while offline: the board still renders from the cache and the queue is kept.
  - Go back online: the badge clears within 10 s (SC-009) and user2 sees the moves.
  - A conflicting change made by user2 while offline shows in the conflict notice.
- [ ] T243 [P] [US16] Add Spanish translations: all namespaces in `apps/web/src/i18n/locales/es/*.json` and the API messages in `apps/api/src/common/i18n/messages/es.json`.
- [ ] T244 [P] [US16] Add French translations: `apps/web/src/i18n/locales/fr/*.json` and `apps/api/src/common/i18n/messages/fr.json`.
- [ ] T245 [P] [US16] Add German translations: `apps/web/src/i18n/locales/de/*.json` and `apps/api/src/common/i18n/messages/de.json`.
- [ ] T246 [P] [US16] Add Simplified Chinese translations: `apps/web/src/i18n/locales/zh-CN/*.json` and `apps/api/src/common/i18n/messages/zh-CN.json`.
- [ ] T247 [P] [US16] Add Vietnamese translations: `apps/web/src/i18n/locales/vi/*.json` and `apps/api/src/common/i18n/messages/vi.json`.
- [ ] T248 [US16] Turn on every language:
  - Enable all 6 locales in the profile language select (`settings/profile.tsx`).
  - Apply them to `i18next.changeLanguage` and `<html lang>`.
  - Use `Intl.DateTimeFormat`/`NumberFormat` and the `date-fns` locale everywhere dates are shown.
  - Render emails in the recipient's `User.locale` (`MailService`).
  - Make `i18n:check` require all 6 locales.
- [ ] T249 [P] [US16] Add the theme UI: a light/dark/system switch in the top bar user menu and the profile, saved to `User.theme` and applied through `theme-provider.tsx`. Verify every screen and chart in dark mode keeps WCAG AA contrast.
- [ ] T250 [P] [US16] Add board backgrounds:
  - Migration `Board.background Json?` (`{type: color|image, value}`).
  - A picker in `board-settings-dialog.tsx`: 10 preset colors, 6 preset images from `apps/web/public/backgrounds/`, or an upload through the attachment pipeline.
  - Rendered behind the columns with a contrast overlay.
- [ ] T251 [P] [US16] Add keyboard shortcuts in `apps/web/src/features/platform/shortcuts.ts`:
  - `?` help panel, `/` or Ctrl/⌘+K search, `n` new card in the focused column, `e` edit title, `m` "Move to…", `a` assign me, `l` labels, `d` due date, `Esc` close, `j`/`k` next/previous card.
  - Disabled while typing in inputs.
  - Help panel `shortcut-help-dialog.tsx` with i18n.
- [ ] T252 [US16] Make the core flows work on mobile (FR-154):
  - Board: columns snap-scroll horizontally on phones, and touch dragging uses dnd-kit `TouchSensor` with a 200 ms delay.
  - The card dialog becomes a full-screen sheet below the `md` breakpoint.
  - The sidebar collapses into a drawer.
  - Verify at 375×812 in Playwright (`e2e/mobile.spec.ts`).

**Checkpoint**: Quickstart step 19 passes. SC-008 and SC-009 are verified.

---

## Phase 19: Polish & Cross-Cutting Concerns

**Purpose**: Production deployment, performance, security, accessibility, docs

- [ ] T253 [P] Create the production Dockerfile `apps/api/Dockerfile`: a multi-stage build with `pnpm deploy --filter api`, `prisma generate`, and a non-root user. The same image runs `node dist/main.js` (api) or `node dist/worker.js` (worker).
- [ ] T254 [P] Create the production web image `apps/web/Dockerfile`: `vite build`, then copy the output into a `caddy:2` image serving the static files.
- [ ] T255 Create the production stack `infra/docker-compose.yml`:
  - Services: `caddy`, `api`, `worker`, `postgres` (volume), `redis` (AOF).
  - A `migrate` one-shot service running `prisma migrate deploy`.
  - Health checks and `restart: unless-stopped` on every service.
  - `env_file: .env`.
- [ ] T256 Configure Caddy in `infra/Caddyfile`:
  - Automatic HTTPS for `{$DOMAIN}`.
  - Proxy `/api/*`, `/rt/*` (WebSocket) and `/healthz` to `api:3000`, and serve the SPA with a fallback to `index.html`.
  - Security headers: CSP allowing self, R2 and the Google Picker origins; HSTS; X-Content-Type-Options; Referrer-Policy; Permissions-Policy.
- [ ] T257 [P] Create the backup scripts in `infra/backup/backup.sh` and `restore.sh`:
  - A nightly `pg_dump -Fc` uploaded to R2 under `backups/`, keeping 7 daily and 4 weekly copies.
  - A host cron entry and a documented restore drill in `infra/backup/README.md`.
- [ ] T258 [P] Create the large seed `apps/api/prisma/seed/large.ts` (script `db:seed:large`): one board with 500 cards spread over 5 columns, and a workspace with 10 000 cards and 20 000 comments.
- [ ] T259 Run the performance checks with the large seed and fix the regressions:
  - A 500-card board loads in under 3 s with smooth dragging (SC-003). Profile `board-snapshot.query.ts` and the column virtualization.
  - Search returns in under 1 s (SC-006). Use `EXPLAIN ANALYZE` on the search query.
  - Record the results in `specs/001-kora-kanban-platform/perf-results.md`.
- [ ] T260 [P] Load-test real-time with `e2e/load/realtime.k6.js` (k6 + `xk6-websockets`): 100 concurrent users across 10 boards (SC-007), checking event latency p95 ≤ 2 s (SC-002).
- [ ] T261 [P] Run an accessibility pass: add `@axe-core/playwright` checks to `e2e/a11y.spec.ts` for the login, board, card dialog, settings and reports pages with zero serious or critical violations. Add keyboard-only Playwright specs for every drag interaction: board cards and columns, checklist items, swimlanes, calendar, timeline, backlog and sprints (SC-008).
- [ ] T262 [P] Security review against Constitution II:
  - Confirm every controller route has `@Public()` or `@RequirePermission`, using a unit test in `apps/api/test/permissions/route-coverage.spec.ts` that walks the Nest route metadata.
  - The same test lists every `@SkipCsrf()` route and fails if any exists outside the approved list (`/hooks/*`).
  - Run `pnpm audit`.
  - Verify the `kora_sid` cookie flags in production.
  - Verify the rich-text allow-list.
- [ ] T263 [P] Add `apps/api/test/permissions/permissions-coverage.spec.ts`: permission tests declare the row they cover with a `describePermission('<row text>')` helper (`apps/api/test/permissions/describe-permission.ts`); this test parses every row of `contracts/permissions.md` and fails when any row has no matching test.
- [ ] T264 [P] Write the repository docs: `README.md` (overview, stack, local setup linked to quickstart, scripts) and `docs/architecture.md` (modules, outbox/real-time flow diagram, permissions, phases).
- [ ] T265 Run the full `specs/001-kora-kanban-platform/quickstart.md` validation (steps 1–19 plus the performance check) on a staging VPS and record the pass/fail results in `specs/001-kora-kanban-platform/validation-log.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup and **blocks all stories**.
- **MVP stories (Phases 3–8)** run **in order**, because each one builds on the domain the previous one creates:
  - US1 (accounts) → US2 (workspaces need users) → US3 (boards need workspaces and the permission resolvers).
  - Then US4 and US5 can run **in parallel**: both need US3, and they touch different modules.
  - US6 needs US4 (mentions, watchers) and US5 (the outbox dispatcher, user rooms).
- **P2 (US7, US8)**: both need the MVP. Independent of each other and can run in parallel.
- **P3 (US9, US10)**: need the MVP. US10 benefits from US9 estimates (workload sums), but falls back to counts.
- **P4**:
  - US11 → US12, because sprints need the backlog.
  - US13 needs the MVP outbox (US5); its "notify" action needs US6.
  - US14 needs the MVP; its webhooks use the US5 outbox.
  - US15 needs the MVP and exports US7/US11 fields when present.
  - US16's offline work needs US3–US5; its translations can start any time after the MVP UI is stable.
- **Polish**:
  - Deployment tasks T253–T257 can run right after the MVP checkpoint, to deploy the MVP.
  - The other Polish tasks come after the stories you plan to ship.
- **Constitution V**: a phase (P2, P3, P4) starts only after the previous phase is working and tested.

### User Story Dependency Graph

```text
Setup → Foundational → US1 → US2 → US3 ─┬→ US4 ─┐
                                        └→ US5 ─┴→ US6   ══ MVP ══
MVP ─┬→ US7 (P2)
     └→ US8 (P2)
P2 done ─┬→ US9 (P3)
         └→ US10 (P3)
P3 done ─┬→ US11 → US12
         ├→ US13
         ├→ US14
         ├→ US15
         └→ US16
```

### Within Each User Story

- Prisma schema/migration and shared Zod schemas come first, and can be written in parallel.
- Constitution IV test tasks are written next. They should fail before the implementation exists.
- Then services, controllers, and web API hooks.
- UI comes after the hooks it uses.
- Finish with the story's E2E test and checkpoint.

### Parallel Opportunities

- Setup: T002–T011 are all [P].
- Foundational: shared T013–T019 [P]; API infra T022–T028 and T033–T036 [P]; web T040–T044 [P].
- In each story: the schema, shared-schema and test tasks are [P] with each other. UI tasks in different files are [P].
- US4 ∥ US5 after US3; US7 ∥ US8; US9 ∥ US10; US13 ∥ US14 ∥ US15 ∥ US16 (translations T243–T247 are fully parallel).

---

## Parallel Example: User Story 3

```bash
# Schema + shared contracts together:
Task: "T079 Create Board/BoardMember/Column/Label in apps/api/prisma/schema/board.prisma"
Task: "T080 Create Card core in apps/api/prisma/schema/card.prisma"
Task: "T081 Create ActivityEvent/OutboxEvent/ProcessedMutation in apps/api/prisma/schema/activity.prisma"
Task: "T082 Board/column Zod schemas in packages/shared/src/schemas/board.ts"
Task: "T083 Card Zod schemas in packages/shared/src/schemas/card.ts"

# Constitution IV tests together:
Task: "T076 card-move.spec.ts", "T077 boards.spec.ts", "T078 board.permissions.spec.ts"

# UI components together (after T092 hooks):
Task: "T095 column.tsx", "T096 card-tile.tsx", "T097 move-to-dialog.tsx", "T098 board-header.tsx", "T099 archive-sheet.tsx"
```

## Parallel Example: User Story 16

```bash
Task: "T243 Spanish", "T244 French", "T245 German", "T246 Chinese (Simplified)", "T247 Vietnamese"
Task: "T249 theme UI", "T250 board backgrounds", "T251 keyboard shortcuts"
```

---

## Implementation Strategy

### MVP First (Phases 1–8)

1. Phase 1 Setup, then Phase 2 Foundational. **Stop and check** that CI is green and `/healthz` responds.
2. US1, then US2, then US3. **Stop and validate**: quickstart steps 1–4, card-move and permission suites green.
3. US4 and US5, in parallel or in either order, then US6.
4. **Stop and validate**: quickstart steps 1–7 and SC-001 to SC-005.
5. Deploy the MVP with T253–T257 and demo it.

### Incremental Delivery

1. MVP → deploy.
2. P2: US7 + US8 → quickstart 8–11 → deploy.
3. P3: US9 + US10 → quickstart 12–13 → deploy.
4. P4: pick milestones in any order the dependency graph allows (US11→US12, US13, US14, US15, US16) → deploy each one.
5. Polish T258–T265 before calling the product complete.

### Solo Developer Notes

- Commit after each task or logical group. Each phase checkpoint is a good place for a tag (`v0.1-mvp`, `v0.2`, …).
- P4 is large. Constitution V allows cutting or postponing any P4 story without affecting P1–P3.

---

## Notes

- [P] = different files and no dependency on incomplete tasks. [USn] = traceability to spec.md.
- Constraints from data-model.md are quoted in the tasks. Don't loosen them during implementation.
- Every board mutation goes through `BoardTxService` (T084). Don't write board data outside it, or real-time and activity history will break.
- Keep the permission matrix in `packages/shared` as the single source. The API guards and UI visibility both read it.
