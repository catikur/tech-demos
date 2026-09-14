import { useEffect, useRef, useState } from "react";
import type { Chat, ChatMessage, Space } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { ago, fmtTime, initials, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

const KIND_LABEL: Record<Chat["kind"], string> = { oneOnOne: "1:1", group: "group", channel: "channel" };

export function ChatsView({
  spaceId,
  spaces,
  selectedId,
  onSelect,
}: {
  spaceId: string | null;
  spaces: Space[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const list = useData<Chat[]>(
    () => api.get(`/api/chats?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "chats"),
  );
  const detail = useData<(Chat & { messages: ChatMessage[] }) | null>(
    () => (selectedId ? api.get(`/api/chats/${selectedId}`) : Promise.resolve(null)),
    [selectedId],
    (ev) => ev.type === "data" && ev.entity === "chats",
  );
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const chats = list.data ?? [];
  const chat = detail.data && detail.data.id === selectedId ? detail.data : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat?.messages.length, chat?.id]);

  const select = async (id: string) => {
    onSelect(id);
    if (chats.find((c) => c.id === id)?.unreadCount) {
      await api.post(`/api/chats/${id}/read`, {});
      list.reload();
    }
  };

  const send = async () => {
    if (!chat || !draft.trim()) return;
    await api.post(`/api/chats/${chat.id}/send`, { body: draft.trim() });
    setDraft("");
    detail.reload();
  };

  return (
    <div className="split split-2">
      <section className="pane pane-list">
        <div className="pane-header">
          <h2>Chats</h2>
          <span className="badge badge-soft">{chats.reduce((n, c) => n + c.unreadCount, 0)} unread</span>
        </div>
        <ul className="thread-list">
          {chats.length === 0 && (
            <li className="list-empty">No chats here — Teams chats appear for Microsoft 365 accounts.</li>
          )}
          {chats.map((c) => (
            <li key={c.id}>
              <button className={`thread-item ${c.id === selectedId ? "is-selected" : ""} ${c.unreadCount ? "is-unread" : ""}`} onClick={() => void select(c.id)}>
                <span className="avatar avatar-agent">{c.kind === "channel" ? "#" : initials(c.title)}</span>
                <span className="thread-main">
                  <span className="thread-top">
                    <span className="thread-sender">{c.title}</span>
                    <span className="thread-time">{ago(c.lastAt)}</span>
                  </span>
                  <span className="thread-snippet">
                    {KIND_LABEL[c.kind]} · {c.members.length} members
                  </span>
                  {spaceId === null && (
                    <span className="thread-labels">
                      <SpaceBadge spaces={spaces} spaceId={c.spaceId} />
                    </span>
                  )}
                </span>
                {c.unreadCount > 0 && <span className="count-dot">{c.unreadCount}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="pane pane-detail">
        {!chat ? (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <p>Select a chat or channel.</p>
          </div>
        ) : (
          <>
            <div className="pane-header">
              <h2 className="detail-title">{chat.title}</h2>
              <span className="badge badge-soft">{KIND_LABEL[chat.kind]}</span>
            </div>
            <div className="messages" ref={scrollRef}>
              {chat.messages.map((m) => (
                <article key={m.id} className={`chat-msg ${m.isMine ? "chat-msg-mine" : ""} ${m.mentionsMe ? "chat-msg-mention" : ""}`}>
                  <header className="message-header">
                    <span className="message-from">{m.isMine ? "You" : senderName(m.from)}</span>
                    <span className="message-time">{fmtTime(m.at)}</span>
                  </header>
                  <div className="chat-msg-body">{m.body}</div>
                </article>
              ))}
            </div>
            <div className="composer composer-compact">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Message ${chat.title}…`}
                onKeyDown={(e) => e.key === "Enter" && void send()}
              />
              <button className="btn btn-primary" disabled={!draft.trim()} onClick={() => void send()}>
                Send
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
