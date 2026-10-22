import { describe, expect, test } from "bun:test";
import type { Candle } from "../data/synthetic.ts";
import { primitives as P } from "./primitives.ts";

const approx = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

function candle(o: number, h: number, l: number, c: number, i: number): Candle {
  return { time: 1000 + i * 86400, open: o, high: h, low: l, close: c, volume: 1 };
}

describe("sma", () => {
  test("known values", () => {
    const out = P.sma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNaN();
    expect(out[1]).toBeNaN();
    approx(out[2], 2);
    approx(out[3], 3);
    approx(out[4], 4);
  });

  test("constant input stays constant", () => {
    const out = P.sma([7, 7, 7, 7], 2);
    approx(out[1], 7);
    approx(out[3], 7);
  });
});

describe("ema", () => {
  test("seeded with SMA, then alpha = 2/(len+1)", () => {
    const out = P.ema([2, 4, 6, 8], 3);
    expect(out[1]).toBeNaN();
    approx(out[2], 4); // seed = sma(2,4,6)
    approx(out[3], 0.5 * 8 + 0.5 * 4); // alpha = 2/4
  });
});

describe("rma", () => {
  test("Wilder alpha = 1/len", () => {
    const out = P.rma([3, 3, 3, 13], 3);
    approx(out[2], 3);
    approx(out[3], (1 / 3) * 13 + (2 / 3) * 3);
  });
});

describe("stdev", () => {
  test("constant series has zero deviation", () => {
    const out = P.stdev([5, 5, 5, 5], 3);
    approx(out[3], 0);
  });

  test("population stdev of [2,4,4,4,5,5,7,9] is 2", () => {
    const out = P.stdev([2, 4, 4, 4, 5, 5, 7, 9], 8);
    approx(out[7], 2);
  });
});

describe("highest / lowest", () => {
  test("rolling extremes", () => {
    const src = [3, 1, 4, 1, 5];
    expect(P.highest(src, 3)[4]).toBe(5);
    expect(P.highest(src, 3)[3]).toBe(4);
    expect(P.lowest(src, 3)[2]).toBe(1);
    expect(P.lowest(src, 3)[4]).toBe(1);
  });
});

describe("trueRange", () => {
  test("first bar is high - low", () => {
    const tr = P.trueRange([candle(10, 12, 9, 11, 0)]);
    approx(tr[0], 3);
  });

  test("gap up uses distance to previous close", () => {
    const tr = P.trueRange([candle(10, 11, 9, 10, 0), candle(15, 16, 14.5, 15.5, 1)]);
    // h-l = 1.5, |h-pc| = 6, |l-pc| = 4.5 → 6
    approx(tr[1], 6);
  });
});

describe("change", () => {
  test("1-bar and n-bar diffs", () => {
    const src = [1, 3, 6, 10];
    const d1 = P.change(src);
    expect(d1[0]).toBeNaN();
    approx(d1[1], 2);
    approx(d1[3], 4);
    const d2 = P.change(src, 2);
    approx(d2[2], 5);
  });
});
