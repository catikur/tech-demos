import { useEffect, useRef, useState } from "react";
import type { AgentReply, ChatEntry } from "../types.ts";

const SUGGESTIONS = ["pe of NVDA", "compare AAPL and MSFT", "why is TSLA down", "top gainer today"];

export function AgentPane() {
  const [entries, setEntries] = useState<ChatEntry[]>([
    {
      role: "agent",
      text: "Research agent online (mock tools, no LLM). Ask about quotes, fundamentals, comparisons, or screens — or type \"help\".",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, busy]);

  async function ask(query: string) {
    const trimmed = query.trim();
    if (!trimmed || busy) return;
    setInput("");
    setBusy(true);
    setEntries((prev) => [...prev, { role: "user", text: trimmed }]);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const reply = (await res.json()) as AgentReply;
      // small delay so the "thinking" state is visible
      await new Promise((r) => setTimeout(r, 350));
      setEntries((prev) => [...prev, { role: "agent", text: reply.answer, toolCalls: reply.toolCalls }]);
    } catch {
      setEntries((prev) => [...prev, { role: "agent", text: "Agent request failed — is the dev server running?" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel agent">
      <header className="panel-title">
        Agent <span className="mcp-tag">mock MCP tools</span>
      </header>

      <div className="chat-log" ref={logRef}>
        {entries.map((e, i) => (
          <div key={i} className={`msg ${e.role}`}>
            {e.role === "user" && <span className="prompt">›</span>}
            <div className="msg-body">
              {e.toolCalls && e.toolCalls.length > 0 && (
                <div className="chips">
                  {e.toolCalls.map((c, j) => (
                    <span className="chip" key={j} title={JSON.stringify(c.args)}>
                      ⚙ {c.tool}(
                      {Object.values(c.args)
                        .map(String)
                        .join(", ")}
                      ) · {c.ms}ms
                    </span>
                  ))}
                </div>
              )}
              <pre>{e.text}</pre>
            </div>
          </div>
        ))}
        {busy && <div className="msg agent thinking">calling tools…</div>}
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="suggestion" onClick={() => ask(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="agent-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <span className="prompt">›</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the research agent…"
          disabled={busy}
          autoFocus
        />
        <button type="submit" disabled={busy || !input.trim()}>
          run
        </button>
      </form>
    </section>
  );
}
