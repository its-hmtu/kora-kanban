# Contract: Outbound Webhooks (P4)

**Feature**: [../spec.md](../spec.md) FR-131 · Design: [../research.md](../research.md) B18

## Delivery

- Sent as `POST` to the registered HTTPS URL, with a JSON body and a 10-second timeout.
- **Headers**:
  - `X-Kora-Event`: the event type, e.g. `card.moved`
  - `X-Kora-Delivery`: a unique delivery uuid; use it to ignore duplicates
  - `X-Kora-Timestamp`: Unix seconds
  - `X-Kora-Signature`: `sha256=` + hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
- **Receivers should** check the signature and reject any timestamp more than 5 minutes old,
  which blocks replayed requests.
- **Success** is any `2xx` response. Anything else, or a timeout, is retried with exponential
  backoff: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h, 24 h. That's 8 attempts in total, after
  which the delivery is marked `FAILED`.
- After 3 days in a row with failures, the webhook is disabled automatically and workspace Admins
  get a notification.

## Body

```json
{
  "id": "evt_uuid",
  "type": "card.moved",
  "createdAt": "2026-11-10T09:00:00.000Z",
  "workspaceId": "uuid",
  "boardId": "uuid",
  "actor": { "id": "uuid", "name": "Alice" },
  "data": { }
}
```

`data` uses the same shape as the matching `payload` in
[realtime-events.md](./realtime-events.md), plus the full card summary for card events.

## Subscribable events

`card.created`, `card.updated`, `card.moved`, `card.archived`, `card.deleted`, `comment.added`,
`checklist.completed`, `column.created`, `column.archived`, `board.updated`, `member.added`,
`member.removed`, `sprint.started`, `sprint.completed`.

Sending `POST /webhooks/:id/test` delivers a `ping` event.
