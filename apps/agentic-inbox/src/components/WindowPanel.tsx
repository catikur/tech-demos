import { useEffect, useState } from "react";
import { api, spaceQuery } from "../api/client.ts";
import { t } from "../i18n.ts";
import { useData } from "../state.ts";

interface ViewWindow {
  from: number;
  to: number | null;
  saved: boolean;
  hiddenCommitments: number;
}

function toDateInput(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfInput(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function endOfInput(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function WindowPanel({ spaceId, onChanged }: { spaceId: string | null; onChanged: () => void }) {
  const view = useData<ViewWindow>(() => api.get(`/api/window?${spaceQuery(spaceId)}`), [spaceId], (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "commitments"));
  const current = view.data;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openEnd, setOpenEnd] = useState(true);
  const [busy, setBusy] = useState<"save" | "rebuild" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    setFrom(toDateInput(current.from));
    setOpenEnd(current.to == null);
    setTo(toDateInput(current.to ?? Date.now()));
  }, [current?.from, current?.to]);

  const payload = () => ({ from: startOfInput(from), to: openEnd ? null : endOfInput(to) });

  const save = async () => {
    setBusy("save");
    setError(null);
    setNote(null);
    try {
      await api.patch(`/api/window?${spaceQuery(spaceId)}`, payload());
      setNote(t("window.saved"));
      view.reload();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const rebuild = async () => {
    setBusy("rebuild");
    setError(null);
    setNote(null);
    try {
      await api.patch(`/api/window?${spaceQuery(spaceId)}`, payload());
      const result = await api.post<{ synced: number; topics: number; failed: { email: string; error: string }[] }>(
        `/api/window/rebuild?${spaceQuery(spaceId)}`,
      );
      const fail = result.failed?.[0];
      setNote(fail ? t("window.rebuiltPartial", { email: fail.email, error: fail.error }) : t("window.rebuilt", { n: result.synced, topics: result.topics }));
      view.reload();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (!current) return <p className="muted">{t("common.loading")}</p>;

  return (
    <div className="form-card" style={{ marginBottom: 8 }}>
      <p className="muted small" style={{ margin: 0 }}>
        {t("window.hint")}
      </p>
      <div className="window-dates">
        <label>
          {t("window.from")}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {t("window.to")}
          <input type="date" value={to} disabled={openEnd} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="window-open">
          <input type="checkbox" checked={openEnd} onChange={(e) => setOpenEnd(e.target.checked)} />
          {t("window.openEnd")}
        </label>
      </div>
      <p className="small" style={{ margin: 0 }}>
        {current.saved ? t("window.savedRange") : t("window.defaultRange")}
        {current.hiddenCommitments > 0 ? ` ${t("window.hidden", { n: current.hiddenCommitments })}` : ""}
      </p>
      {error && <div className="error-note">{error}</div>}
      {note && <p className="small">{note}</p>}
      <div className="row-actions">
        <button className="btn btn-small btn-primary" disabled={busy !== null || !from} onClick={() => void save()}>
          {busy === "save" ? t("window.saving") : t("window.save")}
        </button>
        <button className="btn btn-small" disabled={busy !== null || !from} onClick={() => void rebuild()}>
          {busy === "rebuild" ? t("window.rebuilding") : t("window.rebuild")}
        </button>
      </div>
    </div>
  );
}
