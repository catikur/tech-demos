import { useState } from "react";
import { api } from "./api";
import { RegimeBadge } from "./components";
import type { ScreenHit, Settings } from "./shared/types";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<ScreenHit[]>([]);
  const [meta, setMeta] = useState<{
    regime?: string;
    vix?: number;
    scanned?: number;
    universe?: number;
    scoutSkipped?: boolean;
  } | null>(null);

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
      }>("/api/screen", { method: "POST", body: JSON.stringify({ theme }) });
      setHits(r.hits);
      setMeta({
        regime: r.regime,
        vix: r.vix,
        scanned: r.scanned,
        universe: r.universe,
        scoutSkipped: r.scoutSkipped,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="rise-in max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-950 p-6 sm:rounded-2xl">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-mono text-sm font-bold tracking-widest text-zinc-100">SCREENER</h2>
          <span className="text-[10px] text-zinc-500">
            {settings.screenUniverse} · top {settings.screenSize}
            {settings.screenScoutEnabled ? " · scout açık" : " · yalnız teyp"}
          </span>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-200">
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="min-w-60 flex-1">
            <div className="mb-1 font-mono text-[10px] tracking-widest text-zinc-500">TEMA (opsiyonel)</div>
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="RISK-ON AI yarıiletkenler"
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
        </div>

        {meta && (
          <p className="mb-3 font-mono text-[11px] text-zinc-500">
            evren {meta.universe} · taranan {meta.scanned} · VIX {meta.vix?.toFixed(1)} · {meta.regime}
            {meta.scoutSkipped ? " · scout atlandı (anahtar veya screen persona yok)" : ""}
          </p>
        )}
        {error && <p className="mb-3 text-xs text-rose-400">{error}</p>}

        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="font-mono text-[10px] tracking-widest text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-2">Ticker</th>
                <th className="px-3 py-2">Teyp</th>
                <th className="px-3 py-2">Skor</th>
                <th className="px-3 py-2">Scout</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {hits.map((h) => (
                <tr key={h.ticker} className="border-b border-zinc-900 last:border-0">
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
                  <td className="px-3 py-2 font-mono text-sky-300">{h.score.toFixed(1)}</td>
                  <td className="px-3 py-2 text-zinc-400">
                    {h.scouts.length === 0 && "—"}
                    {h.scouts.map((s) => (
                      <div key={s.agentId} className="mb-1">
                        <span className="font-mono text-[10px] text-zinc-500">{s.agentName}</span>{" "}
                        <span className="font-mono text-[10px] text-zinc-200">{s.stance}</span>
                        <div className="text-[10px] leading-snug text-zinc-500">{s.take}</div>
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => onPick(h.ticker)}
                      className="rounded-lg border border-zinc-700 px-2 py-1 font-mono text-[10px] text-zinc-200 hover:bg-zinc-800"
                    >
                      Masaya al
                    </button>
                  </td>
                </tr>
              ))}
              {!hits.length && !busy && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                    Evreni taramak için Tara. Tema kutusu boşsa Ayarlar’daki universe kullanılır.
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
