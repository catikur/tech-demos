import { useState } from "react";
import type { Meeting, Space, TranscriptLine } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { fmtDateTime, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

function offset(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function MeetingsView({
  spaceId,
  spaces,
  renderDetailExtras,
}: {
  spaceId: string | null;
  spaces: Space[];
  renderDetailExtras?: (meeting: Meeting) => React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useData<Meeting[]>(
    () => api.get(`/api/meetings?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "meetings"),
  );
  const detail = useData<(Meeting & { transcript: TranscriptLine[] | null }) | null>(
    () => (selectedId ? api.get(`/api/meetings/${selectedId}`) : Promise.resolve(null)),
    [selectedId],
    () => false,
  );
  const meetings = list.data ?? [];
  const meeting = detail.data && detail.data.id === selectedId ? detail.data : null;

  return (
    <div className="split split-2">
      <section className="pane pane-list">
        <div className="pane-header">
          <h2>Meetings</h2>
          <span className="badge badge-soft">{meetings.filter((m) => m.hasTranscript).length} with transcript</span>
        </div>
        <ul className="thread-list">
          {meetings.length === 0 && <li className="list-empty">No recorded meetings yet.</li>}
          {meetings.map((m) => (
            <li key={m.id}>
              <button className={`thread-item ${m.id === selectedId ? "is-selected" : ""}`} onClick={() => setSelectedId(m.id)}>
                <span className="avatar avatar-agent">◉</span>
                <span className="thread-main">
                  <span className="thread-top">
                    <span className="thread-sender">{m.title}</span>
                  </span>
                  <span className="thread-snippet">{fmtDateTime(m.start)} · {m.attendees.length} attendees</span>
                  <span className="thread-labels">
                    {m.hasTranscript && <span className="pill pill-agent">transcript</span>}
                    {m.hasRecording && <span className="pill">recording</span>}
                    {spaceId === null && <SpaceBadge spaces={spaces} spaceId={m.spaceId} />}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="pane pane-detail">
        {!meeting ? (
          <div className="empty-state">
            <div className="empty-icon">🎙️</div>
            <p>Select a meeting to read its transcript.</p>
          </div>
        ) : (
          <div className="detail scroll">
            <h2 className="detail-title">{meeting.title}</h2>
            <div className="detail-meta">
              <div>{fmtDateTime(meeting.start)}</div>
              <div>{meeting.attendees.map(senderName).join(", ")}</div>
              {meeting.recordingUrl && (
                <div>
                  <a href={meeting.recordingUrl} target="_blank" rel="noreferrer">
                    Recording
                  </a>
                </div>
              )}
            </div>
            {renderDetailExtras?.(meeting)}
            <h3>Transcript</h3>
            {!meeting.transcript && <p className="muted">No transcript available.</p>}
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
