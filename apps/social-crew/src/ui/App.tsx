import { useReducer, useState } from "react";
import { remaining } from "../engine/budget";
import { createInitialDesk, deskReducer } from "../engine/desk";
import { formatSlot, parseSlotId } from "../engine/timing";
import { Analyst } from "./Analyst";
import { Desk } from "./Desk";
import { Ops } from "./Ops";
import { Queue } from "./Queue";
import { Scout } from "./Scout";
import { Studio } from "./Studio";
import { Writer } from "./Writer";
import { TABS, type TabId } from "./model";

function initDesk(): ReturnType<typeof createInitialDesk> {
  return createInitialDesk();
}

export function App() {
  const [state, dispatch] = useReducer(deskReducer, null, initDesk);
  const [tab, setTab] = useState<TabId>("desk");
  const left = remaining(state.spent, state.cap);
  const width = Math.min(100, state.cap === 0 ? 100 : (state.spent / state.cap) * 100);
  const confirm = state.confirm;
  const confirmSlot = confirm?.kind === "schedule" ? parseSlotId(confirm.slotId) : null;

  return (
    <div className="app">
      <header className="mast">
        <div className="mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span className="you" />
        </div>
        <div>
          <p className="kicker">Mock desk · fixtures only</p>
          <h1>Social Crew</h1>
        </div>
        <p className="tag">Six seats. You are the yes.</p>
        <div className="budget" data-testid="budget-meter">
          <span>
            {state.spent}/{state.cap}
            <small>{left < 0 ? " over cap" : ` ${left} left`}</small>
          </span>
          <i>
            <b style={{ width: `${width}%` }} />
          </i>
        </div>
      </header>
      <nav>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {state.notice ? (
        <p className="notice" role="status">
          {state.notice}
        </p>
      ) : null}
      <main>
        {tab === "desk" ? <Desk state={state} dispatch={dispatch} /> : null}
        {tab === "scout" ? <Scout state={state} dispatch={dispatch} /> : null}
        {tab === "writer" ? <Writer state={state} dispatch={dispatch} /> : null}
        {tab === "studio" ? <Studio state={state} dispatch={dispatch} /> : null}
        {tab === "queue" ? <Queue state={state} dispatch={dispatch} /> : null}
        {tab === "analyst" ? <Analyst state={state} dispatch={dispatch} /> : null}
        {tab === "ops" ? <Ops state={state} dispatch={dispatch} /> : null}
      </main>
      <footer>Nothing on this desk calls a network or publishes. An approved X draft only builds an intent link.</footer>
      {confirm ? (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div>
            <h2 id="confirm-title">{confirm.kind === "approve" ? "Approve this draft?" : "Place it on the calendar?"}</h2>
            <p>
              {confirm.kind === "approve"
                ? "It still will not post. You will get an X intent link to open yourself."
                : `Local calendar only${confirmSlot ? `, ${formatSlot(confirmSlot)}` : ""}. This demo does not publish.`}
            </p>
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => dispatch({ type: "dismiss-notice" })}>
                Not yet
              </button>
              {confirm.kind === "approve" ? (
                <button type="button" className="btn" onClick={() => dispatch({ type: "approve", id: confirm.id, confirmed: true })}>
                  Yes, approve
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => dispatch({ type: "schedule", id: confirm.id, slotId: confirm.slotId, confirmed: true })}
                >
                  Yes, queue it
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
