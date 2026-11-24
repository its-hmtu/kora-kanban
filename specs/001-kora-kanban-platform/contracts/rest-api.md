# Contract: HTTP API

**Feature**: [../spec.md](../spec.md) · Data shapes: [../data-model.md](../data-model.md)

One API serves the Kora web app and the public API (FR-130).

## Conventions

- Base path: `/api/v1`. JSON only (`Content-Type: application/json`), except file uploads,
  which go straight to storage via presigned URLs.
- **Auth**:
  - Web app: `kora_sid` session cookie plus `X-CSRF-Token` header on non-GET requests.
  - Public API: `Authorization: Bearer kora_pat_…` (personal access token). CSRF does not apply.
- **Authorization**: every route declares a required permission
  (see [permissions.md](./permissions.md)). Denied → `403`. Resources the caller can't see →
  `404`, so their existence isn't revealed.
- **Validation**: request bodies are validated against Zod schemas from `packages/shared`.
  Failure → `422`.
- **Errors**: `{ "error": { "code": "WIP_LIMIT", "message": "…", "details": {} } }`, with the
  message localized by `Accept-Language`. Unexpected server errors (500, or any status with no
  more specific code) use `code: "INTERNAL"` with a generic message; internal details are
  logged, never returned.
- **Pagination**: cursor-based, `?cursor=…&limit=50` (max 100) → `{ items, nextCursor }`.
- **Mutations**:
  - Accept an optional `X-Client-Mutation-Id` (uuid) for idempotent offline replay.
  - Responses include `boardVersion` when the change touched a board.
    `boardVersion` is a bigint serialized as a decimal string (e.g. `"1042"`), never a JSON number.
- **Rate limits**:
  - Auth routes: 10 per minute per IP+email.
  - Public API tokens: 100 per minute. Exceeded → `429` with a `Retry-After` header.
- **Status codes**:
  - `200`/`201`/`204` on success.
  - `400` malformed, `401` unauthenticated, `403` forbidden, `404` not found.
  - `409` conflict (for example, a workflow rule forbids the move), `413` too large,
    `422` invalid, `429` rate-limited.

Legend: **[P1]** MVP … **[P4]** later. `🔓` = no auth required.

---

## Auth & account [P1]

| Method | Path | Purpose | FR |
|---|---|---|---|
| POST | `/auth/register` 🔓 | `{email, password, name}` → 201; sends verification email | 001 |
| POST | `/auth/verify-email` 🔓 | `{token}` | 001 |
| POST | `/auth/login` 🔓 | `{email, password}` → sets cookie; returns `{user}` | 005 |
| GET | `/auth/oauth/providers` 🔓 | `{providers: ('google'\|'github')[]}` — the configured OAuth providers (web hides the others) | 002 |
| GET | `/auth/oauth/:provider` 🔓 | Starts the Google/GitHub flow (redirect) | 002 |
| GET | `/auth/oauth/:provider/callback` 🔓 | Completes the flow, links accounts or creates one, sets cookie; any failure redirects to `/login?error=…` | 002, 003 |
| POST | `/auth/logout` | Ends the current session | 007 |
| POST | `/auth/logout-all` | Ends all sessions and disconnects sockets | 007 |
| POST | `/auth/password/forgot` 🔓 | `{email}` → always 204 (no account enumeration) | 004 |
| POST | `/auth/password/reset` 🔓 | `{token, password}` | 004 |
| GET | `/auth/csrf` 🔓 | Issues the CSRF cookie and token | — |
| GET | `/me` | Current user, preferences, workspace list | 006 |
| PATCH | `/me` | `{name?, avatarUrl?, locale?, theme?, timezone?}` | 006 |
| PUT | `/me/password` | `{currentPassword, newPassword}`; rotates sessions | 006 |
| DELETE | `/me` | Deletes the account (blocked if user is the sole Owner of a workspace) | 006 |
| GET/PUT | `/me/notification-preferences` | Per-type channel settings | 052 |
| POST/DELETE | `/me/push-subscriptions` | Registers or removes a browser push subscription | 051 |
| GET/POST/DELETE | `/me/tokens[/:id]` | Personal access tokens. [P4] | 130 |

## Workspaces & members [P1]

| Method | Path | Purpose | FR |
|---|---|---|---|
| GET/POST | `/workspaces` | List mine / create (caller becomes Owner) | 010 |
| GET/PATCH/DELETE | `/workspaces/:wid` | Read / rename / delete (Owner only) | 010 |
| GET | `/workspaces/:wid/members` | List members | 012 |
| PATCH/DELETE | `/workspaces/:wid/members/:uid` | Change role / remove (keeps at least 1 Owner) | 012, 016 |
| GET/POST | `/workspaces/:wid/invitations` | List / create (email or link) | 011 |
| DELETE | `/workspaces/:wid/invitations/:iid` | Revoke | 011 |
| GET | `/invitations/:token` 🔓 | Preview an invite | 011 |
| POST | `/invitations/:token/accept` | Join the workspace | 011 |

## Boards, columns, labels [P1]

| Method | Path | Purpose | FR |
|---|---|---|---|
| GET/POST | `/workspaces/:wid/boards` | List accessible / create `{name, visibility, template?: "default"\|"blank"}` | 020 |
| GET | `/boards/:bid` | Full board snapshot: board, columns, labels, members, cards (summary), `boardVersion` | 020 |
| PATCH | `/boards/:bid` | Name, visibility, settings (aging, swimlanes, estimate unit, background, mode) | 013, 063 |
| POST | `/boards/:bid/archive` · `/restore` | Archive or restore | 020 |
| DELETE | `/boards/:bid` | Permanent delete (requires `{confirm: board name}`) | 020 |
| GET/PUT/DELETE | `/boards/:bid/members[/:uid]` | Board roles | 014 |
| GET | `/boards/:bid/archive-items` | Archived columns and cards | 025 |
| POST | `/boards/:bid/columns` | `{name, afterColumnId?}` | 021 |
| PATCH | `/columns/:cid` | `{name?, position?, wipLimit?, policy?, category?}` | 021, 060, 064 |
| POST | `/columns/:cid/archive` · `/restore` | Archives or restores the column and its cards | 021 |
| GET/POST | `/boards/:bid/labels` · PATCH/DELETE `/labels/:lid` | Label management | 030 |

## Cards & details [P1]

| Method | Path | Purpose | FR |
|---|---|---|---|
| POST | `/columns/:cid/cards` | `{title, afterCardId?}` | 022 |
| GET | `/cards/:id` | Full card: details, checklists, attachments, watchers | 030 |
| PATCH | `/cards/:id` | Changed fields only, plus `baseVersion`; response includes `overwritten: [fields]` | 030, 042 |
| POST | `/cards/:id/move` | `{toColumnId, afterCardId?, beforeCardId?, toSwimlaneId?}` → `{position, boardVersion, wipExceeded}` | 023, 024, 060 |
| POST | `/cards/:id/archive` · `/restore` | Archive or restore | 022 |
| DELETE | `/cards/:id` | Permanent delete (only if archived) | 022 |
| PUT/DELETE | `/cards/:id/assignees/:uid` | Assign or unassign | 030 |
| PUT/DELETE | `/cards/:id/labels/:lid` | Add or remove a label | 030 |
| PUT/DELETE | `/cards/:id/watch` | Watch or unwatch | 036 |
| POST | `/cards/:id/checklists` · PATCH/DELETE `/checklists/:id` | Checklists | 031 |
| POST | `/checklists/:id/items` · PATCH/DELETE `/checklist-items/:id` | Items (text, isDone, position) | 031 |
| POST | `/cards/:id/attachments/upload-url` | `{name, mimeType, sizeBytes}` → `{attachmentId, uploadUrl}`; `413` if over 10 MB | 032 |
| POST | `/attachments/:id/confirm` | Verifies the uploaded object and marks it READY | 032 |
| POST | `/cards/:id/attachments/link` | `{url, name?}` | 032 |
| GET | `/attachments/:id/download` | 302 redirect to a short-lived signed URL | 032 |
| DELETE | `/attachments/:id` | Remove | 032 |
| GET/POST | `/cards/:id/comments` · PATCH/DELETE `/comments/:id` | Comments with mentions | 033 |
| GET | `/cards/:id/activity` | Paginated history | 034 |

## Notifications [P1]

| Method | Path | Purpose |
|---|---|---|
| GET | `/notifications?unread=true` | Paginated list |
| POST | `/notifications/:id/read` · `/notifications/read-all` | Mark as read |

## Search, filters, views [P2]

| Method | Path | Purpose | FR |
|---|---|---|---|
| GET | `/search?q=&workspaceId=&type=card\|comment\|board` | Full-text search, limited to boards the caller can access | 070 |
| GET | `/boards/:bid/cards?assignee=&label=&priority=&due=&mine=&view=` | Filtered card list (List/Calendar/Timeline views) | 071, 072 |
| GET/POST | `/boards/:bid/views` · PATCH/DELETE `/views/:id` | Saved views | 071 |
| GET | `/me/tasks` | Cards assigned to me across boards | 073 |
| PATCH | `/cards/:id` with `isBlocked`, `blockedReason` | Blocked flag | 062 |
| GET/POST | `/boards/:bid/swimlanes` · PATCH/DELETE `/swimlanes/:id` | Custom swimlanes | 061 |

## Time & estimates [P3]

| Method | Path | Purpose | FR |
|---|---|---|---|
| POST | `/cards/:id/timer/start` · `/me/timer/stop` | Start or stop the timer (starting stops any other active timer) | 080 |
| GET | `/me/timer` | The active timer, if any | 080 |
| GET/POST | `/cards/:id/time-entries` · PATCH/DELETE `/time-entries/:id` | Manual time logs | 080 |
| GET/PUT | `/me/pomodoro-settings` | Pomodoro intervals | 081 |
| PUT/DELETE | `/cards/:id/recurrence` | Recurring cards | 083 |

## Reports [P3]

| Method | Path | FR |
|---|---|---|
| GET | `/boards/:bid/reports/cfd?from=&to=` | 090 |
| GET | `/boards/:bid/reports/cycle-time?from=&to=` (includes lead time) | 090 |
| GET | `/boards/:bid/reports/throughput?from=&to=&bucket=week` | 090 |
| GET | `/boards/:bid/reports/workload` | 090 |
| GET | `/sprints/:sid/reports/burndown` · `/burnup` | 090 |

## Structure, sprints, automation, templates [P4]

| Method | Path | FR |
|---|---|---|
| GET | `/boards/:bid/backlog` · POST `/boards/:bid/backlog` (create item) | 101 |
| POST | `/cards/:id/move` with `toColumnId: null` (to backlog) or `toSprintId` | 101, 111 |
| PATCH | `/cards/:id` with `issueType`, `parentId`, `customFields` | 100, 103 |
| GET/POST/DELETE | `/cards/:id/links[/:linkId]` | 102 |
| GET/POST | `/boards/:bid/custom-fields` · PATCH/DELETE `/custom-fields/:id` | 103 |
| GET/PUT | `/boards/:bid/workflow` (list of allowed transitions) | 104 |
| GET/POST | `/boards/:bid/sprints` · PATCH `/sprints/:id` | 111 |
| POST | `/sprints/:id/start` · `/sprints/:id/complete` `{moveIncompleteTo: "backlog"\|sprintId}` | 111, 112 |
| GET/POST | `/boards/:bid/automations` · PATCH/DELETE `/automations/:id` · GET `/automations/:id/runs` | 120 |
| GET/POST | `/workspaces/:wid/templates` · POST `/boards/:bid/save-as-template` · POST `/cards/:id/save-as-template` | 122 |

## Integrations, webhooks, export/import [P4]

| Method | Path | FR |
|---|---|---|
| GET | `/workspaces/:wid/integrations` | 132–135 |
| GET | `/integrations/:provider/connect?workspaceId=` → OAuth or app-install redirect · DELETE `/integrations/:id` | 132–135 |
| GET/POST/DELETE | `/integrations/:id/routes` (Slack channel ↔ board, event list) | 132 |
| POST | `/hooks/github` 🔓 · `/hooks/gitlab` 🔓 (signature-verified inbound webhooks) | 133 |
| POST | `/cards/:id/attachments/gdrive` `{fileId, name, url}` | 134 |
| PUT/DELETE | `/me/calendar-sync` | 135 |
| GET/POST | `/workspaces/:wid/webhooks` · PATCH/DELETE `/webhooks/:id` · GET `/webhooks/:id/deliveries` · POST `/webhooks/:id/test` | 131 |
| POST | `/boards/:bid/export` `{format: "kora"\|"csv"}` → `{jobId}` | 140 |
| POST | `/workspaces/:wid/import/upload-url` · POST `/workspaces/:wid/import` `{fileKey}` → `{jobId}` | 141 |
| GET | `/jobs/:id` (status, download URL, import report) | 140, 141 |

## Ops

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` 🔓 | Checks the database, Redis and queue |
| GET | `/api/v1/docs` 🔓 | OpenAPI documentation for the public API |
