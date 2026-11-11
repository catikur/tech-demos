import { useMemo } from "react";
import { getCandles } from "../lib/candles.ts";
import { describeRules } from "../lib/snippet.ts";
import { quickCheck, type VerdictLabel } from "../lib/quickcheck.ts";
import type { Strategy } from "../lib/types.ts";

const STEPS = [
  "Read the rule card",
  "Score lookahead, sample size, stoploss, and parameter extremes",
  "Stamp one label",
];

export function CheckPanel({ strategy }: { strategy: Strategy }) {
  const verdict = useMemo(() => quickCheck(strategy, getCandles(strategy.symbol, strategy.timeframe)), [strategy]);
  const rules = describeRules(strategy);
  return (
    <div className="split check-layout">
      <section className="card">
        <p className="eyebrow">System One · before the backtest</p>
        <h2>Quick check</h2>
        <p className={stampClass(verdict.label)}>{verdict.label}</p>
        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <ul className="reasons">
          {verdict.reasons.map((reason) => (
            <li key={reason.text}>
              <span className={`tag tag-${reason.label}`}>{reason.label}</span>
              {reason.text}
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <p className="eyebrow">What was judged</p>
        <h2>{strategy.name}</h2>
        <dl className="plain">
          <div>
            <dt>Market</dt>
            <dd>
              {strategy.symbol} · {strategy.timeframe}
            </dd>
          </div>
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
        <p className="quiet">
          The label is a fixed rubric on this card and these seeded bars. It is not a model call and it is not permission to trade.
        </p>
      </section>
    </div>
  );
}

function stampClass(label: VerdictLabel): string {
  switch (label) {
    case "good":
      return "stamp stamp-good";
    case "weak":
      return "stamp stamp-weak";
    case "risky":
      return "stamp stamp-risky";
    default: {
      const exhaustive: never = label;
      return exhaustive;
    }
  }
}
