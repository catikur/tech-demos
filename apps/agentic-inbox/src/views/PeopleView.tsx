import { useState } from "react";
import type { Person, PersonProfile, Space, SourceRef } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { ago, fmtDateTime, initials, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

export function PeopleView({
  spaceId,
  spaces,
  onOpenSource,
}: {
  spaceId: string | null;
  spaces: Space[];
  onOpenSource: (ref: SourceRef) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const list = useData<Person[]>(
    () => api.get(`/api/people?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "people"),
  );
  const profile = useData<PersonProfile | null>(
    () => (selectedId ? api.get(`/api/people/${selectedId}`) : Promise.resolve(null)),
    [selectedId],
    (ev) => ev.type === "data" && (ev.entity === "people" || ev.entity === "commitments"),
  );
  const people = (list.data ?? []).filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.email.includes(query.toLowerCase()));
  const p = profile.data && profile.data.id === selectedId ? profile.data : null;

  const toggleVip = async (person: Person) => {
    await api.patch(`/api/people/${person.id}`, { vip: !person.vip });
    list.reload();
    profile.reload();
  };

  return (
    <div className="split split-2">
      <section className="pane pane-list">
        <div className="pane-header">
          <h2>People</h2>
          <span className="badge badge-soft">{people.length}</span>
        </div>
        <div className="pane-search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" />
        </div>
        <ul className="thread-list">
          {people.map((person) => (
            <li key={person.id}>
              <button className={`thread-item ${person.id === selectedId ? "is-selected" : ""}`} onClick={() => setSelectedId(person.id)}>
                <span className="avatar avatar-agent">{initials(person.name)}</span>
                <span className="thread-main">
                  <span className="thread-top">
                    <span className="thread-sender">
                      {person.vip && "★ "}
                      {person.name}
                    </span>
                  </span>
                  <span className="thread-snippet">{person.email}</span>
                  {spaceId === null && (
                    <span className="thread-labels">
                      <SpaceBadge spaces={spaces} spaceId={person.spaceId} />
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="pane pane-detail">
        {!p ? (
          <div className="empty-state">
            <div className="empty-icon">👤</div>
            <p>Select a person to see their relationship card.</p>
          </div>
        ) : (
          <div className="detail scroll">
            <div className="person-head">
              <span className="avatar avatar-agent avatar-large">{initials(p.name)}</span>
              <div>
                <h2 className="detail-title" style={{ margin: 0 }}>
                  {p.name}
                </h2>
                <div className="muted">{p.email}</div>
              </div>
              <button className={`btn btn-small ${p.vip ? "btn-primary" : ""}`} onClick={() => void toggleVip(p)}>
                {p.vip ? "★ VIP" : "Mark VIP"}
              </button>
            </div>
            <div className="stat-grid">
              <div className="stat">
                <span className="stat-value">{p.lastContactAt ? ago(p.lastContactAt) : "—"}</span>
                <span className="stat-label">last contact</span>
              </div>
              <div className="stat">
                <span className="stat-value">{p.threadCount}</span>
                <span className="stat-label">threads</span>
              </div>
              <div className="stat">
                <span className="stat-value">{p.meetingCount}</span>
                <span className="stat-label">recorded meetings</span>
              </div>
              <div className="stat">
                <span className="stat-value">{p.openCommitments.length}</span>
                <span className="stat-label">open commitments</span>
              </div>
            </div>
            {p.openCommitments.length > 0 && (
              <>
                <h3>Open loops</h3>
                <ul className="plain-list">
                  {p.openCommitments.map((c) => (
                    <li key={c.id}>
                      <span className={`pill ${c.direction === "owed_by_me" ? "pill-warn" : "pill-ok"}`}>{c.direction === "owed_by_me" ? "you owe" : "owes you"}</span> {c.text}
                      {c.dueAt && <span className="muted small"> · {fmtDateTime(c.dueAt)}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {p.upcomingMeetings.length > 0 && (
              <>
                <h3>Upcoming together</h3>
                <ul className="plain-list">
                  {p.upcomingMeetings.map((e) => (
                    <li key={e.id}>
                      <button className="link-btn" onClick={() => onOpenSource({ kind: "event", id: e.id, label: e.title })}>
                        {e.title}
                      </button>{" "}
                      <span className="muted small">{fmtDateTime(e.start)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {p.recentThreads.length > 0 && (
              <>
                <h3>Recent threads</h3>
                <ul className="plain-list">
                  {p.recentThreads.map((t) => (
                    <li key={t.id}>
                      <button className="link-btn" onClick={() => onOpenSource({ kind: "thread", id: t.id, label: t.subject })}>
                        {t.subject}
                      </button>{" "}
                      <span className="muted small">
                        {senderName(t.lastFrom)} · {ago(t.lastAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {p.recentChats.length > 0 && (
              <>
                <h3>Chats</h3>
                <ul className="plain-list">
                  {p.recentChats.map((c) => (
                    <li key={c.id}>
                      <button className="link-btn" onClick={() => onOpenSource({ kind: "chat", id: c.id, label: c.title })}>
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {p.topics.length > 0 && (
              <>
                <h3>Topics</h3>
                <ul className="chip-list">
                  {p.topics.map((t) => (
                    <li key={t} className="chip-static">
                      {t}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3>Your notes</h3>
            <NotesEditor person={p} onSaved={profile.reload} />
          </div>
        )}
      </section>
    </div>
  );
}

function NotesEditor({ person, onSaved }: { person: Person; onSaved: () => void }) {
  const [notes, setNotes] = useState(person.notes);
  const [saved, setSaved] = useState(false);
  return (
    <div className="composer" style={{ border: "1px solid var(--border)", borderRadius: 10 }}>
      <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Preferences, context, things to remember…" />
      <div className="composer-actions">
        {saved && <span className="sent-note">✓ Saved</span>}
        <button
          className="btn btn-small"
          onClick={async () => {
            await api.patch(`/api/people/${person.id}`, { notes });
            setSaved(true);
            onSaved();
            setTimeout(() => setSaved(false), 1500);
          }}
        >
          Save notes
        </button>
      </div>
    </div>
  );
}
