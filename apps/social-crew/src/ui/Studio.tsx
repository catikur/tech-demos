import { useState } from "react";
import type { BrandFont, BrandKit } from "../engine/types";
import { downloadCard } from "./download";
import { activeItem, type DeskProps } from "./model";

const FONTS: BrandFont[] = ["serif", "sans", "mono"];

export function Studio({ state, dispatch }: DeskProps) {
  const item = activeItem(state);
  const [error, setError] = useState<string | null>(null);

  function setBrand(patch: Partial<BrandKit>) {
    dispatch({ type: "set-brand", brand: { ...state.brand, ...patch } });
  }

  return (
    <div className="split">
      <section className="panel">
        <header className="panel-head">
          <h2>Brand kit</h2>
          <p>Colors, a logo word, and a font stack that already lives on the machine.</p>
        </header>
        <label>
          Name
          <input value={state.brand.name} onChange={(event) => setBrand({ name: event.target.value })} />
        </label>
        <label>
          Logo text
          <input value={state.brand.logoText} onChange={(event) => setBrand({ logoText: event.target.value })} />
        </label>
        <div className="swatches">
          <Color label="Ink" value={state.brand.ink} onChange={(ink) => setBrand({ ink })} />
          <Color label="Paper" value={state.brand.paper} onChange={(paper) => setBrand({ paper })} />
          <Color label="Accent" value={state.brand.accent} onChange={(accent) => setBrand({ accent })} />
        </div>
        <div className="tabs">
          {FONTS.map((font) => (
            <button key={font} type="button" className={state.brand.font === font ? "on" : ""} onClick={() => setBrand({ font })}>
              {font}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          disabled={!item}
          onClick={() => {
            if (!item) return;
            setError(null);
            downloadCard(item.cardSvg, "social-crew-card.png")
              .then(() => dispatch({ type: "note-export", id: item.id }))
              .catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : "Export failed.");
              });
          }}
        >
          Download PNG
        </button>
        {error ? <p className="fine warn">{error}</p> : null}
      </section>
      <section className="panel">
        <header className="panel-head">
          <h2>Card</h2>
          <p>Drawn here. Not uploaded. Not posted.</p>
        </header>
        {item ? (
          <div className="card-frame" data-testid="visual-card" dangerouslySetInnerHTML={{ __html: item.cardSvg }} />
        ) : (
          <p>Run the desk to lay a card.</p>
        )}
      </section>
    </div>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="swatch">
      {label}
      <input type="color" value={toColorInput(value)} onChange={(event) => onChange(event.target.value.toUpperCase())} />
      <code>{value}</code>
    </label>
  );
}

function toColorInput(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
}
