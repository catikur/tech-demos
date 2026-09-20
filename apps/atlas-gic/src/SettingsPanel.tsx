import { useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { DEFAULT_SETTINGS } from "./shared/settings";
import type { Agent, ModelOption, Settings } from "./shared/types";

export function SettingsPanel({
  settings,
  keyMasked,
  keyConfigured,
  agents,
  onClose,
  onSaved,
}: {
  settings: Settings;
  keyMasked: string | null;
  keyConfigured: boolean;
  agents: Agent[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Settings>(settings);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [filter, setFilter] = useState(settings.model);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ models: ModelOption[] }>("/api/models")
      .then((r) => setModels(r.models))
      .catch(() => setModels([]));
  }, []);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ ...form, apiKey: apiKey || undefined }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const filtered = models.filter(
    (m) =>
      m.id.toLowerCase().includes(filter.toLowerCase()) ||
      m.name.toLowerCase().includes(filter.toLowerCase()),
  ).slice(0, 40);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="rise-in max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-950 p-6 sm:rounded-2xl">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-mono text-sm font-bold tracking-widest text-zinc-100">AYARLAR</h2>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-200">
            ✕
          </button>
        </div>

        <Field label="OpenRouter API key">
          <input
            type="password"
            placeholder={keyConfigured ? keyMasked ?? "set via env" : "sk-or-v1-…"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs"
          />
          <p className="mt-1 text-[10px] text-zinc-600">
            Boş bırakırsan mevcut env / kayıtlı anahtar kullanılır. Anahtar git’e yazılmaz.
          </p>
        </Field>

        <Field label="Base URL">
          <input
            value={form.openrouterBaseUrl}
            readOnly
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-500"
          />
          <p className="mt-1 text-[10px] text-zinc-600">
            OpenRouter adresi kilitli — rastgele URL anahtarı dışarı sızdırır.
          </p>
        </Field>

        <Field label="Model">
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              set("model", e.target.value);
            }}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs"
          />
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-zinc-800">
            {(filtered.length ? filtered : [{ id: form.model, name: form.model }]).map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  set("model", m.id);
                  setFilter(m.id);
                }}
                className={`block w-full truncate px-3 py-1.5 text-left font-mono text-[11px] ${
                  form.model === m.id ? "bg-sky-500/20 text-sky-300" : "text-zinc-400 hover:bg-zinc-900"
                }`}
              >
                {m.id}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Num label="Temperature" value={form.temperature} step={0.05} onChange={(v) => set("temperature", v)} />
          <Num label="Max tokens" value={form.maxTokens} step={100} onChange={(v) => set("maxTokens", v)} />
          <Num label="Starting cash $" value={form.startingCash} step={1000} onChange={(v) => set("startingCash", v)} />
          <Num label="Slippage bps" value={form.slippageBps} step={1} onChange={(v) => set("slippageBps", v)} />
          <Num label="CRO cap RISK-ON %" value={form.croCapRiskOn} step={0.5} onChange={(v) => set("croCapRiskOn", v)} />
          <Num label="CRO cap RISK-OFF %" value={form.croCapRiskOff} step={0.5} onChange={(v) => set("croCapRiskOff", v)} />
          <Num label="CRO cap CHOP %" value={form.croCapChop} step={0.5} onChange={(v) => set("croCapChop", v)} />
          <Num label="Darwin up" value={form.darwinUp} step={0.01} onChange={(v) => set("darwinUp", v)} />
          <Num label="Darwin down" value={form.darwinDown} step={0.01} onChange={(v) => set("darwinDown", v)} />
          <Num label="Weight min" value={form.weightMin} step={0.05} onChange={(v) => set("weightMin", v)} />
          <Num label="Weight max" value={form.weightMax} step={0.05} onChange={(v) => set("weightMax", v)} />
          <Num label="VIX risk-on below" value={form.vixRiskOnBelow} step={1} onChange={(v) => set("vixRiskOnBelow", v)} />
          <Num label="VIX risk-off above" value={form.vixRiskOffAbove} step={1} onChange={(v) => set("vixRiskOffAbove", v)} />
          <Num
            label="Autoresearch lookback"
            value={form.autoresearchLookback}
            step={1}
            onChange={(v) => set("autoresearchLookback", v)}
          />
        </div>

        <h3 className="mt-5 mb-2 font-mono text-[10px] tracking-widest text-zinc-500">SCREENER</h3>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="mb-2 block">
            <div className="mb-1 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">Universe</div>
            <select
              value={form.screenUniverse}
              onChange={(e) => set("screenUniverse", e.target.value as Settings["screenUniverse"])}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs"
            >
              <option value="sp100">S&P 100</option>
              <option value="ndx100">Nasdaq-100</option>
              <option value="watchlist">İzleme listesi</option>
            </select>
          </label>
          <Num label="Top N" value={form.screenSize} step={1} onChange={(v) => set("screenSize", v)} />
          <Num label="Min fiyat" value={form.screenMinPrice} step={1} onChange={(v) => set("screenMinPrice", v)} />
          <Num label="Min hacim" value={form.screenMinVolume} step={100000} onChange={(v) => set("screenMinVolume", v)} />
          <Num label="W momentum" value={form.screenWMomentum} step={0.1} onChange={(v) => set("screenWMomentum", v)} />
          <Num label="W hacim" value={form.screenWVolume} step={0.1} onChange={(v) => set("screenWVolume", v)} />
          <Num label="W aralık" value={form.screenWRange} step={0.1} onChange={(v) => set("screenWRange", v)} />
          <Num label="W rejim" value={form.screenWRegime} step={0.1} onChange={(v) => set("screenWRegime", v)} />
          <Num label="Scout max" value={form.screenScoutMaxNames} step={1} onChange={(v) => set("screenScoutMaxNames", v)} />
        </div>
        <Field label="İzleme listesi">
          <textarea
            value={form.screenWatchlist}
            onChange={(e) => set("screenWatchlist", e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs"
          />
        </Field>
        <label className="mb-4 flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={form.screenScoutEnabled}
            onChange={(e) => set("screenScoutEnabled", e.target.checked)}
          />
          Screen personaları ile tek tur scout
        </label>

        <KadroEditor agents={agents} onSaved={onSaved} />

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.language === "tr"}
              onChange={(e) => set("language", e.target.checked ? "tr" : "en")}
            />
            Ajan metinleri Türkçe
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.confirmBook}
              onChange={(e) => set("confirmBook", e.target.checked)}
            />
            Kâğıda yaz onayı (önerilir)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.allowShort}
              onChange={(e) => set("allowShort", e.target.checked)}
            />
            Short serbest
          </label>
        </div>

        {err && <p className="mt-3 text-xs text-rose-400">{err}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-xl border border-sky-500/50 bg-sky-500/15 px-4 py-2 font-mono text-xs font-bold text-sky-300"
          >
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button
            onClick={() => setForm(DEFAULT_SETTINGS)}
            className="rounded-xl border border-zinc-700 px-4 py-2 font-mono text-xs text-zinc-400"
          >
            Varsayılanlar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <div className="mb-1 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">{label}</div>
      {children}
    </label>
  );
}

function Num({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-2 block">
      <div className="mb-1 font-mono text-[10px] tracking-widest text-zinc-500 uppercase">{label}</div>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs"
      />
    </label>
  );
}

function KadroEditor({ agents, onSaved }: { agents: Agent[]; onSaved: () => void }) {
  const [drafts, setDrafts] = useState<Agent[]>(agents);
  const [nid, setNid] = useState("custom-ta");
  const [nname, setNname] = useState("Yeni teknikçi");
  const [nprompt, setNprompt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setDrafts(agents), [agents]);

  async function saveOne(a: Agent) {
    setBusy(a.id);
    setErr(null);
    try {
      await api("/api/agents", { method: "PUT", body: JSON.stringify(a) });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    setBusy("new");
    setErr(null);
    try {
      await api("/api/agents", {
        method: "PUT",
        body: JSON.stringify({
          id: nid,
          name: nname,
          role: "custom",
          layer: "sector",
          kind: "technical",
          surfaces: "both",
          enabled: true,
          emoji: "🧪",
          prompt: nprompt || "You are a custom scout. Stay close to the tape. FLAT if thin.",
          baseWeight: 1,
        }),
      });
      setNprompt("");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-4">
      <h3 className="mb-2 font-mono text-[10px] tracking-widest text-zinc-500">KADRO</h3>
      {err && <p className="mb-2 text-xs text-rose-400">{err}</p>}
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 p-2">
        {drafts.map((a) => (
          <div key={a.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-sm">{a.emoji}</span>
              <span className="font-mono text-[11px] text-zinc-200">{a.name}</span>
              <select
                value={a.kind}
                onChange={(e) => setDrafts((ds) => ds.map((d) => (d.id === a.id ? { ...d, kind: e.target.value as Agent["kind"] } : d)))}
                className="rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 font-mono text-[10px]"
              >
                {["tape", "technical", "fundamental", "macro", "superinvestor", "risk"].map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <select
                value={a.surfaces}
                onChange={(e) =>
                  setDrafts((ds) => ds.map((d) => (d.id === a.id ? { ...d, surfaces: e.target.value as Agent["surfaces"] } : d)))
                }
                className="rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 font-mono text-[10px]"
              >
                <option value="debate">debate</option>
                <option value="screen">screen</option>
                <option value="both">both</option>
              </select>
              <label className="flex items-center gap-1 font-mono text-[10px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={a.enabled}
                  onChange={(e) => setDrafts((ds) => ds.map((d) => (d.id === a.id ? { ...d, enabled: e.target.checked } : d)))}
                />
                açık
              </label>
              <button
                onClick={() => void saveOne(a)}
                disabled={busy === a.id}
                className="ml-auto font-mono text-[10px] text-sky-400"
              >
                {busy === a.id ? "…" : "kaydet"}
              </button>
            </div>
            <textarea
              value={a.prompt}
              onChange={(e) => setDrafts((ds) => ds.map((d) => (d.id === a.id ? { ...d, prompt: e.target.value } : d)))}
              rows={2}
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[10px] text-zinc-400"
            />
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={nid}
          onChange={(e) => setNid(e.target.value)}
          placeholder="id (custom-ta)"
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[10px]"
        />
        <input
          value={nname}
          onChange={(e) => setNname(e.target.value)}
          placeholder="ad"
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[10px]"
        />
      </div>
      <textarea
        value={nprompt}
        onChange={(e) => setNprompt(e.target.value)}
        placeholder="Yeni persona charter"
        rows={2}
        className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[10px]"
      />
      <button
        onClick={() => void create()}
        disabled={busy === "new"}
        className="mt-2 rounded-lg border border-zinc-700 px-3 py-1 font-mono text-[10px] text-zinc-300"
      >
        {busy === "new" ? "…" : "+ Persona ekle"}
      </button>
    </div>
  );
}
