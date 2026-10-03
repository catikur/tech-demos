import type { HomeDashboard, SourceRef, Space } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { t } from "../i18n.ts";
import { fmtDateTime, useData } from "../state.ts";

export function HomeView({
  spaceId,
  spaces,
  onOpenSource,
}: {
  spaceId: string | null;
  spaces: Space[];
  onOpenSource: (ref: SourceRef) => void;
}) {
  const home = useData<HomeDashboard>(
    () => api.get(`/api/home?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && (ev.entity === "drafts" || ev.entity === "commitments" || ev.entity === "threads")),
  );
  const data = home.data;
  return (
    <div className="feature">
      <div className="feature-bar">
        <h2 style={{ margin: 0 }}>{t("home.title")}</h2>
        <span className="muted small">{t("home.hint")}</span>
      </div>
      {home.loading && !data && <p className="muted" style={{ padding: 16 }}>{t("common.loading")}</p>}
      {data && (
        <div className="home-grid">
          {data.nextMeeting && (
            <button
              type="button"
              className="card home-next"
              onClick={() => onOpenSource({ kind: "event", id: data.nextMeeting!.id, label: data.nextMeeting!.title })}
            >
              <span className="muted small">{t("home.next")}</span>
              <strong>{data.nextMeeting.title}</strong>
              <span className="muted small">{fmtDateTime(data.nextMeeting.start)} · {t("home.prepare")}</span>
            </button>
          )}
          {data.cards.map((card) => (
            <section key={card.id} className="card home-card">
              <div className="card-top">
                <strong>{t(`home.card.${card.id}`)}</strong>
                <span className="badge">{card.count}</span>
              </div>
              {card.lines.length === 0 && <p className="muted small">{t("home.none")}</p>}
              {card.lines.map((line) => (
                <button key={`${line.source.kind}-${line.source.id}`} type="button" className="briefing-item" onClick={() => onOpenSource(line.source)}>
                  <span>{line.title}</span>
                  <span className="event-meta">{line.detail}</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
