import { useState } from "react";
import type { Account, AppStatus, Memory, MemoryKind } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { spaceLabel, t } from "../i18n.ts";
import { fmtDateTime, useData } from "../state.ts";
import { SpaceRules } from "../components/SpaceRules.tsx";
import { LlmSettings } from "../components/LlmSettings.tsx";
import type { SessionView } from "../components/LoginView.tsx";

function providerLabel(provider: Account["provider"]): string {
  return t(`provider.${provider}`);
}

function capabilityLabel(cap: string): string {
  return t(`capability.${cap}`);
}

export function SettingsView({ status, onChanged }: { status: AppStatus | null; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!status) return <div className="pane pane-single">{t("common.loading")}</div>;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pane pane-single scroll">
      <div className="settings">
        <h2>{t("settings.spaces")}</h2>
        <p className="muted">{t("settings.spacesHint")}</p>
        <div className="form-grid">
          {status.spaces.map((s) => (
            <SpaceRules key={s.id} space={s} onSaved={onChanged} />
          ))}
        </div>

        <h2>{t("settings.graph")}</h2>
        <p className="muted">{t("settings.graphHint")}</p>
        <GraphSettings onChanged={onChanged} />

        <h2>{t("settings.google")}</h2>
        <p className="muted">{t("settings.googleHint")}</p>
        <GoogleSettings onChanged={onChanged} />

        <h2>{t("settings.accounts")}</h2>
        <p className="muted">{t("settings.accountsHint")}</p>
        {error && <div className="error-note">{error}</div>}
        <table className="table">
          <thead>
            <tr>
              <th>{t("settings.colProvider")}</th>
              <th>{t("settings.colAccount")}</th>
              <th>{t("settings.colSpace")}</th>
              <th>{t("settings.colCaps")}</th>
              <th>{t("settings.colSync")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {status.accounts.map((a) => (
              <tr key={a.id}>
                <td>{providerLabel(a.provider)}</td>
                <td>
                  <div>{a.displayName}</div>
                  <div className="muted small">{a.email}</div>
                </td>
                <td>
                  <select
                    value={a.spaceId}
                    onChange={(e) => void run(`move-${a.id}`, () => api.patch(`/api/accounts/${a.id}`, { spaceId: e.target.value }))}
                  >
                    {status.spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {spaceLabel(s.kind)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="small">{a.capabilities.map(capabilityLabel).join(", ")}</td>
                <td className="small">
                  {a.lastSyncAt ? fmtDateTime(a.lastSyncAt) : t("common.never")}
                  {a.lastSyncError && <div className="error-note">{a.lastSyncError}</div>}
                </td>
                <td className="row-actions">
                  <button className="btn btn-small" disabled={busy !== null} onClick={() => void run(`sync-${a.id}`, () => api.post(`/api/accounts/${a.id}/sync`))}>
                    {busy === `sync-${a.id}` ? t("settings.syncing") : t("settings.sync")}
                  </button>
                  <button
                    className="btn btn-small btn-ghost"
                    disabled={busy !== null || a.provider === "m365"}
                    onClick={() => confirm(t("settings.removeConfirm", { email: a.email })) && void run(`rm-${a.id}`, () => api.delete(`/api/accounts/${a.id}`))}
                  >
                    {t("settings.remove")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>{t("settings.connect")}</h2>
        <div className="connect-grid">
          {status.spaces.map((s) => (
            <div key={s.id} className="connect-card" style={{ borderColor: `${s.color}55` }}>
              <div className="connect-title" style={{ color: s.color }}>
                {t("space.named", { name: spaceLabel(s.kind) })}
              </div>
              <a className={`btn ${status.oauth.google ? "" : "is-disabled"}`} href={status.oauth.google ? `/api/auth/google/start?space=${s.id}` : undefined}>
                {t("settings.connectGmail")}
              </a>
            </div>
          ))}
        </div>
        {!status.oauth.google && (
          <p className="muted small">
            {t("settings.oauthGoogle")}
            {t("settings.oauthReadme")}
          </p>
        )}

        <h2>{t("settings.agentBackend")}</h2>
        <p>
          {t("settings.provider")} <strong>{status.llm.provider}</strong>
          {status.llm.model && (
            <>
              {" "}
              · {t("settings.model")} <code>{status.llm.model}</code>
            </>
          )}
          {!status.llm.configured && <span className="muted">{t("settings.llmFallback")}</span>}
        </p>
        <LlmSettings onChanged={onChanged} />

        <MemoryPanel spaces={status.spaces} />
      </div>
    </div>
  );
}

function GraphSettings({ onChanged }: { onChanged: () => void }) {
  const session = useData<SessionView>(() => api.get("/api/session"), []);
  const ms = session.data?.microsoft;
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!ms) return <p className="muted">{t("common.loading")}</p>;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch("/api/setup/microsoft", { tenantId, clientId, clientSecret: clientSecret || null });
      setSaved(true);
      setClientSecret("");
      session.reload();
      onChanged();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-card" style={{ marginBottom: 16 }}>
      <p className="small" style={{ margin: 0 }}>
        {ms.configured ? (
          <span className="pill pill-ok">
            {t("settings.graphTenant")} <code>{ms.tenantId}</code> · {t("settings.graphClient")} <code>{ms.clientIdMasked}</code>
            {ms.fromEnv ? ` · ${t("llm.source.env")}` : ` · ${t("llm.source.settings")}`}
          </span>
        ) : (
          <span className="pill pill-warn">{t("settings.oauthMs")}</span>
        )}
      </p>
      {ms.fromEnv ? (
        <p className="muted small">{t("settings.graphFromEnv")}</p>
      ) : (
        <>
          <label className="form-row">
            {t("login.tenant")}
            <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder={ms.tenantId ?? ""} autoComplete="off" />
          </label>
          <label className="form-row">
            {t("login.clientId")}
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={ms.clientIdMasked ?? ""} autoComplete="off" />
          </label>
          <label className="form-row">
            {t("login.clientSecret")}
            <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" />
          </label>
          <button className="btn btn-small btn-primary" disabled={busy || !tenantId.trim() || !clientId.trim()} onClick={() => void save()}>
            {t("settings.graphSave")}
          </button>
          {saved && <span className="sent-note"> ✓ {t("common.saved")}</span>}
          {error && <div className="error-note">{error}</div>}
        </>
      )}
    </div>
  );
}

function GoogleSettings({ onChanged }: { onChanged: () => void }) {
  const session = useData<SessionView>(() => api.get("/api/session"), []);
  const g = session.data?.google;
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!g) return <p className="muted">{t("common.loading")}</p>;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch("/api/setup/google", { clientId, clientSecret: clientSecret || null });
      setSaved(true);
      setClientSecret("");
      session.reload();
      onChanged();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-card" style={{ marginBottom: 16 }}>
      <p className="small" style={{ margin: 0 }}>
        {g.configured ? (
          <span className="pill pill-ok">
            {t("settings.googleClient")} <code>{g.clientIdMasked}</code>
            {g.fromEnv ? ` · ${t("llm.source.env")}` : ` · ${t("llm.source.settings")}`}
          </span>
        ) : (
          <span className="pill pill-warn">{t("settings.oauthGoogle")}</span>
        )}
      </p>
      <p className="muted small">
        {t("settings.googleRedirect")} <code>{g.redirectUri}</code>
      </p>
      {g.fromEnv ? (
        <p className="muted small">{t("settings.googleFromEnv")}</p>
      ) : (
        <>
          <label className="form-row">
            {t("settings.googleClient")}
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={g.clientIdMasked ?? t("settings.googlePlaceholder")} autoComplete="off" />
          </label>
          <label className="form-row">
            {t("settings.googleSecret")}
            <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" />
          </label>
          <button className="btn btn-small btn-primary" disabled={busy || !clientId.trim()} onClick={() => void save()}>
            {t("settings.googleSave")}
          </button>
          {saved && <span className="sent-note"> ✓ {t("common.saved")}</span>}
          {error && <div className="error-note">{error}</div>}
        </>
      )}
    </div>
  );
}

const KINDS: MemoryKind[] = ["preference", "correction", "fact"];

function MemoryPanel({ spaces }: { spaces: AppStatus["spaces"] }) {
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [kind, setKind] = useState<MemoryKind>("preference");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useData<Memory[]>(
    () => (spaceId ? api.get(`/api/memories?${spaceQuery(spaceId)}`) : Promise.resolve([])),
    [spaceId],
    (ev) => ev.type === "data" && ev.entity === "memories",
  );
  const items = list.data ?? [];

  const add = async () => {
    if (!spaceId || text.trim().length < 3) return;
    setBusy(true);
    try {
      await api.post("/api/memories", { spaceId, kind, text: text.trim() });
      setText("");
      list.reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.delete(`/api/memories/${id}`);
      list.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>{t("settings.memory")}</h2>
      <p className="muted">{t("settings.memoryHint")}</p>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <label>
          {t("settings.colSpace")}
          <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {spaceLabel(s.kind)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {items.length === 0 ? (
        <p className="muted small">{t("settings.memoryEmpty")}</p>
      ) : (
        <ul className="plain-list">
          {items.map((m) => (
            <li key={m.id}>
              <span className="pill pill-ok">{t(`memory.kind.${m.kind}`)}</span> {m.text}{" "}
              <span className="muted small">{fmtDateTime(m.createdAt)}</span>{" "}
              <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => void remove(m.id)}>
                {t("settings.memoryDelete")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="composer" style={{ border: "1px solid var(--border)", borderRadius: 10, marginTop: 12 }}>
        <div className="row-actions" style={{ padding: "8px 8px 0" }}>
          <label>
            {t("settings.memoryKind")}{" "}
            <select value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`memory.kind.${k}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("settings.memoryText")} />
        <div className="composer-actions">
          <button className="btn btn-small" disabled={busy || text.trim().length < 3} onClick={() => void add()}>
            {t("settings.memoryAdd")}
          </button>
        </div>
      </div>
    </>
  );
}
