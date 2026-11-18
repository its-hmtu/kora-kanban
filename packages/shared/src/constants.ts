export const LOCALES = ["en", "es", "fr", "de", "zh-CN", "vi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const CARD_TITLE_MAX = 200;
export const BOARD_NAME_MAX = 100;
export const COLUMN_NAME_MAX = 60;
export const WORKSPACE_NAME_MAX = 80;
export const LABEL_NAME_MAX = 40;
export const USER_NAME_MAX = 100;
export const CHECKLIST_TITLE_MAX = 100;
export const CHECKLIST_ITEM_MAX = 300;
export const BLOCKED_REASON_MAX = 500;

export const ATTACHMENT_MAX_BYTES = 10_485_760;
export const PASSWORD_MIN = 10;

export const LABEL_COLORS = [
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
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];
