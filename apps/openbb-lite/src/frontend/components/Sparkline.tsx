interface Props {
  data: number[];
  width?: number;
  height?: number;
  up: boolean;
}

export function Sparkline({ data, width = 72, height = 22, up }: Props) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(" ");
  const color = up ? "var(--up)" : "var(--down)";
  return (
    <svg width={width} height={height} className="spark" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
