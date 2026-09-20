import { describe, expect, test } from "bun:test";
import { applyDarwin, contribution, croCapForRegime, positionQty, regimeFromVix, synthesize } from "./engine";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings";

const layers = {
  a: "macro",
  b: "sector",
  cro: "decision",
} as const;

describe("regimeFromVix", () => {
  test("classifies on, chop, off", () => {
    const s = DEFAULT_SETTINGS;
    expect(regimeFromVix(12, s)).toBe("RISK-ON");
    expect(regimeFromVix(20, s)).toBe("CHOP");
    expect(regimeFromVix(30, s)).toBe("RISK-OFF");
  });
});

describe("synthesize", () => {
  test("weighted long wins and CRO caps size", () => {
    const syn = synthesize(
      [
        { agentId: "a", stance: "LONG", conviction: 1 },
        { agentId: "b", stance: "LONG", conviction: 1 },
        { agentId: "cro", stance: "FLAT", conviction: 1 },
      ],
      { a: 2, b: 2, cro: 2.5 },
      4,
      layers,
    );
    expect(syn.direction).toBe("LONG");
    expect(syn.netScore).toBeCloseTo(1);
    expect(syn.uncappedPct).toBeCloseTo(10);
    expect(syn.sizePct).toBe(4);
    expect(syn.croCapped).toBe(true);
  });

  test("near-zero net stands down", () => {
    const syn = synthesize(
      [
        { agentId: "a", stance: "LONG", conviction: 0.5 },
        { agentId: "b", stance: "SHORT", conviction: 0.5 },
      ],
      { a: 1, b: 1 },
      8,
      layers,
    );
    expect(syn.direction).toBe("STAND DOWN");
    expect(syn.sizePct).toBe(0);
  });
});

describe("darwin + contribution", () => {
  test("long is rewarded when the name rallies", () => {
    expect(contribution("LONG", 1, 5)).toBeGreaterThan(contribution("SHORT", 1, 5));
    expect(contribution("FLAT", 1, 5)).toBe(0);
  });

  test("top half up, bottom half down, clamped", () => {
    const next = applyDarwin(
      { good: 1, bad: 1, mid: 1 },
      [
        { agentId: "good", contribution: 10 },
        { agentId: "mid", contribution: 0 },
        { agentId: "bad", contribution: -10 },
      ],
      DEFAULT_SETTINGS,
    );
    expect(next.good).toBeCloseTo(1.05);
    expect(next.mid).toBeCloseTo(1);
    expect(next.bad).toBeCloseTo(0.95);
  });
});

describe("positionQty", () => {
  test("8% of 100k at $200 is 40 shares", () => {
    expect(positionQty(100_000, 8, 200)).toBeCloseTo(40);
  });
});

describe("croCapForRegime", () => {
  test("uses settings table", () => {
    expect(croCapForRegime("RISK-ON", DEFAULT_SETTINGS)).toBe(8);
    expect(croCapForRegime("RISK-OFF", DEFAULT_SETTINGS)).toBe(4.5);
    expect(croCapForRegime("CHOP", DEFAULT_SETTINGS)).toBe(3);
  });
});

describe("mergeSettings", () => {
  test("rejects inverted vix thresholds", () => {
    const s = mergeSettings({ vixRiskOnBelow: 40, vixRiskOffAbove: 10 });
    expect(s.vixRiskOnBelow).toBeLessThan(s.vixRiskOffAbove);
  });

  test("clamps temperature", () => {
    expect(mergeSettings({ temperature: 9 }).temperature).toBe(2);
  });
});
