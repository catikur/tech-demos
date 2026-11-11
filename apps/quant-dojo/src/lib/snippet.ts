import type { Condition, Operand, Strategy } from "./types.ts";

function className(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const raw = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const ident = raw.replace(/^[0-9]+/, "");
  return ident.length > 0 ? ident : "DojoStrategy";
}

function pySeries(operand: Operand): string {
  switch (operand.type) {
    case "number":
      return trimNumber(operand.value);
    case "price":
      return `dataframe["${operand.field}"]`;
    case "indicator":
      return `dataframe["${operand.id}"]`;
    default: {
      const exhaustive: never = operand;
      return exhaustive;
    }
  }
}

function pyShift(operand: Operand): string {
  if (operand.type === "number") return trimNumber(operand.value);
  return `${pySeries(operand)}.shift(1)`;
}

function pyCondition(condition: Condition): string {
  const left = pySeries(condition.left);
  const right = pySeries(condition.right);
  switch (condition.op) {
    case "lt":
      return `(${left} < ${right})`;
    case "gt":
      return `(${left} > ${right})`;
    case "crosses_above":
      return `((${left} > ${right}) & (${pyShift(condition.left)} <= ${pyShift(condition.right)}))`;
    case "crosses_below":
      return `((${left} < ${right}) & (${pyShift(condition.left)} >= ${pyShift(condition.right)}))`;
    default: {
      const exhaustive: never = condition.op;
      return exhaustive;
    }
  }
}

function trimNumber(value: number): string {
  if (Number.isInteger(value)) return value.toFixed(0);
  return String(Number(value.toFixed(4)));
}

function indicatorLine(strategy: Strategy): string[] {
  return strategy.indicators.map((spec) => {
    switch (spec.kind) {
      case "rsi":
        return `        dataframe["${spec.id}"] = ta.RSI(dataframe, timeperiod=${spec.period})`;
      case "ema":
        return `        dataframe["${spec.id}"] = ta.EMA(dataframe, timeperiod=${spec.period})`;
      case "sma":
        return `        dataframe["${spec.id}"] = ta.SMA(dataframe, timeperiod=${spec.period})`;
      default: {
        const exhaustive: never = spec.kind;
        return exhaustive;
      }
    }
  });
}

function ruleBlock(conditions: Condition[], column: string, join: "&" | "|"): string[] {
  if (conditions.length === 0) {
    return [`        dataframe["${column}"] = 0`];
  }
  const lines = conditions.map((condition, index) => {
    const prefix = index === 0 ? "            " : `            ${join} `;
    return `${prefix}${pyCondition(condition)}`;
  });
  return [
    "        dataframe.loc[",
    "            (",
    ...lines,
    "            ),",
    `            "${column}",`,
    "        ] = 1",
  ];
}

function roiBlock(strategy: Strategy): string {
  if (strategy.roi.length === 0) return "    minimal_roi = {}";
  const rows = [...strategy.roi]
    .sort((a, b) => a.minutes - b.minutes)
    .map((row) => `        "${row.minutes}": ${trimNumber(row.profit)},`);
  return ["    minimal_roi = {", ...rows, "    }"].join("\n");
}

export function renderSnippet(strategy: Strategy): string {
  const stop =
    strategy.stoploss == null
      ? "    # No protective stoploss on the rule card."
      : `    stoploss = ${trimNumber(strategy.stoploss)}`;
  const fillNote =
    strategy.entryFill === "signal_close"
      ? "# WARNING: the dojo fills entries at the signal close. That peeks ahead.\n# A causal port fills on the next open.\n"
      : "# Entries fill on the next open after the signal bar closes.\n";
  const lines = [
    "# Quant Dojo sketch — display only. Nothing here is executed.",
    "# Educational stand-in for a freqtrade-style strategy module.",
    "# Not a live config and not financial advice.",
    fillNote.trimEnd(),
    "",
    "from pandas import DataFrame",
    "import talib.abstract as ta",
    "from freqtrade.strategy import IStrategy",
    "",
    "",
    `class ${className(strategy.name)}(IStrategy):`,
    "    INTERFACE_VERSION = 3",
    `    timeframe = "${strategy.timeframe}"`,
    stop,
    roiBlock(strategy),
    "",
    "    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:",
    ...(strategy.indicators.length === 0
      ? ["        return dataframe"]
      : [...indicatorLine(strategy), "        return dataframe"]),
    "",
    "    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:",
    ...ruleBlock(strategy.entry, "enter_long", "&"),
    "        return dataframe",
    "",
    "    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:",
    ...ruleBlock(strategy.exit, "exit_long", "|"),
    "        return dataframe",
    "",
  ];
  return lines.join("\n");
}

function operandWords(operand: Operand): string {
  switch (operand.type) {
    case "number":
      return trimNumber(operand.value);
    case "price":
      return operand.field;
    case "indicator":
      return operand.id;
    default: {
      const exhaustive: never = operand;
      return exhaustive;
    }
  }
}

function conditionWords(condition: Condition): string {
  const left = operandWords(condition.left);
  const right = operandWords(condition.right);
  switch (condition.op) {
    case "lt":
      return `${left} is below ${right}`;
    case "gt":
      return `${left} is above ${right}`;
    case "crosses_above":
      return `${left} crosses above ${right}`;
    case "crosses_below":
      return `${left} crosses below ${right}`;
    default: {
      const exhaustive: never = condition.op;
      return exhaustive;
    }
  }
}

export function describeRules(strategy: Strategy): { entry: string; exit: string; risk: string } {
  const entry =
    strategy.entry.length === 0
      ? "No entry rule."
      : strategy.entry.map(conditionWords).join(" and ");
  const exitBits = strategy.exit.map(conditionWords);
  if (strategy.roi.length > 0) exitBits.push("a minimal ROI table");
  const exit = exitBits.length === 0 ? "No exit rule." : exitBits.join(", or ");
  const stop =
    strategy.stoploss == null || strategy.stoploss >= 0
      ? "No stoploss."
      : `Stoploss ${(strategy.stoploss * 100).toFixed(1)}%.`;
  const fill =
    strategy.entryFill === "signal_close" ? "Fills on the signal close." : "Fills on the next open.";
  return { entry, exit, risk: `${stop} ${fill}` };
}
