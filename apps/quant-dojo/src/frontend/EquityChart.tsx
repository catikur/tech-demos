import type { EquityPoint } from "../lib/backtest.ts";
import { formatMoney } from "./format.ts";

type Props = {
  strategy: EquityPoint[];
  buyHold: EquityPoint[];
  splitIndex: number;
};

export function EquityChart({ strategy, buyHold, splitIndex }: Props) {
  const width = 720;
  const height = 280;
  const pad = { l: 62, r: 16, t: 16, b: 28 };
  const values = [...strategy, ...buyHold].map((point) => point.equity);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const last = Math.max(strategy.length - 1, 1);
  const x = (index: number) => pad.l + (index / last) * innerW;
  const y = (value: number) => pad.t + (1 - (value - min) / span) * innerH;
  const line = (series: EquityPoint[]) =>
    series
      .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(point.equity).toFixed(2)}`)
      .join(" ");
  const ticks = [max, (max + min) / 2, min];
  const splitX = x(Math.min(Math.max(splitIndex, 0), strategy.length - 1));

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Equity curve against buy and hold">
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="grid" x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} />
          <text className="axis" x={pad.l - 8} y={y(tick) + 4} textAnchor="end">
            {formatMoney(tick)}
          </text>
        </g>
      ))}
      <line className="split" x1={splitX} x2={splitX} y1={pad.t} y2={height - pad.b} />
      <text className="split-label" x={splitX + 6} y={pad.t + 12}>
        holdout
      </text>
      <path className="hold" d={line(buyHold)} />
      <path className="equity" d={line(strategy)} />
    </svg>
  );
}
