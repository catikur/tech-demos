import type { Meeting, Space, TranscriptLine } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { t } from "../i18n.ts";
import { fmtDateTime, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

function offset(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function MeetingsView({
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
  renderDetailExtras?: (meeting: Meeting) => React.ReactNode;
}) {
  const setSelectedId = onSelect;
  const list = useData<Meeting[]>(
    () => api.get(`/api/meetings?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "meetings"),
  );
  const detail = useData<(Meeting & { transcript: TranscriptLine[] | null }) | null>(
    () => (selectedId ? api.get(`/api/meetings/${selectedId}`) : Promise.resolve(null)),
    [selectedId],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "meetings"),
  );
  const meetings = list.data ?? [];
  const meeting = detail.data && detail.data.id === selectedId ? detail.data : null;

  return (
    <div className="split split-2">
      <section className="pane pane-list">
        <div className="pane-header">
          <h2>{t("meetings.title")}</h2>
          <span className="badge badge-soft">{t("meetings.withTranscript", { n: meetings.filter((m) => m.hasTranscript).length })}</span>
        </div>
        <ul className="thread-list">
          {meetings.length === 0 && <li className="list-empty">{t("meetings.empty")}</li>}
          {meetings.map((m) => (
            <li key={m.id}>
              <button className={`thread-item ${m.id === selectedId ? "is-selected" : ""}`} onClick={() => setSelectedId(m.id)}>
                <span className="avatar avatar-agent">◉</span>
                <span className="thread-main">
                  <span className="thread-top">
                    <span className="thread-sender">{m.title}</span>
                  </span>
                  <span className="thread-snippet">{t("meetings.snippet", { when: fmtDateTime(m.start), n: m.attendees.length })}</span>
                  <span className="thread-labels">
                    {m.hasTranscript && <span className="pill pill-agent">{t("calendar.transcript")}</span>}
                    {m.recordingLocked && <span className="pill pill-warn">{t("meetings.lockedRecording")}</span>}
                    {m.hasRecording && !m.recordingLocked && <span className="pill">{t("meetings.recording")}</span>}
                    {!m.hasTranscript && <span className="pill">{t("briefing.calendarOnly")}</span>}
                    {spaceId === null && <SpaceBadge spaces={spaces} spaceId={m.spaceId} />}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="pane pane-detail">
        {!selectedId ? (
          <div className="empty-state">
            <div className="empty-icon">🎙️</div>
            <p>{t("meetings.select")}</p>
          </div>
        ) : !meeting ? (
          <p className="muted" style={{ padding: 16 }}>
            {t("common.loading")}
          </p>
        ) : (
          <div className="detail scroll">
            <h2 className="detail-title">{meeting.title}</h2>
            <div className="detail-meta">
              <div>{fmtDateTime(meeting.start)}</div>
              <div>{meeting.attendees.map(senderName).join(", ")}</div>
              {meeting.joinUrl && (
                <div>
                  <a href={meeting.joinUrl} target="_blank" rel="noreferrer">
                    {t("calendar.join")}
                  </a>
                </div>
              )}
              {meeting.recordingUrl && (
                <div>
                  <a href={meeting.recordingUrl} target="_blank" rel="noreferrer">
                    {meeting.recordingLocked ? t("meetings.openInTeams") : t("meetings.recordingLink")}
                  </a>
                  {meeting.recordingLocked && <span className="muted small"> — {t("meetings.lockedHint")}</span>}
                </div>
              )}
            </div>
            {renderDetailExtras?.(meeting)}
            <h3>{t("meetings.transcript")}</h3>
            {!meeting.transcript && <p className="muted">{t("meetings.noTranscript")}</p>}
            {meeting.transcript && (
              <ol className="transcript">
                {meeting.transcript.map((l, i) => (
                  <li key={i}>
                    <span className="transcript-time">{offset(l.at)}</span>
                    <span className="transcript-speaker">{senderName(l.speaker)}</span>
                    <span className="transcript-text">{l.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
