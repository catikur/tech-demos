export function maxDrawdown(equities: number[], initial: number): number {
  let peak = initial;
  let worst = 0;
  for (const equity of equities) {
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const drawdown = (peak - equity) / peak;
      if (drawdown > worst) worst = drawdown;
    }
  }
  return worst;
}

/** Mean bar return divided by its sample deviation. Not annualized. */
export function sharpeLike(equities: number[], initial: number): number | null {
  const series = [initial, ...equities];
  if (series.length < 3) return null;
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1] ?? 0;
    const next = series[i] ?? 0;
    if (prev === 0) return null;
    returns.push(next / prev - 1);
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  if (variance === 0) return null;
  return mean / Math.sqrt(variance);
}

export function applicableRoi(
  table: { minutes: number; profit: number }[],
  elapsedMinutes: number,
): number | null {
  let best: { minutes: number; profit: number } | null = null;
  for (const row of table) {
    if (row.minutes <= elapsedMinutes && (best === null || row.minutes >= best.minutes)) {
      best = row;
    }
  }
  return best ? best.profit : null;
}
