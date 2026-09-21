interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <label className="knob">
      <span className="knob-label">
        {label}
        <span className="knob-value">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export interface Knobs {
  lookback: number;
  predLen: number;
  temperature: number;
  topP: number;
  sampleCount: number;
}

interface Props {
  knobs: Knobs;
  onChange: (k: Knobs) => void;
  onRun: () => void;
  seed: number | null;
  stale: boolean;
  disabled: boolean;
}

export function Controls({ knobs, onChange, onRun, seed, stale, disabled }: Props) {
  const set = (patch: Partial<Knobs>) => onChange({ ...knobs, ...patch });
  return (
    <div className="panel controls">
      <div className="knob-group">
        <span className="knob-group-title">context</span>
        <Slider label="lookback" value={knobs.lookback} min={32} max={256} step={8} onChange={(v) => set({ lookback: v })} />
        <Slider label="pred_len" value={knobs.predLen} min={8} max={96} step={4} onChange={(v) => set({ predLen: v })} />
      </div>
      <div className="knob-group">
        <span className="knob-group-title">sampling</span>
        <Slider
          label="T"
          value={knobs.temperature}
          min={0.1}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => set({ temperature: v })}
        />
        <Slider
          label="top_p"
          value={knobs.topP}
          min={0.1}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => set({ topP: v })}
        />
        <Slider label="sample_count" value={knobs.sampleCount} min={1} max={30} step={1} onChange={(v) => set({ sampleCount: v })} />
      </div>
      <div className="run-group">
        <button className={`run-button${stale ? " run-button-stale" : ""}`} onClick={onRun} disabled={disabled}>
          {stale ? "Run forecast · update" : "Run forecast"} <span className="run-note">(mock)</span>
        </button>
        <span className="seed-note">
          {seed === null ? "seed —" : `seed ${seed}`} · deterministic{stale ? " · knobs changed" : ""}
        </span>
      </div>
    </div>
  );
}
