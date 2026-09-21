import { useMemo, useState } from "react";
import { COARSE_SIZE, FINE_SIZE, type BarToken } from "../lib/tokenizer";
import { VOCAB, type ForecastResult } from "../lib/forecast";

interface Props {
  tokens: BarToken[];
  forecast: ForecastResult | null;
}

function coarseColor(id: number): string {
  const hue = (id / COARSE_SIZE) * 300; // red→magenta sweep
  return `hsl(${hue}, 72%, 52%)`;
}

function fineColor(id: number): string {
  const hue = (id / FINE_SIZE) * 300;
  return `hsl(${hue}, 45%, 38%)`;
}

function forecastTokenColor(id: number): string {
  const t = id / (VOCAB - 1); // 0 = strong down, 1 = strong up
  const hue = t * 130; // red → green
  return `hsl(${hue}, 65%, 46%)`;
}

function Bits({ bits }: { bits: number[] }) {
  return (
    <span className="bits">
      {bits.map((b, i) => (
        <span key={i} className={b > 0 ? "bit bit-pos" : "bit bit-neg"}>
          {b > 0 ? "+1" : "−1"}
        </span>
      ))}
    </span>
  );
}

export function TokenPanel({ tokens, forecast }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const usage = useMemo(() => {
    const coarseUsed = new Set(tokens.map((t) => t.coarse)).size;
    const fineUsed = new Set(tokens.map((t) => t.fine)).size;
    return { coarseUsed, fineUsed };
  }, [tokens]);

  const hovered = hover !== null ? tokens[hover] : null;

  return (
    <div className="panel token-panel">
      <div className="panel-header">
        <h2>Hierarchical tokenizer</h2>
        <span className="tag">mock · BSQ-shaped</span>
      </div>
      <p className="panel-note">
        Each bar of the lookback window is quantized into a <strong>coarse</strong> token (4 bits: return
        direction/magnitude × range regime) plus a <strong>fine</strong> residual token (6 bits: return residual ×
        body shape × volume). Real Kronos learns these codebooks with Binary Spherical Quantization — this panel
        fakes the codes but keeps the structure.
      </p>

      <div className="token-strip-wrap">
        <div className="token-strip-labels">
          <span>coarse (16)</span>
          <span>fine (64)</span>
        </div>
        <div className="token-strip" onMouseLeave={() => setHover(null)}>
          {tokens.map((t, i) => (
            <div
              key={t.time}
              className={`token-col${hover === i ? " token-col-hover" : ""}`}
              onMouseEnter={() => setHover(i)}
            >
              <div className="token-cell" style={{ background: coarseColor(t.coarse) }} />
              <div className="token-cell" style={{ background: fineColor(t.fine) }} />
            </div>
          ))}
        </div>
      </div>

      <div className="token-detail">
        {hovered ? (
          <>
            <div className="token-detail-row">
              <span className="detail-label">bar</span>
              <span>{new Date(hovered.time * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
            </div>
            <div className="token-detail-row">
              <span className="detail-label">coarse #{hovered.coarse}</span>
              <Bits bits={hovered.coarseBits} />
            </div>
            <div className="token-detail-row">
              <span className="detail-label">fine #{hovered.fine}</span>
              <Bits bits={hovered.fineBits} />
            </div>
            <div className="token-detail-row features">
              <span>ret {(hovered.features.ret * 100).toFixed(2)}%</span>
              <span>z {hovered.features.retZ.toFixed(2)}</span>
              <span>body {(hovered.features.body * 100).toFixed(0)}%</span>
              <span>volZ {hovered.features.volZ.toFixed(2)}</span>
            </div>
          </>
        ) : (
          <span className="token-detail-hint">hover a column to inspect its token pair</span>
        )}
      </div>

      <div className="token-stats">
        <span>
          codebook usage: <strong>{usage.coarseUsed}/{COARSE_SIZE}</strong> coarse ·{" "}
          <strong>{usage.fineUsed}/{FINE_SIZE}</strong> fine
        </span>
      </div>

      {forecast && forecast.paths.length > 0 && (
        <div className="forecast-tokens">
          <div className="panel-header">
            <h2>Sampled forecast tokens</h2>
            <span className="tag">path #1</span>
          </div>
          <p className="panel-note">
            Return-token ids drawn autoregressively for the first sample path (vocab {VOCAB}, red = down, green =
            up). Avg nucleus size after top-p: <strong>{forecast.avgNucleusSize.toFixed(1)}</strong> tokens.
          </p>
          <div className="token-strip forecast-strip">
            {forecast.paths[0].tokens.map((id, i) => (
              <div key={i} className="token-col" title={`step ${i + 1} → token #${id}`}>
                <div className="token-cell" style={{ background: forecastTokenColor(id) }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
