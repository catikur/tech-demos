import { useState } from "react";
import type { FollowUp, Meeting } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api } from "../api/client.ts";
import { t } from "../i18n.ts";
import { fmtDateTime } from "../state.ts";

type Result = FollowUp & { recipients: string[] };

/** Feature 3 — transcript → decisions, actions (into the ledger) and a confirm-to-send follow-up mail. */
export function FollowUpPanel({ meeting, onSent }: { meeting: Meeting; onSent: (threadId: string) => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const generate = async (refresh = false) => {
    setState("loading");
    try {
      const r = refresh ? await api.post<Result>(`/api/meetings/${meeting.id}/followup`) : await api.get<Result>(`/api/meetings/${meeting.id}/followup`);
      setResult(r);
      setBody(r.draftBody);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  const send = async () => {
    if (!result) return;
    setState("sending");
    try {
      const thread = await api.post<{ id: string }>(`/api/meetings/${meeting.id}/followup/send`, { body, subject: result.draftSubject });
      setState("sent");
      onSent(thread.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  if (!meeting.hasTranscript) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <h3 style={{ margin: 0 }}>{t("followup.title")}</h3>
        <div className="row-actions">
          <button className="btn btn-small btn-primary" disabled={state === "loading"} onClick={() => void generate(false)}>
            {state === "loading" ? t("followup.extracting") : result ? t("common.reload") : t("followup.extract")}
          </button>
          {result && (
            <button className="btn btn-small btn-ghost" onClick={() => void generate(true)}>
              {t("common.regenerate")}
            </button>
          )}
        </div>
      </div>
      {state === "error" && <div className="error-note">{error}</div>}
      {result && (
        <>
          <div className="split-cols">
            <div>
              <h4>{t("followup.decisions", { n: result.decisions.length })}</h4>
              <ul className="plain-list">
                {result.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
                {result.decisions.length === 0 && <li className="muted">{t("common.noneDetected")}</li>}
              </ul>
            </div>
            <div>
              <h4>
                {t("followup.actions", { n: result.actions.length })}{" "}
                <span className="pill pill-ok">{t("followup.added", { n: result.createdCommitments })}</span>
              </h4>
              <ul className="plain-list">
                {result.actions.map((a, i) => (
                  <li key={i}>
                    <strong>{senderName(a.owner)}</strong>: {a.text}
                    {a.dueAt && <span className="muted small"> · {t("common.byDate", { date: fmtDateTime(a.dueAt) })}</span>}
                  </li>
                ))}
                {result.actions.length === 0 && <li className="muted">{t("common.noneDetected")}</li>}
              </ul>
            </div>
          </div>
          <h4>{t("followup.mail", { names: result.recipients.map(senderName).join(", ") })}</h4>
          <div className="composer" style={{ border: "1px solid var(--border)", borderRadius: 10 }}>
            <div className="muted small" style={{ marginBottom: 6 }}>
              {t("common.subject", { subject: result.draftSubject })}
            </div>
            <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} disabled={state === "sent"} />
            <div className="composer-actions">
              {state === "sent" && <span className="sent-note">✓ {t("followup.sent")}</span>}
              <button className="btn btn-primary" disabled={state === "sending" || state === "sent" || !body.trim()} onClick={() => void send()}>
                {state === "sending" ? t("common.sending") : t("followup.confirm")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
