import { useMemo, useReducer, useState } from "react";
import type { Mailbox } from "./types.ts";
import { lastMessage } from "./types.ts";
import { seedMailbox, ME } from "./data/seed.ts";
import { InboxList } from "./components/InboxList.tsx";
import { ThreadView } from "./components/ThreadView.tsx";
import { AgentPanel } from "./components/AgentPanel.tsx";

interface State {
  mailbox: Mailbox;
  selectedThreadId: string | null;
}

type Action =
  | { type: "select"; threadId: string }
  | { type: "send"; threadId: string; body: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "select":
      return {
        selectedThreadId: action.threadId,
        mailbox: {
          ...state.mailbox,
          threads: state.mailbox.threads.map((t) =>
            t.id === action.threadId ? { ...t, unread: false } : t,
          ),
        },
      };
    case "send":
      return {
        ...state,
        mailbox: {
          ...state.mailbox,
          threads: state.mailbox.threads.map((t) =>
            t.id === action.threadId
              ? {
                  ...t,
                  unread: false,
                  messages: [
                    ...t.messages,
                    {
                      id: `m-${action.threadId}-${t.messages.length + 1}-${Date.now()}`,
                      from: ME,
                      to: lastMessage(t).from,
                      body: action.body,
                      at: Date.now(),
                    },
                  ],
                }
              : t,
          ),
        },
      };
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, {
    mailbox: seedMailbox,
    selectedThreadId: null,
  });
  const [composerPrefill, setComposerPrefill] = useState<{ threadId: string; body: string } | null>(
    null,
  );

  const sortedThreads = useMemo(
    () =>
      [...state.mailbox.threads].sort((a, b) => lastMessage(b).at - lastMessage(a).at),
    [state.mailbox.threads],
  );
  const selected =
    state.mailbox.threads.find((t) => t.id === state.selectedThreadId) ?? null;
  const unreadCount = state.mailbox.threads.filter((t) => t.unread).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">📬</span>
          <span className="brand-name">Agentic Inbox</span>
          <span className="brand-tag">local slice · seeded mail · no cloud</span>
        </div>
        <div className="topbar-me">{ME}</div>
      </header>
      <main className="panes">
        <InboxList
          threads={sortedThreads}
          selectedId={state.selectedThreadId}
          unreadCount={unreadCount}
          onSelect={(id) => dispatch({ type: "select", threadId: id })}
        />
        <ThreadView
          thread={selected}
          prefill={
            composerPrefill && composerPrefill.threadId === selected?.id
              ? composerPrefill.body
              : null
          }
          onPrefillConsumed={() => setComposerPrefill(null)}
          onSend={(threadId, body) => dispatch({ type: "send", threadId, body })}
        />
        <AgentPanel
          mailbox={state.mailbox}
          selectedThreadId={state.selectedThreadId}
          onConfirmSend={(threadId, body) => dispatch({ type: "send", threadId, body })}
          onEditInComposer={(threadId, body) => {
            dispatch({ type: "select", threadId });
            setComposerPrefill({ threadId, body });
          }}
        />
      </main>
    </div>
  );
}
