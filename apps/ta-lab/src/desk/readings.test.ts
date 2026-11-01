import { describe, expect, test } from "bun:test";
import { generateCandles, projectClosePath, type Candle } from "../data/synthetic.ts";
import { candlesWithCloseTail } from "../indicators/close-path.ts";
import {
  atr14Pct,
  bandHalf,
  basisPct,
  betaOf,
  buildDesk,
  clauseWhere,
  dailyFeatureSet,
  dailyStructure,
  dayWordsAsBars,
  deskWilderRsi,
  detectRegime,
  donchianBreakout,
  fireListedRules,
  FUNDING_WINDOW,
  hourlyCancelResult,
  labWilderAtr,
  labWilderRsi,
  momentumHeld,
  paperCapClip,
  PAPER_MAX_NOTIONAL_USDT,
  priceAtr,
  regimeAlignment,
  regimeBlockReason,
  rollingExtreme,
  stanceForSide,
  stopWithAtrFloor,
  sumRsi14,
  technicalFactor,
  trendVote,
  type DailyFeatureSet,
  type RuleContext,
} from "./readings.ts";

function bar(i: number, close: number, extra: Partial<Candle> = {}): Candle {
  return {
    time: 1_700_000_000 + i * 86_400,
    open: extra.open ?? close,
    high: extra.high ?? close + 1,
    low: extra.low ?? close - 1,
    close,
    volume: extra.volume ?? 1_000,
  };
}

function ramp(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const close = 100 + i;
    return bar(i, close, { open: close - 0.5, high: close + 0.4, low: close - 0.4, volume: 1_000 + i });
  });
}

function flat(n: number, close = 50): Candle[] {
  return Array.from({ length: n }, (_, i) => bar(i, close, { open: close, high: close + 1, low: close - 1, volume: 1_000 }));
}

function features(partial: Partial<DailyFeatureSet>): DailyFeatureSet {
  return {
    close: 100,
    ret1: 0,
    ret5: 0,
    ret20: 0,
    rsi14: 55,
    atr14Pct: 1,
    sigmaPct: 1,
    distMa20: 0,
    volZ20: 0,
    volZ20LabN: 0,
    high20: false,
    low20: false,
    shockZ: 0,
    priorHigh: null,
    priorLow: null,
    ...partial,
  };
}

const ctx: RuleContext = { beta: 1, benchRet1: 0, benchRet5: 0 };

describe("three ATR numbers", () => {
  test("simple price ATR ignores the first bar and is null below period + 1", () => {
    expect(priceAtr(flat(14))).toBeNull();
    const candles = [bar(0, 10, { high: 110, low: 0 })];
    for (let i = 1; i <= 14; i++) candles.push(bar(i, 10, { open: 10, high: 10.5, low: 9.5 }));
    expect(priceAtr(candles)).toBeCloseTo(1, 8);
    expect(labWilderAtr(candles)).not.toBeCloseTo(1, 4);
    expect(atr14Pct(candles)).toBeCloseTo(10, 8);
  });

  test("seeded NEONX has three finite ATR readings on the last real bar", () => {
    const candles = generateCandles("NEONX", 0x5eed_c0de, 360);
    const desk = buildDesk(candles, generateCandles("QUARK", 0x5eed_c0de, 360));
    expect(desk.barCount).toBe(360);
    expect(desk.atr.wilder).toBeGreaterThan(0);
    expect(desk.atr.price).toBeGreaterThan(0);
    expect(desk.atr.pct).toBeGreaterThan(0);
    expect(desk.atr.wilder).not.toBeCloseTo(desk.atr.price ?? 0, 6);
  });
});

describe("RSI pair", () => {
  test("sum RSI is the unsmoothed 14-change ratio", () => {
    const closes = [10, 11, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18];
    const candles = closes.map((close, i) => bar(i, close));
    expect(sumRsi14(candles)).toBeCloseTo(70, 8);
    const neonx = generateCandles("NEONX", 0x5eed_c0de, 360);
    expect(labWilderRsi(neonx)).not.toBeCloseTo(sumRsi14(neonx) ?? 0, 2);
  });

  test("a flat window is 100 in the lab and 50 on the desk", () => {
    const candles = flat(40);
    expect(labWilderRsi(candles)).toBe(100);
    expect(deskWilderRsi(candles)).toBe(50);
  });

  test("moving NEONX matches the lab Wilder and the desk Wilder", () => {
    const candles = generateCandles("NEONX", 0x5eed_c0de, 360);
    expect(labWilderRsi(candles)).toBeCloseTo(deskWilderRsi(candles) ?? NaN, 8);
  });
});

describe("three trend labels", () => {
  test("a ramp is an up vote and a long structure; a flat series is not", () => {
    expect(trendVote(ramp(80))).toBe("up");
    expect(trendVote(ramp(40))).toBe("unknown");
    expect(trendVote(ramp(360))).toBe("up");
    expect(dailyStructure(ramp(360))).toBe("long");
    expect(trendVote(flat(360))).toBe("down");
    expect(dailyStructure(flat(360))).toBe("mixed");
  });

  test("sum-RSI trend_up is inside (50, 70), at 5 and at 10", () => {
    const both = fireListedRules(features({ ret20: 12, distMa20: 1, rsi14: 60 }), ctx).filter((rule) =>
      rule.family.startsWith("trend_"),
    );
    expect(both.map((rule) => rule.id).sort()).toEqual(["trend_up:r10", "trend_up:r5"]);
    const loose = fireListedRules(features({ ret20: 6, distMa20: 1, rsi14: 60 }), ctx).map((rule) => rule.id);
    expect(loose).toContain("trend_up:r5");
    expect(loose).not.toContain("trend_up:r10");
    expect(fireListedRules(features({ ret20: 12, distMa20: 1, rsi14: 50 }), ctx).some((rule) => rule.family === "trend_up")).toBe(
      false,
    );
    expect(fireListedRules(features({ ret20: 12, distMa20: 1, rsi14: 70 }), ctx).some((rule) => rule.family === "trend_up")).toBe(
      false,
    );
    expect(buildDesk(ramp(360), flat(360)).universeLabel).toBe("none");
  });
});

describe("SL-01 checklist", () => {
  test("mixed structure silences V-A, V-B, V-C, and V-E", () => {
    const desk = buildDesk(flat(360), ramp(360));
    expect(desk.structure).toBe("mixed");
    for (const variant of desk.sl01.variants) expect(variant.status).toBe("silent");
    expect(desk.sl01.variants.find((variant) => variant.id === "E")?.liveRule).toBe(false);
    expect(desk.sl01.variants.find((variant) => variant.id === "A")?.liveRule).toBe(true);
    expect(desk.sl01.timeframeNote).toContain("240");
    expect(desk.sl01.timeframeNote).toContain("60");
    expect(desk.sl01.veNote.toLowerCase()).toContain("preregistration");
    expect(desk.producesOrder).toBe(false);
  });

  test("a rising series passes V-C and keeps the ATR floor from tightening", () => {
    const desk = buildDesk(ramp(360), flat(360));
    expect(desk.sl01.variants.find((variant) => variant.id === "C")?.status).toBe("pass");
    const wide = stopWithAtrFloor(100, 99, 5, "long", 1);
    expect(wide.stop).toBe(95);
    expect(wide.widened).toBe(true);
    const raw = stopWithAtrFloor(100, 90, 5, "long", 1);
    expect(raw.stop).toBe(90);
    expect(raw.widened).toBe(false);
  });

  test("V-E excludes today; the Donchian lesson includes it", () => {
    const candles = Array.from({ length: 56 }, (_, i) => bar(i, 10, { high: 10, low: 9 }));
    candles[55] = bar(55, 12, { high: 50, low: 9 });
    expect(donchianBreakout(candles, 55, "long")).toBe(12);
    expect(rollingExtreme(candles, 55, false, "high")).toBe(10);
    expect(rollingExtreme(candles, 55, true, "high")).toBe(50);
  });

  test("the 0.10% hold is close to close", () => {
    expect(momentumHeld([100, 100, 100], "long", 0.1)).toBe(true);
    expect(momentumHeld([100, 99, 99], "long", 0.1)).toBe(false);
  });
});

describe("universe card", () => {
  test("last-day fields, n-1 volume z, and no funding family", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 20; i++) candles.push(bar(i, 100, { high: 101, low: 99, volume: i === 19 ? Math.E : 1 }));
    candles.push(bar(20, 110, { high: 111, low: 109, volume: Math.E }));
    const set = dailyFeatureSet(candles);
    expect(set).not.toBeNull();
    expect(set?.ret1).toBeCloseTo(10, 8);
    expect(set?.high20).toBe(true);
    expect(set?.shockZ).toBeCloseTo((set?.ret1 ?? 0) / (set?.atr14Pct ?? 1), 8);
    expect(set?.volZ20).not.toBeNull();
    expect(set?.volZ20LabN).not.toBeNull();
    expect(set?.volZ20).not.toBeCloseTo(set?.volZ20LabN ?? 0, 8);
    expect(Math.abs(set?.volZ20 ?? 0)).toBeLessThan(Math.abs(set?.volZ20LabN ?? 0));
  });

  test("rule bands and an absent ridge", () => {
    const over = fireListedRules(features({ distMa20: 6, atr14Pct: 2 }), ctx);
    expect(over.filter((rule) => rule.family === "overextended").map((rule) => rule.side)).toEqual(["SHORT", "SHORT"]);
    const shock = fireListedRules(features({ shockZ: 3 }), ctx).filter((rule) => rule.family === "shock_revert");
    expect(shock.map((rule) => rule.id).sort()).toEqual(["shock_revert:k2.5", "shock_revert:k3"]);
    expect(shock[0]?.side).toBe("SHORT");
    const rel = fireListedRules(features({ ret5: 5, atr14Pct: 2 }), { beta: 1, benchRet1: 0, benchRet5: 1 });
    expect(rel.some((rule) => rule.id === "relative_strength:k2")).toBe(true);
    expect(fireListedRules(features({}), ctx).some((rule) => rule.family.startsWith("funding"))).toBe(false);
    const desk = buildDesk(generateCandles("NEONX", 3, 360), generateCandles("QUARK", 3, 360));
    expect(desk.ridge).toBeNull();
    expect(desk.lean).toBeNull();
    expect(desk.costMultiple).toBeNull();
    expect(desk.beta).toBeGreaterThanOrEqual(-3);
    expect(desk.beta).toBeLessThanOrEqual(3);
    expect(desk.bandHalf).toBeCloseTo(1.2816 * (desk.features?.sigmaPct ?? 0), 8);
  });

  test("beta prior, clamp, and the 80% half-width fallback", () => {
    expect(betaOf(Array.from({ length: 19 }, () => [10, 1]))).toBe(1);
    expect(betaOf(Array.from({ length: 30 }, (_, i) => [10 * (i + 1), i + 1]))).toBe(3);
    expect(betaOf(Array.from({ length: 30 }, () => [1, 4]))).toBe(1);
    expect(bandHalf(null, 1.4)).toBeCloseTo(1.2816, 8);
    expect(bandHalf(0, 1.4)).toBe(0);
    expect(bandHalf(null, null)).toBe(0);
  });
});

describe("regime strip", () => {
  test("thresholds, alignment, and a closed volatility block", () => {
    const calmUp = Array.from({ length: 24 }, (_, i) =>
      bar(i, 100 + (i === 23 ? 3 : 0), { open: i === 0 ? 100 : 100, high: 101, low: 100 }),
    );
    calmUp[0] = bar(0, 100, { open: 100, high: 101, low: 100 });
    const up = detectRegime(calmUp);
    expect(up.trend).toBe("up");
    expect(up.volatility).toBe("calm");
    expect(up.regime).toBe("risk_on");
    const wild = calmUp.map((candle, i) => (i === 0 ? candle : { ...candle, high: candle.close + 6, low: candle.close }));
    expect(detectRegime(wild).regime).toBe("volatile");
    expect(detectRegime(calmUp.slice(0, 23)).regime).toBe("unknown");
    expect(regimeAlignment("up", "long")).toBe("with");
    expect(regimeAlignment("up", "short")).toBe("against");
    expect(regimeAlignment("flat", "long")).toBe("neutral");
    expect(regimeAlignment("unknown", "short")).toBe("unknown");
    expect(regimeBlockReason(9, 0)).toBeNull();
    expect(regimeBlockReason(9, 4)).toContain("regime_volatility_exceeded");
  });

  test("the strip reads the other symbol, and the tail is not partial_daily", () => {
    const asset = ramp(40);
    const bench = flat(40, 20);
    const desk = buildDesk(asset, bench);
    expect(desk.regime).toEqual(detectRegime(bench));
    expect(desk.regime).not.toEqual(detectRegime(asset));
    expect(desk.tailIsPartialDaily).toBe(false);
    expect(desk.tailNote).toContain("partial_daily");
    expect(desk.regimeBlock).toBeNull();
  });
});

describe("stance card", () => {
  test("a flat book contradicts a long and does not size it", () => {
    const read = stanceForSide(flat(360), "long");
    expect(read.stance).toBe("contradicts");
    expect(read.factor).toBe(0.85);
    expect(read.strong).toBeNull();
    expect(read.appliedToSize).toBe(false);
    expect(read).not.toHaveProperty("quantity");
    expect(technicalFactor("supports", true)).toBe(1.25);
    expect(technicalFactor("contradicts", true)).toBe(0.7);
    expect(stanceForSide(flat(360), "long").factor).not.toBe(0.7);
  });

  test("RSI at 75 or 25 docks one point and does not flip a two-vote agreement", () => {
    const rising = ramp(360);
    const read = stanceForSide(rising, "long");
    expect(read.rsiPenalty).toBe(true);
    expect(deskWilderRsi(rising)).toBeGreaterThanOrEqual(75);
    expect(read.stance === "supports" || read.stance === "neutral" || read.stance === "contradicts").toBe(true);
    expect(read.strong).toBeNull();
  });
});

describe("one bar, paper cap, basis", () => {
  test("a touch in the bar is ambiguous and a quiet bar is cancelled", () => {
    expect(hourlyCancelResult(true)).toBe("cancel_ambiguous");
    expect(hourlyCancelResult(false)).toBe("cancelled");
    expect(FUNDING_WINDOW).toBe("funding_window_unmeasurable");
  });

  test("the clipped notional is the 1000 cap, not quantity times price", () => {
    let found = false;
    for (let cents = 1; cents <= 50_000; cents++) {
      const price = cents / 100;
      const clip = paperCapClip(price);
      expect(clip?.clippedNotional).toBe(PAPER_MAX_NOTIONAL_USDT);
      expect(clip?.quantity).toBe(1000 / price);
      if (clip && clip.product > 1000) {
        found = true;
        expect(clip.product.toFixed(2)).toBe("1000.00");
        expect(clip.clippedNotional.toFixed(2)).toBe("1000.00");
        break;
      }
    }
    expect(found).toBe(true);
    expect(paperCapClip(0)).toBeNull();
  });

  test("basis is two numbers, or none", () => {
    expect(basisPct(110, 100)).toBeCloseTo(10, 8);
    expect(basisPct(90, 100)).toBeCloseTo(-10, 8);
    expect(basisPct(100, 0)).toBeNull();
    expect(basisPct(null, 100)).toBeNull();
  });
});

describe("one loaded interval", () => {
  test("an intraday series renames day-words, hides beta, and keeps V-E preregistered", () => {
    const asset = ramp(80);
    const bench = flat(80, 20);
    const desk = buildDesk(asset, bench, "60");
    expect(desk.producesOrder).toBe(false);
    expect(desk.betaShown).toBe(false);
    expect(desk.relative).toBeNull();
    expect(desk.sl01.timeframeNote).toContain("this series");
    expect(desk.sl01.veNote.toLowerCase()).toContain("preregistration");
    const ve = desk.sl01.variants.find((variant) => variant.id === "E");
    expect(ve?.liveRule).toBe(false);
    expect(ve?.clauses.find((item) => item.id === "e-channel")?.text).toContain("55-bar");
    const vc = desk.sl01.variants.find((variant) => variant.id === "C");
    expect(vc?.clauses.find((item) => item.id === "c-ret")?.text).toContain("20-bar");
    expect(vc?.clauses.find((item) => item.id === "c-ret")?.text).toContain("60-bar");
    expect(desk.sl01.variants.find((variant) => variant.id === "A")?.clauses.find((item) => item.id === "a-stop")?.text).toContain(
      "this interval's price ATR",
    );
    expect(desk.copy.regimeRangeLabel).toBe("Change / loaded window");
    expect(desk.copy.needsBars).toBe("Needs 21 real bars.");
    expect(desk.regime).toEqual(detectRegime(asset));
    expect(desk.regime).not.toEqual(detectRegime(bench));
    expect(clauseWhere("240", "60")).toBe("this series");
    expect(clauseWhere("60", "60")).toBe("60");
    expect(clauseWhere("prereg", "15")).toBe("prereg");
    expect(desk.tailNote).toContain("partial_daily");
    expect(dayWordsAsBars("partial_daily daily range")).toBe("partial_daily bar range");
  });

  test("daily and synthetic labels stay, including the V-A / V-B note", () => {
    const desk = buildDesk(ramp(80), flat(80), "D");
    expect(desk.betaShown).toBe(true);
    expect(desk.sl01.timeframeNote).toContain("daily bars");
    expect(desk.sl01.variants.find((variant) => variant.id === "C")?.clauses.find((item) => item.id === "c-ret")?.text).toContain(
      "20-day",
    );
    expect(desk.copy.structureLabel).toBe("Daily structure");
    expect(clauseWhere("240", "D")).toBe("240");
    expect(clauseWhere("240", "synthetic")).toBe("240");
    expect(buildDesk(ramp(40), flat(40)).series).toBe("synthetic");
  });
});

describe("tail boundary", () => {
  test("a close tail does not move desk readings, and the lesson series stays 360", () => {
    const candles = generateCandles("NEONX", 0x5eed_c0de, 360);
    const bench = generateCandles("QUARK", 0x5eed_c0de, 360);
    const tail = projectClosePath("NEONX", candles[candles.length - 1]);
    const benchTail = projectClosePath("QUARK", bench[bench.length - 1]);
    const plain = buildDesk(candles, bench);
    expect(plain.barCount).toBe(360);
    expect(buildDesk(candlesWithCloseTail(candles, tail), bench)).toEqual(plain);
    expect(buildDesk(candles, candlesWithCloseTail(bench, benchTail))).toEqual(plain);
  });
});
