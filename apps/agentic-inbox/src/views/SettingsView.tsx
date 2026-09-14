import { useState } from "react";
import type { Account, AppStatus } from "../../shared/types.ts";
import { api } from "../api/client.ts";
import { fmtDateTime } from "../state.ts";

const PROVIDER_LABEL: Record<Account["provider"], string> = {
  demo: "Demo",
  m365: "Microsoft 365",
  gmail: "Gmail",
};

export function SettingsView({ status, onChanged }: { status: AppStatus | null; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!status) return <div className="pane pane-single">Loading…</div>;

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
        <h2>Accounts</h2>
        <p className="muted">
          Each account belongs to exactly one space. Move accounts between Work and Personal; the agent never mixes spaces unless you ask it to.
        </p>
        {error && <div className="error-note">{error}</div>}
        <table className="table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Account</th>
              <th>Space</th>
              <th>Capabilities</th>
              <th>Last sync</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {status.accounts.map((a) => (
              <tr key={a.id}>
                <td>{PROVIDER_LABEL[a.provider]}</td>
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
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="small">{a.capabilities.join(", ")}</td>
                <td className="small">
                  {a.lastSyncAt ? fmtDateTime(a.lastSyncAt) : "never"}
                  {a.lastSyncError && <div className="error-note">{a.lastSyncError}</div>}
                </td>
                <td className="row-actions">
                  <button className="btn btn-small" disabled={busy !== null} onClick={() => void run(`sync-${a.id}`, () => api.post(`/api/accounts/${a.id}/sync`))}>
                    {busy === `sync-${a.id}` ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    className="btn btn-small btn-ghost"
                    disabled={busy !== null}
                    onClick={() => confirm(`Remove ${a.email} and its local data?`) && void run(`rm-${a.id}`, () => api.delete(`/api/accounts/${a.id}`))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Connect an account</h2>
        <div className="connect-grid">
          {status.spaces.map((s) => (
            <div key={s.id} className="connect-card" style={{ borderColor: `${s.color}55` }}>
              <div className="connect-title" style={{ color: s.color }}>
                {s.name} space
              </div>
              <a className={`btn ${status.oauth.microsoft ? "" : "is-disabled"}`} href={status.oauth.microsoft ? `/api/auth/microsoft/start?space=${s.id}` : undefined}>
                Connect Microsoft 365
              </a>
              <a className={`btn ${status.oauth.google ? "" : "is-disabled"}`} href={status.oauth.google ? `/api/auth/google/start?space=${s.id}` : undefined}>
                Connect Gmail
              </a>
            </div>
          ))}
        </div>
        {(!status.oauth.microsoft || !status.oauth.google) && (
          <p className="muted small">
            {!status.oauth.microsoft && <>Set <code>MS_CLIENT_ID</code> (and optionally <code>MS_TENANT_ID</code>) to enable Microsoft 365. </>}
            {!status.oauth.google && <>Set <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> to enable Gmail. </>}
            See the README for the app-registration walkthroughs.
          </p>
        )}

        <h2>Agent backend</h2>
        <p>
          Provider: <strong>{status.llm.provider}</strong>
          {status.llm.model && <> · model <code>{status.llm.model}</code></>}
          {!status.llm.configured && (
            <span className="muted"> — rule-based fallback. Set <code>OPENAI_API_KEY</code> (or <code>OPENAI_BASE_URL</code> for Azure/Ollama) or <code>ANTHROPIC_API_KEY</code> to enable a real model.</span>
          )}
        </p>
      </div>
    </div>
  );
}
