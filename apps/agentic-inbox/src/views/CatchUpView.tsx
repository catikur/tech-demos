import { useEffect, useState } from "react";
import type { CatchUp, Space, SourceRef } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { sourceLabel, t } from "../i18n.ts";
import { ago, fmtDateTime, useData } from "../state.ts";
import { Markdown } from "../components/Markdown.tsx";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";
import { DigestsPanel } from "../components/DigestsPanel.tsx";

const PRESETS: { id: string; labelKey: string; hours?: number }[] = [
  { id: "seen", labelKey: "catchup.sinceSeen" },
  { id: "8", labelKey: "catchup.last8h", hours: 8 },
  { id: "24", labelKey: "catchup.yesterday", hours: 24 },
  { id: "168", labelKey: "catchup.lastWeek", hours: 168 },
  { id: "digests", labelKey: "catchup.digests" },
];

export function CatchUpView({
  spaceId,
  spaces,
  onOpenSource,
  focusDigestId,
}: {
  spaceId: string | null;
  spaces: Space[];
  onOpenSource: (ref: SourceRef) => void;
  focusDigestId?: string | null;
}) {
  const [preset, setPreset] = useState(focusDigestId ? "digests" : "24");
  const p = PRESETS.find((x) => x.id === preset)!;
  const catchup = useData<CatchUp | null>(
    () =>
      preset === "digests"
        ? Promise.resolve(null)
        : api.get(
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
              {t(x.labelKey)}
            </button>
          ))}
        </div>
        {data && (
          <span className="muted small">
            {fmtDateTime(data.fromAt)} → {fmtDateTime(data.toAt)}
          </span>
        )}
      </div>
      {preset === "digests" ? (
        <DigestsPanel spaceId={spaceId} spaces={spaces} focusId={focusDigestId} />
      ) : (
        <div className="split split-2 split-even">
          <section className="pane pane-list pane-wide">
            <div className="pane-header">
              <h2>{t("catchup.summary")}</h2>
            </div>
            <div className="scroll detail">
              {catchup.loading && <p className="muted">{t("catchup.collecting")}</p>}
              {data && <Markdown text={data.summaryMarkdown} />}
              {data && data.sections.length === 0 && <p className="muted">{t("catchup.quiet")}</p>}
            </div>
          </section>
          <section className="pane pane-list pane-wide">
            <div className="pane-header">
              <h2>{t("catchup.ranked")}</h2>
              {data && <span className="badge badge-soft">{t("catchup.items", { n: data.sections.reduce((n, s) => n + s.items.length, 0) })}</span>}
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
                          <span className="pill pill-agent">{sourceLabel(i.source.kind)}</span>
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
      )}
    </div>
  );
}
