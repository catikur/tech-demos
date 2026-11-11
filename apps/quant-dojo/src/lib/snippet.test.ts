import { describe, expect, test } from "bun:test";
import { rsiEmaPreset } from "./preset.ts";
import { renderSnippet } from "./snippet.ts";
import type { Condition } from "./types.ts";

function balanced(source: string): boolean {
  let depth = 0;
  for (const char of source) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

const extraExit: Condition = {
  left: { type: "price", field: "close" },
  op: "gt",
  right: { type: "number", value: 1 },
};

describe("python sketch", () => {
  test("parentheses balance and exit rules join with or", () => {
    const strategy = rsiEmaPreset();
    strategy.exit = [...strategy.exit, extraExit];
    const source = renderSnippet(strategy);
    const entry = source.slice(source.indexOf("populate_entry_trend"), source.indexOf("populate_exit_trend"));
    const exit = source.slice(source.indexOf("populate_exit_trend"));
    expect(balanced(source)).toBe(true);
    expect(entry).toContain("&");
    expect(entry).not.toContain("|");
    expect(exit).toContain("|");
  });
});
