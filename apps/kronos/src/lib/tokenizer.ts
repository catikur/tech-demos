import type { Bar } from "./ohlcv";

/**
 * Hierarchical tokenizer. Each bar becomes a coarse token (4 bits: return and
 * range) and a fine residual token (6 bits: return detail, body, volume).
 * The same bar always maps to the same ids.
 */

export const COARSE_BITS = 4;
export const FINE_BITS = 6;
export const COARSE_SIZE = 1 << COARSE_BITS; // 16
export const FINE_SIZE = 1 << FINE_BITS; // 64

export interface BarToken {
  time: number;
  coarse: number; // 0..15
  fine: number; // 0..63
  coarseBits: number[]; // ±1 per bit, BSQ-style display
  fineBits: number[];
  features: {
    ret: number; // log return, close/open
    retZ: number; // normalized within window
    range: number; // log(high/low)
    body: number; // |close-open| / (high-low)
    volZ: number;
  };
}

function clampBin(x: number, bins: number): number {
  return Math.max(0, Math.min(bins - 1, x));
}

function toBits(id: number, nBits: number): number[] {
  const out: number[] = [];
  for (let b = nBits - 1; b >= 0; b--) out.push((id >> b) & 1 ? 1 : -1);
  return out;
}

/** Quantize a z-score into `bins` equal-probability-ish buckets over [-2.5, 2.5]. */
function zBin(z: number, bins: number): number {
  const t = (z + 2.5) / 5;
  return clampBin(Math.floor(t * bins), bins);
}

export function tokenizeWindow(bars: Bar[]): BarToken[] {
  const n = bars.length;
  if (n === 0) return [];

  const rets = bars.map((b) => Math.log(b.close / b.open));
  const ranges = bars.map((b) => Math.log(b.high / Math.max(b.low, 1e-9)));
  const vols = bars.map((b) => b.volume);

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const std = (xs: number[], m: number) =>
    Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length) || 1e-9;

  const mRet = mean(rets);
  const sRet = std(rets, mRet);
  const mRange = mean(ranges);
  const sRange = std(ranges, mRange);
  const mVol = mean(vols);
  const sVol = std(vols, mVol);

  return bars.map((bar, i) => {
    const retZ = (rets[i] - mRet) / sRet;
    const rangeZ = (ranges[i] - mRange) / sRange;
    const volZ = (vols[i] - mVol) / sVol;
    const span = bar.high - bar.low;
    const body = span > 0 ? Math.abs(bar.close - bar.open) / span : 0;

    // Coarse (4 bits): direction+magnitude of the return (3 bits) × range regime (1 bit).
    const retBin = zBin(retZ, 8); // 3 bits
    const rangeBit = rangeZ > 0 ? 1 : 0; // 1 bit
    const coarse = (retBin << 1) | rangeBit;

    // Fine (6 bits): residual return detail (2) × body shape (2) × volume regime (2).
    const coarseLo = -2.5 + (retBin * 5) / 8;
    const residual = (retZ - coarseLo) / (5 / 8); // position inside the coarse bin, ~[0,1]
    const resBin = clampBin(Math.floor(residual * 4), 4);
    const bodyBin = clampBin(Math.floor(body * 4), 4);
    const volBin = zBin(volZ, 4);
    const fine = (resBin << 4) | (bodyBin << 2) | volBin;

    return {
      time: bar.time,
      coarse,
      fine,
      coarseBits: toBits(coarse, COARSE_BITS),
      fineBits: toBits(fine, FINE_BITS),
      features: { ret: rets[i], retZ, range: ranges[i], body, volZ },
    };
  });
}
