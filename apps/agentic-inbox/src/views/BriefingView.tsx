import { useState } from "react";
import type { MorningBriefing, ProposedDraft, Space, SourceRef } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { t } from "../i18n.ts";
import { fmtDateTime, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

export function BriefingView({
  spaceId,
  spaces,
  onOpenSource,
  onOpenDraft,
}: {
  spaceId: string | null;
  spaces: Space[];
  onOpenSource: (ref: SourceRef) => void;
  onOpenDraft: (threadId: string, body: string) => void;
}) {
  const briefing = useData<MorningBriefing>(
    () => api.get(`/api/briefing?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && (ev.entity === "drafts" || ev.entity === "commitments")),
  );
  const data = briefing.data;
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, status: "accepted" | "dismissed", draft?: ProposedDraft) => {
    setBusy(id);
    try {
      await api.patch(`/api/drafts/${id}`, { status });
      if (status === "accepted" && draft) onOpenDraft(draft.threadId, draft.body);
      briefing.reload();
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setBusy("gen");
    try {
      await api.post(`/api/drafts?${spaceQuery(spaceId)}`);
      briefing.reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="feature">
      <div className="feature-bar">
        <h2 style={{ margin: 0 }}>{t("briefing.title")}</h2>
        <span className="muted small">{t("briefing.hint")}</span>
        <button className="btn btn-small" disabled={busy !== null} onClick={() => void generate()}>
          {busy === "gen" ? t("briefing.generating") : t("briefing.generateDrafts")}
        </button>
        <button
          className="btn btn-small"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("teams");
            try {
              await api.post(`/api/org/briefing/post?${spaceQuery(spaceId)}`);
              briefing.reload();
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "teams" ? t("org.posting") : t("org.postNow")}
        </button>
      </div>
      {briefing.loading && !data && <p className="muted" style={{ padding: 16 }}>{t("common.loading")}</p>}
      {data && (
        <div className="briefing-grid">
          <section className="card briefing-lead">
            <div className="card-top">
              <strong>{t("briefing.doNow")}</strong>
            </div>
            <p className="briefing-summary">
              {t("briefing.summaryLine", {
                events: data.events.length,
                actions: data.dueCommitments.filter((c) => c.direction === "owed_by_me").length + data.waitingOnMe.length,
                unread: data.unread.length,
                drafts: data.drafts.length,
              })}
            </p>
            {data.dueCommitments
              .filter((c) => c.direction === "owed_by_me")
              .slice(0, 4)
              .map((c) => (
                <div key={c.id} className="briefing-item is-static">
                  <span>{c.text}</span>
                  <span className="muted small">{c.counterpartName ?? senderName(c.counterpart)}</span>
                </div>
              ))}
            {data.waitingOnMe.slice(0, 4).map((r) => (
              <button key={r.id} className="briefing-item" onClick={() => onOpenSource(r.source)}>
                <span>
                  {t("briefing.replyPrefix")} {r.source.label}
                </span>
                <span className="muted small">{senderName(r.counterpart)}</span>
              </button>
            ))}
            {data.waitingOnMe.length === 0 && data.dueCommitments.every((c) => c.direction !== "owed_by_me") && (
              <p className="muted small">{t("briefing.noActions")}</p>
            )}
          </section>
          <section className="card">
            <div className="card-top">
              <strong>{t("briefing.today")}</strong>
              <span className="badge badge-soft">{data.events.length}</span>
            </div>
            {data.events.length === 0 && <p className="muted small">{t("briefing.noEvents")}</p>}
            {data.events.map((e) => (
              <button key={e.id} className="briefing-item" onClick={() => onOpenSource({ kind: "event", id: e.id, label: e.title })}>
                <span>{e.title}</span>
                <span className="muted small">{fmtDateTime(e.start)}</span>
                {spaceId === null && <SpaceBadge spaces={spaces} spaceId={e.spaceId} />}
              </button>
            ))}
          </section>
          <section className="card">
            <div className="card-top">
              <strong>{t("briefing.unread")}</strong>
              <span className="badge badge-soft">{data.unread.length}</span>
            </div>
            {data.unread.length === 0 && <p className="muted small">{t("briefing.noUnread")}</p>}
            {data.unread.map((th) => (
              <button key={th.id} className="briefing-item" onClick={() => onOpenSource({ kind: "thread", id: th.id, label: th.subject })}>
                <span>{th.subject}</span>
                <span className="muted small">{senderName(th.lastFrom)}</span>
              </button>
            ))}
          </section>
          <section className="card">
            <div className="card-top">
              <strong>{t("briefing.due")}</strong>
              <span className="badge badge-soft">{data.dueCommitments.length}</span>
            </div>
            <p className="muted small">{t("briefing.dueHint")}</p>
            {data.dueCommitments.length === 0 && <p className="muted small">{t("briefing.noDue")}</p>}
            {data.dueCommitments.map((c) => (
              <div key={c.id} className="briefing-item is-static">
                <span>{c.text}</span>
                <span className="muted small">{c.counterpartName ?? senderName(c.counterpart)}</span>
              </div>
            ))}
          </section>
          <section className="card">
            <div className="card-top">
              <strong>{t("briefing.drafts")}</strong>
              <span className="badge badge-soft">{data.drafts.length}</span>
            </div>
            {data.drafts.length === 0 && <p className="muted small">{t("briefing.noDrafts")}</p>}
            {data.drafts.map((d) => (
              <div key={d.id} className="briefing-item is-static">
                <span>{d.subject}</span>
                <p className="muted small" style={{ whiteSpace: "pre-wrap", maxHeight: 72, overflow: "hidden" }}>
                  {d.body.slice(0, 180)}
                </p>
                <div className="row-actions">
                  <button className="btn btn-small btn-primary" disabled={busy !== null} onClick={() => void act(d.id, "accepted", d)}>
                    {t("briefing.useDraft")}
                  </button>
                  <button className="btn btn-small btn-ghost" disabled={busy !== null} onClick={() => void act(d.id, "dismissed")}>
                    {t("briefing.dismiss")}
                  </button>
                </div>
              </div>
            ))}
          </section>
          <section className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-top">
              <strong>{t("briefing.meetings")}</strong>
              <span className="badge badge-soft">{data.recentMeetings.length}</span>
            </div>
            <p className="muted small">{t("briefing.meetingsHint")}</p>
            {data.recentMeetings.length === 0 && <p className="muted small">{t("briefing.noMeetings")}</p>}
            {data.recentMeetings.map((m) => (
              <button key={m.id} className="briefing-item" onClick={() => onOpenSource({ kind: "meeting", id: m.id, label: m.title })}>
                <span>{m.title}</span>
                <span className="muted small">
                  {fmtDateTime(m.start)}
                  {m.hasTranscript ? ` · ${t("calendar.transcript")}` : ` · ${t("briefing.noTranscript")}`}
                  {m.recordingLocked ? ` · ${t("meetings.lockedRecording")}` : m.hasRecording ? ` · ${t("meetings.recording")}` : ""}
                </span>
              </button>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
