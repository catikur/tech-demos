import { useMemo } from "react";
import { backtest } from "../lib/backtest.ts";
import { getCandles, holdoutIndex } from "../lib/candles.ts";
import type { Strategy } from "../lib/types.ts";
import { DEFAULT_BACKTEST } from "../lib/types.ts";
import { EquityChart } from "./EquityChart.tsx";
import { formatMoney, formatPct, formatPrice, formatTime, reasonLabel } from "./format.ts";

export function BacktestPanel({ strategy }: { strategy: Strategy }) {
  const candles = getCandles(strategy.symbol, strategy.timeframe);
  const result = useMemo(() => backtest(candles, strategy, DEFAULT_BACKTEST), [candles, strategy]);
  const metrics = [
    ["Total return", formatPct(result.totalReturn)],
    ["Buy & hold", formatPct(result.buyHoldReturn)],
    ["Max drawdown", formatPct(-result.maxDrawdown)],
    ["Win rate", result.winRate == null ? "—" : `${Math.round(result.winRate * 100)}%`],
    ["Sharpe-like", result.sharpe == null ? "—" : result.sharpe.toFixed(2)],
  ];
  return (
    <div className="stack-page">
      <section className="card">
        <p className="eyebrow">
          {strategy.symbol} · {strategy.timeframe} · {candles.length} seeded bars · 10 bps a side · stake{" "}
          {formatMoney(DEFAULT_BACKTEST.stake)} of {formatMoney(DEFAULT_BACKTEST.initialEquity)}
        </p>
        <h2>{strategy.name}</h2>
        <div className="metrics">
          {metrics.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <EquityChart strategy={result.equity} buyHold={result.buyHoldEquity} splitIndex={holdoutIndex(candles.length)} />
        <div className="legend">
          <span>
            <i className="swatch equity" /> Strategy
          </span>
          <span>
            <i className="swatch hold" /> Buy & hold
          </span>
          <span className="quiet">
            Holdout marker is where the sweep stops tuning. This curve still uses the full window. Sharpe-like is the
            mean bar return divided by its sample deviation, not an annualized figure.
          </span>
        </div>
      </section>
      <section className="card">
        <p className="eyebrow">{result.trades.length} closed trades</p>
        <h2>Trade list</h2>
        {result.trades.length === 0 ? (
          <p className="quiet">No fills. The signal never lined up after warmup, or the fill would have needed a bar that does not exist.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Why</th>
                  <th>Return</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((trade, index) => (
                  <tr key={`${trade.entryIndex}-${trade.exitIndex}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{formatTime(trade.entryTime)}</td>
                    <td>{formatTime(trade.exitTime)}</td>
                    <td>{formatPrice(trade.entryPrice)}</td>
                    <td>{formatPrice(trade.exitPrice)}</td>
                    <td>{reasonLabel(trade.reason)}</td>
                    <td className={trade.pnl >= 0 ? "up" : "down"}>{formatPct(trade.pnlPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
