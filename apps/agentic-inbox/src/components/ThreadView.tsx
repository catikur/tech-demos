import { useEffect, useRef, useState } from "react";
import type { Thread } from "../../shared/types.ts";
import { senderEmail, senderName } from "../../shared/types.ts";
import { t } from "../i18n.ts";
import { fmtDateTime } from "../state.ts";
import { PersonChip } from "./PersonChip.tsx";

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
          <p>{t("inbox.select")}</p>
          <p>{t("inbox.selectHint")}</p>
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
  if (!counterpart) {
    return (
      <section className="pane pane-detail">
        <div className="pane-header">
          <h2 className="detail-title">{thread.subject.trim() && thread.subject !== "(no subject)" ? thread.subject : t("inbox.noSubject")}</h2>
        </div>
        <p className="muted" style={{ padding: 16 }}>
          {t("inbox.missingMessages")}
        </p>
      </section>
    );
  }

  return (
    <section className="pane pane-detail">
      <div className="pane-header">
        <h2 className="detail-title">{thread.subject}</h2>
        <span className="badge badge-soft">{t("inbox.participants", { n: thread.participants.length })}</span>
      </div>
      {!counterpart.isMine && senderEmail(counterpart.from).includes("@") && (
        <PersonChip spaceId={thread.spaceId} email={senderEmail(counterpart.from)} />
      )}
      <div className="messages" ref={scrollRef}>
        {thread.messages.map((m) => (
          <article key={m.id} className={`message ${m.isMine ? "message-mine" : ""}`}>
            <header className="message-header">
              <span className="message-from">{m.isMine ? t("common.you") : senderName(m.from)}</span>
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
          placeholder={t("inbox.replyPlaceholder", { name: senderName(counterpart.from) })}
          rows={4}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
          }}
        />
        <div className="composer-actions">
          {state === "sent" && <span className="sent-note">✓ {t("common.sent")}</span>}
          {state === "error" && <span className="error-note">{error}</span>}
          <button className="btn btn-primary" onClick={() => void send()} disabled={!draft.trim() || state === "sending"}>
            {state === "sending" ? t("common.sending") : t("inbox.sendReply")}
          </button>
        </div>
      </div>
    </section>
  );
}
