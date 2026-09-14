import { useMemo, useState } from "react";
import type { LlmConfigView } from "../../server/api/llm.ts";
import type { ModelCatalog, ModelInfo } from "../../server/agent/models.ts";
import { api } from "../api/client.ts";
import { t } from "../i18n.ts";
import { fmtDateTime, useData } from "../state.ts";

/** Settings → Agent (OpenRouter): API key, model picker fed by the live catalog, connection test. */
export function LlmSettings({ onChanged }: { onChanged: () => void }) {
  const config = useData<LlmConfigView>(() => api.get("/api/llm/config"), [], (ev) => ev.type === "data" && ev.entity === "llm");
  const cfg = config.data;

  const [keyInput, setKeyInput] = useState("");
  const [keyState, setKeyState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [keyError, setKeyError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<(ModelCatalog & { stale?: boolean; error?: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [onlyTools, setOnlyTools] = useState(true);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState("");
  const [manual, setManual] = useState("");
  const [modelState, setModelState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [modelError, setModelError] = useState<string | null>(null);

  const [testState, setTestState] = useState<"idle" | "running" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const patch = async (body: { apiKey?: string | null; model?: string | null }) => {
    const next = await api.patch<LlmConfigView>("/api/llm/config", body);
    config.reload();
    onChanged();
    return next;
  };

  const saveKey = async (value: string | null) => {
    setKeyState("saving");
    setKeyError(null);
    try {
      await patch({ apiKey: value });
      setKeyInput("");
      setKeyState("saved");
      setTimeout(() => setKeyState("idle"), 2000);
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : String(e));
      setKeyState("error");
    }
  };

  const loadModels = async (refresh: boolean) => {
    setLoading(true);
    setCatalogError(null);
    try {
      const data = await api.get<ModelCatalog & { stale?: boolean; error?: string }>(`/api/llm/models${refresh ? "?refresh=1" : ""}`);
      setCatalog(data);
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const saveModel = async (value: string | null) => {
    setModelState("saving");
    setModelError(null);
    try {
      await patch({ model: value });
      setModelState("saved");
      setManual("");
      setTimeout(() => setModelState("idle"), 2000);
    } catch (e) {
      setModelError(e instanceof Error ? e.message : String(e));
      setModelState("error");
    }
  };

  const runTest = async () => {
    setTestState("running");
    setTestMessage(null);
    try {
      const r = await api.post<{ ok: boolean; model: string; ms?: number; error?: string }>("/api/llm/test");
      if (r.ok) {
        setTestState("ok");
        setTestMessage(t("llm.testOk", { model: r.model, ms: r.ms ?? 0 }));
      } else {
        setTestState("fail");
        setTestMessage(t("llm.testFail", { error: r.error ?? "?" }));
      }
    } catch (e) {
      setTestState("fail");
      setTestMessage(t("llm.testFail", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const visible = useMemo<ModelInfo[]>(() => {
    const list = catalog?.models ?? [];
    const q = filter.trim().toLowerCase();
    return list.filter((m) => (!onlyTools || m.tools) && (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)));
  }, [catalog, onlyTools, filter]);

  const pickedInfo = visible.find((m) => m.id === picked) ?? catalog?.models.find((m) => m.id === picked) ?? null;
  const candidate = manual.trim() || picked;

  if (!cfg) return <p className="muted">{t("common.loading")}</p>;

  return (
    <div className="form-grid">
      <div className="form-card">
        <div className="connect-title">{t("llm.keyTitle")}</div>
        <p className="muted small" style={{ margin: 0 }}>
          {t("llm.keyHint")}
        </p>
        <p className="small" style={{ margin: 0 }}>
          {cfg.apiKeyConfigured && cfg.apiKeyMasked ? (
            <span className="pill pill-ok">{t("llm.keyActive", { masked: cfg.apiKeyMasked, source: t(`llm.source.${cfg.apiKeySource ?? "default"}`) })}</span>
          ) : (
            <span className="pill pill-warn">{t("llm.keyMissing")}</span>
          )}
          {cfg.mockForced && <span className="pill pill-warn" style={{ marginLeft: 6 }}>{t("llm.mockForced")}</span>}
        </p>
        <label className="form-row">
          {t("llm.keyTitle")}
          <input
            type="password"
            autoComplete="off"
            value={keyInput}
            placeholder={t("llm.keyPlaceholder")}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && keyInput.trim().length >= 16 && void saveKey(keyInput)}
          />
        </label>
        <div className="row-actions">
          <button className="btn btn-small btn-primary" disabled={keyState === "saving" || keyInput.trim().length < 16} onClick={() => void saveKey(keyInput)}>
            {t("llm.keySave")}
          </button>
          {cfg.apiKeySource === "settings" && (
            <button className="btn btn-small btn-ghost" disabled={keyState === "saving"} onClick={() => void saveKey(null)}>
              {t("llm.keyClear")}
            </button>
          )}
          <button className="btn btn-small" disabled={testState === "running" || !cfg.apiKeyConfigured} onClick={() => void runTest()}>
            {testState === "running" ? t("llm.testing") : t("llm.test")}
          </button>
          {keyState === "saved" && <span className="sent-note">✓ {t("llm.saved")}</span>}
        </div>
        {keyError && <div className="error-note">{keyError}</div>}
        {testMessage && <div className={testState === "ok" ? "sent-note" : "error-note"}>{testMessage}</div>}
      </div>

      <div className="form-card">
        <div className="connect-title">{t("llm.modelTitle")}</div>
        <p className="muted small" style={{ margin: 0 }}>
          {t("llm.modelHint")}
        </p>
        <p className="small" style={{ margin: 0 }}>
          <span className="pill pill-agent">{t("llm.modelActive", { model: cfg.model, source: t(`llm.source.${cfg.modelSource}`) })}</span>
        </p>
        <div className="row-actions">
          <button className="btn btn-small" disabled={loading} onClick={() => void loadModels(!!catalog)}>
            {loading ? t("llm.loadingModels") : catalog ? t("llm.refreshModels") : t("llm.loadModels")}
          </button>
          {catalog && (
            <span className="muted small">{t("llm.modelsCount", { n: catalog.models.length, when: fmtDateTime(catalog.fetchedAt) })}</span>
          )}
        </div>
        {catalogError && <div className="error-note">{catalogError}</div>}
        {catalog?.stale && <div className="error-note">{t("llm.modelsStale", { error: catalog.error ?? "?" })}</div>}
        {catalog && (
          <>
            <label className="form-row form-row-inline" style={{ margin: 0 }}>
              <input type="checkbox" checked={onlyTools} onChange={(e) => setOnlyTools(e.target.checked)} style={{ width: "auto" }} />
              {t("llm.onlyTools")}
            </label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("llm.search")} />
            <select size={8} value={picked} onChange={(e) => setPicked(e.target.value)} data-testid="model-list">
              <option value="" disabled>
                {t("llm.pick")}
              </option>
              {visible.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} — {m.name}
                </option>
              ))}
            </select>
            {pickedInfo && (
              <div className="muted small">
                <code>{pickedInfo.id}</code> · {pickedInfo.contextLength ? t("llm.ctx", { n: Math.round(pickedInfo.contextLength / 1000) }) : "—"} ·{" "}
                {pickedInfo.promptPerMillion === 0 && pickedInfo.completionPerMillion === 0
                  ? t("llm.free")
                  : t("llm.price", { p: pickedInfo.promptPerMillion ?? "?", c: pickedInfo.completionPerMillion ?? "?" })}
                {!pickedInfo.tools && <> · <span className="pill pill-warn">{t("llm.noTools")}</span></>}
              </div>
            )}
          </>
        )}
        <label className="form-row">
          {t("llm.manualModel")}
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="openai/gpt-4o-mini" />
        </label>
        <div className="row-actions">
          <button className="btn btn-small btn-primary" disabled={modelState === "saving" || !candidate} onClick={() => void saveModel(candidate)}>
            {t("llm.useModel")}
          </button>
          {cfg.modelSource === "settings" && (
            <button className="btn btn-small btn-ghost" disabled={modelState === "saving"} onClick={() => void saveModel(null)}>
              {t("llm.resetModel")}
            </button>
          )}
          {modelState === "saved" && <span className="sent-note">✓ {t("llm.saved")}</span>}
        </div>
        {modelError && <div className="error-note">{modelError}</div>}
      </div>
    </div>
  );
}
