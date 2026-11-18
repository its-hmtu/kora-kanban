import { describe, expect, it } from "vitest";
import * as c from "./constants";

describe("constants", () => {
  it("LOCALES keeps order and default is en", () => {
    expect(c.LOCALES).toEqual(["en", "es", "fr", "de", "zh-CN", "vi"]);
    expect(c.DEFAULT_LOCALE).toBe("en");
  });
  it("LABEL_COLORS matches the 12 theme tokens in order", () => {
    expect(c.LABEL_COLORS).toEqual([
      "red",
      "orange",
      "amber",
      "yellow",
      "lime",
      "green",
      "teal",
      "cyan",
      "blue",
      "indigo",
      "purple",
      "pink",
    ]);
  });
  it("limits have the specified values", () => {
    expect([
      c.CARD_TITLE_MAX,
      c.BOARD_NAME_MAX,
      c.COLUMN_NAME_MAX,
      c.WORKSPACE_NAME_MAX,
      c.LABEL_NAME_MAX,
      c.USER_NAME_MAX,
      c.CHECKLIST_TITLE_MAX,
      c.CHECKLIST_ITEM_MAX,
      c.BLOCKED_REASON_MAX,
      c.ATTACHMENT_MAX_BYTES,
      c.PASSWORD_MIN,
    ]).toEqual([200, 100, 60, 80, 40, 100, 100, 300, 500, 10_485_760, 10]);
  });
});
