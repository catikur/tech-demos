import { useState } from "react";
import type { Space, SourceRef, Topic } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { ago, fmtDateTime, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

const KIND_ICON: Record<SourceRef["kind"], string> = { thread: "✉", chat: "◫", meeting: "◉", event: "▦", manual: "✎" };

export function TopicsView({
  spaceId,
  spaces,
  onOpenSource,
}: {
  spaceId: string | null;
  spaces: Space[];
  onOpenSource: (ref: SourceRef) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useData<Topic[]>(
    () => api.get(`/api/topics?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "topics"),
  );
  const topics = list.data ?? [];
  const selected = topics.find((t) => t.id === selectedId) ?? topics[0] ?? null;

  const rebuild = async () => {
    setBusy(true);
    try {
      await api.post(`/api/topics/rebuild?${spaceQuery(spaceId)}`);
      list.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="feature">
      <div className="feature-bar">
        <span className="muted small">Mail, chats and meetings about the same thing, clustered automatically. Ask the agent “what's the status of …”.</span>
        <button className="btn btn-small" disabled={busy} onClick={() => void rebuild()}>
          {busy ? "Rebuilding…" : "Rebuild topics"}
        </button>
      </div>
      <div className="split split-2">
        <section className="pane pane-list">
          <div className="pane-header">
            <h2>Topics</h2>
            <span className="badge badge-soft">{topics.length}</span>
          </div>
          <ul className="thread-list">
            {topics.length === 0 && <li className="list-empty">No topics yet — they appear once two or more items share a subject.</li>}
            {topics.map((t) => (
              <li key={t.id}>
                <button className={`thread-item ${selected?.id === t.id ? "is-selected" : ""}`} onClick={() => setSelectedId(t.id)}>
                  <span className="avatar avatar-agent">#</span>
                  <span className="thread-main">
                    <span className="thread-top">
                      <span className="thread-sender">{t.name}</span>
                      <span className="thread-time">{ago(t.lastAt)}</span>
                    </span>
                    <span className="thread-snippet">{t.summary}</span>
                    <span className="thread-labels">
                      {t.keywords.slice(0, 4).map((k) => (
                        <span key={k} className="label label-muted">
                          {k}
                        </span>
                      ))}
                      {spaceId === null && <SpaceBadge spaces={spaces} spaceId={t.spaceId} />}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="pane pane-detail">
          {!selected ? (
            <div className="empty-state">
              <div className="empty-icon">🧵</div>
              <p>Select a topic to see its cross-channel timeline.</p>
            </div>
          ) : (
            <div className="detail scroll">
              <h2 className="detail-title">{selected.name}</h2>
              <div className="detail-meta">
                <div>{selected.summary}</div>
                <div>
                  {fmtDateTime(selected.firstAt)} → {fmtDateTime(selected.lastAt)}
                </div>
              </div>
              <h3>Keywords</h3>
              <ul className="chip-list">
                {selected.keywords.map((k) => (
                  <li key={k} className="chip-static">
                    {k}
                  </li>
                ))}
              </ul>
              <h3>Timeline</h3>
              <ol className="timeline">
                {selected.links.map((l) => (
                  <li key={`${l.kind}-${l.id}`}>
                    <button className="event-row" onClick={() => onOpenSource(l)}>
                      <span className="event-time">{KIND_ICON[l.kind]}</span>
                      <span className="event-main">
                        <span className="event-title">{l.label}</span>
                        <span className="event-meta">{l.kind}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
