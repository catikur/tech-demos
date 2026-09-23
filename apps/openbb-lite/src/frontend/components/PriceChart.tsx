import type { PricePoint } from "../types.ts";

interface Props {
  history: PricePoint[];
  up: boolean;
}

const W = 640;
const H = 180;
const PAD = { top: 10, right: 54, bottom: 22, left: 8 };

export function PriceChart({ history, up }: Props) {
  if (history.length < 2) return null;
  const closes = history.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (history.length - 1)) * iw;
  const y = (v: number) => PAD.top + ih - ((v - min) / span) * ih;

  const line = closes.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${PAD.left},${PAD.top + ih} ${line} ${PAD.left + iw},${PAD.top + ih}`;
  const color = up ? "var(--up)" : "var(--down)";
  const gridLevels = [min, min + span / 2, max];
  const monthTicks = history
    .map((p, i) => ({ p, i }))
    .filter(({ p }, idx, arr) => idx === 0 || p.date.slice(0, 7) !== arr[idx - 1]!.p.date.slice(0, 7))
    .slice(1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="6 month price chart">
      {gridLevels.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={PAD.left + iw} y1={y(v)} y2={y(v)} className="grid" />
          <text x={PAD.left + iw + 6} y={y(v) + 3.5} className="axis">
            {v.toFixed(0)}
          </text>
        </g>
      ))}
      {monthTicks.map(({ p, i }) => (
        <text key={p.date} x={x(i)} y={H - 6} className="axis mid">
          {new Date(p.date).toLocaleString("en", { month: "short", timeZone: "UTC" })}
        </text>
      ))}
      <polygon points={area} fill={color} opacity="0.08" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}
