import type { RadarItem, Space, SourceRef } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { sourceLabel, t } from "../i18n.ts";
import { initials, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

function age(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return t("time.agoMinutes", { n: Math.round(ms / 60_000) });
  if (h < 48) return t("time.agoHours", { n: Math.round(h) });
  return t("time.agoDays", { n: Math.round(h / 24) });
}

function ageClass(ms: number): string {
  const h = ms / 3_600_000;
  if (h > 48) return "age-hot";
  if (h > 12) return "age-warm";
  return "age-cool";
}

export function RadarView({
  spaceId,
  spaces,
  onOpenSource,
}: {
  spaceId: string | null;
  spaces: Space[];
  onOpenSource: (ref: SourceRef, prefill?: string) => void;
}) {
  const radar = useData<RadarItem[]>(
    () => api.get(`/api/radar?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && (ev.entity === "threads" || ev.entity === "chats" || ev.entity === "people")),
  );
  const items = radar.data ?? [];
  const me = items.filter((i) => i.direction === "waiting_on_me");
  const them = items.filter((i) => i.direction === "waiting_on_them");

  const column = (title: string, rows: RadarItem[], empty: string, action: string) => (
    <section className="pane pane-list pane-wide">
      <div className="pane-header">
        <h2>{title}</h2>
        <span className="badge badge-soft">{rows.length}</span>
      </div>
      <div className="scroll">
        {rows.length === 0 && <div className="list-empty">{empty}</div>}
        {rows.map((i) => (
          <article key={i.id} className={`card radar-card ${ageClass(i.ageMs)}`}>
            <div className="card-top">
              <span className="avatar avatar-small">{initials(senderName(i.counterpart))}</span>
              <strong>{senderName(i.counterpart)}</strong>
              {i.vip && <span className="pill pill-warn">★ {t("common.vip")}</span>}
              <span className="pill">{age(i.ageMs)}</span>
              <span className="pill pill-agent">{sourceLabel(i.source.kind)}</span>
              {spaceId === null && <SpaceBadge spaces={spaces} spaceId={i.spaceId} />}
            </div>
            <div className="card-subject">{i.source.label}</div>
            <p className="card-text">{i.excerpt}</p>
            <div className="age-bar">
              <span style={{ width: `${Math.min(100, (i.ageMs / (72 * 3_600_000)) * 100)}%` }} />
            </div>
            <div className="card-actions">
              <button className="btn btn-small btn-primary" onClick={() => onOpenSource(i.source, i.source.kind === "thread" ? i.suggestedReply : undefined)}>
                {action}
              </button>
              <button className="btn btn-small btn-ghost" onClick={() => onOpenSource(i.source)}>
                {t("common.open")}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  return (
    <div className="feature">
      <div className="feature-bar">
        <span className="muted small">{t("radar.hint")}</span>
        <button className="btn btn-small" onClick={radar.reload}>
          {t("common.refresh")}
        </button>
      </div>
      <div className="split split-2 split-even">
        {column(t("radar.waitingOnYou"), me, t("radar.emptyMine"), t("radar.replySuggest"))}
        {column(t("radar.waitingOnThem"), them, t("radar.emptyTheirs"), t("common.nudge"))}
      </div>
    </div>
  );
}
