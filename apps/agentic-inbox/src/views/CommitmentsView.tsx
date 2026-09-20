import { useState } from "react";
import type { BoardLane, Commitment, Space, SourceRef } from "../../shared/types.ts";
import { senderName } from "../../shared/types.ts";
import { api, spaceQuery } from "../api/client.ts";
import { sourceLabel, t } from "../i18n.ts";
import { fmtDateTime, useData } from "../state.ts";
import { SpaceBadge } from "../components/SpaceSwitcher.tsx";

const LANES: BoardLane[] = ["todo", "doing", "waiting", "done"];

function dueLabel(dueAt: number | null): { text: string; cls: string } {
  if (!dueAt) return { text: t("commitments.noDue"), cls: "" };
  const diff = dueAt - Date.now();
  const days = Math.round(diff / 86_400_000);
  if (diff < 0) return { text: t("commitments.overdue", { n: Math.abs(days) || 1 }), cls: "pill-danger" };
  if (days <= 1) return { text: t("commitments.dueSoon"), cls: "pill-warn" };
  return { text: t("commitments.dueIn", { n: days }), cls: "pill-ok" };
}

function laneOf(c: Commitment): BoardLane {
  if (c.status === "done") return "done";
  if (c.boardLane === "todo" || c.boardLane === "doing" || c.boardLane === "waiting" || c.boardLane === "done") return c.boardLane;
  return c.direction === "owed_to_me" ? "waiting" : "todo";
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
  const list = useData<Commitment[]>(
    () => api.get(`/api/commitments?${spaceQuery(spaceId)}`),
    [spaceId],
    (ev) => ev.type === "sync" || (ev.type === "data" && ev.entity === "commitments"),
  );
  const [busy, setBusy] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [showDropped, setShowDropped] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<BoardLane | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftWho, setDraftWho] = useState("");
  const items = list.data ?? [];
  const dropped = items.filter((c) => c.status === "dropped");
  const byLane: Record<BoardLane, Commitment[]> = { todo: [], doing: [], waiting: [], done: [] };
  for (const c of items) {
    if (c.status === "dropped") continue;
    byLane[laneOf(c)].push(c);
  }

  const setLane = async (id: string, boardLane: BoardLane) => {
    await api.patch(`/api/commitments/${id}`, { boardLane });
    list.reload();
  };
  const setState = async (c: Commitment, status: Commitment["status"]) => {
    await api.patch(`/api/commitments/${c.id}`, { status });
    list.reload();
  };
  const sendToTodo = async (c: Commitment) => {
    setPushingId(c.id);
    try {
      await api.post(`/api/commitments/${c.id}/todo`);
      list.reload();
    } catch (err) {
      console.error(err);
    } finally {
      setPushingId(null);
    }
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
  const addCard = async () => {
    const text = draftText.trim();
    const counterpart = draftWho.trim();
    if (!text || !counterpart || !spaceId) return;
    setBusy(true);
    try {
      await api.post(`/api/commitments?${spaceQuery(spaceId)}`, {
        spaceId,
        direction: "owed_by_me",
        counterpart,
        text,
      });
      setDraftText("");
      setDraftWho("");
      list.reload();
    } finally {
      setBusy(false);
    }
  };

  const card = (c: Commitment) => {
    const due = dueLabel(c.dueAt);
    return (
      <article
        key={c.id}
        className={`card kanban-card ${dragging === c.id ? "is-dragging" : ""}`}
        draggable
        onDragStart={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("button, select, a, input, textarea")) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData("text/plain", c.id);
          e.dataTransfer.effectAllowed = "move";
          setDragging(c.id);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOverLane(null);
        }}
      >
        <div className="card-top">
          <strong>{c.counterpartName ?? senderName(c.counterpart)}</strong>
          <span className={`pill ${due.cls}`}>{due.text}</span>
          {c.msTaskId && <span className="pill pill-ok">{t("commitments.todoBadge")}</span>}
          {spaceId === null && <SpaceBadge spaces={spaces} spaceId={c.spaceId} />}
        </div>
        <p className="card-text">{c.text}</p>
        <div className="card-meta">
          <button className="link-btn" onClick={() => onOpenSource(c.source)}>
            {t("commitments.from", { kind: sourceLabel(c.source.kind), label: c.source.label })}
          </button>
          {c.dueAt && <span className="muted small">{fmtDateTime(c.dueAt)}</span>}
        </div>
        <div className="card-actions">
          <label className="kanban-move">
            <span className="muted small">{t("commitments.moveLane")}</span>
            <select
              className="kanban-lane-select"
              value={laneOf(c)}
              aria-label={t("commitments.moveLane")}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => void setLane(c.id, e.target.value as BoardLane)}
            >
              {LANES.map((lane) => (
                <option key={lane} value={lane}>
                  {t(`commitments.lane.${lane}`)}
                </option>
              ))}
            </select>
          </label>
          {c.status === "open" ? (
            <>
              <button className="btn btn-small" onClick={() => void setState(c, "done")}>
                {t("commitments.markDone")}
              </button>
              <button className="btn btn-small btn-ghost" onClick={() => void setState(c, "dropped")}>
                {t("commitments.drop")}
              </button>
              {c.direction === "owed_by_me" && !c.msTaskId && (
                <button className="btn btn-small" disabled={pushingId === c.id} onClick={() => void sendToTodo(c)}>
                  {pushingId === c.id ? t("common.sending") : t("commitments.sendToTodo")}
                </button>
              )}
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
  };

  return (
    <div className="feature kanban-feature">
      <div className="feature-bar">
        <h2 className="kanban-title">{t("commitments.boardTitle")}</h2>
        <span className="muted small">{t("commitments.boardHint")}</span>
        <button className="btn btn-small" disabled={busy} onClick={() => void extract()}>
          {busy ? t("commitments.scanning") : t("commitments.rescan")}
        </button>
        <button className={`btn btn-small ${showDropped ? "btn-primary" : ""}`} onClick={() => setShowDropped((v) => !v)}>
          {t("commitments.dropped")} ({dropped.length})
        </button>
      </div>
      <form
        className="kanban-add"
        onSubmit={(e) => {
          e.preventDefault();
          void addCard();
        }}
      >
        <input value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder={t("commitments.addText")} />
        <input value={draftWho} onChange={(e) => setDraftWho(e.target.value)} placeholder={t("commitments.addWho")} />
        <button className="btn btn-small btn-primary" disabled={busy || !draftText.trim() || !draftWho.trim() || !spaceId}>
          {t("commitments.addCard")}
        </button>
      </form>
      <div className="kanban">
        {LANES.map((lane) => (
          <section
            key={lane}
            className={`kanban-col ${overLane === lane ? "is-drop" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverLane(lane);
            }}
            onDragLeave={() => setOverLane((cur) => (cur === lane ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              setOverLane(null);
              setDragging(null);
              if (id) void setLane(id, lane);
            }}
          >
            <div className="pane-header">
              <h2>{t(`commitments.lane.${lane}`)}</h2>
              <span className="badge badge-soft">{byLane[lane].length}</span>
            </div>
            <div className="kanban-cards">
              {byLane[lane].length === 0 && <div className="list-empty">{t(`commitments.laneEmpty.${lane}`)}</div>}
              {byLane[lane].map(card)}
            </div>
          </section>
        ))}
      </div>
      {showDropped && (
        <section className="kanban-dropped">
          <h3>{t("commitments.dropped")}</h3>
          {dropped.length === 0 && <p className="muted small">{t("commitments.emptyDropped")}</p>}
          {dropped.map(card)}
        </section>
      )}
    </div>
  );
}
