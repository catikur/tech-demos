import { useState } from "react";
import type { Account, AppStatus, Memory, MemoryKind } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { spaceLabel, t } from "../i18n.ts";
import { fmtDateTime, useData } from "../state.ts";
import { SpaceRules } from "../components/SpaceRules.tsx";
import { LlmSettings } from "../components/LlmSettings.tsx";

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
                    disabled={busy !== null}
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
              <a className={`btn ${status.oauth.microsoft ? "" : "is-disabled"}`} href={status.oauth.microsoft ? `/api/auth/microsoft/start?space=${s.id}` : undefined}>
                {t("settings.connectM365")}
              </a>
              <a className={`btn ${status.oauth.google ? "" : "is-disabled"}`} href={status.oauth.google ? `/api/auth/google/start?space=${s.id}` : undefined}>
                {t("settings.connectGmail")}
              </a>
            </div>
          ))}
        </div>
        {(!status.oauth.microsoft || !status.oauth.google) && (
          <p className="muted small">
            {!status.oauth.microsoft && t("settings.oauthMs")}
            {!status.oauth.google && t("settings.oauthGoogle")}
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
