import type { PersonProfile } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { ago, initials, useData } from "../state.ts";

/** Feature 7 — compact relationship card shown while you read/write to someone. */
export function PersonChip({ spaceId, email }: { spaceId: string; email: string }) {
  const profile = useData<PersonProfile | null>(
    () => api.get(`/api/people/by-email?${spaceQuery(spaceId)}&email=${encodeURIComponent(email)}`),
    [spaceId, email],
    (ev) => ev.type === "data" && (ev.entity === "people" || ev.entity === "commitments"),
  );
  const p = profile.data;
  if (!p) return null;
  const owe = p.openCommitments.filter((c) => c.direction === "owed_by_me").length;
  const owed = p.openCommitments.length - owe;
  return (
    <div className="person-chip" title={p.notes || undefined}>
      <span className="avatar avatar-small avatar-agent">{initials(p.name)}</span>
      <span className="person-chip-main">
        <span className="person-chip-name">
          {p.vip && "★ "}
          {p.name}
        </span>
        <span className="person-chip-meta">
          last contact {p.lastContactAt ? ago(p.lastContactAt) : "—"} · {p.threadCount} threads · {p.meetingCount} meetings
          {owe > 0 && <span className="pill pill-warn">you owe {owe}</span>}
          {owed > 0 && <span className="pill pill-ok">owes you {owed}</span>}
          {p.upcomingMeetings[0] && <span className="pill pill-agent">next: {p.upcomingMeetings[0].title}</span>}
        </span>
      </span>
    </div>
  );
}
