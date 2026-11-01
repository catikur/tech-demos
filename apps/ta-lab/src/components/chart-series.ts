/** How a line is split so the projected tail can use a different stroke. */

export interface IndexSpan {
  from: number;
  to: number;
}

/**
 * `projected` starts one point before the tail so the dashed stroke meets
 * the historical stroke. The first new segment is the first projected bar.
 */
export function lineSegments(
  valueLength: number,
  realCount: number,
): { base: IndexSpan; projected: IndexSpan | null } {
  if (valueLength <= realCount || realCount <= 0) {
    return { base: { from: 0, to: valueLength }, projected: null };
  }
  return {
    base: { from: 0, to: realCount },
    projected: { from: realCount - 1, to: valueLength },
  };
}

export function seriesPoints(
  times: number[],
  values: number[],
  from: number,
  to: number,
): { time: number; value?: number }[] {
  const end = Math.min(to, values.length, times.length);
  const out: { time: number; value?: number }[] = [];
  for (let i = Math.max(0, from); i < end; i++) {
    const value = values[i];
    if (Number.isNaN(value)) out.push({ time: times[i] });
    else out.push({ time: times[i], value });
  }
  return out;
}

/** Dashed close line, anchored on the last real close so it doesn't float. */
export function projectedClosePoints(
  last: { time: number; close: number },
  path: { time: number; close: number }[],
): { time: number; value: number }[] {
  if (path.length === 0) return [];
  return [
    { time: last.time, value: last.close },
    ...path.map((point) => ({ time: point.time, value: point.close })),
  ];
}
