import type { PersonProfile } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { t } from "../i18n.ts";
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
          {t("person.lastContact", {
            rel: p.lastContactAt ? ago(p.lastContactAt) : "—",
            threads: p.threadCount,
            meetings: p.meetingCount,
          })}
          {owe > 0 && <span className="pill pill-warn">{t("person.youOwe", { n: owe })}</span>}
          {owed > 0 && <span className="pill pill-ok">{t("person.owesYou", { n: owed })}</span>}
          {p.upcomingMeetings[0] && <span className="pill pill-agent">{t("person.next", { title: p.upcomingMeetings[0].title })}</span>}
        </span>
      </span>
    </div>
  );
}
