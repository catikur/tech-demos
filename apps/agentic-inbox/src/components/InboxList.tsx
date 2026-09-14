import type { Space, ThreadSummary } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { ago, CATEGORY_COLORS, initials } from "../state.ts";
import { SpaceBadge } from "./SpaceSwitcher.tsx";

export function InboxList({
  threads,
  spaces,
  showSpace,
  selectedId,
  unreadCount,
  query,
  onQuery,
  onSelect,
  loading,
}: {
  threads: ThreadSummary[];
  spaces: Space[];
  showSpace: boolean;
  selectedId: string | null;
  unreadCount: number;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <section className="pane pane-list">
      <div className="pane-header">
        <h2>Inbox</h2>
        {unreadCount > 0 && <span className="badge">{unreadCount} unread</span>}
      </div>
      <div className="pane-search">
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search mail…" />
      </div>
      <ul className="thread-list">
        {loading && <li className="list-empty">Loading…</li>}
        {!loading && threads.length === 0 && <li className="list-empty">No threads{query ? " match" : ""}.</li>}
        {threads.map((t) => {
          const name = senderName(t.lastFrom);
          const color = CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.other;
          return (
            <li key={t.id}>
              <button
                className={`thread-item ${t.id === selectedId ? "is-selected" : ""} ${t.unread ? "is-unread" : ""}`}
                onClick={() => onSelect(t.id)}
              >
                <span className="avatar" style={{ background: `${color}26`, color }}>
                  {initials(name)}
                </span>
                <span className="thread-main">
                  <span className="thread-top">
                    <span className="thread-sender">{name}</span>
                    <span className="thread-time">{ago(t.lastAt)}</span>
                  </span>
                  <span className="thread-subject">{t.subject}</span>
                  <span className="thread-snippet">{t.snippet}</span>
                  <span className="thread-labels">
                    <span className="label" style={{ borderColor: `${color}66`, color }}>
                      {t.category}
                    </span>
                    {t.messageCount > 1 && <span className="label label-muted">{t.messageCount} msgs</span>}
                    {showSpace && <SpaceBadge spaces={spaces} spaceId={t.spaceId} />}
                  </span>
                </span>
                {t.unread && <span className="unread-dot" />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
