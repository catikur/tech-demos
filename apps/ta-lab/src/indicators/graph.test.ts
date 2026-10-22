import { describe, expect, test } from "bun:test";
import { derivePrimitivesGraph } from "./graph.ts";

describe("derived primitives graph", () => {
  const graph = derivePrimitivesGraph();
  const edges = new Set(graph.edges.map((e) => `${e.indicator}→${e.primitive}`));

  test("every indicator uses at least one primitive", () => {
    for (const id of graph.indicators) {
      expect(graph.edges.some((e) => e.indicator === id)).toBe(true);
    }
  });

  test("edges reflect the real implementations", () => {
    expect(edges.has("sma→sma")).toBe(true);
    expect(edges.has("ema→ema")).toBe(true);
    expect(edges.has("rsi→change")).toBe(true);
    expect(edges.has("rsi→rma")).toBe(true);
    expect(edges.has("macd→ema")).toBe(true);
    expect(edges.has("bollinger→sma")).toBe(true);
    expect(edges.has("bollinger→stdev")).toBe(true);
    expect(edges.has("atr→trueRange")).toBe(true);
    expect(edges.has("atr→rma")).toBe(true);
    expect(edges.has("supertrend→trueRange")).toBe(true);
    expect(edges.has("supertrend→rma")).toBe(true);
  });

  test("no fabricated edges", () => {
    expect(edges.has("sma→stdev")).toBe(false);
    expect(edges.has("rsi→sma")).toBe(false);
    expect(edges.has("macd→trueRange")).toBe(false);
  });
});
