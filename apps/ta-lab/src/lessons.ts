/**
 * Original lesson content + "find it on the chart" exercises. Every exercise
 * is checked against the actual computed indicator series on the current
 * synthetic dataset — never against hard-coded answers.
 */

import type { Candle } from "./data/synthetic.ts";
import { getIndicator, type OutputLine } from "./indicators/indicators.ts";
import { primitives as P } from "./indicators/primitives.ts";

export interface Lesson {
  id: string;
  indicatorId: string;
  title: string;
  measures: string;
  read: string;
  pitfall: string;
  exercise: {
    prompt: string;
    /** ± bars accepted around a target index. */
    tolerance: number;
    /** Valid candle indices on this dataset. */
    targets(candles: Candle[]): number[];
    /** Feedback for a clicked candle (used for wrong answers). */
    describe(index: number, candles: Candle[]): string;
  };
  /** Extra dashed overlay lines drawn on the price chart while the exercise is active. */
  extraOverlays?(candles: Candle[]): OutputLine[];
}

const closes = (candles: Candle[]) => candles.map((c) => c.close);

function crossesAbove(a: number[], b: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < a.length; i++) {
    if ([a[i], a[i - 1], b[i], b[i - 1]].some(Number.isNaN)) continue;
    if (a[i - 1] <= b[i - 1] && a[i] > b[i]) out.push(i);
  }
  return out;
}

const fmt = (v: number) => (Number.isNaN(v) ? "n/a" : v.toFixed(2));

function run(indicatorId: string, candles: Candle[]) {
  const def = getIndicator(indicatorId);
  const lines = def.compute(candles, def.defaults, P);
  return (key: string) => lines.find((l) => l.key === key)!.values;
}

export const LESSONS: Lesson[] = [
  {
    id: "lesson-sma",
    indicatorId: "sma",
    title: "SMA — Simple Moving Average",
    measures:
      "The plain average of the last n closes. It compresses noisy prices into one slow line that shows where price has been, on average, over the window.",
    read:
      "Price above a rising SMA suggests an uptrend; below a falling one, a downtrend. Two SMAs of different lengths give crossover signals: the fast one crossing above the slow one (a 'golden cross') marks momentum shifting up.",
    pitfall:
      "Every value in the window counts equally, so the SMA reacts late — by the time it turns, a chunk of the move is gone. In sideways chop, crossovers whipsaw constantly.",
    exercise: {
      prompt: "Click a candle where SMA 20 crosses above SMA 50 (a golden cross).",
      tolerance: 1,
      targets(candles) {
        const src = closes(candles);
        return crossesAbove(P.sma(src, 20), P.sma(src, 50));
      },
      describe(i, candles) {
        const src = closes(candles);
        return `Here SMA20 = ${fmt(P.sma(src, 20)[i])} and SMA50 = ${fmt(
          P.sma(src, 50)[i],
        )}. Look for the bar where the fast line moves from below to above the slow one.`;
      },
    },
    extraOverlays(candles) {
      return [{ key: "sma50", title: "SMA 50 (slow)", values: P.sma(closes(candles), 50) }];
    },
  },
  {
    id: "lesson-ema",
    indicatorId: "ema",
    title: "EMA — Exponential Moving Average",
    measures:
      "A weighted average where each older close counts exponentially less. It tracks the same idea as the SMA but hugs recent price much more closely.",
    read:
      "Traders use the EMA as a dynamic support/resistance line: in a healthy trend, pullbacks tend to pause near it. A close crossing above the EMA is an early (and noisy) sign the short-term trend is turning up.",
    pitfall:
      "Its responsiveness cuts both ways — the EMA reacts to every spike, so single-bar noise can flip signals that an SMA would have ignored. Fast is not the same as right.",
    exercise: {
      prompt: "Click a candle where the close crosses above the EMA 21.",
      tolerance: 1,
      targets(candles) {
        const ema = run("ema", candles)("ema");
        return crossesAbove(closes(candles), ema);
      },
      describe(i, candles) {
        const ema = run("ema", candles)("ema");
        return `Close = ${fmt(candles[i].close)}, EMA21 = ${fmt(
          ema[i],
        )}. You want the bar that closes above the EMA after the previous bar closed at or below it.`;
      },
    },
  },
  {
    id: "lesson-rsi",
    indicatorId: "rsi",
    title: "RSI — Relative Strength Index",
    measures:
      "The balance of recent up-moves vs down-moves, smoothed with Wilder's RMA and squeezed into 0–100. It answers: of the recent bar-to-bar changes, how one-sided were they?",
    read:
      "Readings above 70 are conventionally 'overbought', below 30 'oversold'. More useful than the levels themselves is the crossing: RSI pushing up through 70 shows unusually one-sided buying pressure.",
    pitfall:
      "In a strong trend, RSI can sit above 70 for weeks while price keeps climbing — 'overbought' is a description, not a sell signal. Fading every high reading is a classic way to lose money.",
    exercise: {
      prompt: "Click a candle where RSI 14 crosses above 70.",
      tolerance: 1,
      targets(candles) {
        const rsi = run("rsi", candles)("rsi");
        return crossesAbove(rsi, rsi.map(() => 70));
      },
      describe(i, candles) {
        const rsi = run("rsi", candles)("rsi");
        return `RSI here is ${fmt(rsi[i])}. Find the bar where it moves from ≤ 70 to above 70 — watch the sub-pane.`;
      },
    },
  },
  {
    id: "lesson-macd",
    indicatorId: "macd",
    title: "MACD — Moving Average Convergence/Divergence",
    measures:
      "The gap between a fast EMA (12) and a slow EMA (26). When the fast one pulls away upward, momentum is building; the signal line (EMA 9 of MACD) smooths that gap, and the histogram shows their difference.",
    read:
      "Histogram flipping from negative to positive means the MACD line just crossed above its signal line — a bullish momentum cross. The further from zero the cross happens, the more stretched the move already is.",
    pitfall:
      "MACD is a derivative of two lagging averages, so it confirms moves rather than predicting them. In ranges it generates streams of small, losing crosses.",
    exercise: {
      prompt: "Click a candle where the MACD histogram flips from negative to positive.",
      tolerance: 1,
      targets(candles) {
        const hist = run("macd", candles)("hist");
        const out: number[] = [];
        for (let i = 1; i < hist.length; i++) {
          if (Number.isNaN(hist[i]) || Number.isNaN(hist[i - 1])) continue;
          if (hist[i - 1] <= 0 && hist[i] > 0) out.push(i);
        }
        return out;
      },
      describe(i, candles) {
        const hist = run("macd", candles)("hist");
        return `Histogram here is ${fmt(hist[i])}. You want the first positive bar right after a negative one — in the sub-pane.`;
      },
    },
  },
  {
    id: "lesson-bollinger",
    indicatorId: "bollinger",
    title: "Bollinger Bands",
    measures:
      "A 20-bar SMA with bands ±2 standard deviations around it. Band width is pure volatility: tight bands mean a quiet market, wide bands a loud one.",
    read:
      "Price tagging or closing outside a band is a statistically unusual excursion. Squeezes (bands pinching together) often precede expansions — volatility is cyclical even when direction isn't.",
    pitfall:
      "A close outside the band is not automatically a reversal. In a breakout, price can 'walk the band' — repeatedly closing outside — while the move keeps going.",
    exercise: {
      prompt: "Click a candle that closes above the upper Bollinger Band (20, 2).",
      tolerance: 0,
      targets(candles) {
        const get = run("bollinger", candles);
        const upper = get("upper");
        return candles.map((c, i) => (!Number.isNaN(upper[i]) && c.close > upper[i] ? i : -1)).filter((i) => i >= 0);
      },
      describe(i, candles) {
        const upper = run("bollinger", candles)("upper");
        return `Close = ${fmt(candles[i].close)}, upper band = ${fmt(
          upper[i],
        )}. Look for a candle whose close pokes above the upper band.`;
      },
    },
  },
  {
    id: "lesson-atr",
    indicatorId: "atr",
    title: "ATR — Average True Range",
    measures:
      "The average size of recent candles, where 'size' (true range) also counts gaps against the previous close. ATR says nothing about direction — only how much the market moves per bar.",
    read:
      "Rising ATR = expanding volatility; falling ATR = compression. Its classic job is position sizing and stop placement: a stop at 2×ATR adapts to how loud the market currently is.",
    pitfall:
      "Comparing raw ATR across symbols or price levels is meaningless — a $2 ATR is huge on a $20 stock and noise on a $2000 one. Normalize before comparing.",
    exercise: {
      prompt: "Click the candle where ATR 14 peaks (its highest value in this dataset).",
      tolerance: 2,
      targets(candles) {
        const atr = run("atr", candles)("atr");
        let best = -1;
        for (let i = 0; i < atr.length; i++) {
          if (!Number.isNaN(atr[i]) && (best < 0 || atr[i] > atr[best])) best = i;
        }
        return best >= 0 ? [best] : [];
      },
      describe(i, candles) {
        const atr = run("atr", candles)("atr");
        const max = Math.max(...atr.filter((v) => !Number.isNaN(v)));
        return `ATR here is ${fmt(atr[i])}; the dataset peak is ${fmt(
          max,
        )}. Find the stormiest stretch of the chart — the tallest point of the ATR sub-pane.`;
      },
    },
  },
  {
    id: "lesson-supertrend",
    indicatorId: "supertrend",
    title: "Supertrend",
    measures:
      "A trailing stop built from ATR: a band placed a multiple of ATR away from the candle midpoint that only ratchets in the trend's favor. The line flips sides when price closes through it.",
    read:
      "Line below price (green) = uptrend regime; line above price (red) = downtrend. The flip bar is the signal: it marks where the trailing stop was taken out and the regime label changed.",
    pitfall:
      "Supertrend is beautiful in trends and bleeds in ranges — every mean-reverting wiggle triggers a flip. It defines regime; it doesn't predict the next one.",
    exercise: {
      prompt: "Click a candle where Supertrend (10, 3) flips direction — either way.",
      tolerance: 1,
      targets(candles) {
        const dir = run("supertrend", candles)("direction");
        const out: number[] = [];
        for (let i = 1; i < dir.length; i++) {
          if (Number.isNaN(dir[i]) || Number.isNaN(dir[i - 1])) continue;
          if (dir[i] !== dir[i - 1]) out.push(i);
        }
        return out;
      },
      describe(i, candles) {
        const dir = run("supertrend", candles)("direction");
        const label = dir[i] === 1 ? "uptrend" : "downtrend";
        return `This bar is inside a ${label} stretch. Find a bar where the colored line jumps from one side of price to the other.`;
      },
    },
  },
];

export interface ExerciseCheck {
  ok: boolean;
  message: string;
  targetCount: number;
}

export function checkExercise(lesson: Lesson, clickedIndex: number, candles: Candle[]): ExerciseCheck {
  const targets = lesson.exercise.targets(candles);
  const tol = lesson.exercise.tolerance;
  const hit = targets.some((t) => Math.abs(t - clickedIndex) <= tol);
  if (hit) {
    return {
      ok: true,
      message: `Correct — that's one of ${targets.length} matching candle${targets.length === 1 ? "" : "s"} in this dataset.`,
      targetCount: targets.length,
    };
  }
  return {
    ok: false,
    message: lesson.exercise.describe(clickedIndex, candles),
    targetCount: targets.length,
  };
}
