import { useEffect, useRef, useState } from "react";
import type { Thread } from "../../shared/types.ts";
import { senderEmail, senderName } from "../../shared/types.ts";
import { fmtDateTime } from "../state.ts";

export function ThreadView({
  thread,
  prefill,
  onPrefillConsumed,
  onSend,
}: {
  thread: Thread | null;
  prefill: string | null;
  onPrefillConsumed: () => void;
  onSend: (threadId: string, body: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft("");
    setState("idle");
  }, [thread?.id]);

  useEffect(() => {
    if (prefill !== null) {
      setDraft(prefill);
      onPrefillConsumed();
    }
  }, [prefill, onPrefillConsumed]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread?.messages.length, thread?.id]);

  if (!thread) {
    return (
      <section className="pane pane-detail pane-empty">
        <div className="empty-state">
          <div className="empty-icon">✉️</div>
          <p>Select a thread,</p>
          <p>or ask the Email Agent to “summarize my inbox”.</p>
        </div>
      </section>
    );
  }

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setState("sending");
    try {
      await onSend(thread.id, body);
      setDraft("");
      setState("sent");
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  const counterpart = [...thread.messages].reverse().find((m) => !m.isMine) ?? thread.messages[0];

  return (
    <section className="pane pane-detail">
      <div className="pane-header">
        <h2 className="detail-title">{thread.subject}</h2>
        <span className="badge badge-soft">{thread.participants.length} participants</span>
      </div>
      <div className="messages" ref={scrollRef}>
        {thread.messages.map((m) => (
          <article key={m.id} className={`message ${m.isMine ? "message-mine" : ""}`}>
            <header className="message-header">
              <span className="message-from">{m.isMine ? "You" : senderName(m.from)}</span>
              <span className="message-addr">{senderEmail(m.from)}</span>
              <span className="message-time">{fmtDateTime(m.at)}</span>
            </header>
            <pre className="message-body">{m.body}</pre>
          </article>
        ))}
      </div>
      <div className="composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Reply to ${senderName(counterpart.from)}… (or ask the agent to draft one)`}
          rows={4}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
          }}
        />
        <div className="composer-actions">
          {state === "sent" && <span className="sent-note">✓ Sent</span>}
          {state === "error" && <span className="error-note">{error}</span>}
          <button className="btn btn-primary" onClick={() => void send()} disabled={!draft.trim() || state === "sending"}>
            {state === "sending" ? "Sending…" : "Send reply"}
          </button>
        </div>
      </div>
    </section>
  );
}
