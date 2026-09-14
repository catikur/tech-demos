import { useEffect, useRef, useState } from "react";
import type { AgentContext, AgentEvent, Space } from "../../shared/types.ts";
import { askAgent } from "../api/client.ts";

type DraftTarget = { kind: "thread" | "chat"; id: string };

type ChatItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "thought"; text: string }
  | { id: string; kind: "tool"; tool: string; input: string; output: string }
  | { id: string; kind: "reply"; text: string }
  | { id: string; kind: "error"; text: string }
  | {
      id: string;
      kind: "draft";
      target: DraftTarget;
      subject: string;
      body: string;
      status: "pending" | "sending" | "sent" | "discarded" | "failed";
    };

let nextId = 0;
const uid = () => `c${++nextId}`;

const GREETING =
  "Hi — I'm your Email Agent. I read mail, calendar, Teams chats and meeting transcripts in the active space, and I never send anything without your explicit confirmation.";

export function AgentPanel({
  context,
  activeSpace,
  onConfirmSend,
  onEditInComposer,
}: {
  context: AgentContext;
  activeSpace: Space | null;
  onConfirmSend: (target: DraftTarget, body: string) => Promise<void>;
  onEditInComposer: (target: DraftTarget, body: string) => void;
}) {
  const [items, setItems] = useState<ChatItem[]>([{ id: uid(), kind: "reply", text: GREETING }]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items, running]);

  const suggestions = [
    "Summarize my inbox",
    "What did I miss since yesterday?",
    context.selectedThreadId ? "Draft a reply to this" : "What's on my calendar this week?",
  ];

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || running) return;
    setInput("");
    setItems((prev) => [...prev, { id: uid(), kind: "user", text: question }]);
    setRunning(true);
    try {
      await askAgent(question, context, (ev: AgentEvent) => {
        if (ev.kind === "done") return;
        setItems((prev) => [
          ...prev,
          ev.kind === "draft" ? { id: uid(), ...ev, status: "pending" } : { id: uid(), ...ev },
        ]);
      });
    } catch (e) {
      setItems((prev) => [...prev, { id: uid(), kind: "error", text: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setRunning(false);
    }
  };

  const setDraftStatus = (id: string, status: Extract<ChatItem, { kind: "draft" }>["status"]) =>
    setItems((prev) => prev.map((i) => (i.id === id && i.kind === "draft" ? { ...i, status } : i)));

  const confirmSend = async (item: Extract<ChatItem, { kind: "draft" }>) => {
    setDraftStatus(item.id, "sending");
    try {
      await onConfirmSend(item.target, item.body);
      setDraftStatus(item.id, "sent");
      setItems((prev) => [
        ...prev,
        {
          id: uid(),
          kind: "tool",
          tool: item.target.kind === "thread" ? "send_reply" : "send_chat_message",
          input: JSON.stringify({ [item.target.kind === "thread" ? "threadId" : "chatId"]: item.target.id }),
          output: "Sent after user confirmation. Logged to audit trail.",
        },
        { id: uid(), kind: "reply", text: "Sent — it's now in the conversation." },
      ]);
    } catch (e) {
      setDraftStatus(item.id, "failed");
      setItems((prev) => [...prev, { id: uid(), kind: "error", text: e instanceof Error ? e.message : String(e) }]);
    }
  };

  return (
    <aside className="pane pane-agent">
      <div className="pane-header">
        <h2>
          <span className="agent-dot" /> Email Agent
        </h2>
        <span className="badge badge-soft" style={activeSpace ? { color: activeSpace.color, borderColor: `${activeSpace.color}66` } : undefined}>
          {activeSpace ? `scope: ${activeSpace.name}` : "scope: all spaces"}
        </span>
      </div>
      <div className="chat" ref={scrollRef}>
        {items.map((item) => {
          switch (item.kind) {
            case "user":
              return (
                <div key={item.id} className="chat-row chat-user">
                  <div className="bubble bubble-user">{item.text}</div>
                </div>
              );
            case "thought":
              return (
                <div key={item.id} className="chat-row">
                  <div className="thought">💭 {item.text}</div>
                </div>
              );
            case "tool":
              return (
                <div key={item.id} className="chat-row">
                  <details className="tool-call">
                    <summary>
                      <span className="tool-chip">⚙ {item.tool}</span>
                      <code className="tool-input">{item.input}</code>
                    </summary>
                    <pre className="tool-output">{item.output}</pre>
                  </details>
                </div>
              );
            case "reply":
              return (
                <div key={item.id} className="chat-row">
                  <div className="bubble bubble-agent">{item.text}</div>
                </div>
              );
            case "error":
              return (
                <div key={item.id} className="chat-row">
                  <div className="bubble bubble-error">{item.text}</div>
                </div>
              );
            case "draft":
              return (
                <div key={item.id} className="chat-row">
                  <div className={`draft-card draft-${item.status}`}>
                    <div className="draft-head">
                      <span className="draft-label">{item.target.kind === "thread" ? "Proposed reply" : "Proposed chat message"}</span>
                      <span className="draft-subject">{item.subject}</span>
                    </div>
                    <pre className="draft-body">{item.body}</pre>
                    {(item.status === "pending" || item.status === "failed") && (
                      <div className="draft-actions">
                        <button className="btn btn-primary" onClick={() => void confirmSend(item)}>
                          Confirm &amp; send
                        </button>
                        {item.target.kind === "thread" && (
                          <button className="btn" onClick={() => onEditInComposer(item.target, item.body)}>
                            Edit in composer
                          </button>
                        )}
                        <button className="btn btn-ghost" onClick={() => setDraftStatus(item.id, "discarded")}>
                          Discard
                        </button>
                      </div>
                    )}
                    {item.status === "sending" && <div className="draft-status muted">Sending…</div>}
                    {item.status === "sent" && <div className="draft-status ok">✓ Sent</div>}
                    {item.status === "discarded" && <div className="draft-status muted">Discarded</div>}
                  </div>
                </div>
              );
          }
        })}
        {running && (
          <div className="chat-row">
            <div className="bubble bubble-agent typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>
      <div className="chat-suggestions">
        {suggestions.map((s) => (
          <button key={s} className="chip" onClick={() => void ask(s)} disabled={running}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your mail, calendar, chats…" disabled={running} />
        <button className="btn btn-primary" type="submit" disabled={running || !input.trim()}>
          Ask
        </button>
      </form>
    </aside>
  );
}
