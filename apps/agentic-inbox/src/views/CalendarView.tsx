import type { CalendarEvent, Space } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { fmtDateTime, untilLabel, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

function dayKey(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long" });
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
          <h2>Calendar</h2>
          <span className="badge badge-soft">{events.filter((e) => e.start > now).length} upcoming</span>
        </div>
        <div className="scroll">
          {events.length === 0 && <div className="list-empty">No events in this window.</div>}
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
                    <span className="event-time">
                      {new Date(e.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="event-main">
                      <span className="event-title">{e.title}</span>
                      <span className="event-meta">
                        {e.attendees.length} attendees · {untilLabel(e.start)}
                        {e.meetingId && <span className="pill pill-agent">transcript</span>}
                        {e.responseStatus === "none" && !past && <span className="pill pill-warn">not responded</span>}
                        {overlaps.has(e.id) && <span className="pill pill-danger">overlaps other space</span>}
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
            <p>Select an event to see details and prepare for it.</p>
          </div>
        ) : (
          <div className="detail scroll">
            <h2 className="detail-title">{selected.title}</h2>
            <div className="detail-meta">
              <div>{fmtDateTime(selected.start)} → {new Date(selected.end).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
              <div>{selected.location || "No location"}</div>
              <div>Organizer: {senderName(selected.organizer)}</div>
              {selected.joinUrl && (
                <div>
                  <a href={selected.joinUrl} target="_blank" rel="noreferrer">
                    Join link
                  </a>
                </div>
              )}
            </div>
            {selected.description && <p className="detail-desc">{selected.description}</p>}
            <h3>Attendees</h3>
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
