import { describe, expect, test } from "bun:test";
import { lineSegments, projectedClosePoints, seriesPoints } from "./chart-series.ts";

describe("chart series split", () => {
  test("a real-length series is not split", () => {
    expect(lineSegments(360, 360)).toEqual({ base: { from: 0, to: 360 }, projected: null });
  });

  test("the dashed span starts on the last real bar", () => {
    expect(lineSegments(384, 360)).toEqual({
      base: { from: 0, to: 360 },
      projected: { from: 359, to: 384 },
    });
  });

  test("projected close points anchor on the last real close and add no wick", () => {
    const points = projectedClosePoints(
      { time: 1_000, close: 10 },
      [
        { time: 1_000 + 86400, close: 11 },
        { time: 1_000 + 2 * 86400, close: 12 },
      ],
    );
    expect(points).toEqual([
      { time: 1_000, value: 10 },
      { time: 1_000 + 86400, value: 11 },
      { time: 1_000 + 2 * 86400, value: 12 },
    ]);
    expect(projectedClosePoints({ time: 1, close: 1 }, [])).toEqual([]);
  });

  test("NaN stays a gap and the span does not read past the series", () => {
    const points = seriesPoints([10, 20, 30, 40], [1, Number.NaN, 3], 0, 4);
    expect(points).toEqual([{ time: 10, value: 1 }, { time: 20 }, { time: 30, value: 3 }]);
  });
});
