import { useEffect, useRef, useState } from "react";
import type { Chat, ChatMessage, Space } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { t } from "../i18n.ts";
import { ago, fmtTime, initials, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

function kindLabel(kind: Chat["kind"]): string {
  return t(`chats.kind.${kind}`);
}

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
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chats = list.data ?? [];
  const chat = detail.data && detail.data.id === selectedId ? detail.data : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat?.messages.length, chat?.id]);

  useEffect(() => {
    setReplyToId(null);
    setDraft("");
  }, [chat?.id]);

  const select = async (id: string) => {
    onSelect(id);
    if (chats.find((c) => c.id === id)?.unreadCount) {
      await api.post(`/api/chats/${id}/read`, {});
      list.reload();
    }
  };

  const send = async () => {
    if (!chat || !draft.trim()) return;
    await api.post(`/api/chats/${chat.id}/send`, { body: draft.trim(), replyToId: replyToId ?? undefined });
    setDraft("");
    setReplyToId(null);
    detail.reload();
  };

  const replyTarget = replyToId ? chat?.messages.find((m) => m.id === replyToId) : null;
  const threadRoot = (m: ChatMessage) => m.replyToId ?? m.id;

  return (
    <div className="split split-2">
      <section className="pane pane-list">
        <div className="pane-header">
          <h2>{t("chats.title")}</h2>
          <span className="badge badge-soft">{t("chats.unread", { n: chats.reduce((n, c) => n + c.unreadCount, 0) })}</span>
        </div>
        <ul className="thread-list">
          {chats.length === 0 && <li className="list-empty">{t("chats.empty")}</li>}
          {chats.map((c) => (
            <li key={c.id}>
              <button className={`thread-item ${c.id === selectedId ? "is-selected" : ""} ${c.unreadCount ? "is-unread" : ""}`} onClick={() => void select(c.id)}>
                <span className="avatar avatar-agent">{c.kind === "channel" ? "#" : initials(c.title)}</span>
                <span className="thread-main">
                  <span className="thread-top">
                    <span className="thread-sender">{c.title}</span>
                    <span className="thread-time">{ago(c.lastAt)}</span>
                  </span>
                  <span className="thread-snippet">{t("chats.members", { kind: kindLabel(c.kind), n: c.members.length })}</span>
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
            <p>{t("chats.select")}</p>
          </div>
        ) : (
          <>
            <div className="pane-header">
              <h2 className="detail-title">{chat.title}</h2>
              <span className="badge badge-soft">{kindLabel(chat.kind)}</span>
            </div>
            <div className="messages" ref={scrollRef}>
              {chat.messages.map((m) => (
                <article
                  key={m.id}
                  className={`chat-msg ${m.isMine ? "chat-msg-mine" : ""} ${m.mentionsMe ? "chat-msg-mention" : ""} ${m.replyToId ? "chat-msg-reply" : ""} ${replyToId === m.id ? "is-reply-target" : ""}`}
                  data-reply-to={m.replyToId ?? undefined}
                  onClick={() => setReplyToId(threadRoot(m))}
                >
                  <header className="message-header">
                    <span className="message-from">{m.isMine ? t("common.you") : senderName(m.from)}</span>
                    <span className="message-time">{fmtTime(m.at)}</span>
                  </header>
                  <div className="chat-msg-body">{m.body}</div>
                </article>
              ))}
            </div>
            {replyTarget && (
              <div className="composer-reply" data-reply-to={replyTarget.id}>
                <span className="composer-reply-body">{replyTarget.body}</span>
                <button type="button" className="btn btn-ghost" onClick={() => setReplyToId(null)}>
                  ×
                </button>
              </div>
            )}
            <div className="composer composer-compact">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("chats.messagePlaceholder", { title: chat.title })}
                onKeyDown={(e) => e.key === "Enter" && void send()}
              />
              <button className="btn btn-primary" disabled={!draft.trim()} onClick={() => void send()}>
                {t("common.send")}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
