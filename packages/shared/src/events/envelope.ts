import { z } from "zod";

/** Board event types, per contracts/realtime-events.md. */
export const BOARD_EVENT_TYPES = [
  "board.updated",
  "board.archived",
  "board.deleted",
  "column.created",
  "column.updated",
  "column.archived",
  "column.restored",
  "card.created",
  "card.updated",
  "card.moved",
  "card.archived",
  "card.restored",
  "card.deleted",
  "card.assignees.changed",
  "card.labels.changed",
  "checklist.changed",
  "attachment.added",
  "attachment.removed",
  "comment.added",
  "comment.updated",
  "comment.deleted",
  "label.changed",
  "member.changed",
  "presence.changed",
  "column.wip.exceeded",
  "swimlane.changed",
  "view.changed",
  "sprint.changed",
  "automation.ran",
] as const;
export type BoardEventType = (typeof BOARD_EVENT_TYPES)[number];

/** User-room event types, per contracts/realtime-events.md. */
export const USER_EVENT_TYPES = [
  "notification.new",
  "session:revoked",
  "workspace.access.changed",
  "timer.changed",
  "job.finished",
] as const;
export type UserEventType = (typeof USER_EVENT_TYPES)[number];

/** bigint serialized as a decimal string (non-negative integer, no leading zeros). */
export const boardVersionString = z.string().regex(/^(0|[1-9]\d*)$/);

// Per-event payload schemas arrive with the stories that emit them.
const payload = z.unknown().refine((v) => v !== undefined, { message: "payload is required" });

export const boardEventEnvelope = z.object({
  boardId: z.uuid(),
  boardVersion: boardVersionString,
  type: z.enum(BOARD_EVENT_TYPES),
  actorId: z.uuid().nullable(),
  clientMutationId: z.uuid().nullable(),
  at: z.iso.datetime(),
  payload,
});
export type BoardEventEnvelope = z.infer<typeof boardEventEnvelope>;

export const userEvent = z.object({
  type: z.enum(USER_EVENT_TYPES),
  at: z.iso.datetime(),
  payload,
});
export type UserEvent = z.infer<typeof userEvent>;
