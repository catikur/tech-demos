import type { CalendarEvent, Space } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { dateLocale, t } from "../i18n.ts";
import { fmtDateTime, untilLabel, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";
import { RichBody } from "../components/RichBody.tsx";

function dayKey(at: number): string {
  return new Date(at).toLocaleDateString(dateLocale, { weekday: "long", day: "2-digit", month: "long" });
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
}

export function CalendarView({
  spaceId,
  spaces,
  selectedId,
  onSelect,
  renderDetailExtras,
}: {
  spaceId: string | null;
  spaces: Space[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderDetailExtras?: (event: CalendarEvent) => React.ReactNode;
}) {
  const now = Date.now();
  const list = useData<CalendarEvent[]>(
    () => api.get(`/api/events?${spaceQuery(spaceId)}&from=${now - 2 * 86_400_000}&to=${now + 14 * 86_400_000}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "events"),
  );
  const events = list.data ?? [];
  const selected = events.find((e) => e.id === selectedId) ?? null;

  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = dayKey(e.start);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }

  // Overlap detection across spaces (only meaningful in the "All" view).
  const overlaps = new Set<string>();
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      if (a.spaceId !== b.spaceId && a.start < b.end && b.start < a.end) {
        overlaps.add(a.id);
        overlaps.add(b.id);
      }
    }
  }

  return (
    <div className="split split-2">
      <section className="pane pane-list pane-wide">
        <div className="pane-header">
          <h2>{t("calendar.title")}</h2>
          <span className="badge badge-soft">{t("calendar.upcoming", { n: events.filter((e) => e.start > now).length })}</span>
        </div>
        <div className="scroll">
          {events.length === 0 && <div className="list-empty">{t("calendar.empty")}</div>}
          {[...groups.entries()].map(([day, evs]) => (
            <div key={day} className="day-group">
              <div className="day-label">{day}</div>
              {evs.map((e) => {
                const past = e.end < now;
                return (
                  <button
                    key={e.id}
                    className={`event-row ${e.id === selectedId ? "is-selected" : ""} ${past ? "is-past" : ""}`}
                    onClick={() => onSelect(e.id)}
                  >
                    <span className="event-time">{clock(e.start)}</span>
                    <span className="event-main">
                      <span className="event-title">{e.title}</span>
                      <span className="event-meta">
                        {t("calendar.attendeesMeta", { n: e.attendees.length, when: untilLabel(e.start) })}
                        {e.meetingId && <span className="pill pill-agent">{t("calendar.transcript")}</span>}
                        {e.responseStatus === "none" && !past && <span className="pill pill-warn">{t("calendar.notResponded")}</span>}
                        {overlaps.has(e.id) && <span className="pill pill-danger">{t("calendar.overlap")}</span>}
                      </span>
                    </span>
                    {spaceId === null && <SpaceBadge spaces={spaces} spaceId={e.spaceId} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <section className="pane pane-detail">
        {!selected ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <p>{t("calendar.select")}</p>
          </div>
        ) : (
          <div className="detail scroll">
            <h2 className="detail-title">{selected.title}</h2>
            <div className="detail-meta">
              <div>
                {fmtDateTime(selected.start)} → {clock(selected.end)}
              </div>
              <div>{selected.location || t("calendar.noLocation")}</div>
              <div>{t("calendar.organizer", { name: senderName(selected.organizer) })}</div>
              {selected.joinUrl && (
                <div>
                  <a href={selected.joinUrl} target="_blank" rel="noreferrer">
                    {t("calendar.join")}
                  </a>
                </div>
              )}
            </div>
            {selected.description && (
              <RichBody className="detail-desc" text={selected.description} html={selected.descriptionHtml} />
            )}
            <h3>{t("calendar.attendees")}</h3>
            <ul className="chip-list">
              {selected.attendees.map((a) => (
                <li key={a} className="chip-static">
                  {senderName(a)}
                </li>
              ))}
            </ul>
            {renderDetailExtras?.(selected)}
          </div>
        )}
      </section>
    </div>
  );
}
