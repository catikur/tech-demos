import { useState } from "react";
import { PLATFORM_LIMITS, type PlatformId } from "../engine/types";
import { activeItem, type DeskProps } from "./model";

const PLATFORMS: PlatformId[] = ["x", "linkedin", "bluesky", "instagram"];

export function Writer({ state, dispatch }: DeskProps) {
  const item = activeItem(state);
  const [platform, setPlatform] = useState<PlatformId>("x");
  const text = item?.platforms[platform] ?? "";

  return (
    <div className="split">
      <section className="panel">
        <header className="panel-head">
          <h2>Voice file</h2>
          <p>Features come from the samples. Adjectives are not a voice.</p>
        </header>
        <textarea
          value={state.samples}
          onChange={(event) => dispatch({ type: "set-field", field: "samples", value: event.target.value })}
          rows={8}
          aria-label="Sample posts"
        />
        <button type="button" className="btn" onClick={() => dispatch({ type: "train" })}>
          Read the samples
        </button>
        <dl className="stats">
          <div>
            <dt>Posts</dt>
            <dd>{state.voice.postCount}</dd>
          </div>
          <div>
            <dt>Words / sentence</dt>
            <dd>{state.voice.avgWordsPerSentence}</dd>
          </div>
          <div>
            <dt>Questions</dt>
            <dd>{state.voice.questionRate}</dd>
          </div>
          <div>
            <dt>First person</dt>
            <dd>{state.voice.firstPersonRate}</dd>
          </div>
          <div>
            <dt>Contractions</dt>
            <dd>{state.voice.contractionRate}</dd>
          </div>
          <div>
            <dt>Prefers</dt>
            <dd>{state.voice.prefers}</dd>
          </div>
        </dl>
        <p className="fine">Banned: {state.voice.banned.join(", ")}.</p>
      </section>
      <section className="panel" data-testid="drafts">
        <header className="panel-head">
          <h2>Drafts</h2>
          <p>{item ? item.topic : "Run the desk to get a draft."}</p>
        </header>
        {item ? (
          <>
            <div className="hooks">
              {item.hooks.map((hook, index) => (
                <button
                  key={hook.id}
                  type="button"
                  className={index === item.hookIndex ? "hook on" : "hook"}
                  onClick={() => dispatch({ type: "select-hook", id: item.id, index })}
                >
                  <em>{hook.label}</em>
                  <strong>{hook.text}</strong>
                </button>
              ))}
            </div>
            <div className="tabs">
              {PLATFORMS.map((id) => (
                <button key={id} type="button" className={id === platform ? "on" : ""} onClick={() => setPlatform(id)}>
                  {id} {item.platforms[id].length}/{PLATFORM_LIMITS[id]}
                </button>
              ))}
            </div>
            <pre className={text.length > PLATFORM_LIMITS[platform] ? "draft over" : "draft"}>{text}</pre>
            <h3>X thread</h3>
            <ol className="thread">
              {item.thread.map((part, index) => (
                <li key={`${item.id}-${index}`}>
                  <span>
                    {part.length}/{PLATFORM_LIMITS.x}
                  </span>
                  {part}
                </li>
              ))}
            </ol>
            <div className="card-frame slim" data-testid="draft-card" dangerouslySetInnerHTML={{ __html: item.cardSvg }} />
          </>
        ) : (
          <p>No draft yet.</p>
        )}
      </section>
    </div>
  );
}
