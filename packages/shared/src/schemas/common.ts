import { z } from "zod";
import { LOCALES } from "../constants";

export const uuid = z.uuid();

export const cursorQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CursorQuery = z.infer<typeof cursorQuery>;

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

export const localeSchema = z.enum(LOCALES);

/** ProseMirror JSON document. */
export const richTextDoc = z.object({
  type: z.literal("doc"),
  content: z.array(z.looseObject({})),
});
export type RichTextDoc = z.infer<typeof richTextDoc>;
