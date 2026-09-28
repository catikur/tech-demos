import { useEffect, useMemo, useRef, useState } from "react";
import type { Instrument } from "../lib/market";

const PINNED = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];

interface Props {
  value: string;
  instruments: Instrument[];
  onChange: (symbol: string) => void;
}

export function SymbolSearch({ value, instruments, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const known = useMemo(() => new Set(instruments.map((i) => i.symbol)), [instruments]);
  const pinned = PINNED.filter((symbol) => instruments.length === 0 || known.has(symbol));

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return instruments
      .filter((i) => i.symbol.includes(q) || i.baseCoin.toUpperCase().includes(q))
      .slice(0, 12);
  }, [instruments, query]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, []);

  const pick = (symbol: string) => {
    onChange(symbol);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="symbol-search" ref={rootRef}>
      <div className="symbol-pins">
        {pinned.map((symbol) => (
          <button
            key={symbol}
            type="button"
            className={`pin${symbol === value ? " pin-active" : ""}`}
            onClick={() => pick(symbol)}
          >
            {symbol.replace(/USDT$/, "")}
          </button>
        ))}
      </div>
      <div className="symbol-field">
        <input
          value={open ? query : value}
          placeholder="Search USDT perp"
          spellCheck={false}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) pick(matches[0].symbol);
            if (e.key === "Escape") setOpen(false);
          }}
        />
        {open && matches.length > 0 && (
          <ul className="symbol-menu">
            {matches.map((instrument) => (
              <li key={instrument.symbol}>
                <button type="button" onClick={() => pick(instrument.symbol)}>
                  <span>{instrument.symbol}</span>
                  <span className="symbol-base">{instrument.baseCoin}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
