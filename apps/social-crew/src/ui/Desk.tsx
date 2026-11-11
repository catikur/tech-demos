import { useEffect, useState } from "react";
import { FULL_RUN_COST } from "../engine/budget";
import { activeItem, AGENT_COLOR, type DeskProps } from "./model";

const SUBJECTS = ["ai agents", "local-first notes", "developer tools"];

export function Desk({ state, dispatch }: DeskProps) {
  const [shown, setShown] = useState(state.steps.length);
  const [seed] = useState(state.steps);

  useEffect(() => {
    if (state.steps === seed) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || state.steps.length === 0) {
      setShown(state.steps.length);
      return;
    }
    setShown(0);
    const timers = state.steps.map((_, index) =>
      window.setTimeout(() => setShown(index + 1), 170 * (index + 1)),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [seed, state.steps]);

  const item = activeItem(state);

  return (
    <div className="split">
      <section className="panel chat">
        <header className="panel-head">
          <h2>Manager</h2>
          <p>The only desk you talk to. A run costs {FULL_RUN_COST}.</p>
        </header>
        <div className="chips">
          {SUBJECTS.map((subject) => (
            <button key={subject} type="button" className="chip" onClick={() => dispatch({ type: "run", text: subject })}>
              {subject}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => dispatch({ type: "run", text: "Who does what on this team?" })}>
            Who does what?
          </button>
        </div>
        <ol className="log">
          {state.messages.map((entry) => (
            <li key={entry.id} className={entry.role}>
              <span>{entry.role === "manager" ? "Manager" : "You"}</span>
              <p>{entry.text}</p>
            </li>
          ))}
        </ol>
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            dispatch({ type: "run", text: state.topic });
          }}
        >
          <label>
            Topic
            <input
              value={state.topic}
              onChange={(event) => dispatch({ type: "set-field", field: "topic", value: event.target.value })}
            />
          </label>
          <label>
            Account
            <input
              value={state.account}
              onChange={(event) => dispatch({ type: "set-field", field: "account", value: event.target.value })}
            />
          </label>
          <button type="submit" className="btn">
            Run the desk
          </button>
        </form>
        {item ? <p className="hint">Latest card is pending in the queue until you say yes.</p> : null}
      </section>
      <section className="panel" data-testid="timeline">
        <header className="panel-head">
          <h2>Run timeline</h2>
          <p>Six seats. The scheduler step parks the draft. It does not publish.</p>
        </header>
        <ol className="timeline">
          {state.steps.slice(0, shown).map((step) => (
            <li key={step.id}>
              <i style={{ background: AGENT_COLOR[step.agent] }} />
              <div>
                <div className="step-top">
                  <strong>{step.title}</strong>
                  <em>{step.agent}</em>
                  <span>{step.cost}</span>
                </div>
                <p>{step.detail}</p>
                <div className="pills">
                  {step.skills.slice(0, 5).map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                  {step.skills.length > 5 ? <span>+{step.skills.length - 5}</span> : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
