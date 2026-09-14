import { useEffect, useState } from "react";
import type { CalendarEvent, MeetingBrief } from "../../shared/types.ts";
import { api } from "../api/client.ts";
import { t } from "../i18n.ts";
import { Markdown } from "./Markdown.tsx";

/** Feature 2 — on-demand (and scheduler-produced) pre-meeting brief, shown in the event detail. */
export function BriefPanel({ event }: { event: CalendarEvent }) {
  const [brief, setBrief] = useState<MeetingBrief | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const load = async (refresh = false) => {
    setState("loading");
    try {
      setBrief(await api.get<MeetingBrief>(`/api/events/${event.id}/brief${refresh ? "?refresh=1" : ""}`));
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  // Show a brief the scheduler already prepared without asking the user to click.
  useEffect(() => {
    let cancelled = false;
    setBrief(null);
    api
      .get<MeetingBrief | null>(`/api/events/${event.id}/brief?existing=1`)
      .then((b) => !cancelled && b && setBrief(b))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  if (event.attendees.length < 2) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <h3 style={{ margin: 0 }}>{t("brief.title")}</h3>
        <div className="row-actions">
          <button className="btn btn-small btn-primary" disabled={state === "loading"} onClick={() => void load(false)}>
            {state === "loading" ? t("brief.preparing") : brief ? t("common.reload") : t("brief.prepare")}
          </button>
          {brief && (
            <button className="btn btn-small btn-ghost" disabled={state === "loading"} onClick={() => void load(true)}>
              {t("common.regenerate")}
            </button>
          )}
        </div>
      </div>
      {state === "error" && <div className="error-note">{error}</div>}
      {!brief && state !== "loading" && <p className="muted small">{t("brief.hint")}</p>}
      {brief && <Markdown text={brief.bodyMarkdown} />}
    </div>
  );
}
