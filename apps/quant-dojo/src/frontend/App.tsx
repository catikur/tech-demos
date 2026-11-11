import { useEffect, useState } from "react";
import type { Strategy, SymbolId } from "../lib/types.ts";
import { SYMBOLS } from "../lib/types.ts";
import { BacktestPanel } from "./BacktestPanel.tsx";
import { CheckPanel } from "./CheckPanel.tsx";
import { loadStrategy, saveStrategy } from "./storage.ts";
import { StrategyPanel } from "./StrategyPanel.tsx";
import { SweepPanel } from "./SweepPanel.tsx";
import { TutorPanel } from "./TutorPanel.tsx";

type Tab = "tutor" | "strategy" | "check" | "backtest" | "sweep";

const TABS: { id: Tab; label: string }[] = [
  { id: "tutor", label: "Tutor" },
  { id: "strategy", label: "Strategy" },
  { id: "check", label: "Quick check" },
  { id: "backtest", label: "Backtest" },
  { id: "sweep", label: "Sweep" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("tutor");
  const [strategy, setStrategy] = useState<Strategy>(() => loadStrategy());

  useEffect(() => {
    saveStrategy(strategy);
  }, [strategy]);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="seal" aria-hidden="true">
            Q
          </span>
          <div>
            <p className="eyebrow">Seeded floor · no live market</p>
            <h1>Quant Dojo</h1>
          </div>
        </div>
        <div className="market">
          <label>
            Symbol
            <select
              value={strategy.symbol}
              onChange={(event) => setStrategy({ ...strategy, symbol: event.target.value as SymbolId })}
            >
              {SYMBOLS.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label>
            Timeframe
            <select
              value={strategy.timeframe}
              onChange={(event) =>
                setStrategy({ ...strategy, timeframe: event.target.value === "4h" ? "4h" : "1h" })
              }
            >
              <option value="1h">1h</option>
              <option value="4h">4h</option>
            </select>
          </label>
        </div>
      </header>
      <p className="disclaimer">
        Educational rehearsal on deterministic prices. Not financial advice. No exchange, broker, wallet, API key, or live model.
      </p>
      <nav aria-label="Sections">
        {TABS.map((item) => (
          <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      <main>{renderTab(tab, strategy, setStrategy)}</main>
    </div>
  );
}

function renderTab(tab: Tab, strategy: Strategy, setStrategy: (strategy: Strategy) => void) {
  switch (tab) {
    case "tutor":
      return <TutorPanel />;
    case "strategy":
      return <StrategyPanel strategy={strategy} onChange={setStrategy} />;
    case "check":
      return <CheckPanel strategy={strategy} />;
    case "backtest":
      return <BacktestPanel strategy={strategy} />;
    case "sweep":
      return <SweepPanel strategy={strategy} />;
    default: {
      const exhaustive: never = tab;
      return exhaustive;
    }
  }
}
