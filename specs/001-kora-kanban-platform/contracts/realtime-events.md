# Contract: Real-time Events (Socket.IO)

**Feature**: [../spec.md](../spec.md) · Design rationale: [../research.md](../research.md) B6
Payload schemas live in `packages/shared/src/events/` (Zod), so the server and client always
match.

## Connection

- Namespace: `/rt`. Transport: WebSocket, with long-polling as a fallback.
- **Auth**: the `kora_sid` cookie is sent on the handshake and validated like any HTTP request.
  If it's invalid, the connection is refused with `connect_error` and `{code: "UNAUTHENTICATED"}`.
- After connecting, the server puts the socket in the room `user:{userId}` automatically
  (for notifications and timers).
- When the user signs out, or the session is revoked, the server sends `session:revoked` and
  disconnects every socket for that session (or for that user, after "sign out everywhere").

## Client → server

| Event | Payload | Ack | Notes |
|---|---|---|---|
| `board:join` | `{boardId, sinceVersion?}` | `{ok, boardVersion, mode: "replay"\|"resync", events?}` | Checks board access. If `sinceVersion` is still within the outbox window (24 h), missed events are replayed; otherwise the client must refetch `GET /boards/:bid` |
| `board:leave` | `{boardId}` | `{ok}` | |
| `presence:update` | `{boardId, cardId?: string\|null}` | — | Which card the user has open (shown as an avatar on the card) |

Changes are **not** sent over the socket. All mutations go through HTTP, so authorization,
validation and idempotency live in one place, and the socket is only a broadcast channel.

## Server → client: board room `board:{boardId}`

Every board event has this envelope:

```json
{
  "boardId": "uuid",
  "boardVersion": "1042",
  "type": "card.moved",
  "actorId": "uuid | null",
  "clientMutationId": "uuid | null",
  "at": "2026-11-10T09:00:00.000Z",
  "payload": { }
}
```

- `boardVersion` (and `sinceVersion`) are bigints sent as decimal strings (e.g. `"1042"`),
  never JSON numbers; clients compare them with `BigInt(...)`.
- Clients apply events in `boardVersion` order. If there's a gap (received version > last + 1),
  the client re-joins with `sinceVersion` to catch up.
- A client ignores the echo of its own change, identified by a matching `clientMutationId`
  (its optimistic update has already been applied).

| `type` | Payload | Phase |
|---|---|---|
| `board.updated` | changed board fields | P1 |
| `board.archived` / `board.deleted` | `{}` (clients close the board) | P1 |
| `column.created` / `column.updated` / `column.archived` / `column.restored` | column summary | P1 |
| `card.created` | card summary | P1 |
| `card.updated` | `{cardId, fields: {…changed}}` | P1 |
| `card.moved` | `{cardId, fromColumnId, toColumnId, position, swimlaneId?, sprintId?}` | P1 |
| `card.archived` / `card.restored` / `card.deleted` | `{cardId}` | P1 |
| `card.assignees.changed` / `card.labels.changed` | `{cardId, ids: []}` | P1 |
| `checklist.changed` | `{cardId, checklistId, progress: {done, total}}` | P1 |
| `attachment.added` / `attachment.removed` | `{cardId, attachment summary}` | P1 |
| `comment.added` / `comment.updated` / `comment.deleted` | `{cardId, comment}` | P1 |
| `label.changed` | label | P1 |
| `member.changed` | `{userId, role \| null}`. If the role is null and the user is the recipient, the client closes the board (spec edge case 1) | P1 |
| `presence.changed` | `{users: [{userId, cardId?}]}` | P1 |
| `column.wip.exceeded` | `{columnId, count, limit}` | P2 |
| `swimlane.changed` / `view.changed` | swimlane / view | P2 |
| `sprint.changed` | sprint summary | P4 |
| `automation.ran` | `{ruleId, cardId, status}` | P4 |

## Server → client: user room `user:{userId}`

| Event | Payload | Phase |
|---|---|---|
| `notification.new` | notification summary, including the unread count | P1 |
| `session:revoked` | `{reason}` | P1 |
| `workspace.access.changed` | `{workspaceId, role \| null}` | P1 |
| `timer.changed` | `{activeTimer \| null}` (keeps timers in sync across tabs and devices) | P3 |
| `job.finished` | `{jobId, kind, status}` | P4 |

## Guarantees

- **Delivery:** at least once. Events come from the transactional outbox, and clients drop any
  event with a `boardVersion` at or below the one they've already applied.
- **Latency target:** 95% of events reach viewers within 2 s (SC-002).
- **Order:** guaranteed within each board through `boardVersion`. There's no ordering across
  different boards.
