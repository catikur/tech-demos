import { useState } from "react";
import type { Digest, Space } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { fmtDateTime, useData } from "../state.ts";
import { Markdown } from "./Markdown.tsx";
import { SpaceBadge } from "./SpaceSwitcher.tsx";

/** Phase 6 — stored daily/weekly digests with a manual "run now" for demos and testing. */
export function DigestsPanel({ spaceId, spaces, focusId }: { spaceId: string | null; spaces: Space[]; focusId?: string | null }) {
  const list = useData<Digest[]>(
    () => api.get(`/api/digests?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "notification" || (ev.type === "data" && ev.entity === "digests"),
  );
  const [selectedId, setSelectedId] = useState<string | null>(focusId ?? null);
  const [busy, setBusy] = useState(false);
  const digests = list.data ?? [];
  const selected = digests.find((d) => d.id === (selectedId ?? focusId)) ?? digests[0] ?? null;

  const run = async (period: "daily" | "weekly") => {
    setBusy(true);
    try {
      const created = await api.post<Digest[]>(`/api/digests/run?${spaceQuery(spaceId)}&period=${period}`);
      list.reload();
      if (created[0]) setSelectedId(created[0].id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="split split-2">
      <section className="pane pane-list">
        <div className="pane-header">
          <h2>Digests</h2>
          <div className="row-actions">
            <button className="btn btn-small" disabled={busy} onClick={() => void run("daily")}>
              Run daily now
            </button>
            <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => void run("weekly")}>
              Weekly
            </button>
          </div>
        </div>
        <ul className="thread-list">
          {digests.length === 0 && <li className="list-empty">No digests yet. They are produced at each space's digest hour, or run one now.</li>}
          {digests.map((d) => (
            <li key={d.id}>
              <button className={`thread-item ${selected?.id === d.id ? "is-selected" : ""}`} onClick={() => setSelectedId(d.id)}>
                <span className="avatar avatar-agent">▤</span>
                <span className="thread-main">
                  <span className="thread-top">
                    <span className="thread-sender">{d.period === "weekly" ? "Weekly" : "Daily"} digest</span>
                    <span className="thread-time">{fmtDateTime(d.createdAt)}</span>
                  </span>
                  <span className="thread-snippet">
                    {fmtDateTime(d.fromAt)} → {fmtDateTime(d.toAt)}
                  </span>
                  {spaceId === null && (
                    <span className="thread-labels">
                      <SpaceBadge spaces={spaces} spaceId={d.spaceId} />
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="pane pane-detail">
        {!selected ? (
          <div className="empty-state">
            <div className="empty-icon">▤</div>
            <p>Select a digest.</p>
          </div>
        ) : (
          <div className="detail scroll">
            <Markdown text={selected.bodyMarkdown} />
          </div>
        )}
      </section>
    </div>
  );
}
