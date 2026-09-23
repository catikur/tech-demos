import { useEffect, useState } from "react";
import type { Quote, SymbolDetail } from "./types.ts";
import { Watchlist } from "./components/Watchlist.tsx";
import { FundamentalsCard } from "./components/FundamentalsCard.tsx";
import { AgentPane } from "./components/AgentPane.tsx";

export function App() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState("AAPL");
  const [detail, setDetail] = useState<SymbolDetail | null>(null);

  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then(setQuotes);
  }, []);

  useEffect(() => {
    let stale = false;
    fetch(`/api/symbol/${selected}`)
      .then((r) => r.json())
      .then((d: SymbolDetail) => {
        if (!stale) setDetail(d);
      });
    return () => {
      stale = true;
    };
  }, [selected]);

  return (
    <div className="terminal">
      <header className="topbar">
        <span className="logo">▌OPENBB-LITE</span>
        <span className="subtitle">research terminal</span>
        <span className="badge">MOCK DATA · OFFLINE</span>
      </header>

      <main className="grid">
        <Watchlist quotes={quotes} selected={selected} onSelect={setSelected} />
        {detail ? (
          <FundamentalsCard detail={detail} />
        ) : (
          <section className="panel main loading">loading {selected}…</section>
        )}
        <AgentPane />
      </main>

      <footer className="statusbar">
        seeded session 2026-09-23 · {quotes.length} symbols · inspired by OpenBB · mock data only —
        not investment advice
      </footer>
    </div>
  );
}
