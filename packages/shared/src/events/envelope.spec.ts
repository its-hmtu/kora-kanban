import { describe, expect, it } from "vitest";
import { boardEventEnvelope, userEvent } from "./envelope";

const base = {
  boardId: "3f2b8c1e-5a6d-4e7f-8a9b-0c1d2e3f4a5b",
  boardVersion: "1042",
  type: "card.moved",
  actorId: "3f2b8c1e-5a6d-4e7f-8a9b-0c1d2e3f4a5c",
  clientMutationId: "3f2b8c1e-5a6d-4e7f-8a9b-0c1d2e3f4a5d",
  at: "2026-11-10T09:00:00.000Z",
  payload: { cardId: "x" },
};

describe("boardEventEnvelope", () => {
  it("accepts a valid envelope", () => {
    expect(boardEventEnvelope.parse(base)).toEqual(base);
  });

  it("accepts null actorId and clientMutationId", () => {
    expect(
      boardEventEnvelope.safeParse({ ...base, actorId: null, clientMutationId: null }).success,
    ).toBe(true);
  });

  it("accepts a bigint-sized boardVersion string", () => {
    expect(
      boardEventEnvelope.safeParse({ ...base, boardVersion: "9223372036854775807" }).success,
    ).toBe(true);
  });

  it.each(["", "-1", "1.5", "abc", "007"])("rejects boardVersion %j", (v) => {
    expect(boardEventEnvelope.safeParse({ ...base, boardVersion: v }).success).toBe(false);
  });

  it("rejects numeric boardVersion", () => {
    expect(boardEventEnvelope.safeParse({ ...base, boardVersion: 1042 }).success).toBe(false);
  });

  it("rejects unknown type, bad at, bad boardId, missing payload", () => {
    expect(boardEventEnvelope.safeParse({ ...base, type: "card.exploded" }).success).toBe(false);
    expect(boardEventEnvelope.safeParse({ ...base, at: "yesterday" }).success).toBe(false);
    expect(boardEventEnvelope.safeParse({ ...base, boardId: "nope" }).success).toBe(false);
    const rest: Record<string, unknown> = { ...base };
    delete rest.payload;
    expect(boardEventEnvelope.safeParse(rest).success).toBe(false);
  });
});

describe("userEvent", () => {
  it("accepts a user event", () => {
    const e = { type: "session:revoked", at: base.at, payload: { reason: "signed_out" } };
    expect(userEvent.parse(e)).toEqual(e);
  });

  it("rejects an unknown user event type", () => {
    expect(userEvent.safeParse({ type: "card.moved", at: base.at, payload: {} }).success).toBe(
      false,
    );
  });
});
