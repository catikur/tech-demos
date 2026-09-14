import { useEffect, useState } from "react";
import type { CatchUp, Space, SourceRef } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { ago, fmtDateTime, useData } from "../state.ts";
import { Markdown } from "../components/Markdown.tsx";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

const PRESETS: { id: string; label: string; hours?: number }[] = [
  { id: "seen", label: "Since I last looked" },
  { id: "8", label: "Last 8 hours", hours: 8 },
  { id: "24", label: "Since yesterday", hours: 24 },
  { id: "168", label: "Last week", hours: 168 },
];

export function CatchUpView({
  spaceId,
  spaces,
  onOpenSource,
}: {
  spaceId: string | null;
  spaces: Space[];
  onOpenSource: (ref: SourceRef) => void;
}) {
  const [preset, setPreset] = useState("24");
  const p = PRESETS.find((x) => x.id === preset)!;
  const catchup = useData<CatchUp>(
    () =>
      api.get(
        p.hours ? `/api/catchup?${spaceQuery(spaceId)}&from=${Date.now() - p.hours * 3_600_000}` : `/api/catchup?${spaceQuery(spaceId)}&preset=seen`,
      ),
    [spaceId, preset],
    () => false,
  );

  // Leaving the view marks the window as seen, so "since I last looked" is meaningful next time.
  useEffect(() => {
    return () => {
      void api.post(`/api/catchup/seen?${spaceQuery(spaceId)}`);
    };
  }, [spaceId]);

  const data = catchup.data;
  return (
    <div className="feature">
      <div className="feature-bar">
        <div className="seg">
          {PRESETS.map((x) => (
            <button key={x.id} className={`seg-btn ${preset === x.id ? "is-active" : ""}`} onClick={() => setPreset(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        {data && (
          <span className="muted small">
            {fmtDateTime(data.fromAt)} → {fmtDateTime(data.toAt)}
          </span>
        )}
      </div>
      <div className="split split-2 split-even">
        <section className="pane pane-list pane-wide">
          <div className="pane-header">
            <h2>Summary</h2>
          </div>
          <div className="scroll detail">
            {catchup.loading && <p className="muted">Collecting…</p>}
            {data && <Markdown text={data.summaryMarkdown} />}
            {data && data.sections.length === 0 && <p className="muted">Nothing happened in this window. Enjoy the quiet.</p>}
          </div>
        </section>
        <section className="pane pane-list pane-wide">
          <div className="pane-header">
            <h2>Everything, ranked</h2>
            {data && <span className="badge badge-soft">{data.sections.reduce((n, s) => n + s.items.length, 0)} items</span>}
          </div>
          <div className="scroll">
            {data?.sections.map((s) => (
              <div key={s.title} className="day-group">
                <div className="day-label">{s.title}</div>
                {s.items.map((i, idx) => (
                  <button key={`${i.source.kind}-${i.source.id}-${idx}`} className="event-row" onClick={() => onOpenSource(i.source)}>
                    <span className="event-time">{ago(i.at)}</span>
                    <span className="event-main">
                      <span className="event-title">{i.title}</span>
                      <span className="event-meta">{i.excerpt}</span>
                      <span className="event-meta">
                        <span className="pill">{i.reason}</span>
                        <span className="pill pill-agent">{i.source.kind}</span>
                        {spaceId === null && <SpaceBadge spaces={spaces} spaceId={i.spaceId} />}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
