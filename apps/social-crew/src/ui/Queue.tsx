import { useEffect, useState } from "react";
import { DAY_LABELS, WEEK_DATES } from "../engine/timing";
import { PLATFORM_LIMITS, type PlatformId } from "../engine/types";
import { activeItem, type DeskProps } from "./model";

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

export function Queue({ state, dispatch }: DeskProps) {
  const item = activeItem(state);
  const hook = item?.hooks[item.hookIndex]?.text ?? "";
  const [body, setBody] = useState(hook);
  const [slotId, setSlotId] = useState("1-9");

  useEffect(() => {
    setBody(hook);
  }, [hook, item?.id]);

  useEffect(() => {
    const suggested = item?.suggested[0];
    if (suggested) setSlotId(`${suggested.day}-${suggested.hour}`);
  }, [item?.id, item?.suggested]);

  return (
    <div className="stack" data-testid="approval-queue">
      <section className="panel">
        <header className="panel-head">
          <h2>Ask first</h2>
          <p>These toggles stop a matching action. They are not a lock on a shared machine, and replies stay human either way.</p>
        </header>
        <div className="toggles">
          <Toggle
            label="Ask before approve"
            checked={state.askFirst.publish}
            onChange={(value) => dispatch({ type: "set-ask", key: "publish", value })}
          />
          <Toggle
            label="Ask before calendar"
            checked={state.askFirst.schedule}
            onChange={(value) => dispatch({ type: "set-ask", key: "schedule", value })}
          />
          <Toggle
            label="Ask before connecting a tool"
            checked={state.askFirst.connectTool}
            onChange={(value) => dispatch({ type: "set-ask", key: "connectTool", value })}
          />
          <Toggle label="Automated replies" checked={false} disabled onChange={() => undefined} />
        </div>
        <p className="fine">
          {state.askFirst.connectTool
            ? "No posting tool is connected. A connect step would stop and ask."
            : "Connect would still not attach a live tool in this demo."}
        </p>
      </section>
      <div className="split">
        <section className="panel">
          <header className="panel-head">
            <h2>Queue</h2>
            <p>Nothing here is scheduled until it is approved.</p>
          </header>
          <ul className="queue">
            {state.queue.map((entry) => (
              <li key={entry.id}>
                <button type="button" className={entry.id === item?.id ? "on" : ""} onClick={() => dispatch({ type: "select-item", id: entry.id })}>
                  <strong>{entry.topic}</strong>
                  <em className={entry.status}>{entry.status}</em>
                  <span>{entry.scheduledFor ?? "no slot"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          {item ? (
            <>
              <header className="panel-head">
                <h2>{item.topic}</h2>
                <p>{item.status === "scheduled" ? `Local calendar ${item.scheduledFor}` : "Not on the calendar."}</p>
              </header>
              <label>
                Opening line
                <textarea value={body} rows={3} onChange={(event) => setBody(event.target.value)} />
              </label>
              <div className="row">
                <button type="button" className="btn ghost" onClick={() => dispatch({ type: "edit", id: item.id, body })}>
                  Save edit
                </button>
                <button type="button" className="btn" onClick={() => dispatch({ type: "approve", id: item.id, confirmed: false })}>
                  Approve
                </button>
                <button type="button" className="btn danger" onClick={() => dispatch({ type: "reject", id: item.id })}>
                  Reject
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => dispatch({ type: "schedule", id: item.id, slotId, confirmed: false })}
                >
                  Put on calendar
                </button>
              </div>
              {item.intentUrl ? (
                <p className="intent" data-testid="intent-link">
                  <a href={item.intentUrl} target="_blank" rel="noreferrer noopener">
                    Open X intent yourself
                  </a>
                  <code>{item.intentUrl}</code>
                </p>
              ) : (
                <p className="fine">The intent link appears after you approve. It is not opened for you.</p>
              )}
              <div className="previews">
                {(["x", "linkedin", "bluesky", "instagram"] as PlatformId[]).map((platform) => (
                  <article key={platform}>
                    <header>
                      {platform}
                      <span>
                        {item.platforms[platform].length}/{PLATFORM_LIMITS[platform]}
                      </span>
                    </header>
                    <p>{item.platforms[platform]}</p>
                  </article>
                ))}
              </div>
              <div className="calendar" data-testid="calendar">
                <div className="cal-head" />
                {DAY_LABELS.map((label, day) => (
                  <div key={label} className="cal-head">
                    {label}
                    <small>{WEEK_DATES[day]?.slice(5)}</small>
                  </div>
                ))}
                {HOURS.map((hour) => (
                  <HourRow
                    key={hour}
                    hour={hour}
                    slotId={slotId}
                    scheduledFor={item.scheduledFor}
                    suggested={new Set(item.suggested.map((slot) => `${slot.day}-${slot.hour}`))}
                    onPick={setSlotId}
                  />
                ))}
              </div>
            </>
          ) : (
            <p>The queue is empty.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function HourRow({
  hour,
  slotId,
  scheduledFor,
  suggested,
  onPick,
}: {
  hour: number;
  slotId: string;
  scheduledFor: string | null;
  suggested: Set<string>;
  onPick: (id: string) => void;
}) {
  const label = `${String(hour).padStart(2, "0")}:00`;
  return (
    <>
      <div className="cal-hour">{label}</div>
      {DAY_LABELS.map((day, index) => {
        const id = `${index}-${hour}`;
        const scheduled = scheduledFor === `${day} ${label}`;
        const className = ["cell", id === slotId ? "picked" : "", suggested.has(id) ? "suggested" : "", scheduled ? "queued" : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <button key={id} type="button" className={className} onClick={() => onPick(id)}>
            {scheduled ? "queued" : suggested.has(id) ? "best" : ""}
          </button>
        );
      })}
    </>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={disabled ? "toggle locked" : "toggle"}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
