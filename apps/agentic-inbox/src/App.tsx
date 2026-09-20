import { useCallback, useEffect, useState } from "react";
import type { AgentContext, Space, SourceRef } from "../shared/types.ts";
import { api } from "./api/client.ts";
import { t } from "./i18n.ts";
import { useActiveSpace, useData, useStatus } from "./state.ts";
import { AgentPanel } from "./components/AgentPanel.tsx";
import { SpaceSwitcher } from "./components/SpaceSwitcher.tsx";
import { NotificationBell } from "./components/NotificationBell.tsx";
import { BriefPanel } from "./components/BriefPanel.tsx";
import { FollowUpPanel } from "./components/FollowUpPanel.tsx";
import { MinutesPanel } from "./components/MinutesPanel.tsx";
import { InboxView } from "./views/InboxView.tsx";
import { CalendarView } from "./views/CalendarView.tsx";
import { ChatsView } from "./views/ChatsView.tsx";
import { MeetingsView } from "./views/MeetingsView.tsx";
import { CommitmentsView } from "./views/CommitmentsView.tsx";
import { CatchUpView } from "./views/CatchUpView.tsx";
import { TopicsView } from "./views/TopicsView.tsx";
import { RadarView } from "./views/RadarView.tsx";
import { PeopleView } from "./views/PeopleView.tsx";
import { BriefingView } from "./views/BriefingView.tsx";
import { LoginView, type SessionView } from "./components/LoginView.tsx";
import { SettingsView } from "./views/SettingsView.tsx";
import { Icon, type IconName } from "./components/Icon.tsx";

export type ViewId =
  | "briefing"
  | "inbox"
  | "calendar"
  | "chats"
  | "meetings"
  | "catchup"
  | "commitments"
  | "radar"
  | "topics"
  | "people"
  | "settings";

const NAV: { id: ViewId; labelKey: string; icon: IconName }[] = [
  { id: "briefing", labelKey: "nav.briefing", icon: "sun" },
  { id: "inbox", labelKey: "nav.inbox", icon: "inbox" },
  { id: "calendar", labelKey: "nav.calendar", icon: "calendar" },
  { id: "chats", labelKey: "nav.chats", icon: "chat" },
  { id: "meetings", labelKey: "nav.meetings", icon: "video" },
  { id: "catchup", labelKey: "nav.catchup", icon: "catchup" },
  { id: "commitments", labelKey: "nav.commitments", icon: "board" },
  { id: "radar", labelKey: "nav.radar", icon: "radar" },
  { id: "topics", labelKey: "nav.topics", icon: "hash" },
  { id: "people", labelKey: "nav.people", icon: "people" },
  { id: "settings", labelKey: "nav.settings", icon: "settings" },
];

const PRIMARY: ViewId[] = ["briefing", "inbox", "calendar", "commitments"];
const MORE_IDS = new Set<ViewId>(["chats", "meetings", "catchup", "radar", "topics", "people", "settings"]);

export interface Selection {
  threadId: string | null;
  chatId: string | null;
  eventId: string | null;
  meetingId: string | null;
}

const emptySelection: Selection = { threadId: null, chatId: null, eventId: null, meetingId: null };

export function App() {
  const session = useData<SessionView>(() => api.get("/api/session"), []);
  const status = useStatus();
  const [spaceId, setSpaceId] = useActiveSpace();
  const [view, setView] = useState<ViewId>("briefing");
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [composerPrefill, setComposerPrefill] = useState<{ threadId: string; body: string } | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [focusDigestId, setFocusDigestId] = useState<string | null>(null);

  const spaces: Space[] = status.data?.spaces ?? [];
  const activeSpace = spaces.find((s) => s.id === spaceId) ?? null;
  const noAccounts = (status.data?.accounts.length ?? -1) === 0;

  useEffect(() => {
    if (spaceId && spaces.length > 0 && !activeSpace) setSpaceId(null);
  }, [spaceId, spaces.length, activeSpace, setSpaceId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAgentOpen(false);
        setMoreOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const agentContext: AgentContext = {
    spaceId,
    selectedThreadId: selection.threadId,
    selectedChatId: selection.chatId,
    selectedEventId: selection.eventId,
  };

  const select = useCallback((patch: Partial<Selection>) => setSelection((s) => ({ ...s, ...patch })), []);

  const go = useCallback(
    (id: ViewId) => {
      if (id === view) setSelection(emptySelection);
      setView(id);
      setMoreOpen(false);
    },
    [view],
  );

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
      setMoreOpen(false);
    },
    [select],
  );

  const viewProps = { spaceId, spaces, onOpenSource: openSource };

  /** Notification links: `event:<id>`, `digest:<id>`, `commitment:<id>`, `thread:<id>`, `radar`. */
  const openLink = useCallback(
    (link: string) => {
      const [kind, id] = link.split(":");
      if (kind === "event" && id) openSource({ kind: "event", id, label: "" });
      else if (kind === "thread" && id) openSource({ kind: "thread", id, label: "" });
      else if (kind === "meeting" && id) openSource({ kind: "meeting", id, label: "" });
      else if (kind === "digest") {
        setFocusDigestId(id ?? null);
        setView("catchup");
      } else if (kind === "commitment") setView("commitments");
      else if (kind === "radar") setView("radar");
    },
    [openSource],
  );

  const llmModel = status.data?.llm.model ? ` · ${status.data.llm.model}` : "";

  const signOut = async () => {
    await api.delete("/api/session");
    window.location.href = "/";
  };

  if (session.loading && !session.data) return <div className="login-screen muted">{t("common.loading")}</div>;
  if (session.data?.loginRequired && !session.data.authenticated) {
    return <LoginView session={session.data} onConfigured={session.reload} />;
  }

  const moreActive = MORE_IDS.has(view);
  const navButton = (n: (typeof NAV)[number], compact = false) => {
    const label = t(n.labelKey);
    return (
      <button
        key={n.id}
        type="button"
        className={`nav-item ${view === n.id ? "is-active" : ""}`}
        onClick={() => go(n.id)}
        title={label}
      >
        <Icon name={n.icon} className="nav-icon" />
        <span className="nav-label">{compact && n.id === "catchup" ? t("nav.catchupShort") : label}</span>
      </button>
    );
  };

  return (
    <div className={`app ${agentOpen ? "agent-open" : ""} ${moreOpen ? "more-open" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            B
          </span>
          <span className="brand-name">Butler</span>
        </div>
        <SpaceSwitcher spaces={spaces} activeId={spaceId} onChange={setSpaceId} />
        <div className="topbar-right">
          {status.data && (
            <span className="topbar-llm" title={t("brand.agentTitle")}>
              {t("brand.agent", { provider: status.data.llm.provider })}
              {llmModel}
            </span>
          )}
          {session.data?.email && (
            <span className="topbar-user" title={session.data.email}>
              {session.data.email}
            </span>
          )}
          {session.data?.loginRequired && (
            <button className="icon-btn desktop-only" title={t("login.signOut")} onClick={() => void signOut()}>
              <Icon name="logout" />
            </button>
          )}
          <NotificationBell spaceId={spaceId} spaces={spaces} onOpenLink={openLink} />
          <button
            type="button"
            className={`icon-btn agent-toggle ${agentOpen ? "is-active" : ""}`}
            title={t("brand.toggleAgent")}
            onClick={() => setAgentOpen((o) => !o)}
          >
            <Icon name="spark" />
          </button>
        </div>
      </header>

      <div className="body">
        <nav className="nav rail" aria-label={t("shell.nav")}>
          {NAV.map((n) => navButton(n))}
        </nav>

        <main className="main" style={{ "--space-color": activeSpace?.color ?? "#f6821f" } as React.CSSProperties}>
          {noAccounts && (
            <div className="accounts-banner">
              <span>{t("empty.accounts")}</span>
              <button className="link-btn" type="button" onClick={() => go("settings")}>
                {t("empty.accountsCta")}
              </button>
            </div>
          )}
          {view === "briefing" && (
            <BriefingView
              spaceId={spaceId}
              spaces={spaces}
              onOpenSource={openSource}
              onOpenDraft={(threadId, body) => openSource({ kind: "thread", id: threadId, label: "" }, body)}
            />
          )}
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
                <>
                  <MinutesPanel key={`min-${meeting.id}`} meeting={meeting} />
                  <FollowUpPanel key={meeting.id} meeting={meeting} onSent={(threadId) => openSource({ kind: "thread", id: threadId, label: "" })} />
                </>
              )}
            />
          )}
          {view === "catchup" && <CatchUpView key={focusDigestId ?? "catchup"} {...viewProps} focusDigestId={focusDigestId} />}
          {view === "commitments" && <CommitmentsView {...viewProps} />}
          {view === "radar" && <RadarView {...viewProps} />}
          {view === "topics" && <TopicsView {...viewProps} />}
          {view === "people" && <PeopleView {...viewProps} />}
          {view === "settings" && <SettingsView status={status.data} onChanged={status.reload} />}
        </main>
      </div>

      <nav className="bottom-nav" aria-label={t("shell.nav")}>
        {NAV.filter((n) => PRIMARY.includes(n.id)).map((n) => navButton(n, true))}
        <button
          type="button"
          className={`nav-item ${moreActive || moreOpen ? "is-active" : ""}`}
          onClick={() => setMoreOpen((o) => !o)}
          title={t("nav.more")}
        >
          <Icon name="more" className="nav-icon" />
          <span className="nav-label">{t("nav.more")}</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <button type="button" className="sheet-backdrop" aria-label={t("shell.close")} onClick={() => setMoreOpen(false)} />
          <div className="more-sheet" role="dialog" aria-label={t("nav.more")}>
            <div className="sheet-handle" />
            <header className="sheet-head">
              <h2>{t("nav.more")}</h2>
              <button type="button" className="icon-btn" onClick={() => setMoreOpen(false)} aria-label={t("shell.close")}>
                <Icon name="close" />
              </button>
            </header>
            <div className="more-grid">
              {NAV.filter((n) => MORE_IDS.has(n.id)).map((n) => (
                <button key={n.id} type="button" className={`more-tile ${view === n.id ? "is-active" : ""}`} onClick={() => go(n.id)}>
                  <Icon name={n.icon} />
                  <span>{t(n.labelKey)}</span>
                </button>
              ))}
            </div>
            {session.data?.loginRequired && (
              <button type="button" className="btn btn-ghost more-signout" onClick={() => void signOut()}>
                <Icon name="logout" /> {t("login.signOut")}
              </button>
            )}
          </div>
        </>
      )}

      {!agentOpen && (
        <button type="button" className="agent-fab" onClick={() => setAgentOpen(true)}>
          <Icon name="spark" />
          <span>{t("shell.askButler")}</span>
        </button>
      )}

      {agentOpen && (
        <>
          <button type="button" className="sheet-backdrop agent-backdrop" aria-label={t("shell.close")} onClick={() => setAgentOpen(false)} />
          <AgentPanel
            context={agentContext}
            activeSpace={activeSpace}
            onClose={() => setAgentOpen(false)}
            onConfirmSend={async (target, body) => {
              if (target.kind === "thread") await api.post(`/api/threads/${target.id}/reply`, { body, actor: "agent" });
              else if (target.kind === "chat") await api.post(`/api/chats/${target.id}/send`, { body, actor: "agent" });
              else await api.post(`/api/meetings/${target.id}/followup/send`, { body, actor: "agent" });
            }}
            onEditInComposer={(target, body) => {
              setAgentOpen(false);
              if (target.kind === "thread") openSource({ kind: "thread", id: target.id, label: "" }, body);
              else if (target.kind === "chat") openSource({ kind: "chat", id: target.id, label: "" });
              else openSource({ kind: "meeting", id: target.id, label: "" });
            }}
          />
        </>
      )}
    </div>
  );
}
