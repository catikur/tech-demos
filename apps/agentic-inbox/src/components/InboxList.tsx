import type { Thread } from "../types.ts";
import { lastMessage, senderName } from "../types.ts";

const CATEGORY_COLORS: Record<string, string> = {
  newsletter: "#8b7cf6",
  support: "#f97316",
  invite: "#22c55e",
  billing: "#eab308",
  recruiting: "#38bdf8",
  personal: "#f472b6",
  security: "#ef4444",
};

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

function timeLabel(at: number): string {
  const mins = Math.max(1, Math.round((Date.now() - at) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function InboxList({
  threads,
  selectedId,
  unreadCount,
  onSelect,
}: {
  threads: Thread[];
  selectedId: string | null;
  unreadCount: number;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="pane pane-inbox">
      <div className="pane-header">
        <h2>Inbox</h2>
        {unreadCount > 0 && <span className="badge">{unreadCount} unread</span>}
      </div>
      <ul className="thread-list">
        {threads.map((t) => {
          const last = lastMessage(t);
          const name = senderName(last.from);
          const color = CATEGORY_COLORS[t.category] ?? "#94a3b8";
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
                    <span className="thread-time">{timeLabel(last.at)}</span>
                  </span>
                  <span className="thread-subject">{t.subject}</span>
                  <span className="thread-snippet">
                    {last.body.replace(/\s+/g, " ").slice(0, 80)}
                  </span>
                  <span className="thread-labels">
                    <span className="label" style={{ borderColor: `${color}66`, color }}>
                      {t.category}
                    </span>
                    {t.messages.length > 1 && (
                      <span className="label label-muted">{t.messages.length} msgs</span>
                    )}
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
