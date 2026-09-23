import type { Quote } from "../types.ts";
import { Sparkline } from "./Sparkline.tsx";

interface Props {
  quotes: Quote[];
  selected: string;
  onSelect: (ticker: string) => void;
}

export function Watchlist({ quotes, selected, onSelect }: Props) {
  return (
    <section className="panel watchlist">
      <header className="panel-title">Watchlist</header>
      <ul>
        {quotes.map((q) => {
          const up = q.changePct >= 0;
          return (
            <li key={q.ticker}>
              <button
                className={`row ${q.ticker === selected ? "active" : ""}`}
                onClick={() => onSelect(q.ticker)}
              >
                <span className="tk">{q.ticker}</span>
                <Sparkline data={q.spark} up={up} />
                <span className="px">{q.last.toFixed(2)}</span>
                <span className={`chg ${up ? "up" : "down"}`}>
                  {up ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
