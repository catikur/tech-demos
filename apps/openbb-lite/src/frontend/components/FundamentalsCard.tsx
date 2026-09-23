import type { SymbolDetail } from "../types.ts";
import { PriceChart } from "./PriceChart.tsx";

const fmtUsd = (n: number): string => {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${n.toLocaleString()}`;
};
const fmtShares = (n: number): string =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${(n / 1e6).toFixed(0)}M`;

export function FundamentalsCard({ detail }: { detail: SymbolDetail }) {
  const { quote, fundamentals: f, history } = detail;
  const up = quote.changePct >= 0;
  const stats: Array<[string, string]> = [
    ["Market cap", fmtUsd(f.marketCap)],
    ["P/E (TTM)", f.peRatio.toFixed(1)],
    ["Forward P/E", f.forwardPe.toFixed(1)],
    ["EPS (TTM)", `$${f.eps.toFixed(2)}`],
    ["Div. yield", `${f.dividendYield.toFixed(2)}%`],
    ["Beta", f.beta.toFixed(2)],
    ["Shares out.", fmtShares(f.sharesOutstanding)],
    ["Revenue (TTM)", fmtUsd(f.revenueTTM)],
    ["Gross margin", `${f.grossMargin.toFixed(1)}%`],
    ["52w range", `$${quote.low52w} – $${quote.high52w}`],
    ["Sector", f.sector],
    ["Next earnings", f.nextEarnings],
  ];

  return (
    <section className="panel main">
      <header className="symbol-head">
        <div>
          <h1>
            {quote.ticker} <span className="name">{quote.name}</span>
          </h1>
          <div className="industry">{f.industry}</div>
        </div>
        <div className="price-block">
          <div className="last">${quote.last.toFixed(2)}</div>
          <div className={`chg big ${up ? "up" : "down"}`}>
            {up ? "▲" : "▼"} {Math.abs(quote.change).toFixed(2)} ({Math.abs(quote.changePct).toFixed(2)}%)
          </div>
        </div>
      </header>

      <PriceChart history={history} up={up} />
      <div className="chart-caption">Daily close · last ~6 months · seeded mock series</div>

      <div className="fund-grid">
        {stats.map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
