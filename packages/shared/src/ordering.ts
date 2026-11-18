import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/** Keys longer than this should be rebalanced by a background job. */
export const MAX_POSITION_KEY_LENGTH = 50;

/** Key strictly between `before` and `after`; omit a side for the list start/end. */
export function positionBetween(before?: string | null, after?: string | null): string {
  const lo = before ?? null;
  const hi = after ?? null;
  if (lo !== null && hi !== null && lo >= hi) {
    throw new Error(`positionBetween: before ("${lo}") must be less than after ("${hi}")`);
  }
  return generateKeyBetween(lo, hi);
}

export function needsRebalance(key: string): boolean {
  return key.length > MAX_POSITION_KEY_LENGTH;
}

/** `count` evenly spaced, strictly increasing keys. */
export function rebalance(count: number): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`rebalance: count must be a non-negative integer, got ${count}`);
  }
  return generateNKeysBetween(null, null, count);
}
