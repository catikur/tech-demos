import { useEffect, useMemo, useState } from "react";
import { api, readSse } from "./api";
import { RegimeBadge } from "./components";
import type { BybitClass, ScreenHit, ScreenUniverse, Settings } from "./shared/types";

const UNIVERSES: Array<[ScreenUniverse, string]> = [
  ["sp100", "S&P 100"],
  ["ndx100", "Nasdaq-100"],
  ["watchlist", "İzleme"],
  ["bybit", "Bybit perp"],
];

const BYBIT_CLASSES: Array<[BybitClass, string]> = [
  ["all", "Hepsi"],
  ["crypto", "Kripto"],
  ["stock", "Hisse"],
  ["commodity", "Emtia"],
  ["etf", "ETF"],
  ["forex", "Forex"],
];

type SortKey = "ticker" | "changePct" | "volume" | "score" | "forecastMeanPct";

export function ScreenerDrawer({
  settings,
  onPick,
  onClose,
}: {
  settings: Settings;
  onPick: (ticker: string) => void;
  onClose: () => void;
}) {
  const [theme, setTheme] = useState("");
  const [universe, setUniverse] = useState<ScreenUniverse>(settings.screenUniverse);
  const [bybitClass, setBybitClass] = useState<BybitClass>(settings.screenBybitClass);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<ScreenHit[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: "score", dir: -1 });
  const [picked, setPicked] = useState<string[]>([]);
  const [batchNote, setBatchNote] = useState<string | null>(null);
  const [runs, setRuns] = useState<Array<{ id: number; at: string; universe: string; scanned: number }>>([]);
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");
  const [diff, setDiff] = useState<{ entered: string[]; exited: string[]; stayed: string[] } | null>(null);
  const [meta, setMeta] = useState<{
    regime?: string;
    vix?: number;
    scanned?: number;
    universe?: number;
    scoutSkipped?: boolean;
    universeId?: string;
    bybitClass?: string | null;
  } | null>(null);

  useEffect(() => {
    api<{ runs: Array<{ id: number; at: string; universe: string; scanned: number }> }>("/api/screens")
      .then((r) => setRuns(r.runs))
      .catch(() => undefined);
  }, [hits]);

  const shown = useMemo(() => {
    const copy = [...hits];
    copy.sort((a, b) => {
      const av = sort.key === "ticker" ? a.ticker : Number(a[sort.key] ?? 0);
      const bv = sort.key === "ticker" ? b.ticker : Number(b[sort.key] ?? 0);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sort.dir;
      return ((av as number) - (bv as number)) * sort.dir;
    });
    return copy;
  }, [hits, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === "ticker" ? 1 : -1 }));
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{
        hits: ScreenHit[];
        regime: string;
        vix: number;
        scanned: number;
        universe: number;
        scoutSkipped?: boolean;
        universeId?: string;
        bybitClass?: string | null;
      }>("/api/screen", {
        method: "POST",
        body: JSON.stringify({ theme, universe, bybitClass }),
      });
      setHits(r.hits);
      setPicked([]);
      setMeta({
        regime: r.regime,
        vix: r.vix,
        scanned: r.scanned,
        universe: r.universe,
        scoutSkipped: r.scoutSkipped,
        universeId: r.universeId,
        bybitClass: r.bybitClass,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function csv() {
    const header = "ticker,company,price,changePct,volume,openInterest,score,forecastMeanPct";
    const lines = shown.map((h) =>
      [h.ticker, `"${h.company.replace(/"/g, "")}"`, h.price, h.changePct, h.volume, h.openInterest ?? "", h.score, h.forecastMeanPct ?? ""].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "atlas-screen.csv";
    a.click();
  }

  async function watch(ticker: string) {
    const parts = settings.screenWatchlist.split(/[\s,]+/).filter(Boolean);
    if (parts.includes(ticker)) return;
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ screenWatchlist: [...parts, ticker].join(", ") }),
    });
  }

  async function debatePicked() {
    if (!picked.length) return;
    setBatchNote(null);
    setBusy(true);
    try {
      await readSse("/api/debate/batch", { tickers: picked }, (event, data) => {
        if (event === "progress") {
          const p = data as { ticker?: string; status?: string; index?: number; total?: number };
          setBatchNote(`${(p.index ?? 0) + 1}/${p.total ?? picked.length} ${p.ticker} ${p.status}`);
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function compare() {
    if (!cmpA || !cmpB) return;
    const r = await api<{ entered: string[]; exited: string[]; stayed: string[] }>(
      `/api/screens/diff?a=${cmpA}&b=${cmpB}`,
    );
    setDiff(r);
  }

  const th = (key: SortKey, label: string) => (
    <th className="px-3 py-2">
      <button onClick={() => toggleSort(key)} className="font-mono text-[10px] tracking-widest text-zinc-500">
        {label}
        {sort.key === key ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div tabIndex={-1} className="rise-in max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-950 p-6 outline-none sm:rounded-2xl">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-mono text-sm font-bold tracking-widest text-zinc-100">SCREENER</h2>
          <span className="text-[10px] text-zinc-500">
            {universe === "bybit" ? `bybit ${bybitClass}` : universe} · top {settings.screenSize}
            {settings.screenScoutEnabled ? " · scout açık" : " · yalnız teyp"}
          </span>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-200" aria-label="Close drawer">
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="min-w-36">
            <div className="mb-1 font-mono text-[10px] tracking-widest text-zinc-500">EVREN</div>
            <select
              value={universe}
              onChange={(e) => setUniverse(e.target.value as ScreenUniverse)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs"
            >
              {UNIVERSES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {universe === "bybit" && (
            <label className="min-w-32">
              <div className="mb-1 font-mono text-[10px] tracking-widest text-zinc-500">SINIF</div>
              <select
                value={bybitClass}
                onChange={(e) => setBybitClass(e.target.value as BybitClass)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs"
              >
                {BYBIT_CLASSES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="min-w-60 flex-1">
            <div className="mb-1 font-mono text-[10px] tracking-widest text-zinc-500">TEMA (opsiyonel)</div>
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder={universe === "bybit" ? "altın ve tesla" : "RISK-ON AI yarıiletkenler"}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs"
            />
          </label>
          <button
            onClick={() => void run()}
            disabled={busy}
            className="rounded-xl border border-sky-500/50 bg-sky-500/15 px-4 py-2 font-mono text-xs font-bold text-sky-300 disabled:opacity-40"
          >
            {busy ? "Taranıyor…" : "Tara"}
          </button>
          <button onClick={csv} disabled={!shown.length} className="rounded-xl border border-zinc-700 px-3 py-2 font-mono text-[10px] text-zinc-300">
            CSV
          </button>
          <button
            onClick={() => void debatePicked()}
            disabled={!picked.length || busy}
            className="rounded-xl border border-amber-500/40 px-3 py-2 font-mono text-[10px] text-amber-300 disabled:opacity-40"
          >
            Seçileni tartış ({picked.length})
          </button>
        </div>
        {batchNote && <p className="mb-2 font-mono text-[11px] text-amber-300">{batchNote}</p>}
        {universe === "bybit" && (
          <p className="mb-3 text-[10px] leading-relaxed text-zinc-500">
            Canlı Bybit linear perpetual. Emir yok. Tema kutusu borsa sembolü ister (TSLAUSDT, XAUUSDT), Yahoo formatı değil.
          </p>
        )}

        {runs.length > 0 && (
          <div className="mb-3 flex flex-wrap items-end gap-2 text-[10px]">
            <span className="font-mono text-zinc-500">Önceki taramalar</span>
            <select value={cmpA} onChange={(e) => setCmpA(e.target.value)} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
              <option value="">A</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} {r.universe} {r.at.slice(5, 16)}
                </option>
              ))}
            </select>
            <select value={cmpB} onChange={(e) => setCmpB(e.target.value)} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
              <option value="">B</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} {r.universe} {r.at.slice(5, 16)}
                </option>
              ))}
            </select>
            <button onClick={() => void compare()} className="rounded border border-zinc-700 px-2 py-1 text-zinc-300">
              Karşılaştır
            </button>
            {diff && (
              <span className="text-zinc-400">
                giren {diff.entered.length} · çıkan {diff.exited.length} · kalan {diff.stayed.length}
              </span>
            )}
          </div>
        )}

        {meta && (
          <p className="mb-3 font-mono text-[11px] text-zinc-500">
            evren {meta.universe} · taranan {meta.scanned} · VIX {meta.vix?.toFixed(1)} · {meta.regime}
            {meta.scoutSkipped ? " · scout atlandı" : ""}
          </p>
        )}
        {error && <p className="mb-3 text-xs text-rose-400">{error}</p>}

        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-2" />
                {th("ticker", "Ticker")}
                {th("changePct", "Teyp")}
                {th("volume", "Hacim")}
                <th className="px-3 py-2 font-mono text-[10px] text-zinc-500">OI</th>
                {th("forecastMeanPct", "Fan")}
                {th("score", "Skor")}
                <th className="px-3 py-2 font-mono text-[10px] text-zinc-500">Scout</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((h) => (
                <tr key={h.ticker} className="border-b border-zinc-900 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={picked.includes(h.ticker)}
                      onChange={(e) =>
                        setPicked((xs) => (e.target.checked ? [...xs, h.ticker] : xs.filter((t) => t !== h.ticker)))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-mono font-bold text-zinc-100">{h.ticker}</div>
                    <div className="text-[10px] text-zinc-500">{h.company}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-zinc-300">
                    {h.price.toFixed(2)}{" "}
                    <span className={h.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                      {h.changePct >= 0 ? "+" : ""}
                      {h.changePct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-zinc-500">{Intl.NumberFormat("en", { notation: "compact" }).format(h.volume)}</td>
                  <td className="px-3 py-2 font-mono text-zinc-500">
                    {h.openInterest != null ? Intl.NumberFormat("en", { notation: "compact" }).format(h.openInterest) : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]" title={h.forecastNote || ""}>
                    {h.forecastMeanPct == null ? (
                      <span className="text-zinc-600">—</span>
                    ) : (
                      <span className={h.forecastMeanPct >= 0 ? "text-amber-300" : "text-rose-300"}>
                        {h.forecastMeanPct >= 0 ? "+" : ""}
                        {h.forecastMeanPct.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-sky-300">{h.score.toFixed(1)}</td>
                  <td className="px-3 py-2 text-zinc-400">
                    {h.scouts.length === 0 && "—"}
                    {h.scouts.map((s) => (
                      <div key={s.agentId} className="mb-1">
                        <span className="font-mono text-[10px] text-zinc-500">{s.agentName}</span> {s.stance}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => onPick(h.ticker)} className="mr-1 rounded-lg border border-zinc-700 px-2 py-1 font-mono text-[10px] text-zinc-200">
                      Masaya al
                    </button>
                    <button onClick={() => void watch(h.ticker)} className="rounded-lg border border-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-500">
                      İzle
                    </button>
                  </td>
                </tr>
              ))}
              {!shown.length && !busy && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-zinc-500">
                    Evreni taramak için Tara.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {meta?.regime && (
          <div className="mt-3">
            <RegimeBadge regime={meta.regime as "RISK-ON" | "RISK-OFF" | "CHOP"} />
          </div>
        )}
      </div>
    </div>
  );
}
