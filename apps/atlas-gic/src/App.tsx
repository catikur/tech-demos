import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AutoresearchDrawer, type Resolution } from "./AutoresearchDrawer";
import { api, readSse, ApiError } from "./api";
import {
  AgentCard,
  CommitLog,
  DecisionPanel,
  LayerSection,
  Leaderboard,
  RegimeBadge,
} from "./components";
import { ForecastChart } from "./ForecastChart";
import { SettingsPanel } from "./SettingsPanel";
import { ScreenerDrawer } from "./ScreenerDrawer";
import { looksLikeBybitSymbol } from "./shared/bybit";
import type { TimeframeId } from "./shared/forecast";
import { AGENTS } from "./shared/agents";
import { usesSurface } from "./shared/screen";
import { DEFAULT_SETTINGS } from "./shared/settings";
import type {
  Agent,
  AgentTake,
  AutoresearchProposal,
  BookSnapshot,
  Briefing,
  Commit,
  CroResult,
  Settings,
  Synthesis,
  Weights,
} from "./shared/types";

const LAYER_META = [
  { id: "macro" as const, title: "Layer 1 · Macro", subtitle: "regime & liquidity read" },
  { id: "sector" as const, title: "Layer 2 · Sector", subtitle: "fundamentals & flow" },
  {
    id: "superinvestor" as const,
    title: "Layer 3 · Superinvestor personas",
    subtitle: "the debate floor",
  },
];

type StateResp = {
  settings: Settings;
  keyConfigured: boolean;
  keyMasked: string | null;
  weights: Weights;
  commits: Commit[];
  book: BookSnapshot;
  pendingProposal: AutoresearchProposal | null;
  agents: Agent[];
  latest: {
    debate: {
      id: number;
      ticker: string;
      company: string;
      price: number;
      regime: Briefing["regime"];
      headline: string;
      tape: string;
      croNote: string;
      croCapPct: number;
      cioBullets: string[];
      netScore: number;
      direction: Synthesis["direction"];
      sizePct: number;
      booked: boolean;
    };
    takes: AgentTake[];
  } | null;
};

export default function App() {
  const [ticker, setTicker] = useState("NVDA");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [keyMasked, setKeyMasked] = useState<string | null>(null);
  const [weights, setWeights] = useState<Weights>({});
  const [commits, setCommits] = useState<Commit[]>([]);
  const [book, setBook] = useState<BookSnapshot | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [takes, setTakes] = useState<AgentTake[]>([]);
  const [cro, setCro] = useState<CroResult | null>(null);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [bullets, setBullets] = useState<string[]>([]);
  const [debateId, setDebateId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [screenOpen, setScreenOpen] = useState(false);
  const [roster, setRoster] = useState<Agent[]>(AGENTS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [proposal, setProposal] = useState<AutoresearchProposal | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [booked, setBooked] = useState(false);
  const [needsLogin, setNeedsLogin] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const loadState = useCallback(async () => {
    const s = await api<StateResp>("/api/state");
    setNeedsLogin(false);
    setSettings(s.settings);
    setKeyConfigured(s.keyConfigured);
    setKeyMasked(s.keyMasked);
    setWeights(s.weights);
    setCommits(s.commits);
    setBook(s.book);
    if (s.agents) setRoster(s.agents);
    if (s.pendingProposal) setProposal(s.pendingProposal);
    if (s.latest) {
      const d = s.latest.debate;
      setTakes(s.latest.takes);
      setCro({ note: d.croNote, capPct: d.croCapPct, veto: d.direction === "STAND DOWN" && d.sizePct === 0 });
      setSynthesis({
        direction: d.direction,
        netScore: d.netScore,
        sizePct: d.sizePct,
        uncappedPct: d.sizePct,
        croCapped: false,
      });
      setBullets(d.cioBullets);
      setDebateId(d.id);
      setBooked(d.booked);
      setTicker(d.ticker);
      setBriefing({
        ticker: d.ticker,
        company: d.company,
        price: d.price,
        changePct: 0,
        volume: 0,
        dayHigh: d.price,
        dayLow: d.price,
        currency: "USD",
        vix: 0,
        vixChangePct: 0,
        regime: d.regime,
        headlines: d.headline ? [{ title: d.headline, publisher: "" }] : [],
        tape: d.tape,
      });
    }
  }, []);

  useEffect(() => {
    loadState().catch((e) => {
      if (e instanceof ApiError && e.status === 401) {
        setNeedsLogin(true);
        return;
      }
      setNeedsLogin(false);
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [loadState]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setError(null);
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ password }) });
      setPassword("");
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    await api("/api/logout", { method: "POST" }).catch(() => undefined);
    setNeedsLogin(true);
    setPassword("");
  }

  async function setFanInterval(id: TimeframeId) {
    setSettings((s) => ({ ...s, forecastInterval: id }));
    try {
      const r = await api<{ settings: Settings }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ forecastInterval: id }),
      });
      setSettings(r.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadBriefing(symbol = ticker) {
    setError(null);
    setBusy("briefing");
    try {
      const r = await api<{ briefing: Briefing }>(`/api/briefing?ticker=${encodeURIComponent(symbol)}`);
      if (briefing && r.briefing.ticker !== briefing.ticker) {
        setTakes([]);
        setCro(null);
        setSynthesis(null);
        setBullets([]);
        setDebateId(null);
        setBooked(false);
      }
      setBriefing(r.briefing);
      setTicker(r.briefing.ticker);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function runDebate() {
    setError(null);
    setTakes([]);
    setCro(null);
    setSynthesis(null);
    setBullets([]);
    setDebateId(null);
    setBooked(false);
    setRunning(true);
    const fin: { id: number | null; syn: Synthesis | null } = { id: null, syn: null };
    try {
      await readSse("/api/debate", { ticker }, (event, data) => {
        if (event === "briefing") setBriefing(data as Briefing);
        if (event === "layer") {
          const batch = (data as { takes: AgentTake[] }).takes;
          setTakes((t) => [...t, ...batch]);
        }
        if (event === "cro") setCro(data as CroResult);
        if (event === "cio") {
          const d = data as {
            debateId: number;
            synthesis: Synthesis;
            bullets: string[];
            cro: CroResult;
          };
          fin.id = d.debateId;
          fin.syn = d.synthesis;
          setDebateId(d.debateId);
          setSynthesis(d.synthesis);
          setBullets(d.bullets);
          setCro(d.cro);
        }
      });
      if (fin.id && fin.syn && !settings.confirmBook && fin.syn.direction !== "STAND DOWN") {
        const r = await api<{ book: BookSnapshot }>("/api/book", {
          method: "POST",
          body: JSON.stringify({ debateId: fin.id }),
        });
        setBook(r.book);
        setBooked(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      loadState().catch(() => {});
    }
  }

  async function bookIt() {
    if (!debateId) return;
    setBusy("book");
    setError(null);
    try {
      const r = await api<{ book: BookSnapshot }>("/api/book", {
        method: "POST",
        body: JSON.stringify({ debateId }),
      });
      setBook(r.book);
      setBooked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function mark() {
    setBusy("mark");
    setError(null);
    try {
      const r = await api<{ book: BookSnapshot; weights: Weights }>("/api/mark", { method: "POST" });
      setBook(r.book);
      setWeights(r.weights);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function closePos(id: number) {
    setBusy("close");
    try {
      const r = await api<{ book: BookSnapshot }>(`/api/positions/${id}/close`, { method: "POST" });
      setBook(r.book);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function resetBook() {
    if (!confirm("Açık kâğıt pozisyonları kapatılıp kasa sıfırlansın mı?")) return;
    const r = await api<{ book: BookSnapshot }>("/api/book/reset", { method: "POST" });
    setBook(r.book);
  }

  async function runAutoresearch() {
    setBusy("ar");
    setError(null);
    setResolution(null);
    try {
      const r = await api<{ proposal: AutoresearchProposal }>("/api/autoresearch", { method: "POST" });
      setProposal(r.proposal);
      setDrawerOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function resolve(kind: Resolution) {
    try {
      await api("/api/autoresearch/resolve", {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      setResolution(kind);
      await loadState();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const takeOf = (id: string) => takes.find((t) => t.agentId === id);
  const flaggedId = proposal && resolution === null ? proposal.agentId : null;

  if (needsLogin !== false) {
    if (needsLogin === null) {
      return <div className="min-h-screen bg-zinc-950" />;
    }
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <form
          onSubmit={login}
          className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur"
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="text-2xl">🏛️</span>
            <div>
              <div className="font-mono text-sm font-black tracking-widest text-zinc-100">
                ATLAS<span className="text-sky-400">-GIC</span>
              </div>
              <div className="text-[10px] text-zinc-500">kâğıt araştırma masası · giriş gerekli</div>
            </div>
          </div>
          <label className="block">
            <div className="mb-1 font-mono text-[10px] tracking-widest text-zinc-500">KAPI ŞİFRESİ</div>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm"
            />
          </label>
          {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={loginBusy || !password}
            className="mt-4 w-full rounded-xl border border-sky-500/50 bg-sky-500/15 px-4 py-2 font-mono text-xs font-bold text-sky-300 disabled:opacity-40"
          >
            {loginBusy ? "…" : "Giriş"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏛️</span>
            <div>
              <div className="font-mono text-sm font-black tracking-widest text-zinc-100">
                ATLAS<span className="text-sky-400">-GIC</span>
              </div>
              <div className="text-[10px] text-zinc-500">
                kâğıt araştırma masası · gerçek tartışma · darwinian weights
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={`font-mono text-[10px] ${keyConfigured ? "text-emerald-400" : "text-rose-400"}`}
            >
              {keyConfigured ? "OpenRouter tanımlı" : "API key yok"}
            </span>
            <button
              onClick={() => setScreenOpen(true)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800"
            >
              Screener
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800"
            >
              Ayarlar
            </button>
            <button
              onClick={() => void logout()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 font-mono text-[10px] text-zinc-500 hover:bg-zinc-800"
            >
              Çıkış
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-40">
            <div className="mb-1 font-mono text-[10px] tracking-widest text-zinc-500">TICKER</div>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && loadBriefing()}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-lg font-bold tracking-wider"
            />
          </label>
          <button
            onClick={() => loadBriefing()}
            disabled={!!busy}
            className="rounded-xl border border-zinc-700 px-4 py-2.5 font-mono text-xs text-zinc-300 hover:bg-zinc-800"
          >
            {busy === "briefing" ? "…" : "Fiyat çek"}
          </button>
          <button
            onClick={runDebate}
            disabled={running || !keyConfigured}
            className="rounded-xl border border-sky-500/60 bg-sky-500/15 px-5 py-2.5 font-mono text-xs font-bold tracking-widest text-sky-300 hover:bg-sky-500/25 disabled:opacity-50"
          >
            {running ? "⏳ TARTIŞILIYOR…" : "▶ RUN DEBATE"}
          </button>
        </div>

        {briefing && (
          <div className="mt-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-2xl font-black">{briefing.ticker}</span>
              <span className="text-xs text-zinc-500">{briefing.company}</span>
              <span className="font-mono text-lg text-zinc-100">
                {briefing.price.toFixed(2)} {briefing.currency}
              </span>
              <span className={`font-mono text-sm ${briefing.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {briefing.changePct >= 0 ? "+" : ""}
                {briefing.changePct.toFixed(2)}%
              </span>
              <RegimeBadge regime={briefing.regime} />
            </div>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">{briefing.tape}</p>
            {briefing.headlines[0] && (
              <p className="mt-1 text-[13px] text-zinc-300">{briefing.headlines[0].title}</p>
            )}
          </div>
        )}
      </header>

      {briefing && looksLikeBybitSymbol(briefing.ticker) && (
        <ForecastChart symbol={briefing.ticker} settings={settings} onInterval={(id) => void setFanInterval(id)} />
      )}

      {!keyConfigured && (
        <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-200">
          OpenRouter anahtarı yok. Ayarlar’dan yapıştır veya <code>OPENROUTER_API_KEY</code> ile başlat.
          Sahte take üretilmez.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-200">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <main className="space-y-8">
          {takes.length === 0 && !running && (
            <div className="rise-in flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-24 text-center">
              <div className="mb-3 text-4xl">🏛️</div>
              <p className="mb-1 text-sm font-semibold text-zinc-300">Tartışma katı boş.</p>
              <p className="max-w-md text-xs leading-relaxed text-zinc-500">
                Bir ticker yaz, fiyatı çek, sonra OpenRouter üzerinden gerçek katmanlı tartışmayı çalıştır.
              </p>
            </div>
          )}

          {LAYER_META.map((meta) => {
            const agents = roster.filter((a) => a.layer === meta.id && usesSurface(a, "debate"));
            const ready = agents.every((a) => takeOf(a.id));
            if (!ready && !running) return null;
            if (!ready && running && !agents.some((a) => takeOf(a.id))) {
              return (
                <LayerSection key={meta.id} title={meta.title} subtitle="bekleniyor…">
                  {agents.map((a) => (
                    <div key={a.id} className="h-28 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
                  ))}
                </LayerSection>
              );
            }
            if (!agents.some((a) => takeOf(a.id))) return null;
            return (
              <LayerSection key={meta.id} title={meta.title} subtitle={meta.subtitle}>
                {agents.map((agent) => {
                  const take = takeOf(agent.id);
                  if (!take) return null;
                  return (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      take={take}
                      weight={weights[agent.id] ?? agent.baseWeight}
                      flagged={agent.id === flaggedId}
                    />
                  );
                })}
              </LayerSection>
            );
          })}

          {cro && synthesis && (
            <>
              <DecisionPanel cro={cro} synthesis={synthesis} bullets={bullets} />
              <div className="flex flex-wrap justify-center gap-3">
                {settings.confirmBook && synthesis.direction !== "STAND DOWN" && (
                  <button
                    onClick={bookIt}
                    disabled={!debateId || booked || busy === "book"}
                    className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-5 py-3 font-mono text-xs font-bold tracking-widest text-emerald-400 disabled:opacity-50"
                  >
                    {booked ? "✓ KÂĞIDA YAZILDI" : "KÂĞIDA YAZ"}
                  </button>
                )}
                <button
                  onClick={runAutoresearch}
                  disabled={busy === "ar"}
                  className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-5 py-3 font-mono text-xs font-bold tracking-widest text-amber-400"
                >
                  🌙 AUTORESEARCH
                </button>
              </div>
            </>
          )}
        </main>

        <aside className="space-y-4">
          <BookPanel book={book} onMark={mark} onClose={closePos} onReset={resetBook} busy={busy} />
          <Leaderboard weights={weights} flaggedId={flaggedId} agents={roster} />
          <CommitLog commits={commits} />
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-[10px] leading-relaxed text-zinc-600">
            Kâğıt defter + araştırma masası. Canlı broker yok. Gecikmeli Yahoo fiyat. Yatırım tavsiyesi değildir.
            Mimari ilham:{" "}
            <a href="https://github.com/chrisworsey55/atlas-gic" className="text-sky-500 hover:underline">
              chrisworsey55/atlas-gic
            </a>
            .
          </div>
        </aside>
      </div>

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          keyMasked={keyMasked}
          keyConfigured={keyConfigured}
          agents={roster}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => loadState()}
        />
      )}
      {screenOpen && (
        <ScreenerDrawer
          settings={settings}
          onClose={() => setScreenOpen(false)}
          onPick={(symbol) => {
            setScreenOpen(false);
            setTicker(symbol);
            void loadBriefing(symbol);
          }}
        />
      )}
      {drawerOpen && proposal && (
        <AutoresearchDrawer
          proposal={proposal}
          weights={weights}
          resolution={resolution}
          onKeep={() => resolve("keep")}
          onRevert={() => resolve("revert")}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

function BookPanel({
  book,
  onMark,
  onClose,
  onReset,
  busy,
}: {
  book: BookSnapshot | null;
  onMark: () => void;
  onClose: (id: number) => void;
  onReset: () => void;
  busy: string | null;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <h3 className="mb-3 font-mono text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">
        Kâğıt defter
      </h3>
      {book ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 font-mono text-xs">
            <div>
              <div className="text-[10px] text-zinc-600">CASH</div>
              <div>{book.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600">EQUITY</div>
              <div>{book.equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
          <ul className="mb-3 space-y-2">
            {book.positions.length === 0 && (
              <li className="text-[11px] text-zinc-600">Açık pozisyon yok.</li>
            )}
            {book.positions.map((p) => (
              <li key={p.id} className="rounded-lg border border-zinc-800 p-2 text-[11px]">
                <div className="flex justify-between font-mono">
                  <span>
                    {p.side} {p.ticker}
                  </span>
                  <span className={(p.pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {(p.pnl ?? 0) >= 0 ? "+" : ""}
                    {(p.pnl ?? 0).toFixed(0)}
                  </span>
                </div>
                <div className="text-zinc-500">
                  {p.qty.toFixed(2)} @ {p.avgPrice.toFixed(2)}
                  {p.last ? ` · last ${p.last.toFixed(2)}` : ""}
                </div>
                <button
                  onClick={() => onClose(p.id)}
                  className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-200"
                >
                  Kapat
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              onClick={onMark}
              disabled={busy === "mark"}
              className="flex-1 rounded-lg border border-zinc-700 py-1.5 font-mono text-[10px] text-zinc-300"
            >
              Seansı işaretle
            </button>
            <button onClick={onReset} className="rounded-lg border border-zinc-800 px-2 font-mono text-[10px] text-zinc-600">
              Sıfırla
            </button>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-zinc-600">Yükleniyor…</p>
      )}
    </div>
  );
}
