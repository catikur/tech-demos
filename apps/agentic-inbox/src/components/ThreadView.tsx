import { useEffect, useRef, useState } from "react";
import type { Thread } from "../types.ts";
import { senderEmail, senderName } from "../types.ts";

function fmtTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ThreadView({
  thread,
  prefill,
  onPrefillConsumed,
  onSend,
}: {
  thread: Thread | null;
  prefill: string | null;
  onPrefillConsumed: () => void;
  onSend: (threadId: string, body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [justSent, setJustSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft("");
    setJustSent(false);
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
      <section className="pane pane-thread pane-empty">
        <div className="empty-state">
          <div className="empty-icon">✉️</div>
          <p>Select a thread from the inbox,</p>
          <p>or ask the Email Agent to “summarize my inbox”.</p>
        </div>
      </section>
    );
  }

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    onSend(thread.id, body);
    setDraft("");
    setJustSent(true);
    setTimeout(() => setJustSent(false), 2500);
  };

  return (
    <section className="pane pane-thread">
      <div className="pane-header">
        <h2 className="thread-title">{thread.subject}</h2>
      </div>
      <div className="messages" ref={scrollRef}>
        {thread.messages.map((m) => {
          const mine = m.from.includes("you@inbox.local");
          return (
            <article key={m.id} className={`message ${mine ? "message-mine" : ""}`}>
              <header className="message-header">
                <span className="message-from">{mine ? "You" : senderName(m.from)}</span>
                <span className="message-addr">{senderEmail(m.from)}</span>
                <span className="message-time">{fmtTime(m.at)}</span>
              </header>
              <pre className="message-body">{m.body}</pre>
            </article>
          );
        })}
      </div>
      <div className="composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Reply to ${senderName(thread.messages[0].from)}… (or ask the agent to draft one)`}
          rows={4}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
          }}
        />
        <div className="composer-actions">
          {justSent && <span className="sent-note">✓ Sent (demo — saved to local thread)</span>}
          <button className="btn btn-primary" onClick={send} disabled={!draft.trim()}>
            Send reply
          </button>
        </div>
      </div>
    </section>
  );
}
