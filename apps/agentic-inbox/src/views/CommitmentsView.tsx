import { useState } from "react";
import type { Commitment, Space, SourceRef } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { fmtDateTime, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

function dueLabel(dueAt: number | null): { text: string; cls: string } {
  if (!dueAt) return { text: "no due date", cls: "" };
  const diff = dueAt - Date.now();
  const days = Math.round(diff / 86_400_000);
  if (diff < 0) return { text: `overdue ${Math.abs(days) || 1}d`, cls: "pill-danger" };
  if (days <= 1) return { text: "due today/tomorrow", cls: "pill-warn" };
  return { text: `due in ${days}d`, cls: "pill-ok" };
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
                  from {c.source.kind}: {c.source.label}
                </button>
                <span className="muted small">
                  {c.dueAt ? fmtDateTime(c.dueAt) : ""} · confidence {Math.round(c.confidence * 100)}%
                </span>
              </div>
              <div className="card-actions">
                {c.status === "open" ? (
                  <>
                    <button className="btn btn-small" onClick={() => void setState(c, "done")}>
                      Done
                    </button>
                    <button className="btn btn-small btn-ghost" onClick={() => void setState(c, "dropped")}>
                      Drop
                    </button>
                    {c.direction === "owed_to_me" && c.source.kind === "thread" && (
                      <button
                        className="btn btn-small"
                        onClick={() =>
                          onOpenSource(
                            c.source,
                            `Hi ${(c.counterpartName ?? senderName(c.counterpart)).split(" ")[0]},\n\nQuick nudge on this: "${c.text}" — any update? Happy to help if something is blocking.\n\nThanks!`,
                          )
                        }
                      >
                        Nudge
                      </button>
                    )}
                  </>
                ) : (
                  <button className="btn btn-small btn-ghost" onClick={() => void setState(c, "open")}>
                    Reopen
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
              {s}
            </button>
          ))}
        </div>
        <span className="muted small">Promises and asks extracted from mail, chats and transcripts — both directions.</span>
        <button className="btn btn-small" disabled={busy} onClick={() => void extract()}>
          {busy ? "Scanning…" : "Re-scan now"}
        </button>
      </div>
      <div className="split split-2 split-even">
        {column("I owe", mine, "Nothing you owe anyone. Nice.")}
        {column("Owed to me", theirs, "Nobody owes you anything right now.")}
      </div>
    </div>
  );
}
