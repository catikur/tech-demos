import { useMemo } from "react";
import { getCandles } from "../lib/candles.ts";
import { runSweep } from "../lib/sweep.ts";
import type { Strategy } from "../lib/types.ts";
import { formatPct } from "./format.ts";

export function SweepPanel({ strategy }: { strategy: Strategy }) {
  const candles = getCandles(strategy.symbol, strategy.timeframe);
  const sweep = useMemo(() => runSweep(strategy, candles), [strategy, candles]);
  const hasRsi = strategy.indicators.some((spec) => spec.kind === "rsi");
  return (
    <section className="card">
      <p className="eyebrow">Hyperopt, as a small grid · not a learner</p>
      <h2>In-sample versus the later window</h2>
      <p className="quiet">
        {hasRsi
          ? "RSI period and the RSI entry threshold are crossed. A cell may open trades only inside its window, and a trade still open is closed on that window's last bar. Indicators still see earlier bars."
          : "This card has no RSI threshold to sweep, so the grid is a single rerun of the current rule."}{" "}
        The winner is whoever did best in the first 70%. The later window does not vote.
      </p>
      {sweep.warning ? <p className="banner">{sweep.warning}</p> : <p className="banner quiet-banner">No strong overfit warning on this split.</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>RSI period</th>
              <th>Entry level</th>
              <th>In-sample</th>
              <th>Holdout</th>
              <th>IS trades</th>
              <th>Holdout trades</th>
            </tr>
          </thead>
          <tbody>
            {sweep.rows.map((row) => (
              <tr key={row.id} className={row.id === sweep.bestInSampleId ? "is-best" : ""}>
                <td>{row.rsiPeriod ?? "—"}</td>
                <td>{row.entryThreshold ?? "—"}</td>
                <td>{formatPct(row.isReturn)}</td>
                <td className={row.oosReturn < 0 ? "down" : row.oosReturn > 0 ? "up" : undefined}>
                  {formatPct(row.oosReturn)}
                </td>
                <td>{row.isTrades}</td>
                <td>{row.oosTrades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
