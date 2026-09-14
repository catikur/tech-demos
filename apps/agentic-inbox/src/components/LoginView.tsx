import { useMemo, useState } from "react";
import { t } from "../i18n.ts";

export interface SessionView {
  authenticated: boolean;
  loginRequired: boolean;
  allowedDomain: string;
  email: string | null;
  accountId: string | null;
  microsoftConfigured: boolean;
  googleConfigured: boolean;
  microsoft: { configured: boolean; fromEnv: boolean; tenantId: string | null; clientIdMasked: string | null };
}

export function LoginView({ session, onConfigured }: { session: SessionView; onConfigured: () => void }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const denied = params.get("login") === "denied";
  const reason = params.get("reason");

  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/microsoft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, clientId, clientSecret: clientSecret || null }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      onConfigured();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark">📬</div>
        <h1>{t("login.title")}</h1>
        <p className="muted">{t("login.hint", { domain: session.allowedDomain })}</p>
        {denied && <div className="error-note">{reason || t("login.denied", { domain: session.allowedDomain })}</div>}
        {!session.microsoftConfigured ? (
          <>
            <p className="muted small">{t("login.setupHint")}</p>
            <label className="form-row">
              {t("login.tenant")}
              <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" />
            </label>
            <label className="form-row">
              {t("login.clientId")}
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" />
            </label>
            <label className="form-row">
              {t("login.clientSecret")}
              <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={t("login.clientSecretOptional")} autoComplete="off" />
            </label>
            {error && <div className="error-note">{error}</div>}
            <button className="btn btn-primary" disabled={busy || !tenantId.trim() || !clientId.trim()} onClick={() => void save()}>
              {busy ? t("common.saving") : t("login.saveGraph")}
            </button>
          </>
        ) : (
          <a className="btn btn-primary" href="/api/auth/microsoft/start">
            {t("login.withM365")}
          </a>
        )}
      </div>
    </div>
  );
}
