import { useState } from "react";
import type { Meeting, Note } from "../../shared/types.ts";
import { api } from "../api/client.ts";
import { t } from "../i18n.ts";
import { Markdown } from "./Markdown.tsx";

export function MinutesPanel({ meeting }: { meeting: Meeting }) {
  const [note, setNote] = useState<Note | null>(null);
  const [state, setState] = useState<"idle" | "plaud" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [plaudNote, setPlaudNote] = useState<string | null>(null);

  const generate = async (refresh = true) => {
    setState("loading");
    setError(null);
    try {
      const r = await api.post<Note>(`/api/meetings/${meeting.id}/minutes`, { refresh });
      setNote(r);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  const runPlaud = async () => {
    setState("plaud");
    setError(null);
    setPlaudNote(null);
    try {
      const r = await api.post<{ message: string }>(`/api/meetings/${meeting.id}/plaud`);
      setPlaudNote(r.message);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  const canPlaud = meeting.hasRecording && !meeting.recordingLocked && !meeting.hasTranscript;
  const busy = state === "loading" || state === "plaud";

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 style={{ margin: 0 }}>{t("minutes.title")}</h3>
        <div className="row-actions">
          {canPlaud && (
            <button className="btn btn-small" disabled={busy} onClick={() => void runPlaud()}>
              {state === "plaud" ? t("org.plaudWorking") : t("org.plaudTranscribe")}
            </button>
          )}
          <button className="btn btn-small btn-primary" disabled={busy} onClick={() => void generate(true)}>
            {state === "loading" ? t("minutes.working") : note ? t("common.regenerate") : t("minutes.generate")}
          </button>
        </div>
      </div>
      <p className="muted small">{t("minutes.hint")}</p>
      {canPlaud && <p className="muted small">{t("org.plaudTranscribeHint")}</p>}
      {meeting.recordingLocked && !meeting.hasTranscript && (
        <p className="muted small">{t("org.plaudLockedHint")}</p>
      )}
      {plaudNote && <p className="small">{plaudNote}</p>}
      {state === "error" && <div className="error-note">{error}</div>}
      {note && (
        <div className="markdown" style={{ marginTop: 8 }}>
          <Markdown text={note.bodyMarkdown} />
        </div>
      )}
    </div>
  );
}
