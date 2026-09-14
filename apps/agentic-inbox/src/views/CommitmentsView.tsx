import { useState } from "react";
import type { Commitment, Space, SourceRef } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { sourceLabel, t } from "../i18n.ts";
import { fmtDateTime, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

function dueLabel(dueAt: number | null): { text: string; cls: string } {
  if (!dueAt) return { text: t("commitments.noDue"), cls: "" };
  const diff = dueAt - Date.now();
  const days = Math.round(diff / 86_400_000);
  if (diff < 0) return { text: t("commitments.overdue", { n: Math.abs(days) || 1 }), cls: "pill-danger" };
  if (days <= 1) return { text: t("commitments.dueSoon"), cls: "pill-warn" };
  return { text: t("commitments.dueIn", { n: days }), cls: "pill-ok" };
}

export function CommitmentsView({
  spaceId,
  spaces,
  onOpenSource,
}: {
  spaceId: string | null;
  spaces: Space[];
  onOpenSource: (ref: SourceRef, prefill?: string) => void;
}) {
  const [status, setStatus] = useState<"open" | "done" | "dropped">("open");
  const list = useData<Commitment[]>(
    () => api.get(`/api/commitments?${spaceQuery(spaceId)}&status=${status}`),
    [spaceId, status],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "commitments"),
  );
  const [busy, setBusy] = useState(false);
  const items = list.data ?? [];
  const mine = items.filter((c) => c.direction === "owed_by_me");
  const theirs = items.filter((c) => c.direction === "owed_to_me");

  const setState = async (c: Commitment, next: Commitment["status"]) => {
    await api.patch(`/api/commitments/${c.id}`, { status: next });
    list.reload();
  };
  const extract = async () => {
    setBusy(true);
    try {
      await api.post(`/api/commitments/extract?${spaceQuery(spaceId)}`);
      list.reload();
    } finally {
      setBusy(false);
    }
  };

  const column = (title: string, rows: Commitment[], hint: string) => (
    <section className="pane pane-list pane-wide">
      <div className="pane-header">
        <h2>{title}</h2>
        <span className="badge badge-soft">{rows.length}</span>
      </div>
      <div className="scroll">
        {rows.length === 0 && <div className="list-empty">{hint}</div>}
        {rows.map((c) => {
          const due = dueLabel(c.dueAt);
          return (
            <article key={c.id} className="card">
              <div className="card-top">
                <strong>{c.counterpartName ?? senderName(c.counterpart)}</strong>
                <span className={`pill ${due.cls}`}>{due.text}</span>
                {spaceId === null && <SpaceBadge spaces={spaces} spaceId={c.spaceId} />}
              </div>
              <p className="card-text">{c.text}</p>
              <div className="card-meta">
                <button className="link-btn" onClick={() => onOpenSource(c.source)}>
                  {t("commitments.from", { kind: sourceLabel(c.source.kind), label: c.source.label })}
                </button>
                <span className="muted small">
                  {c.dueAt ? fmtDateTime(c.dueAt) : ""} · {t("commitments.confidence", { n: Math.round(c.confidence * 100) })}
                </span>
              </div>
              <div className="card-actions">
                {c.status === "open" ? (
                  <>
                    <button className="btn btn-small" onClick={() => void setState(c, "done")}>
                      {t("commitments.markDone")}
                    </button>
                    <button className="btn btn-small btn-ghost" onClick={() => void setState(c, "dropped")}>
                      {t("commitments.drop")}
                    </button>
                    {c.direction === "owed_to_me" && c.source.kind === "thread" && (
                      <button
                        className="btn btn-small"
                        onClick={() =>
                          onOpenSource(
                            c.source,
                            t("commitments.nudgeBody", {
                              name: (c.counterpartName ?? senderName(c.counterpart)).split(" ")[0],
                              text: c.text,
                            }),
                          )
                        }
                      >
                        {t("common.nudge")}
                      </button>
                    )}
                  </>
                ) : (
                  <button className="btn btn-small btn-ghost" onClick={() => void setState(c, "open")}>
                    {t("commitments.reopen")}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="feature">
      <div className="feature-bar">
        <div className="seg">
          {(["open", "done", "dropped"] as const).map((s) => (
            <button key={s} className={`seg-btn ${status === s ? "is-active" : ""}`} onClick={() => setStatus(s)}>
              {t(`commitments.${s}`)}
            </button>
          ))}
        </div>
        <span className="muted small">{t("commitments.hint")}</span>
        <button className="btn btn-small" disabled={busy} onClick={() => void extract()}>
          {busy ? t("commitments.scanning") : t("commitments.rescan")}
        </button>
      </div>
      <div className="split split-2 split-even">
        {column(t("commitments.iOwe"), mine, t("commitments.emptyMine"))}
        {column(t("commitments.owedToMe"), theirs, t("commitments.emptyTheirs"))}
      </div>
    </div>
  );
}
