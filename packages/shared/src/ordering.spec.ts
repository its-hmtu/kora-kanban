import { describe, expect, it } from "vitest";
import { needsRebalance, positionBetween, rebalance } from "./ordering";

describe("positionBetween", () => {
  it("returns a key for an empty list", () => {
    expect(typeof positionBetween()).toBe("string");
  });

  it("appends after and prepends before", () => {
    const a = positionBetween();
    expect(positionBetween(a, undefined) > a).toBe(true);
    expect(positionBetween(undefined, a) < a).toBe(true);
  });

  it("treats null like undefined", () => {
    const a = positionBetween();
    expect(positionBetween(null as unknown as undefined, a) < a).toBe(true);
  });

  it("returns a key strictly between neighbours", () => {
    const a = positionBetween();
    const c = positionBetween(a);
    const b = positionBetween(a, c);
    expect(a < b && b < c).toBe(true);
  });

  it("throws a clear error when before >= after", () => {
    const a = positionBetween();
    const c = positionBetween(a);
    expect(() => positionBetween(c, a)).toThrow(/before.*after/i);
    expect(() => positionBetween(a, a)).toThrow(/before.*after/i);
  });

  it("keeps sort order across many inserts at random positions", () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const list: string[] = [positionBetween()];
    for (let i = 0; i < 500; i++) {
      const idx = Math.floor(rand() * (list.length + 1));
      list.splice(idx, 0, positionBetween(list[idx - 1], list[idx]));
    }
    const sorted = [...list].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    expect(list).toEqual(sorted);
    expect(new Set(list).size).toBe(list.length);
  });

  it("keeps order when repeatedly inserting between the same neighbours", () => {
    const first = positionBetween();
    let last = positionBetween(first);
    const keys = [first];
    for (let i = 0; i < 100; i++) {
      const k = positionBetween(first, last);
      expect(first < k && k < last).toBe(true);
      last = k;
      keys.push(k);
    }
  });
});

describe("needsRebalance", () => {
  it("is false at length 50 and true at 51", () => {
    expect(needsRebalance("a".repeat(50))).toBe(false);
    expect(needsRebalance("a".repeat(51))).toBe(true);
  });

  it("flags keys that grow through repeated inserts", () => {
    const first = positionBetween();
    let last = positionBetween(first);
    let grew = false;
    for (let i = 0; i < 400 && !grew; i++) {
      last = positionBetween(first, last);
      grew = needsRebalance(last);
    }
    expect(grew).toBe(true);
  });
});

describe("rebalance", () => {
  it("returns count strictly increasing, short keys", () => {
    const keys = rebalance(200);
    expect(keys).toHaveLength(200);
    for (let i = 1; i < keys.length; i++) expect(keys[i - 1]! < keys[i]!).toBe(true);
    expect(keys.some(needsRebalance)).toBe(false);
  });

  it("returns an empty array for 0 and rejects negatives", () => {
    expect(rebalance(0)).toEqual([]);
    expect(() => rebalance(-1)).toThrow();
  });
});
