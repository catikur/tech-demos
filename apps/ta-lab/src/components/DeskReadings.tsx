import { useState, type ReactNode } from "react";
import { SYMBOLS } from "../data/synthetic.ts";
import {
  basisPct,
  formatReading,
  FUNDING_WINDOW,
  hourlyCancelResult,
  paperCapClip,
  UNRESOLVED_NO_FILL,
  type Alignment,
  type DeskReadings,
  type StanceRead,
  type TradeSide,
  type VariantRead,
} from "../desk/readings.ts";

interface Props {
  desk: DeskReadings;
  chart: ReactNode;
  chartSymbolId: string;
  benchmarkId: string;
  onBenchmarkId: (id: string) => void;
}

function gloss(alignment: Alignment): string {
  switch (alignment) {
    case "with":
      return "ile";
    case "against":
      return "karşı";
    case "neutral":
      return "nötr";
    case "unknown":
      return "bilinmiyor";
    default: {
      const unreachable: never = alignment;
      return unreachable;
    }
  }
}

export function DeskLayout({ desk, chart, chartSymbolId, benchmarkId, onBenchmarkId }: Props) {
  const [side, setSide] = useState<TradeSide>("long");
  const [touched, setTouched] = useState(true);
  const [perpText, setPerpText] = useState("");
  const [spotText, setSpotText] = useState("");
  const stance: StanceRead = side === "long" ? desk.stance.long : desk.stance.short;
  const alignment = side === "long" ? desk.alignment.long : desk.alignment.short;
  const paper = desk.lastClose == null ? null : paperCapClip(desk.lastClose);
  const perp = perpText.trim() === "" ? null : Number(perpText);
  const spot = spotText.trim() === "" ? null : Number(spotText);
  const basis = basisPct(Number.isFinite(perp) ? perp : null, Number.isFinite(spot) ? spot : null);
  const barResult = hourlyCancelResult(touched);
  const features = desk.features;
  const benchmarks = SYMBOLS.filter((symbol) => symbol.id !== chartSymbolId);

  return (
    <div className="chart-desk">
      <div className="chart-column">
        <div className="desk-strip" id="desk-strip" data-testid="desk-strip">
          <span>Last real bar</span>
          <span data-testid="atr-wilder">ATR Wilder {formatReading(desk.atr.wilder)}</span>
          <span data-testid="atr-price">price {formatReading(desk.atr.price)}</span>
          <span data-testid="atr-pct">atr14Pct {formatReading(desk.atr.pct)}%</span>
          <span data-testid="rsi-wilder">RSI Wilder {formatReading(desk.rsi.wilder, 1)}</span>
          <span data-testid="rsi-sum">sum {formatReading(desk.rsi.sum, 1)}</span>
          <span data-testid="trend-vote">vote {desk.vote}</span>
          <span data-testid="trend-structure">structure {desk.structure}</span>
          <span data-testid="trend-universe">{desk.universeLabel}</span>
        </div>
        {chart}
      </div>
      <aside className="desk-panel" id="desk-readings" data-testid="desk-readings">
        <h2>Desk readings</h2>
        <p className="desk-lead">Numbers from the last real daily bar. Not a trade signal, not an order, not a size.</p>

        <section className="desk-card" id="desk-atr">
          <h3>1 · Three ATRs</h3>
          <p className="desk-note">Tail stays off this pane. First-bar true range in the Wilder seed is high minus low only.</p>
          <dl>
            <div>
              <dt>Lab Wilder</dt>
              <dd>{formatReading(desk.atr.wilder, 4)}</dd>
            </div>
            <div>
              <dt>Price ATR</dt>
              <dd>{formatReading(desk.atr.price, 4)}</dd>
            </div>
            <div>
              <dt>atr14Pct</dt>
              <dd>{formatReading(desk.atr.pct, 4)}%</dd>
            </div>
          </dl>
        </section>

        <section className="desk-card" id="desk-rsi">
          <h3>2 · RSI pair</h3>
          <p className="desk-note">30/70 stays a lesson guide. The sum is not a trade threshold.</p>
          <dl>
            <div>
              <dt>Lab Wilder</dt>
              <dd>{formatReading(desk.rsi.wilder, 2)}</dd>
            </div>
            <div>
              <dt>Sum of 14 changes</dt>
              <dd>{formatReading(desk.rsi.sum, 2)}</dd>
            </div>
            {desk.rsi.wilder != null &&
              desk.rsi.deskWilder != null &&
              Math.abs(desk.rsi.wilder - desk.rsi.deskWilder) > 1e-6 && (
                <div>
                  <dt>Desk Wilder</dt>
                  <dd>{formatReading(desk.rsi.deskWilder, 2)}</dd>
                </div>
              )}
          </dl>
        </section>

        <section className="desk-card" id="desk-trend">
          <h3>3 · Three trend labels</h3>
          <dl>
            <div>
              <dt>Vote</dt>
              <dd>{desk.vote}</dd>
            </div>
            <div>
              <dt>Daily structure</dt>
              <dd>{desk.structure}</dd>
            </div>
            <div>
              <dt>ret20 / distMa20 / sum RSI</dt>
              <dd>{desk.universeLabel}</dd>
            </div>
          </dl>
          <p className="desk-note">
            Swing {formatReading(desk.swings.support)} / {formatReading(desk.swings.resistance)} is the last 40 bars.
            Donchian length 40 draws that. No new line. Mixed is a real answer.
          </p>
        </section>

        <section className="desk-card" id="desk-sl01">
          <h3>4 · SL-01 checklist</h3>
          <p className="desk-note">{desk.sl01.timeframeNote}</p>
          <p className="desk-note">
            The ATR floor only widens. This lab does not tighten a stop. V-C has no target. A 2R multiple is not a
            destination and is not drawn. Supertrend is a different function.
          </p>
          {desk.sl01.variants.map((variant) => (
            <VariantBlock key={variant.id} variant={variant} note={variant.id === "E" ? desk.sl01.veNote : null} />
          ))}
        </section>

        <section className="desk-card" id="desk-universe">
          <h3>5 · Universe card</h3>
          {features ? (
            <dl>
              <div>
                <dt>ret1 / ret5 / ret20</dt>
                <dd>
                  {formatReading(features.ret1)} / {formatReading(features.ret5)} / {formatReading(features.ret20)}%
                </dd>
              </div>
              <div>
                <dt>distMa20</dt>
                <dd>{formatReading(features.distMa20)}%</dd>
              </div>
              <div>
                <dt>shockZ</dt>
                <dd>{formatReading(features.shockZ)}</dd>
              </div>
              <div>
                <dt>high20 / low20</dt>
                <dd>
                  {features.high20 ? "high20" : "not high20"} · {features.low20 ? "low20" : "not low20"}
                </dd>
              </div>
              <div>
                <dt>volZ20</dt>
                <dd>
                  {formatReading(features.volZ20)} (n−1) · lab n {formatReading(features.volZ20LabN)}
                </dd>
              </div>
              <div>
                <dt>sigmaPct</dt>
                <dd>{formatReading(features.sigmaPct, 3)}%</dd>
              </div>
              <div>
                <dt>80% half-width</dt>
                <dd>{formatReading(desk.bandHalf, 3)}%</dd>
              </div>
              <div>
                <dt>beta / bench ret5</dt>
                <dd>
                  {formatReading(desk.beta, 3)} / {formatReading(desk.benchRet5)}%
                </dd>
              </div>
              <div>
                <dt>relative score</dt>
                <dd>{formatReading(desk.relative, 3)}</dd>
              </div>
            </dl>
          ) : (
            <p className="desk-note">Needs 21 real daily bars.</p>
          )}
          <p className="desk-note">
            volZ20 divides by n−1. Lab stdev divides by n. The half-width is 1.2816 × sigma at multiplier 1. Not a wick.
            No funding. No ridge fit. Lean and costMultiple stay blank.
          </p>
          <p className="desk-note" data-testid="rule-agreement">
            Fired families {desk.agreement}. {desk.fired.length} reading{desk.fired.length === 1 ? "" : "s"}.
          </p>
          {desk.fired.length > 0 && (
            <ul className="desk-rules">
              {desk.fired.map((rule) => (
                <li key={rule.id}>
                  {rule.id} · {rule.side === "LONG" ? "long" : "short"}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="desk-card" id="desk-regime">
          <h3>6 · Regime strip</h3>
          <label className="desk-field">
            <span>Other symbol</span>
            <select value={benchmarkId} onChange={(event) => onBenchmarkId(event.target.value)}>
              {benchmarks.map((symbol) => (
                <option key={symbol.id} value={symbol.id}>
                  {symbol.id}
                </option>
              ))}
            </select>
          </label>
          <dl>
            <div>
              <dt>{benchmarkId}</dt>
              <dd data-testid="regime-label">
                {desk.regime.regime} · {desk.regime.trend} · {desk.regime.volatility}
              </dd>
            </div>
            <div>
              <dt>Change / daily range</dt>
              <dd>
                {formatReading(desk.regime.changePct)}% / {formatReading(desk.regime.avgRangePct)}%
              </dd>
            </div>
            <div>
              <dt>Alignment for {side}</dt>
              <dd data-testid="regime-alignment">
                {alignment} ({gloss(alignment)})
              </dd>
            </div>
          </dl>
          <p className="desk-note">{desk.tailNote}</p>
          <p className="desk-note">
            Entry on the desk allows with and neutral only. Against and unknown produce no idea. Block reason:{" "}
            {desk.regimeBlock ?? "none (cap 0)"}. This strip does not veto.
          </p>
        </section>

        <section className="desk-card" id="desk-stance">
          <h3>7 · Stance</h3>
          <div className="desk-toggle" role="group" aria-label="Side for the stance reading">
            <button type="button" className={side === "long" ? "btn small primary" : "btn small"} onClick={() => setSide("long")}>
              Long
            </button>
            <button type="button" className={side === "short" ? "btn small primary" : "btn small"} onClick={() => setSide("short")}>
              Short
            </button>
          </div>
          <dl>
            <div>
              <dt>Daily stance</dt>
              <dd data-testid="stance-label">{stance.stance}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{stance.score ?? "none"}</dd>
            </div>
            <div>
              <dt>Factor</dt>
              <dd data-testid="stance-factor">{stance.factor.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Strong</dt>
              <dd>—</dd>
            </div>
            <div>
              <dt>RSI 75/25 dock</dt>
              <dd>{stance.rsiPenalty ? "yes" : "no"}</dd>
            </div>
          </dl>
          <p className="desk-note">
            {stance.reasons.length ? stance.reasons.join(", ") : "No vote."} One daily interval cannot be strong. No
            hourly candles are invented. The factor is not applied to a size.
          </p>
        </section>

        <section className="desk-card" id="desk-bar">
          <h3>8 · One bar</h3>
          <p className="desk-note">
            The last real daily bar is marked seq. Order inside that bar is unknown. This does not place or cancel an
            order, and a touch is not a fill.
          </p>
          <div className="desk-toggle" role="group" aria-label="What happened inside the bar">
            <button type="button" className={touched ? "btn small primary" : "btn small"} onClick={() => setTouched(true)}>
              Touch and cancel
            </button>
            <button type="button" className={!touched ? "btn small primary" : "btn small"} onClick={() => setTouched(false)}>
              Quiet cancel
            </button>
          </div>
          <p className="desk-result" data-testid="bar-result">
            {barResult}
          </p>
          <p className="desk-note">Unresolved, fill not counted: {UNRESOLVED_NO_FILL.join(", ")}.</p>
        </section>

        <section className="desk-card" id="desk-paper">
          <h3>9 · Paper cap</h3>
          <p className="desk-note">1,000 USDT is an identity, not a size suggestion. No live order, no minimum lot.</p>
          {paper ? (
            <dl>
              <div>
                <dt>Cap</dt>
                <dd>{paper.cap.toFixed(2)} USDT</dd>
              </div>
              <div>
                <dt>Quantity at last close</dt>
                <dd>{paper.quantity.toFixed(6)}</dd>
              </div>
              <div>
                <dt>Clipped notional</dt>
                <dd data-testid="paper-notional">{paper.clippedNotional.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Quantity × price</dt>
                <dd>{paper.product.toFixed(8)}</dd>
              </div>
            </dl>
          ) : (
            <p className="desk-note">No last close.</p>
          )}
          <p className="desk-note">The decision path writes the cap. It does not write quantity times price.</p>
        </section>

        <section className="desk-card" id="desk-basis">
          <h3>10 · Basis and funding</h3>
          <p className="desk-note">Two hand-entered numbers. No spot candles and no funding ticker.</p>
          <label className="desk-field">
            <span>Perp</span>
            <input
              inputMode="decimal"
              value={perpText}
              aria-label="Perp price"
              onChange={(event) => setPerpText(event.target.value)}
            />
          </label>
          <label className="desk-field">
            <span>Spot</span>
            <input
              inputMode="decimal"
              value={spotText}
              aria-label="Spot price"
              onChange={(event) => setSpotText(event.target.value)}
            />
          </label>
          <p className="desk-result" data-testid="basis-result">
            {basis == null ? "basis none" : `basis ${basis.toFixed(4)}%`}
          </p>
          {basis != null && basis < 0 && (
            <p className="desk-note">A negative basis blocks entry in the desk code. This card does not block anything.</p>
          )}
          <p className="desk-note">{FUNDING_WINDOW}. That is an unasked question, not a rejection.</p>
        </section>
      </aside>
    </div>
  );
}

function VariantBlock({ variant, note }: { variant: VariantRead; note: string | null }) {
  return (
    <div className="desk-variant">
      <header>
        <strong>{variant.title}</strong>
        <span className={`desk-status ${variant.status}`}>{variant.status}</span>
        {variant.id === "E" && <span className="desk-badge">Preregistration</span>}
      </header>
      {note && <p className="desk-note">{note}</p>}
      <ul>
        {variant.clauses.map((item) => (
          <li key={item.id} className={`desk-clause ${item.state}`}>
            <span className="desk-where">{item.desk}</span>
            <span>{item.text}</span>
            <span className="desk-value">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
