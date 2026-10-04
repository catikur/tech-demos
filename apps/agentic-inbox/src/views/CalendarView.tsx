import type { CalendarEvent, Meeting, Space } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { dateLocale, t } from "../i18n.ts";
import { fmtDateTime, untilLabel, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";
import { RichBody } from "../components/RichBody.tsx";
import { BackButton } from "../components/BackButton.tsx";

function LinkedMeeting({ meetingId, render }: { meetingId: string; render?: (meeting: Meeting) => React.ReactNode }) {
  const detail = useData<Meeting | null>(() => api.get(`/api/meetings/${meetingId}`), [meetingId]);
  if (!detail.data) return null;
  return <>{render?.(detail.data)}</>;
}

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
  selectedMeetingId = null,
  onSelectMeeting,
  renderMeetingExtras,
}: {
  spaceId: string | null;
  spaces: Space[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderDetailExtras?: (event: CalendarEvent) => React.ReactNode;
  selectedMeetingId?: string | null;
  onSelectMeeting?: (id: string | null) => void;
  renderMeetingExtras?: (meeting: Meeting) => React.ReactNode;
}) {
  const now = Date.now();
  const list = useData<CalendarEvent[]>(
    () => api.get(`/api/events?${spaceQuery(spaceId)}&from=${now - 2 * 86_400_000}&to=${now + 14 * 86_400_000}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "events"),
  );
  const meetings = useData<Meeting[]>(
    () => api.get(`/api/meetings?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "meetings"),
  );
  const meetingDetail = useData<Meeting | null>(
    () => (selectedMeetingId ? api.get(`/api/meetings/${selectedMeetingId}`) : Promise.resolve(null)),
    [selectedMeetingId],
  );
  const events = list.data ?? [];
  const selected = selectedMeetingId ? null : (events.find((e) => e.id === selectedId) ?? null);
  const recorded = meetings.data ?? [];

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
    <div className={`split split-2 ${selectedId || selectedMeetingId ? "has-selection" : ""}`}>
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
                    onClick={() => {
                      onSelectMeeting?.(null);
                      onSelect(e.id);
                    }}
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
          {recorded.length > 0 && (
            <div className="day-group">
              <div className="day-label">{t("calendar.recorded")}</div>
              {recorded.map((m) => (
                <button
                  key={m.id}
                  className={`event-row ${m.id === selectedMeetingId ? "is-selected" : ""}`}
                  onClick={() => {
                    onSelect(null);
                    onSelectMeeting?.(m.id);
                  }}
                >
                  <span className="event-time">{clock(m.start)}</span>
                  <span className="event-main">
                    <span className="event-title">{m.title}</span>
                    <span className="event-meta">
                      {m.hasTranscript && <span className="pill pill-agent">{t("calendar.transcript")}</span>}
                      {m.hasRecording && <span className="pill">{t("meetings.recording")}</span>}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="pane pane-detail">
        {selectedMeetingId && meetingDetail.data ? (
          <div className="detail scroll">
            <div className="pane-header">
              <BackButton onBack={() => onSelectMeeting?.(null)} />
              <h2 className="detail-title">{meetingDetail.data.title}</h2>
            </div>
            <div className="detail-meta">
              <div>{fmtDateTime(meetingDetail.data.start)}</div>
              {meetingDetail.data.joinUrl && (
                <div>
                  <a href={meetingDetail.data.joinUrl} target="_blank" rel="noreferrer">
                    {t("calendar.join")}
                  </a>
                </div>
              )}
            </div>
            {renderMeetingExtras?.(meetingDetail.data)}
          </div>
        ) : !selected ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <p>{t("calendar.select")}</p>
          </div>
        ) : (
          <div className="detail scroll">
            <div className="pane-header">
              <BackButton onBack={() => onSelect(null)} />
              <h2 className="detail-title">{selected.title}</h2>
            </div>
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
            {selected.meetingId && <LinkedMeeting meetingId={selected.meetingId} render={renderMeetingExtras} />}
          </div>
        )}
      </section>
    </div>
  );
}
