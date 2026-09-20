import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import type { Thread } from "../../shared/types.ts";
import { senderEmail, senderName } from "../../shared/types.ts";
import { t } from "../i18n.ts";
import { fmtDateTime } from "../state.ts";
import { PersonChip } from "./PersonChip.tsx";

export function ThreadCrashGuard({ resetKey, children }: { resetKey: string | null; children: ReactNode }) {
  return <ThreadCrashGuardInner resetKey={resetKey}>{children}</ThreadCrashGuardInner>;
}

class ThreadCrashGuardInner extends Component<{ resetKey: string | null; children: ReactNode }, { error: boolean }> {
  state = { error: false };

  static getDerivedStateFromError(): { error: boolean } {
    return { error: true };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error("[inbox] thread pane crashed", err, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey: string | null }): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: false });
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <section className="pane pane-detail">
          <p className="muted" style={{ padding: 16 }}>
            {t("inbox.missingMessages")}
          </p>
        </section>
      );
    }
    return this.props.children;
  }
}

export function ThreadView({
  thread,
  loading,
  error,
  prefill,
  onPrefillConsumed,
  onSend,
}: {
  thread: Thread | null;
  loading?: boolean;
  error?: string | null;
  prefill: string | null;
  onPrefillConsumed: () => void;
  onSend: (threadId: string, body: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = thread?.messages ?? [];

  useEffect(() => {
    setDraft("");
    setState("idle");
    setSendError(null);
  }, [thread?.id]);

  useEffect(() => {
    if (prefill !== null) {
      setDraft(prefill);
      onPrefillConsumed();
    }
  }, [prefill, onPrefillConsumed]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, thread?.id]);

  if (loading) {
    return (
      <section className="pane pane-detail pane-empty">
        <div className="empty-state">
          <p>{t("common.loading")}</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="pane pane-detail">
        <p className="muted" style={{ padding: 16 }}>
          {t("inbox.loadError")}
        </p>
      </section>
    );
  }

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
      setSendError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  const counterpart = [...messages].reverse().find((m) => !m.isMine) ?? messages[0];
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

  const counterpartMail = senderEmail(counterpart.from);

  return (
    <section className="pane pane-detail">
      <div className="pane-header">
        <h2 className="detail-title">{thread.subject.trim() && thread.subject !== "(no subject)" ? thread.subject : t("inbox.noSubject")}</h2>
        <span className="badge badge-soft">{t("inbox.participants", { n: thread.participants.length })}</span>
      </div>
      {!counterpart.isMine && counterpartMail.includes("@") && <PersonChip spaceId={thread.spaceId} email={counterpartMail} />}
      <div className="messages" ref={scrollRef}>
        {messages.map((m) => (
          <article key={m.id} className={`message ${m.isMine ? "message-mine" : ""}`}>
            <header className="message-header">
              <span className="message-from">{m.isMine ? t("common.you") : senderName(m.from) || t("inbox.unknownSender")}</span>
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
          placeholder={t("inbox.replyPlaceholder", { name: senderName(counterpart.from) || t("inbox.unknownSender") })}
          rows={4}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
          }}
        />
        <div className="composer-actions">
          {state === "sent" && <span className="sent-note">✓ {t("common.sent")}</span>}
          {state === "error" && <span className="error-note">{sendError}</span>}
          <button className="btn btn-primary" onClick={() => void send()} disabled={!draft.trim() || state === "sending"}>
            {state === "sending" ? t("common.sending") : t("inbox.sendReply")}
          </button>
        </div>
      </div>
    </section>
  );
}
