# Data Model: Kora

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-11-10

Logical model for PostgreSQL (implemented as a Prisma schema in `apps/api/prisma/schema/*.prisma` (multi-file)).
Conventions:

- All IDs are UUIDv7 (time-sortable) unless stated otherwise.
- Every mutable table has `createdAt`, `updatedAt`, and where user-driven, `createdById`.
  `Board`, `Column` and `Card` also have `updatedById`, and every change to them writes an
  `ActivityEvent` with the actor (Constitution: auditability).
- "Archivable" means `archivedAt: timestamp | null` + `archivedById`; archived rows are hidden by
  default and restorable (Constitution I).
- `position` fields are fractional-index strings (research B5).
- Phase tag shows when the entity/field is first needed: **P1** MVP, **P2** v1, **P3** v2,
  **P4** later.

---

## 1. Identity & access (P1)

### User
| Field | Type | Rules |
|---|---|---|
| id | uuid | |
| email | citext, unique | valid email, lowercased |
| emailVerifiedAt | timestamp? | required before password sign-in is fully enabled |
| passwordHash | text? | Argon2id; null for OAuth-only accounts |
| name | text | 1–100 chars |
| avatarUrl | text? | |
| locale | enum `en, es, fr, de, zh-CN, vi` | default from browser, fallback `en` |
| theme | enum `light, dark, system` | default `system` |
| timezone | text | IANA zone, default from browser |
| deletedAt | timestamp? | soft delete; content shows "Deleted user" |

### OAuthAccount
`id, userId → User, provider (google|github), providerUserId, email, emailVerified, createdAt`
- Unique (`provider`, `providerUserId`). Linked to an existing user only if `emailVerified` and
  email matches (FR-003).

### Session
`id, userId → User, tokenHash (unique), expiresAt, lastSeenAt, userAgent, ip, createdAt`
- `tokenHash` = SHA-256 of the cookie value. Deleted on sign-out; all rows for a user deleted on
  "sign out everywhere" and password change.

### VerificationToken
`id, userId, type (email_verify|password_reset), tokenHash, expiresAt, usedAt?`
- Single use; email_verify 24 h, password_reset 1 h (FR-004).

### Workspace
`id, name (1–80), slug (unique, url-safe), createdById, createdAt, updatedAt`

### WorkspaceMember
`workspaceId, userId, role (OWNER|ADMIN|MEMBER|VIEWER), joinedAt` — PK (`workspaceId`, `userId`)
- Invariant: ≥ 1 OWNER per workspace (FR-016).

### Invitation
`id, workspaceId, email?, role, tokenHash, invitedById, expiresAt (7 d), status, acceptedById?`
- `email` null = shareable link invite (multi-use until revoked/expired).
- State: `PENDING → ACCEPTED | REVOKED | EXPIRED` (email invites); link invites stay `PENDING`
  until `REVOKED | EXPIRED`.

### BoardMember
`boardId, userId, role (ADMIN|MEMBER|VIEWER)` — PK (`boardId`, `userId`)
- Effective board role = min(board role, workspace role ceiling), using the "Role ceiling" table in
  `contracts/permissions.md` (MEMBER → ADMIN, VIEWER → VIEWER). Workspace OWNER/ADMIN are
  implicit board ADMIN on every board in their workspace (FR-014, spec assumptions).
- The board creator gets a `BoardMember` row with role ADMIN when the board is created.

---

## 2. Boards (P1, extended later)

### Board (archivable)
| Field | Type | Phase | Rules |
|---|---|---|---|
| id | uuid | P1 | |
| workspaceId | → Workspace | P1 | |
| name | text | P1 | 1–100 chars |
| key | text | P4 | 2–6 uppercase letters, unique per workspace (card refs like `KORA-12`) |
| visibility | enum `PRIVATE, WORKSPACE` | P1 | FR-013 |
| mode | enum `KANBAN, SCRUM` | P1 field, P4 behavior | default `KANBAN` |
| version | bigint | P1 | +1 on every change (research B6) |
| nextCardNumber | int | P1 | per-board sequential card number |
| background | jsonb? | P4 | `{type: color|image, value}` |
| agingThresholdDays | int | P2 | default 7 (FR-063) |
| swimlaneMode | enum `NONE, ASSIGNEE, PRIORITY, EPIC, CUSTOM` | P2 | |
| estimateUnit | enum `POINTS, HOURS` | P3 | FR-082 |
| templateId | → Template? | P4 | origin template |

### Column (archivable)
`id, boardId, name (1–60), position, wipLimit? (int ≥ 1, P2), policy? (rich text, P2),
category (TODO|IN_PROGRESS|DONE)`
- `category` drives reports (cycle time = first IN_PROGRESS → DONE) and "done" logic
  (no reminders for done cards).

### Swimlane (P2, custom mode only)
`id, boardId, name, position`

### Label
`id, boardId, name (0–40), color (one of 12 palette tokens)`

---

## 3. Cards (P1, extended later)

### Card (archivable)
| Field | Type | Phase | Rules |
|---|---|---|---|
| id | uuid | P1 | |
| boardId | → Board | P1 | |
| number | int | P1 | unique per board |
| columnId | → Column? | P1 | null only when in backlog (P4) |
| position | text | P1 | order in column / backlog |
| title | text | P1 | 1–200 chars |
| description | jsonb? | P1 | ProseMirror JSON (research B8) |
| descriptionText | text | P1 | derived plain text, for search |
| priority | enum `NONE, LOW, MEDIUM, HIGH, URGENT` | P1 | |
| startDate / dueDate | timestamptz? | P1 | dueDate ≥ startDate |
| completedAt | timestamptz? | P1 | set when entering a DONE column |
| lastMovedAt | timestamptz | P2 | for aging (FR-063) |
| isBlocked / blockedReason | bool / text? | P2 | reason required when blocked (1–500) |
| swimlaneId | → Swimlane? | P2 | custom swimlane mode |
| estimate | decimal? | P3 | ≥ 0 |
| recurrence | jsonb? | P3 | `{freq, interval, byDay?, targetColumnId, nextRunAt}` |
| issueType | enum `TASK, STORY, BUG, EPIC, SUBTASK` | P4 | default `TASK` |
| parentId | → Card? | P4 | Epic→Story/Task/Bug→Subtask only |
| sprintId | → Sprint? | P4 | |
| customFields | jsonb | P4 | `{fieldId: value}` validated against CustomField |
| searchVector | tsvector (generated) | P2 | title + descriptionText |

**Move invariant**: a card has exactly one (`columnId`, `position`); moves update both in one
transaction and bump `Board.version` (Constitution I).

### CardAssignee
`cardId, userId, assignedById, assignedAt` — PK (`cardId`, `userId`); user must be able to access
the board.

### CardLabel
`cardId, labelId` — PK both; label must belong to the same board.

### CardWatcher
`cardId, userId` — creator and assignees auto-watch (FR-036).

### Checklist / ChecklistItem
- Checklist: `id, cardId, title (1–100), position`
- ChecklistItem: `id, checklistId, text (1–300), isDone, position, assigneeId? (P4), dueDate? (P4)`

### Attachment
`id, cardId, kind (FILE|LINK|GDRIVE), name, url?, storageKey?, mimeType?, sizeBytes?,
status (PENDING|READY), uploadedById`
- FILE: `sizeBytes ≤ 10 485 760` (FR-032), status `PENDING → READY` after size verification;
  PENDING older than 24 h deleted.

### Comment
`id, cardId, authorId, body (jsonb), bodyText, editedAt?, deletedAt?`
- Only author edits/deletes; mentions extracted to `CommentMention(commentId, userId)`.

### CardLink (P4)
`id, sourceCardId, targetCardId, type (BLOCKS|RELATES_TO)` — "is blocked by" is the inverse view
of BLOCKS. No self-links; unique (source, target, type).

### CustomField (P4)
`id, boardId, name, type (TEXT|NUMBER|DATE|SELECT|MULTI_SELECT|USER), options jsonb?, position`

### WorkflowRule (P4)
`id, boardId, fromColumnId, toColumnId, allowed (bool)` — if a board has any rules, moves not
explicitly allowed are rejected (FR-104).

---

## 4. Activity, history & real-time (P1)

### ActivityEvent (immutable)
`id, boardId, cardId?, actorId? (null = system/automation), type, data jsonb, boardVersion, createdAt`
- Types include: `card.created, card.updated (fields+old/new), card.moved (fromColumn, toColumn),
  card.archived, card.restored, comment.added, checklist.*, attachment.*, member.*`.
- Source for card history (FR-034) and reports (FR-091). Never updated or deleted
  (except on workspace deletion).

### OutboxEvent
`id (bigserial), boardId?, userId?, topic, payload jsonb, boardVersion?, createdAt, dispatchedAt?`
- Written in the same transaction as the change; dispatched to Socket.IO, notifications,
  automations, webhooks (research B6). Retained 24 h after dispatch for reconnect catch-up.

### ProcessedMutation
`clientMutationId (uuid, PK), userId, createdAt` — idempotency for offline replay (research B12);
retained 7 days.

---

## 5. Notifications (P1)

### Notification
`id, userId, type, cardId?, boardId?, actorId?, data jsonb, readAt?, emailedAt?, createdAt`
- Types: `assigned, mentioned, watched_card_changed, due_soon, overdue, invited, sprint_*`.

### NotificationPreference
`userId, type, inApp bool, email (OFF|INSTANT|DIGEST), push bool` — PK (`userId`, `type`);
defaults: all in-app on, email INSTANT for assigned/mentioned/invited, push on.

### PushSubscription
`id, userId, endpoint (unique), p256dh, auth, userAgent, createdAt, lastUsedAt` — removed on
410 Gone from the push service.

---

## 6. Search & views (P2)

### SavedView
`id, boardId, ownerId, name, viewType (BOARD|LIST|CALENDAR|TIMELINE), filters jsonb, isShared`
- `filters`: `{assigneeIds?, labelIds?, priorities?, due?: overdue|today|week|none, mine?: bool}`.

Comment search uses a generated `tsvector` on `Comment.bodyText`.

---

## 7. Time tracking (P3)

### TimeEntry
`id, cardId, userId, source (TIMER|MANUAL|POMODORO), startedAt, endedAt?, durationSec?, note?`
- Invariant: at most one entry per user with `endedAt = null` (one active timer, US9 scenario 1).
  Manual entries require `durationSec > 0`.

### PomodoroSettings
`userId (PK), workMin (default 25), shortBreakMin (5), longBreakMin (15), longBreakEvery (4)`

---

## 8. Reporting (P3)

### BoardDailySnapshot
`boardId, date, columnId, cardCount, estimateSum` — PK (`boardId`, `date`, `columnId`); built
nightly from ActivityEvent for CFD (research B15).

---

## 9. Agile structure & sprints (P4)

Backlog = cards on a board with `columnId = null` and `sprintId = null`, ordered by `position`.

### Sprint
`id, boardId, name (1–80), goal?, startDate?, endDate?, state, startedAt?, completedAt?, position`
- State machine: `PLANNED → ACTIVE → COMPLETED`. Only one ACTIVE sprint per board (FR-111).
  On completion, incomplete cards move to backlog or another PLANNED sprint (FR-112).

---

## 10. Automation & templates (P4)

### AutomationRule
`id, boardId, name, enabled, trigger jsonb, conditions jsonb, actions jsonb, createdById,
disabledReason?`
- Auto-disabled with `disabledReason` when it references a deleted label/column (spec edge case).

### AutomationRun
`id, ruleId, triggerEventId, status (SUCCESS|FAILED|LOOP_PREVENTED|SKIPPED), error?, createdAt`

### Template
`id, workspaceId? (null = built-in), kind (BOARD|CARD), name, content jsonb, createdById`

---

## 11. Integrations & public API (P4)

### IntegrationConnection
`id, workspaceId, provider (SLACK|GITHUB|GITLAB|GOOGLE), externalId, credentials (encrypted),
status (ACTIVE|DISCONNECTED|ERROR), connectedById, settings jsonb`
- Google Calendar connections are per user: `userId` set, `workspaceId` null.

### IntegrationRoute (Slack)
`id, connectionId, boardId, channelId, events text[]`

### CardExternalLink
`id, cardId, provider (GITHUB|GITLAB), kind (COMMIT|PULL_REQUEST|MERGE_REQUEST), url, title,
state?, externalId` — unique (provider, externalId, cardId).

### AccessToken
`id, userId, name, tokenHash, prefix (first 8 chars, for display), scopes text[], lastUsedAt?,
expiresAt?, revokedAt?`

### Webhook
`id, workspaceId, boardId?, url (https only), secret (encrypted), events text[], enabled,
createdById`

### WebhookDelivery
`id, webhookId, eventId, attempt, status (PENDING|SUCCESS|FAILED), responseCode?, nextAttemptAt?,
createdAt` — kept 30 days.

---

## 12. Export / import (P4)

### DataJob
`id, workspaceId, boardId?, kind (EXPORT_JSON|EXPORT_CSV|IMPORT), status
(QUEUED|RUNNING|SUCCEEDED|FAILED), fileKey?, report jsonb?, requestedById, createdAt, finishedAt?`
- `report` lists dropped/mapped users on import (US15 scenario 2).

---

## Relationship overview

```text
User ─┬─< WorkspaceMember >─ Workspace ─┬─< Board ─┬─< Column ─< Card
      ├─< BoardMember >──────────────────┘          ├─< Label          ├─< CardAssignee >─ User
      ├─< Session / OAuthAccount                    ├─< Swimlane       ├─< CardLabel >─ Label
      ├─< Notification / PushSubscription           ├─< Sprint ─< Card ├─< Checklist ─< ChecklistItem
      ├─< TimeEntry >─ Card                         ├─< SavedView      ├─< Attachment
      └─< AccessToken                               ├─< AutomationRule ├─< Comment
                                                    ├─< CustomField    ├─< CardLink
Workspace ─< IntegrationConnection / Webhook        ├─< WorkflowRule   ├─< TimeEntry
                                                    └─< ActivityEvent  └─< CardExternalLink
```

## Key indexes

- `Card (columnId, position)` where `archivedAt is null`; `Card (boardId, number)` unique.
- `Card (boardId, dueDate)` for calendar/reminders; GIN on `Card.searchVector`,
  `Comment.searchVector`; trigram on `Card.title`.
- `ActivityEvent (boardId, createdAt)`, `(cardId, createdAt)`.
- `OutboxEvent (dispatchedAt) where dispatchedAt is null`; `(boardId, boardVersion)`.
- `Notification (userId, readAt, createdAt desc)`.
- Partial unique `TimeEntry (userId) where endedAt is null`.
- Partial unique `Sprint (boardId) where state = 'ACTIVE'`.
