import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings";
import {
  composeScoutScore,
  parseWatchlist,
  pickUniverse,
  tapeScore,
  usesSurface,
} from "./screen";
import { NDX100, SP100 } from "./universes";

describe("parseWatchlist", () => {
  test("splits commas and whitespace, uppercases, drops junk", () => {
    expect(parseWatchlist("nvda, aapl\n brk.b  ../etc")).toEqual(["NVDA", "AAPL", "BRK.B"]);
  });
});

describe("pickUniverse", () => {
  test("returns listed universes and watchlist", () => {
    expect(pickUniverse({ ...DEFAULT_SETTINGS, screenUniverse: "sp100" }).length).toBe(SP100.length);
    expect(pickUniverse({ ...DEFAULT_SETTINGS, screenUniverse: "ndx100" }).length).toBe(NDX100.length);
    expect(
      pickUniverse({
        ...DEFAULT_SETTINGS,
        screenUniverse: "watchlist",
        screenWatchlist: "NVDA, AAPL",
      }),
    ).toEqual(["NVDA", "AAPL"]);
  });
});

describe("tapeScore", () => {
  const w = { screenWMomentum: 1, screenWVolume: 1, screenWRange: 1, screenWRegime: 1 };

  test("RISK-ON rewards upside tape", () => {
    const up = tapeScore(
      { changePct: 4, volume: 80_000_000, price: 100, dayHigh: 101, dayLow: 90, regime: "RISK-ON" },
      w,
    );
    const down = tapeScore(
      { changePct: -4, volume: 80_000_000, price: 100, dayHigh: 110, dayLow: 99, regime: "RISK-ON" },
      w,
    );
    expect(up).toBeGreaterThan(down);
  });

  test("RISK-OFF rewards defensive/down tape vs chase", () => {
    const chase = tapeScore(
      { changePct: 5, volume: 50_000_000, price: 100, dayHigh: 101, dayLow: 90, regime: "RISK-OFF" },
      w,
    );
    const fade = tapeScore(
      { changePct: -3, volume: 50_000_000, price: 92, dayHigh: 100, dayLow: 90, regime: "RISK-OFF" },
      w,
    );
    expect(fade).toBeGreaterThan(chase);
  });
});

describe("composeScoutScore", () => {
  test("LONG conviction lifts tape score", () => {
    const tape = 40;
    const lifted = composeScoutScore(tape, [{ stance: "LONG", conviction: 1, weight: 2 }]);
    const shorted = composeScoutScore(tape, [{ stance: "SHORT", conviction: 1, weight: 2 }]);
    expect(lifted).toBeGreaterThan(tape);
    expect(shorted).toBeLessThan(tape);
  });
});

describe("usesSurface", () => {
  test("screen and both match screen; debate-only, disabled, and CRO do not", () => {
    expect(usesSurface({ surfaces: "both", enabled: true }, "screen")).toBe(true);
    expect(usesSurface({ surfaces: "screen", enabled: true }, "screen")).toBe(true);
    expect(usesSurface({ surfaces: "debate", enabled: true }, "screen")).toBe(false);
    expect(usesSurface({ surfaces: "both", enabled: false }, "debate")).toBe(false);
    expect(usesSurface({ surfaces: "debate", enabled: true, layer: "decision" }, "screen")).toBe(false);
    expect(usesSurface({ surfaces: "debate", enabled: true, layer: "decision" }, "debate")).toBe(true);
  });
});

describe("universes", () => {
  test("listed symbols are unique", () => {
    expect(new Set(SP100).size).toBe(SP100.length);
    expect(new Set(NDX100).size).toBe(NDX100.length);
  });
});

describe("mergeSettings screen knobs", () => {
  test("clamps size and universe", () => {
    expect(mergeSettings({ screenSize: 99 }).screenSize).toBe(20);
    expect(mergeSettings({ screenUniverse: "nope" }).screenUniverse).toBe("sp100");
  });
});
