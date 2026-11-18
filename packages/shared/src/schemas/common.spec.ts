import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  cursorQuery,
  localeSchema,
  paginated,
  richTextDoc,
  uuid,
} from "./common";

describe("uuid", () => {
  it("accepts a uuid and rejects other strings", () => {
    expect(uuid.safeParse("3f2b8c1e-9d4a-4e7b-8a61-2c5d7e9f0a12").success).toBe(
      true,
    );
    expect(uuid.safeParse("nope").success).toBe(false);
  });
});

describe("cursorQuery", () => {
  it("defaults limit to 50 and cursor to undefined", () => {
    expect(cursorQuery.parse({})).toEqual({ limit: 50 });
  });
  it("coerces numeric strings from query strings", () => {
    expect(cursorQuery.parse({ cursor: "abc", limit: "25" })).toEqual({
      cursor: "abc",
      limit: 25,
    });
  });
  it("accepts bounds 1 and 100", () => {
    expect(cursorQuery.parse({ limit: 1 }).limit).toBe(1);
    expect(cursorQuery.parse({ limit: 100 }).limit).toBe(100);
  });
  it("rejects 0, 101 and non-integers", () => {
    expect(cursorQuery.safeParse({ limit: 0 }).success).toBe(false);
    expect(cursorQuery.safeParse({ limit: 101 }).success).toBe(false);
    expect(cursorQuery.safeParse({ limit: 1.5 }).success).toBe(false);
  });
});

describe("paginated", () => {
  const schema = paginated(z.object({ id: z.string() }));
  it("parses { items, nextCursor }", () => {
    expect(schema.parse({ items: [{ id: "a" }], nextCursor: null })).toEqual({
      items: [{ id: "a" }],
      nextCursor: null,
    });
    expect(schema.parse({ items: [], nextCursor: "x" }).nextCursor).toBe("x");
  });
  it("rejects invalid items and missing nextCursor", () => {
    expect(
      schema.safeParse({ items: [{ id: 1 }], nextCursor: null }).success,
    ).toBe(false);
    expect(schema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe("localeSchema", () => {
  it("accepts supported locales and rejects others", () => {
    for (const l of ["en", "es", "fr", "de", "zh-CN", "vi"]) {
      expect(localeSchema.safeParse(l).success).toBe(true);
    }
    expect(localeSchema.safeParse("ja").success).toBe(false);
  });
});

describe("richTextDoc", () => {
  it("accepts a ProseMirror doc", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    };
    expect(richTextDoc.parse(doc)).toEqual(doc);
    expect(richTextDoc.safeParse({ type: "doc", content: [] }).success).toBe(
      true,
    );
  });
  it("rejects wrong type, missing or non-array content", () => {
    expect(
      richTextDoc.safeParse({ type: "paragraph", content: [] }).success,
    ).toBe(false);
    expect(richTextDoc.safeParse({ type: "doc" }).success).toBe(false);
    expect(richTextDoc.safeParse({ type: "doc", content: "x" }).success).toBe(
      false,
    );
  });
});
