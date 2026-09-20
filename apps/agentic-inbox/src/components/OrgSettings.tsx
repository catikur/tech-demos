import { useEffect, useState } from "react";
import { api, spaceQuery } from "../api/client.ts";
import { t } from "../i18n.ts";
import { fmtDateTime, useActiveSpace, useData } from "../state.ts";

interface ChannelOption {
  id: string;
  title: string;
}

interface OrgView {
  briefChannelTitle: string;
  briefChatId: string | null;
  briefResolved: boolean;
  channelOptions: ChannelOption[];
  vaultUrl: string;
  vaultParsed: { hostname: string; sitePath: string; libraryName: string; folderPath: string } | null;
  templateFolder: string;
  folders: string[];
  templates: { path: string; name: string }[];
  vaultSyncedAt: number | null;
  vaultFileCount: number;
  vaultError: string | null;
  plaud: {
    configured: boolean;
    clientIdMasked: string | null;
    hasSecret: boolean;
    hasApiKey: boolean;
    mcpUrl: string;
  };
}

export function OrgSettings({ onChanged }: { onChanged: () => void }) {
  const [spaceId] = useActiveSpace();
  const org = useData<OrgView>(() => api.get(`/api/org?${spaceQuery(spaceId)}`), [spaceId]);
  const data = org.data;
  const [briefTitle, setBriefTitle] = useState("");
  const [vaultUrl, setVaultUrl] = useState("");
  const [templateFolder, setTemplateFolder] = useState("");
  const [plaudClient, setPlaudClient] = useState("");
  const [plaudSecret, setPlaudSecret] = useState("");
  const [plaudKey, setPlaudKey] = useState("");
  const [plaudMcp, setPlaudMcp] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setBriefTitle(data.briefChannelTitle);
    setVaultUrl(data.vaultUrl);
    setTemplateFolder(data.templateFolder);
    setPlaudMcp(data.plaud.mcpUrl);
  }, [data]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      await fn();
      org.reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <p className="muted">{t("common.loading")}</p>;

  return (
    <div className="form-card" style={{ marginBottom: 16 }}>
      {error && <div className="error-note">{error}</div>}
      {note && <div className="sent-note">{note}</div>}

      <h3 style={{ marginTop: 0 }}>{t("org.teams")}</h3>
      <p className="muted small">{t("org.teamsHint")}</p>
      <label className="form-row">
        {t("org.channel")}
        <select
          value={data.channelOptions.some((c) => c.title === briefTitle) ? briefTitle : ""}
          onChange={(e) => setBriefTitle(e.target.value || briefTitle)}
        >
          <option value="">{t("org.channelPick")}</option>
          {data.channelOptions.map((c) => (
            <option key={c.id} value={c.title}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <label className="form-row">
        {t("org.channelManual")}
        <input value={briefTitle} onChange={(e) => setBriefTitle(e.target.value)} autoComplete="off" />
      </label>
      <p className="muted small">
        {data.briefResolved ? t("org.channelOk", { title: data.channelOptions.find((c) => c.id === data.briefChatId)?.title ?? briefTitle }) : t("org.channelMissing")}
      </p>
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <button
          className="btn btn-small btn-primary"
          disabled={busy !== null}
          onClick={() =>
            void run("save-channel", async () => {
              await api.patch(`/api/org?${spaceQuery(spaceId)}`, { briefChannelTitle: briefTitle });
              setNote(t("common.saved"));
            })
          }
        >
          {t("org.saveChannel")}
        </button>
        <button
          className="btn btn-small"
          disabled={busy !== null}
          onClick={() =>
            void run("post", async () => {
              const r = await api.post<{ posted: boolean; skipped?: string }>(`/api/org/briefing/post?${spaceQuery(spaceId)}`);
              setNote(r.posted ? t("org.posted") : r.skipped ?? t("org.notPosted"));
            })
          }
        >
          {busy === "post" ? t("org.posting") : t("org.postNow")}
        </button>
      </div>

      <h3>{t("org.vault")}</h3>
      <p className="muted small">{t("org.vaultHint")}</p>
      <label className="form-row">
        {t("org.vaultUrl")}
        <input value={vaultUrl} onChange={(e) => setVaultUrl(e.target.value)} autoComplete="off" />
      </label>
      {data.vaultParsed && (
        <p className="muted small">
          {data.vaultParsed.hostname}
          {data.vaultParsed.sitePath} · {data.vaultParsed.libraryName}
          {data.vaultParsed.folderPath ? ` / ${data.vaultParsed.folderPath}` : ""}
        </p>
      )}
      <div className="row-actions" style={{ marginBottom: 8 }}>
        <button
          className="btn btn-small btn-primary"
          disabled={busy !== null}
          onClick={() =>
            void run("save-vault", async () => {
              await api.patch(`/api/org?${spaceQuery(spaceId)}`, { vaultUrl });
              setNote(t("common.saved"));
            })
          }
        >
          {t("org.saveVault")}
        </button>
        <button
          className="btn btn-small"
          disabled={busy !== null}
          onClick={() =>
            void run("sync-vault", async () => {
              await api.patch(`/api/org?${spaceQuery(spaceId)}`, { vaultUrl });
              const r = await api.post<OrgView>(`/api/org/vault/sync?${spaceQuery(spaceId)}`);
              setNote(t("org.vaultSynced", { n: r.vaultFileCount }));
            })
          }
        >
          {busy === "sync-vault" ? t("org.syncing") : t("org.syncVault")}
        </button>
      </div>
      <p className="muted small">
        {data.vaultSyncedAt ? t("org.vaultMeta", { n: data.vaultFileCount, when: fmtDateTime(data.vaultSyncedAt) }) : t("org.vaultNever")}
      </p>
      {data.vaultError && <div className="error-note">{data.vaultError}</div>}
      <p className="muted small">{t("org.reconnectMs")}</p>

      <label className="form-row">
        {t("org.templates")}
        <select value={templateFolder} onChange={(e) => setTemplateFolder(e.target.value)}>
          <option value="">{t("org.templatesNone")}</option>
          {data.folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">{t("org.templatesHint")}</p>
      {data.templates.length > 0 && (
        <p className="muted small">{t("org.templatesCount", { n: data.templates.length })}</p>
      )}
      <button
        className="btn btn-small"
        disabled={busy !== null}
        onClick={() =>
          void run("save-tpl", async () => {
            await api.patch(`/api/org?${spaceQuery(spaceId)}`, { templateFolder });
            setNote(t("common.saved"));
          })
        }
      >
        {t("org.saveTemplates")}
      </button>

      <h3>{t("org.plaud")}</h3>
      <p className="muted small">{t("org.plaudHint")}</p>
      <p className="small" style={{ margin: "0 0 8px" }}>
        {data.plaud.configured ? (
          <span className="pill pill-ok">
            {t("org.plaudSaved")}
            {data.plaud.clientIdMasked ? ` · ${data.plaud.clientIdMasked}` : ""}
            {data.plaud.hasApiKey ? ` · ${t("org.plaudHasKey")}` : ""}
          </span>
        ) : (
          <span className="pill pill-warn">{t("org.plaudEmpty")}</span>
        )}
      </p>
      <label className="form-row">
        {t("org.plaudClient")}
        <input value={plaudClient} onChange={(e) => setPlaudClient(e.target.value)} placeholder={data.plaud.clientIdMasked ?? ""} autoComplete="off" />
      </label>
      <label className="form-row">
        {t("org.plaudSecret")}
        <input type="password" value={plaudSecret} onChange={(e) => setPlaudSecret(e.target.value)} autoComplete="off" />
      </label>
      <label className="form-row">
        {t("org.plaudKey")}
        <input type="password" value={plaudKey} onChange={(e) => setPlaudKey(e.target.value)} autoComplete="off" />
      </label>
      <label className="form-row">
        {t("org.plaudMcp")}
        <input value={plaudMcp} onChange={(e) => setPlaudMcp(e.target.value)} autoComplete="off" />
      </label>
      <div className="row-actions">
        <button
          className="btn btn-small btn-primary"
          disabled={busy !== null}
          onClick={() =>
            void run("plaud", async () => {
              const body: Record<string, string> = { mcpUrl: plaudMcp };
              if (plaudClient.trim()) body.clientId = plaudClient.trim();
              if (plaudSecret.trim()) body.clientSecret = plaudSecret.trim();
              if (plaudKey.trim()) body.apiKey = plaudKey.trim();
              await api.post(`/api/org/plaud?${spaceQuery(spaceId)}`, body);
              setPlaudClient("");
              setPlaudSecret("");
              setPlaudKey("");
              setNote(t("common.saved"));
            })
          }
        >
          {t("org.plaudSave")}
        </button>
        <button
          className="btn btn-small"
          disabled={busy !== null}
          onClick={() =>
            void run("probe", async () => {
              const r = await api.post<{ message: string }>("/api/org/plaud/probe");
              setNote(r.message);
            })
          }
        >
          {t("org.plaudProbe")}
        </button>
      </div>
    </div>
  );
}
