import { useEffect, useRef, useState } from "react";
import type { Mailbox } from "../types.ts";
import { runAgent } from "../agent/agent.ts";

type ChatItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "thought"; text: string }
  | { id: string; kind: "tool"; tool: string; input: string; output: string }
  | { id: string; kind: "reply"; text: string }
  | {
      id: string;
      kind: "draft";
      threadId: string;
      subject: string;
      body: string;
      status: "pending" | "sent" | "discarded";
    };

let nextId = 0;
const uid = () => `c${++nextId}`;

const SUGGESTIONS = [
  "Summarize my inbox",
  "Find the invoice email",
  "Draft a reply to this",
];

export function AgentPanel({
  mailbox,
  selectedThreadId,
  onConfirmSend,
  onEditInComposer,
}: {
  mailbox: Mailbox;
  selectedThreadId: string | null;
  onConfirmSend: (threadId: string, body: string) => void;
  onEditInComposer: (threadId: string, body: string) => void;
}) {
  const [items, setItems] = useState<ChatItem[]>([
    {
      id: uid(),
      kind: "reply",
      text: "Hi — I'm your Email Agent. I can list, search, and draft replies against the seeded mailbox. I never send anything without your explicit confirmation.",
    },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items, running]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || running) return;
    setInput("");
    setItems((prev) => [...prev, { id: uid(), kind: "user", text: question }]);
    setRunning(true);
    try {
      for await (const ev of runAgent(question, mailbox, selectedThreadId)) {
        setItems((prev) => [
          ...prev,
          ev.kind === "draft" ? { id: uid(), ...ev, status: "pending" } : { id: uid(), ...ev },
        ]);
      }
    } finally {
      setRunning(false);
    }
  };

  const confirmSend = (item: Extract<ChatItem, { kind: "draft" }>) => {
    onConfirmSend(item.threadId, item.body);
    setItems((prev) => [
      ...prev.map((i) => (i.id === item.id ? { ...i, status: "sent" as const } : i)),
      {
        id: uid(),
        kind: "tool",
        tool: "send_reply",
        input: `{ threadId: '${item.threadId}' }`,
        output: "Reply appended to local thread (demo send).",
      },
      {
        id: uid(),
        kind: "reply",
        text: `Sent — the reply is now in the thread. (Local demo: nothing left this machine.)`,
      },
    ]);
  };

  const discard = (item: Extract<ChatItem, { kind: "draft" }>) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: "discarded" as const } : i)),
    );
  };

  return (
    <section className="pane pane-agent">
      <div className="pane-header">
        <h2>
          <span className="agent-dot" /> Email Agent
        </h2>
        <span className="badge badge-soft">tools: list · search · draft · send</span>
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
                  <details className="tool-call" open={item.tool !== "list_threads"}>
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
            case "draft":
              return (
                <div key={item.id} className="chat-row">
                  <div className={`draft-card draft-${item.status}`}>
                    <div className="draft-head">
                      <span className="draft-label">Proposed draft</span>
                      <span className="draft-subject">{item.subject}</span>
                    </div>
                    <pre className="draft-body">{item.body}</pre>
                    {item.status === "pending" && (
                      <div className="draft-actions">
                        <button className="btn btn-primary" onClick={() => confirmSend(item)}>
                          Confirm &amp; send
                        </button>
                        <button
                          className="btn"
                          onClick={() => onEditInComposer(item.threadId, item.body)}
                        >
                          Edit in composer
                        </button>
                        <button className="btn btn-ghost" onClick={() => discard(item)}>
                          Discard
                        </button>
                      </div>
                    )}
                    {item.status === "sent" && <div className="draft-status ok">✓ Sent</div>}
                    {item.status === "discarded" && (
                      <div className="draft-status muted">Discarded</div>
                    )}
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
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => ask(s)} disabled={running}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the agent about your mail…"
          disabled={running}
        />
        <button className="btn btn-primary" type="submit" disabled={running || !input.trim()}>
          Ask
        </button>
      </form>
    </section>
  );
}
