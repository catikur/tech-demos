import { useState } from "react";
import type { FollowUp, Meeting } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api } from "../api/client.ts";
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
        <h3 style={{ margin: 0 }}>Follow-through</h3>
        <div className="row-actions">
          <button className="btn btn-small btn-primary" disabled={state === "loading"} onClick={() => void generate(false)}>
            {state === "loading" ? "Extracting…" : result ? "Reload" : "Extract decisions & actions"}
          </button>
          {result && (
            <button className="btn btn-small btn-ghost" onClick={() => void generate(true)}>
              Regenerate
            </button>
          )}
        </div>
      </div>
      {state === "error" && <div className="error-note">{error}</div>}
      {result && (
        <>
          <div className="split-cols">
            <div>
              <h4>Decisions ({result.decisions.length})</h4>
              <ul className="plain-list">
                {result.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
                {result.decisions.length === 0 && <li className="muted">None detected.</li>}
              </ul>
            </div>
            <div>
              <h4>
                Action items ({result.actions.length}) <span className="pill pill-ok">{result.createdCommitments} added to ledger</span>
              </h4>
              <ul className="plain-list">
                {result.actions.map((a, i) => (
                  <li key={i}>
                    <strong>{senderName(a.owner)}</strong>: {a.text}
                    {a.dueAt && <span className="muted small"> · by {fmtDateTime(a.dueAt)}</span>}
                  </li>
                ))}
                {result.actions.length === 0 && <li className="muted">None detected.</li>}
              </ul>
            </div>
          </div>
          <h4>Follow-up mail → {result.recipients.map(senderName).join(", ")}</h4>
          <div className="composer" style={{ border: "1px solid var(--border)", borderRadius: 10 }}>
            <div className="muted small" style={{ marginBottom: 6 }}>
              Subject: {result.draftSubject}
            </div>
            <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} disabled={state === "sent"} />
            <div className="composer-actions">
              {state === "sent" && <span className="sent-note">✓ Sent — saved as a new thread</span>}
              <button className="btn btn-primary" disabled={state === "sending" || state === "sent" || !body.trim()} onClick={() => void send()}>
                {state === "sending" ? "Sending…" : "Confirm & send follow-up"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
