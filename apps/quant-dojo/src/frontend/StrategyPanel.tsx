import { useState } from "react";
import { pitfallPreset, rsiEmaPreset } from "../lib/preset.ts";
import { describeRules, renderSnippet } from "../lib/snippet.ts";
import type { CompareOp, Condition, IndicatorKind, Operand, Strategy } from "../lib/types.ts";

type Props = {
  strategy: Strategy;
  onChange: (strategy: Strategy) => void;
};

const OPS: { id: CompareOp; label: string }[] = [
  { id: "lt", label: "is below" },
  { id: "gt", label: "is above" },
  { id: "crosses_above", label: "crosses above" },
  { id: "crosses_below", label: "crosses below" },
];

function nextId(strategy: Strategy, kind: IndicatorKind): string {
  const used = new Set(strategy.indicators.map((spec) => spec.id));
  let id: string = kind;
  let n = 1;
  while (used.has(id)) {
    n += 1;
    id = `${kind}_${n}`;
  }
  return id;
}

function operandKey(operand: Operand): string {
  switch (operand.type) {
    case "indicator":
      return `ind:${operand.id}`;
    case "price":
      return "price:close";
    case "number":
      return "num";
    default: {
      const exhaustive: never = operand;
      return exhaustive;
    }
  }
}

function keyToOperand(key: string, previous: Operand): Operand {
  if (key === "num") return previous.type === "number" ? previous : { type: "number", value: 30 };
  if (key === "price:close") return { type: "price", field: "close" };
  if (key.startsWith("ind:")) return { type: "indicator", id: key.slice(4) };
  return previous;
}

function ConditionRow({
  condition,
  strategy,
  onChange,
  onRemove,
}: {
  condition: Condition;
  strategy: Strategy;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}) {
  const options = [
    ...strategy.indicators.map((spec) => ({ key: `ind:${spec.id}`, label: spec.id })),
    { key: "price:close", label: "close" },
    { key: "num", label: "number" },
  ];
  return (
    <div className="rule">
      <select
        aria-label="Left side"
        value={operandKey(condition.left)}
        onChange={(event) => onChange({ ...condition, left: keyToOperand(event.target.value, condition.left) })}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Comparison"
        value={condition.op}
        onChange={(event) => onChange({ ...condition, op: event.target.value as CompareOp })}
      >
        {OPS.map((op) => (
          <option key={op.id} value={op.id}>
            {op.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Right side"
        value={operandKey(condition.right)}
        onChange={(event) => onChange({ ...condition, right: keyToOperand(event.target.value, condition.right) })}
      >
        {options.map((option) => (
          <option key={`r-${option.key}`} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      {condition.right.type === "number" ? (
        <input
          aria-label="Threshold"
          type="number"
          value={condition.right.value}
          onChange={(event) =>
            onChange({
              ...condition,
              right: { type: "number", value: Number(event.target.value) },
            })
          }
        />
      ) : null}
      {condition.left.type === "number" ? (
        <input
          aria-label="Left number"
          type="number"
          value={condition.left.value}
          onChange={(event) =>
            onChange({
              ...condition,
              left: { type: "number", value: Number(event.target.value) },
            })
          }
        />
      ) : null}
      <button type="button" className="ghost" onClick={onRemove} aria-label="Remove rule">
        Remove
      </button>
    </div>
  );
}

export function StrategyPanel({ strategy, onChange }: Props) {
  const [copied, setCopied] = useState(false);
  const rules = describeRules(strategy);
  const snippet = renderSnippet(strategy);
  const stopOn = strategy.stoploss != null && strategy.stoploss < 0;

  const patchEntry = (index: number, condition: Condition) => {
    const entry = strategy.entry.map((item, i) => (i === index ? condition : item));
    onChange({ ...strategy, entry });
  };
  const patchExit = (index: number, condition: Condition) => {
    const exit = strategy.exit.map((item, i) => (i === index ? condition : item));
    onChange({ ...strategy, exit });
  };

  const addIndicator = (kind: IndicatorKind) => {
    if (strategy.indicators.length >= 4) return;
    const id = nextId(strategy, kind);
    const period = kind === "rsi" ? 14 : kind === "ema" ? 20 : 20;
    onChange({ ...strategy, indicators: [...strategy.indicators, { id, kind, period }] });
  };

  const blank = (): Condition => ({
    left: strategy.indicators[0]
      ? { type: "indicator", id: strategy.indicators[0].id }
      : { type: "price", field: "close" },
    op: "lt",
    right: { type: "number", value: 30 },
  });

  return (
    <div className="split">
      <section className="card">
        <p className="eyebrow">Rule card</p>
        <h2>Build the strategy</h2>
        <label className="field">
          Name
          <input value={strategy.name} onChange={(event) => onChange({ ...strategy, name: event.target.value })} />
        </label>
        <div className="preset-row">
          <button
            type="button"
            onClick={() => onChange(rsiEmaPreset(strategy.symbol, strategy.timeframe))}
          >
            RSI + EMA cross
          </button>
          <button type="button" className="ghost" onClick={() => onChange(pitfallPreset(strategy.symbol, strategy.timeframe))}>
            Load a pitfall
          </button>
        </div>

        <h3>Indicators</h3>
        <div className="stack">
          {strategy.indicators.map((spec) => (
            <div className="rule" key={spec.id}>
              <span className="pill">{spec.kind}</span>
              <code>{spec.id}</code>
              <input
                aria-label={`${spec.id} period`}
                type="number"
                min={2}
                max={200}
                value={spec.period}
                onChange={(event) => {
                  const period = Math.round(Number(event.target.value));
                  if (!Number.isFinite(period)) return;
                  onChange({
                    ...strategy,
                    indicators: strategy.indicators.map((item) =>
                      item.id === spec.id ? { ...item, period: Math.min(200, Math.max(2, period)) } : item,
                    ),
                  });
                }}
              />
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  onChange({
                    ...strategy,
                    indicators: strategy.indicators.filter((item) => item.id !== spec.id),
                    entry: strategy.entry.filter((condition) => !uses(condition, spec.id)),
                    exit: strategy.exit.filter((condition) => !uses(condition, spec.id)),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="preset-row">
          <button type="button" onClick={() => addIndicator("rsi")}>
            Add RSI
          </button>
          <button type="button" onClick={() => addIndicator("ema")}>
            Add EMA
          </button>
          <button type="button" onClick={() => addIndicator("sma")}>
            Add SMA
          </button>
        </div>

        <h3>Entry · all must be true</h3>
        {strategy.entry.map((condition, index) => (
          <ConditionRow
            key={`e-${index}`}
            condition={condition}
            strategy={strategy}
            onChange={(next) => patchEntry(index, next)}
            onRemove={() => onChange({ ...strategy, entry: strategy.entry.filter((_, i) => i !== index) })}
          />
        ))}
        <button type="button" disabled={strategy.entry.length >= 4} onClick={() => onChange({ ...strategy, entry: [...strategy.entry, blank()] })}>
          Add entry rule
        </button>

        <h3>Exit signal · any is enough to arm the next open</h3>
        {strategy.exit.map((condition, index) => (
          <ConditionRow
            key={`x-${index}`}
            condition={condition}
            strategy={strategy}
            onChange={(next) => patchExit(index, next)}
            onRemove={() => onChange({ ...strategy, exit: strategy.exit.filter((_, i) => i !== index) })}
          />
        ))}
        <button type="button" disabled={strategy.exit.length >= 4} onClick={() => onChange({ ...strategy, exit: [...strategy.exit, blank()] })}>
          Add exit rule
        </button>

        <h3>Risk</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={stopOn}
            onChange={(event) => onChange({ ...strategy, stoploss: event.target.checked ? -0.06 : null })}
          />
          Protective stoploss
        </label>
        {stopOn ? (
          <label className="field">
            Stop distance %
            <input
              type="number"
              min={0.5}
              max={50}
              step={0.5}
              value={Math.abs((strategy.stoploss ?? 0) * 100)}
              onChange={(event) => {
                const pct = Number(event.target.value);
                if (!Number.isFinite(pct)) return;
                onChange({ ...strategy, stoploss: -Math.min(50, Math.max(0.5, pct)) / 100 });
              }}
            />
          </label>
        ) : null}
        <h3>Minimal ROI</h3>
        {strategy.roi.map((row, index) => (
          <div className="rule" key={`roi-${index}`}>
            <label>
              Minutes
              <input
                type="number"
                min={0}
                value={row.minutes}
                onChange={(event) => {
                  const minutes = Math.max(0, Math.round(Number(event.target.value)));
                  if (!Number.isFinite(minutes)) return;
                  const roi = strategy.roi.map((item, i) => (i === index ? { ...item, minutes } : item));
                  onChange({ ...strategy, roi });
                }}
              />
            </label>
            <label>
              Profit %
              <input
                type="number"
                step={0.5}
                value={Number((row.profit * 100).toFixed(2))}
                onChange={(event) => {
                  const profit = Number(event.target.value) / 100;
                  if (!Number.isFinite(profit)) return;
                  const roi = strategy.roi.map((item, i) => (i === index ? { ...item, profit } : item));
                  onChange({ ...strategy, roi });
                }}
              />
            </label>
            <button
              type="button"
              className="ghost"
              onClick={() => onChange({ ...strategy, roi: strategy.roi.filter((_, i) => i !== index) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={strategy.roi.length >= 4}
          onClick={() => onChange({ ...strategy, roi: [...strategy.roi, { minutes: 0, profit: 0.04 }] })}
        >
          Add ROI row
        </button>
        <label className="field">
          Entry fill
          <select
            value={strategy.entryFill}
            onChange={(event) =>
              onChange({
                ...strategy,
                entryFill: event.target.value === "signal_close" ? "signal_close" : "next_open",
              })
            }
          >
            <option value="next_open">Next open (causal)</option>
            <option value="signal_close">Signal close (lookahead)</option>
          </select>
        </label>
        <dl className="plain">
          <div>
            <dt>Entry</dt>
            <dd>{rules.entry}</dd>
          </div>
          <div>
            <dt>Exit</dt>
            <dd>{rules.exit}</dd>
          </div>
          <div>
            <dt>Risk</dt>
            <dd>{rules.risk}</dd>
          </div>
        </dl>
      </section>
      <section className="card sketch">
        <div className="map-head">
          <p className="eyebrow">Python sketch · not executed</p>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(snippet).then(
                () => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1200);
                },
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre>
          <code>{snippet}</code>
        </pre>
      </section>
    </div>
  );
}

function uses(condition: Condition, id: string): boolean {
  return (
    (condition.left.type === "indicator" && condition.left.id === id) ||
    (condition.right.type === "indicator" && condition.right.id === id)
  );
}
