import { FULL_RUN_COST, remaining } from "../engine/budget";
import { AUTOMATION_RULES } from "../engine/rules";
import { FUNCTIONS, isHumanSkill, SKILLS } from "../engine/skills";
import { AGENT_COLOR, type DeskProps } from "./model";

const PLAN = [
  ["08:00", "Scout sends a brief. You pick."],
  ["After your yes", "Writer and Designer leave drafts. Scheduler asks again."],
  ["18:00", "Mentions are listed. You write the replies."],
  ["Monday 09:00", "Analyst sends the note. You decide what changes in the voice file."],
];

export function Ops({ state, dispatch }: DeskProps) {
  const left = remaining(state.spent, state.cap);
  const width = Math.min(100, state.cap === 0 ? 100 : (state.spent / state.cap) * 100);

  return (
    <div className="stack">
      <section className="panel" data-testid="skill-graph">
        <header className="panel-head">
          <h2>Skill graph</h2>
          <p>12 functions, 37 skills. Lit skills are the ones this run used. Three stay dark until you export, approve, or calendar a post.</p>
        </header>
        <div className="graph">
          {FUNCTIONS.map((fn) => (
            <article key={fn.id}>
              <h3>{fn.name}</h3>
              <p>{fn.summary}</p>
              <ul>
                {SKILLS.filter((skill) => skill.functionId === fn.id).map((skill) => {
                  const used = state.skillsUsed.includes(skill.id);
                  return (
                    <li key={skill.id} className={used ? "used" : "idle"}>
                      <i style={{ background: used ? AGENT_COLOR[skill.agent] : "transparent" }} />
                      <div>
                        <strong>{skill.name}</strong>
                        <em>
                          {skill.agent}
                          {isHumanSkill(skill.id) && !used ? " · waits for you" : ""}
                        </em>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <div className="split">
        <section className="panel">
          <header className="panel-head">
            <h2>Usage</h2>
            <p>
              Spent {state.spent} of {state.cap}. Remaining {left}. Next full run costs {FULL_RUN_COST}. A run already started is not aborted.
            </p>
          </header>
          <div className="cap">
            <b style={{ width: `${width}%` }} />
          </div>
          <label>
            Spending cap
            <input
              type="range"
              min={20}
              max={200}
              value={state.cap}
              onChange={(event) => dispatch({ type: "set-cap", cap: Number(event.target.value) })}
            />
          </label>
          <h3>Weekday plan, disarmed</h3>
          <ul className="plan">
            {PLAN.map(([when, what]) => (
              <li key={when}>
                <strong>{when}</strong>
                <span>{what}</span>
              </li>
            ))}
          </ul>
          <p className="fine">Routines are not armed. This demo does not fire timers.</p>
        </section>
        <section className="panel">
          <header className="panel-head">
            <h2>X automation rules</h2>
            <p>Scheduling your own drafts is allowed. Unattended replies are not. You stay responsible.</p>
          </header>
          <ul className="rules">
            {AUTOMATION_RULES.map((rule) => (
              <li key={rule.id}>
                <strong>
                  {rule.title}
                  {rule.locked ? " · locked" : ""}
                </strong>
                <p>{rule.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
