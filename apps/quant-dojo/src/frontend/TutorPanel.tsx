import { useEffect, useState } from "react";
import { SKILLS, type SkillId } from "../lib/types.ts";
import {
  currentQuestion,
  levelBar,
  levelName,
  overallPct,
  revealAnswer,
  reviewCountdown,
  setDifficulty,
  showHint,
  skillTitle,
  startTutor,
  submitAnswer,
  type TutorState,
} from "../lib/tutor.ts";
import { loadTutor, saveTutor } from "./storage.ts";

function kicker(state: TutorState): string {
  const question = currentQuestion(state);
  const name = question ? skillTitle(question.skill) : "";
  switch (state.serving) {
    case "diagnostic":
      return `Diagnostic ${state.diagnosticIndex + 1} of ${SKILLS.length} · ${name}`;
    case "learn":
      return `Practice · ${name}`;
    case "review":
      return `Spaced review · ${name}`;
    case "edge":
      return `Final pass · ${name}`;
    default: {
      const exhaustive: never = state.serving;
      return exhaustive;
    }
  }
}

function SkillMap({ state }: { state: TutorState }) {
  const queue = reviewCountdown(state);
  return (
    <aside className="map">
      <div className="map-head">
        <p className="eyebrow">Skill map</p>
        <strong>{overallPct(state.levels)}%</strong>
      </div>
      <ol>
        {SKILLS.map((skill) => {
          const level = state.levels[skill] ?? 0;
          const current = currentQuestion(state)?.skill === skill;
          return (
            <li key={skill} className={current ? "is-current" : ""}>
              <div className="map-row">
                <span>{skillTitle(skill)}</span>
                <span className="level">
                  {level}/5 · {levelName(level)}
                </span>
              </div>
              <div className="meter" aria-hidden="true">
                <span style={{ width: `${(level / 5) * 100}%` }} />
              </div>
              <code>{levelBar(level)}</code>
            </li>
          );
        })}
      </ol>
      <div className="queue">
        <p className="eyebrow">Review queue</p>
        {queue.length === 0 ? (
          <p className="quiet">A clean practice answer schedules the first return.</p>
        ) : (
          <ul>
            {queue.map((item) => (
              <li key={item.skill}>
                <span>{skillTitle(item.skill)}</span>
                <span>{item.dueIn <= 0 ? "due now" : `in ${item.dueIn}`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

export function TutorPanel() {
  const [state, setState] = useState<TutorState>(() => loadTutor());

  useEffect(() => {
    saveTutor(state);
  }, [state]);

  const question = currentQuestion(state);

  return (
    <div className="tutor">
      <SkillMap state={state} />
      <section className="card question-card">
        {state.phase === "complete" || !question ? (
          <Complete state={state} onReset={() => setState(startTutor())} />
        ) : (
          <>
            <p className="eyebrow">{kicker(state)}</p>
            <h2>{question.prompt}</h2>
            <div className="choices" role="group" aria-label="Answers">
              {question.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={state.lockedChoice === choice.id ? "choice is-out" : "choice"}
                  onClick={() => setState(submitAnswer(state, choice.id))}
                >
                  <span>{choice.id}</span>
                  {choice.label}
                </button>
              ))}
            </div>
            {state.lastNote ? (
              <p className={`note tone-${state.lastNote.tone}`} role="status">
                {state.lastNote.text}
              </p>
            ) : (
              <p className="quiet">One question. A hint narrows it. The answer waits.</p>
            )}
            <div className="row-actions">
              <button type="button" onClick={() => setState(showHint(state))}>
                Hint
              </button>
              <button type="button" onClick={() => setState(revealAnswer(state))}>
                Just tell me
              </button>
              <button type="button" onClick={() => setState(setDifficulty(state, 1))}>
                Easier
              </button>
              <button type="button" onClick={() => setState(setDifficulty(state, 3))}>
                Harder
              </button>
              <button type="button" className="ghost" onClick={() => setState(startTutor())}>
                Reset
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Complete({ state, onReset }: { state: TutorState; onReset: () => void }) {
  const weakest = [...SKILLS].sort((a, b) => (state.levels[a] ?? 0) - (state.levels[b] ?? 0))[0] ?? "indicators";
  return (
    <>
      <p className="eyebrow">Floor cleared</p>
      <h2>Every skill cleared the final pass.</h2>
      <p className="quiet">
        The softest spot is still {skillTitle(weakest as SkillId).toLowerCase()} at {state.levels[weakest] ?? 0}/5.
        This was a rehearsal on written questions, not a trading credential.
      </p>
      <div className="row-actions">
        <button type="button" onClick={onReset}>
          Start again
        </button>
      </div>
    </>
  );
}
