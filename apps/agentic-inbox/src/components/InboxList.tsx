import type { Space, ThreadSummary } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { t } from "../i18n.ts";
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
        <h2>{t("inbox.title")}</h2>
        {unreadCount > 0 && <span className="badge">{t("inbox.unread", { n: unreadCount })}</span>}
      </div>
      <div className="pane-search">
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t("inbox.search")} />
      </div>
      <ul className="thread-list">
        {loading && <li className="list-empty">{t("common.loading")}</li>}
        {!loading && threads.length === 0 && <li className="list-empty">{query ? t("inbox.emptyMatch") : t("inbox.empty")}</li>}
        {threads.map((thread) => {
          const name = senderName(thread.lastFrom);
          const color = CATEGORY_COLORS[thread.category] ?? CATEGORY_COLORS.other;
          return (
            <li key={thread.id}>
              <button
                className={`thread-item ${thread.id === selectedId ? "is-selected" : ""} ${thread.unread ? "is-unread" : ""}`}
                onClick={() => onSelect(thread.id)}
              >
                <span className="avatar" style={{ background: `${color}26`, color }}>
                  {initials(name)}
                </span>
                <span className="thread-main">
                  <span className="thread-top">
                    <span className="thread-sender">{name}</span>
                    <span className="thread-time">{ago(thread.lastAt)}</span>
                  </span>
                  <span className="thread-subject">{thread.subject}</span>
                  <span className="thread-snippet">{thread.snippet}</span>
                  <span className="thread-labels">
                    <span className="label" style={{ borderColor: `${color}66`, color }}>
                      {t(`category.${thread.category}`)}
                    </span>
                    {thread.messageCount > 1 && <span className="label label-muted">{t("inbox.msgs", { n: thread.messageCount })}</span>}
                    {showSpace && <SpaceBadge spaces={spaces} spaceId={thread.spaceId} />}
                  </span>
                </span>
                {thread.unread && <span className="unread-dot" />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
