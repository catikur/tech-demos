import { useCallback, useEffect, useState } from "react";
import type { AgentContext, Space, SourceRef } from "../shared/types.ts";
import { api } from "./api/client.ts";
import { useActiveSpace, useStatus } from "./state.ts";
import { AgentPanel } from "./components/AgentPanel.tsx";
import { SpaceSwitcher } from "./components/SpaceSwitcher.tsx";
import { BriefPanel } from "./components/BriefPanel.tsx";
import { FollowUpPanel } from "./components/FollowUpPanel.tsx";
import { InboxView } from "./views/InboxView.tsx";
import { CalendarView } from "./views/CalendarView.tsx";
import { ChatsView } from "./views/ChatsView.tsx";
import { MeetingsView } from "./views/MeetingsView.tsx";
import { CommitmentsView } from "./views/CommitmentsView.tsx";
import { CatchUpView } from "./views/CatchUpView.tsx";
import { TopicsView } from "./views/TopicsView.tsx";
import { RadarView } from "./views/RadarView.tsx";
import { PeopleView } from "./views/PeopleView.tsx";
import { SettingsView } from "./views/SettingsView.tsx";

export type ViewId = "inbox" | "calendar" | "chats" | "meetings" | "catchup" | "commitments" | "radar" | "topics" | "people" | "settings";

const NAV: { id: ViewId; label: string; icon: string }[] = [
  { id: "inbox", label: "Inbox", icon: "✉" },
  { id: "calendar", label: "Calendar", icon: "▦" },
  { id: "chats", label: "Chats", icon: "◫" },
  { id: "meetings", label: "Meetings", icon: "◉" },
  { id: "catchup", label: "Catch-up", icon: "⟳" },
  { id: "commitments", label: "Commitments", icon: "✓" },
  { id: "radar", label: "Radar", icon: "◎" },
  { id: "topics", label: "Topics", icon: "#" },
  { id: "people", label: "People", icon: "☺" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export interface Selection {
  threadId: string | null;
  chatId: string | null;
  eventId: string | null;
  meetingId: string | null;
}

export function App() {
  const status = useStatus();
  const [spaceId, setSpaceId] = useActiveSpace();
  const [view, setView] = useState<ViewId>("inbox");
  const [selection, setSelection] = useState<Selection>({ threadId: null, chatId: null, eventId: null, meetingId: null });
  const [composerPrefill, setComposerPrefill] = useState<{ threadId: string; body: string } | null>(null);
  const [agentOpen, setAgentOpen] = useState(true);

  const spaces: Space[] = status.data?.spaces ?? [];
  const activeSpace = spaces.find((s) => s.id === spaceId) ?? null;

  useEffect(() => {
    if (spaceId && spaces.length > 0 && !activeSpace) setSpaceId(null);
  }, [spaceId, spaces.length, activeSpace, setSpaceId]);

  const agentContext: AgentContext = {
    spaceId,
    selectedThreadId: selection.threadId,
    selectedChatId: selection.chatId,
    selectedEventId: selection.eventId,
  };

  const select = useCallback((patch: Partial<Selection>) => setSelection((s) => ({ ...s, ...patch })), []);

  /** Jump to any record from feature views, optionally pre-filling the reply composer. */
  const openSource = useCallback(
    (ref: SourceRef, prefill?: string) => {
      switch (ref.kind) {
        case "thread":
          setView("inbox");
          select({ threadId: ref.id });
          if (prefill !== undefined) setComposerPrefill({ threadId: ref.id, body: prefill });
          break;
        case "chat":
          setView("chats");
          select({ chatId: ref.id });
          break;
        case "meeting":
          setView("meetings");
          select({ meetingId: ref.id });
          break;
        case "event":
          setView("calendar");
          select({ eventId: ref.id });
          break;
      }
    },
    [select],
  );

  const viewProps = { spaceId, spaces, onOpenSource: openSource };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">📬</span>
          <span className="brand-name">Agentic Inbox</span>
          {status.data?.demoMode && <span className="brand-tag">demo data · no cloud</span>}
        </div>
        <SpaceSwitcher spaces={spaces} activeId={spaceId} onChange={setSpaceId} />
        <div className="topbar-right">
          {status.data && (
            <span className="topbar-llm" title="Agent backend">
              agent: {status.data.llm.provider}
              {status.data.llm.model ? ` · ${status.data.llm.model}` : ""}
            </span>
          )}
          <button className="icon-btn" title="Toggle agent panel" onClick={() => setAgentOpen((o) => !o)}>
            {agentOpen ? "⇥" : "⇤"}
          </button>
        </div>
      </header>

      <div className={`body ${agentOpen ? "" : "agent-collapsed"}`}>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${view === n.id ? "is-active" : ""}`} onClick={() => setView(n.id)} title={n.label}>
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </button>
          ))}
        </nav>

        <main className="main" style={{ "--space-color": activeSpace?.color ?? "#94a3b8" } as React.CSSProperties}>
          {view === "inbox" && (
            <InboxView
              spaceId={spaceId}
              spaces={spaces}
              selectedId={selection.threadId}
              onSelect={(id) => select({ threadId: id })}
              prefill={composerPrefill}
              onPrefillConsumed={() => setComposerPrefill(null)}
            />
          )}
          {view === "calendar" && (
            <CalendarView
              spaceId={spaceId}
              spaces={spaces}
              selectedId={selection.eventId}
              onSelect={(id) => select({ eventId: id })}
              renderDetailExtras={(event) => <BriefPanel key={event.id} event={event} />}
            />
          )}
          {view === "chats" && <ChatsView spaceId={spaceId} spaces={spaces} selectedId={selection.chatId} onSelect={(id) => select({ chatId: id })} />}
          {view === "meetings" && (
            <MeetingsView
              spaceId={spaceId}
              spaces={spaces}
              selectedId={selection.meetingId}
              onSelect={(id) => select({ meetingId: id })}
              renderDetailExtras={(meeting) => (
                <FollowUpPanel key={meeting.id} meeting={meeting} onSent={(threadId) => openSource({ kind: "thread", id: threadId, label: "" })} />
              )}
            />
          )}
          {view === "catchup" && <CatchUpView {...viewProps} />}
          {view === "commitments" && <CommitmentsView {...viewProps} />}
          {view === "radar" && <RadarView {...viewProps} />}
          {view === "topics" && <TopicsView {...viewProps} />}
          {view === "people" && <PeopleView {...viewProps} />}
          {view === "settings" && <SettingsView status={status.data} onChanged={status.reload} />}
        </main>

        {agentOpen && (
          <AgentPanel
            context={agentContext}
            activeSpace={activeSpace}
            onConfirmSend={async (target, body) => {
              if (target.kind === "thread") await api.post(`/api/threads/${target.id}/reply`, { body, actor: "agent" });
              else if (target.kind === "chat") await api.post(`/api/chats/${target.id}/send`, { body, actor: "agent" });
              else await api.post(`/api/meetings/${target.id}/followup/send`, { body, actor: "agent" });
            }}
            onEditInComposer={(target, body) => {
              if (target.kind === "thread") openSource({ kind: "thread", id: target.id, label: "" }, body);
              else if (target.kind === "chat") openSource({ kind: "chat", id: target.id, label: "" });
              else openSource({ kind: "meeting", id: target.id, label: "" });
            }}
          />
        )}
      </div>
    </div>
  );
}
