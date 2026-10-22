/**
 * Original lesson content + "find it on the chart" exercises, organized into
 * the six-module curriculum. Every exercise is checked against the actual
 * computed indicator series on the current synthetic dataset — never against
 * hard-coded answers.
 */

import type { Candle } from "./data/synthetic.ts";
import { getIndicator, MODULES, type ModuleId, type OutputLine } from "./indicators/indicators.ts";
import { primitives as P } from "./indicators/primitives.ts";

export type LessonTag = "Basic" | "Intermediate" | "Advanced";

export interface Lesson {
  id: string;
  moduleId: ModuleId;
  indicatorId: string;
  title: string;
  tag: LessonTag;
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

const flagged = (values: number[]) =>
  values.map((v, i) => (v === 1 ? i : -1)).filter((i) => i >= 0);

const fmt = (v: number) => (Number.isNaN(v) ? "n/a" : v.toFixed(2));

function run(indicatorId: string, candles: Candle[]) {
  const def = getIndicator(indicatorId);
  const lines = def.compute(candles, def.defaults, P);
  return (key: string) => lines.find((l) => l.key === key)!.values;
}

export const LESSONS: Lesson[] = [
  // ───────────────────────────── Module 1 · Foundations ─────────────────────
  {
    id: "lesson-patterns",
    moduleId: "foundations",
    indicatorId: "patterns",
    title: "Candlestick Charts & Patterns",
    tag: "Basic",
    measures:
      "A candle compresses one bar of trading into four prices: open, high, low, close. The body shows who won the bar; the wicks show what was attempted and rejected. Patterns like the doji (no body — a stalemate), the hammer (long lower wick — sellers pushed, buyers recovered) and the engulfing bar (one body swallows the previous one) are just recurring shapes of that tug-of-war.",
    read:
      "Patterns only mean something in context. A hammer into a falling market hints at exhaustion; the same shape mid-range is noise. An engulfing candle matters because it shows the balance flipped *within* one bar — the new side erased everything the old side did the bar before.",
    pitfall:
      "Pattern names feel predictive, but alone they are weak signals with huge false-positive rates. Tiny candles form 'patterns' constantly; serious usage filters by candle size and location, exactly like this detector's average-range filter does.",
    exercise: {
      prompt: "Click a bullish engulfing candle (green body swallowing the previous red body).",
      tolerance: 0,
      targets: (candles) => flagged(run("patterns", candles)("bullEngulf")),
      describe(i, candles) {
        const get = run("patterns", candles);
        if (get("bearEngulf")[i] === 1)
          return "That's a bearish engulfing — the red mirror image. You want the green one.";
        if (get("doji")[i] === 1) return "That's a doji — almost no body at all.";
        const c = candles[i];
        return `This candle's body runs ${fmt(Math.min(c.open, c.close))}–${fmt(
          Math.max(c.open, c.close),
        )}; it doesn't engulf the previous body. Look for a green bar that completely covers the red bar before it.`;
      },
    },
  },
  {
    id: "lesson-srlevels",
    moduleId: "foundations",
    indicatorId: "srlevels",
    title: "Support & Resistance",
    tag: "Basic",
    measures:
      "Horizontal prices where turning points cluster. Each swing low that holds is a footprint of buyers stepping in; swing highs that reject are sellers doing the same. Stack enough footprints at one price and you have a level the whole market can see.",
    read:
      "The more touches a level has — without breaking — the more meaningful the *next* touch. Old resistance often flips into support once broken, because the trapped sellers who defended it become buyers trying to exit at break-even.",
    pitfall:
      "Levels are zones, not lines. Price routinely overshoots a level by a wick before respecting it, which stops out anyone who treated the exact number as sacred. Draw them wide and judge closes, not wicks.",
    exercise: {
      prompt: "Click one of the swing lows that build the strongest support level (most touches).",
      tolerance: 1,
      targets: (candles) => flagged(run("srlevels", candles)("supPivots")),
      describe(i, candles) {
        const sup = run("srlevels", candles)("sup0");
        const level = sup[sup.length - 1];
        return `This candle's low is ${fmt(candles[i].low)}; the strongest support sits near ${fmt(
          level,
        )}. Find the bottoms that repeatedly bounced from that zone.`;
      },
    },
  },
  {
    id: "lesson-linregchannel",
    moduleId: "foundations",
    indicatorId: "linregchannel",
    title: "Trend Basics & Channels",
    tag: "Intermediate",
    measures:
      "A trend is a persistent drift in price. The channel makes it measurable: a least-squares regression line is the statistically best 'path' through the window, and the ± stdev bands show how far price normally strays from that path.",
    read:
      "The midline's slope is the trend. Price near the lower band of a rising channel is a routine pullback; price *closing outside* a band is a statistical outlier — either an exhaustion extreme or the start of a regime change.",
    pitfall:
      "A regression channel always fits the past window perfectly — it tells you what the trend *was*. After a sharp break, the channel takes many bars to rotate, happily pointing up while price collapses.",
    exercise: {
      prompt: "Click a candle that closes below the lower channel band (a downside outlier).",
      tolerance: 0,
      targets(candles) {
        const lower = run("linregchannel", candles)("lower");
        return closes(candles)
          .map((c, i) => (!Number.isNaN(lower[i]) && c < lower[i] ? i : -1))
          .filter((i) => i >= 0);
      },
      describe(i, candles) {
        const lower = run("linregchannel", candles)("lower");
        return `Close = ${fmt(candles[i].close)}, lower band = ${fmt(
          lower[i],
        )}. You want a close *under* the band — more than ~2σ below the regression path.`;
      },
    },
  },
  {
    id: "lesson-obv",
    moduleId: "foundations",
    indicatorId: "obv",
    title: "Volume Basics & OBV",
    tag: "Basic",
    measures:
      "Volume is conviction: how much actually traded behind each move. On-Balance Volume compresses it into one running line — add the bar's volume on up-closes, subtract it on down-closes — so you can see whether accumulation or distribution dominates.",
    read:
      "OBV should confirm price. New price highs with new OBV highs = healthy participation. Price grinding up while OBV sags means the rally is running on thin volume. The OBV crossing its own average is the simplest 'flow just flipped' event.",
    pitfall:
      "OBV's absolute number is meaningless — only its shape and direction matter. One enormous-volume bar also permanently shifts the line, so a single event can dominate weeks of signal.",
    exercise: {
      prompt: "Click a candle where OBV crosses above its signal SMA (in the OBV pane).",
      tolerance: 1,
      targets(candles) {
        const get = run("obv", candles);
        return crossesAbove(get("obv"), get("signal"));
      },
      describe(i, candles) {
        const get = run("obv", candles);
        return `Here OBV = ${fmt(get("obv")[i])} vs signal ${fmt(
          get("signal")[i],
        )}. Watch the OBV pane for the bar where the line pushes up through its average.`;
      },
    },
  },

  // ─────────────────────────── Module 2 · Moving Averages ───────────────────
  {
    id: "lesson-sma",
    moduleId: "moving-averages",
    indicatorId: "sma",
    title: "SMA — Simple Moving Average",
    tag: "Basic",
    measures:
      "The plain average of the last n closes. It compresses noisy prices into one slow line that shows where price has been, on average, over the window.",
    read:
      "Price above a rising SMA suggests an uptrend; below a falling one, a downtrend. A classic rhythm in trends: price dips under the average, then *reclaims* it — the reclaim bar is where trend-followers re-engage.",
    pitfall:
      "Every value in the window counts equally, so the SMA reacts late — by the time it turns, a chunk of the move is gone. In sideways chop, price crosses it constantly and every 'signal' whipsaws.",
    exercise: {
      prompt: "Click a candle that closes back above the SMA 20 after at least 5 closes below it.",
      tolerance: 1,
      targets(candles) {
        const sma = run("sma", candles)("sma");
        const src = closes(candles);
        const out: number[] = [];
        for (let i = 6; i < src.length; i++) {
          if (Number.isNaN(sma[i])) continue;
          if (src[i] <= sma[i]) continue;
          let below = true;
          for (let j = i - 5; j < i; j++) {
            if (Number.isNaN(sma[j]) || src[j] > sma[j]) below = false;
          }
          if (below) out.push(i);
        }
        return out;
      },
      describe(i, candles) {
        const sma = run("sma", candles)("sma");
        return `Close = ${fmt(candles[i].close)}, SMA20 = ${fmt(
          sma[i],
        )}. You want the first close back above the average after a stretch of at least 5 bars underneath it.`;
      },
    },
  },
  {
    id: "lesson-ema",
    moduleId: "moving-averages",
    indicatorId: "ema",
    title: "EMA — Exponential Moving Average",
    tag: "Basic",
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
    id: "lesson-macross",
    moduleId: "moving-averages",
    indicatorId: "macross",
    title: "MA Crossovers",
    tag: "Intermediate",
    measures:
      "Two averages of different speeds turned into a binary regime switch. When the fast average sits above the slow one, recent prices outrun older ones — momentum is up. The cross bar itself ('golden cross' up, 'death cross' down) is the moment the regimes swap.",
    read:
      "Crossovers are trend *confirmation*, not prediction: a golden cross fires well after the bottom. Their value is discipline — one unambiguous, testable rule — and the GC/DC markers on the chart show exactly where that rule fires.",
    pitfall:
      "In a range, the two averages braid around each other and every cross is a fake. Crossover systems make all their money in a few long trends and bleed it back in chop; most people quit them right before the trend arrives.",
    exercise: {
      prompt: "Click a golden cross — the bar where SMA 20 crosses above SMA 50 (GC marker).",
      tolerance: 1,
      targets: (candles) => flagged(run("macross", candles)("golden")),
      describe(i, candles) {
        const get = run("macross", candles);
        return `Here SMA20 = ${fmt(get("fast")[i])} and SMA50 = ${fmt(
          get("slow")[i],
        )}. Find the bar where the fast line moves from below to above the slow one.`;
      },
    },
  },
  {
    id: "lesson-ribbon",
    moduleId: "moving-averages",
    indicatorId: "ribbon",
    title: "EMA Ribbon",
    tag: "Intermediate",
    measures:
      "A fan of EMAs (8/13/21/34/55) plotted together. The ribbon's *shape* is the signal: tightly braided means no trend; smoothly fanned out in order means every timescale agrees on direction.",
    read:
      "The moment the ribbon stacks into perfect order (fastest on top for bullish) is a strong regime statement — short-, medium- and long-horizon averages are all aligned. Compression after a long fan-out warns the trend is tiring.",
    pitfall:
      "Five lines look authoritative but carry barely more information than two — they are all smoothed versions of the same closes. The ribbon's beauty tempts people into seeing structure in what is still just one autocorrelated series.",
    exercise: {
      prompt: "Click the candle where the ribbon first stacks fully bullish (all EMAs in order).",
      tolerance: 1,
      targets(candles) {
        const stacked = run("ribbon", candles)("stacked");
        const out: number[] = [];
        for (let i = 1; i < stacked.length; i++) {
          if (stacked[i] === 1 && stacked[i - 1] !== 1) out.push(i);
        }
        return out;
      },
      describe(i, candles) {
        const stacked = run("ribbon", candles)("stacked");
        const state = stacked[i] === 1 ? "already fully bullish" : stacked[i] === -1 ? "fully bearish" : "mixed";
        return `The ribbon here is ${state}. You want the exact bar where it *becomes* fully bullish — the first bar of a clean fan-out.`;
      },
    },
  },

  // ──────────────────────────── Module 3 · Oscillators ──────────────────────
  {
    id: "lesson-rsi",
    moduleId: "oscillators",
    indicatorId: "rsi",
    title: "RSI — Relative Strength Index",
    tag: "Basic",
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
    id: "lesson-stochastic",
    moduleId: "oscillators",
    indicatorId: "stochastic",
    title: "Stochastic Oscillator",
    tag: "Intermediate",
    measures:
      "Where the close sits inside the recent high–low range, as a percentage. 100 means closing at the very top of the range, 0 at the very bottom. %K is that raw position smoothed; %D smooths it again as a trigger line.",
    read:
      "Below 20 the market keeps closing near the bottom of its range — stretched. The classic entry isn't the level itself but the turn: %K hooking up through %D while both are still deep in the oversold zone.",
    pitfall:
      "Stochastic is range math, so it's superb in sideways markets and terrible in trends: in a strong downtrend, the close is *always* near the bottom of the range and the oscillator stays pinned at oversold while price keeps falling.",
    exercise: {
      prompt: "Click a candle where %K crosses above %D while %D is still below 25.",
      tolerance: 1,
      targets(candles) {
        const get = run("stochastic", candles);
        const d = get("d");
        return crossesAbove(get("k"), d).filter((i) => d[i] <= 25);
      },
      describe(i, candles) {
        const get = run("stochastic", candles);
        return `Here %K = ${fmt(get("k")[i])} and %D = ${fmt(
          get("d")[i],
        )}. You want %K hooking up through %D while they're both deep in the lower zone (below 25).`;
      },
    },
  },
  {
    id: "lesson-macd",
    moduleId: "oscillators",
    indicatorId: "macd",
    title: "MACD — Convergence/Divergence",
    tag: "Intermediate",
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
    id: "lesson-cci",
    moduleId: "oscillators",
    indicatorId: "cci",
    title: "CCI — Commodity Channel Index",
    tag: "Intermediate",
    measures:
      "How far today's typical price (HLC/3) sits from its average, scaled by the mean absolute deviation. The 0.015 constant calibrates it so roughly ¾ of readings land between −100 and +100.",
    read:
      "Beyond ±100 means price is statistically stretched from its own recent norm. Trend traders read +100 crossings as breakout strength; mean-reversion traders read extreme readings as rubber-band setups. Same number, opposite trades — know which game you're playing.",
    pitfall:
      "Because CCI is unbounded, 'extreme' has no fixed meaning: +200 in a quiet market and +200 in a wild one are different animals. Comparing CCI values across regimes without checking volatility is a trap.",
    exercise: {
      prompt: "Click a candle where CCI crosses above +100 (breakout-strength threshold).",
      tolerance: 1,
      targets(candles) {
        const cci = run("cci", candles)("cci");
        return crossesAbove(cci, cci.map(() => 100));
      },
      describe(i, candles) {
        const cci = run("cci", candles)("cci");
        return `CCI here is ${fmt(cci[i])}. Find the bar where it pushes up through the +100 guide in the sub-pane.`;
      },
    },
  },

  // ──────────────────────────── Module 4 · Volatility ───────────────────────
  {
    id: "lesson-bollinger",
    moduleId: "volatility",
    indicatorId: "bollinger",
    title: "Bollinger Bands",
    tag: "Intermediate",
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
        const upper = run("bollinger", candles)("upper");
        return candles
          .map((c, i) => (!Number.isNaN(upper[i]) && c.close > upper[i] ? i : -1))
          .filter((i) => i >= 0);
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
    moduleId: "volatility",
    indicatorId: "atr",
    title: "ATR — Average True Range",
    tag: "Basic",
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
    id: "lesson-keltner",
    moduleId: "volatility",
    indicatorId: "keltner",
    title: "Keltner Channels",
    tag: "Intermediate",
    measures:
      "An EMA midline with bands a multiple of ATR away. Same envelope idea as Bollinger, but built on *range* volatility (ATR) instead of close-to-close dispersion (stdev) — so single wild closes distort it far less.",
    read:
      "Because ATR evolves smoothly, Keltner bands breathe slower than Bollinger's. A close outside a Keltner band therefore means more: price beat a volatility estimate that doesn't overreact. Trend riders often trail stops on the opposite band.",
    pitfall:
      "Smoothness is also lag. After a volatility explosion the channel stays too tight for several bars, making everything look like a breakout. Check whether ATR itself just jumped before trusting the band break.",
    exercise: {
      prompt: "Click a candle that closes above the upper Keltner Channel (20, 2×ATR).",
      tolerance: 0,
      targets(candles) {
        const upper = run("keltner", candles)("upper");
        return candles
          .map((c, i) => (!Number.isNaN(upper[i]) && c.close > upper[i] ? i : -1))
          .filter((i) => i >= 0);
      },
      describe(i, candles) {
        const upper = run("keltner", candles)("upper");
        return `Close = ${fmt(candles[i].close)}, upper channel = ${fmt(
          upper[i],
        )}. You want a close fully above the ATR-based envelope.`;
      },
    },
  },
  {
    id: "lesson-squeeze",
    moduleId: "volatility",
    indicatorId: "squeeze",
    title: "TTM Squeeze",
    tag: "Advanced",
    measures:
      "A compression detector: the squeeze is 'on' while the Bollinger Bands fit entirely *inside* the Keltner Channels — close-to-close volatility has collapsed below even the smoothed range estimate. The histogram is regression-smoothed momentum, hinting which way the coil points.",
    read:
      "Squeeze on = energy loading; nothing to do yet. The event is the *release* — the first bar where the Bollingers pop back outside the Keltners after a proper coil. Momentum's sign and slope at that bar picks the direction.",
    pitfall:
      "Not every squeeze releases into a move — plenty fizzle into more chop, and the release direction can head-fake on the very first bar. The squeeze finds *conditions* for a move; it never promises one.",
    exercise: {
      prompt: "Click the candle where a squeeze fires (releases after coiling for 3+ bars).",
      tolerance: 1,
      targets: (candles) => flagged(run("squeeze", candles)("fired")),
      describe(i, candles) {
        const on = run("squeeze", candles)("squeezeOn");
        const state = on[i] === 1 ? "inside a squeeze (still coiling)" : "not in a squeeze";
        return `This bar is ${state}. You want the release bar — the first bar *after* a coil of at least 3 bars where the bands pop back open.`;
      },
    },
  },

  // ─────────────────────────── Module 5 · Trend Systems ─────────────────────
  {
    id: "lesson-supertrend",
    moduleId: "trend-systems",
    indicatorId: "supertrend",
    title: "Supertrend",
    tag: "Intermediate",
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
  {
    id: "lesson-adx",
    moduleId: "trend-systems",
    indicatorId: "adx",
    title: "ADX / DMI",
    tag: "Advanced",
    measures:
      "Directional movement separated into +DI (upward range expansion) and −DI (downward), each normalized by ATR. ADX smooths the *gap* between them — it measures how one-sided movement is, with zero interest in which side.",
    read:
      "ADX below ~20: no trend worth the name; crossover systems will whipsaw. ADX pushing through 25 while rising: a real trend is igniting — direction given by whichever DI line is on top. Falling ADX after a long trend marks exhaustion, not reversal.",
    pitfall:
      "ADX rises during strong *downtrends* too — it is trend strength, not bullishness. And because it's triple-smoothed it turns very late; treat it as a regime filter for other signals, never as an entry trigger by itself.",
    exercise: {
      prompt: "Click a candle where ADX crosses above 25 (trend ignition).",
      tolerance: 1,
      targets(candles) {
        const adx = run("adx", candles)("adx");
        return crossesAbove(adx, adx.map(() => 25));
      },
      describe(i, candles) {
        const get = run("adx", candles);
        return `ADX here is ${fmt(get("adx")[i])} (+DI ${fmt(get("plusDI")[i])}, −DI ${fmt(
          get("minusDI")[i],
        )}). Find the bar where the ADX line pushes up through the 25 guide.`;
      },
    },
  },
  {
    id: "lesson-ichimoku",
    moduleId: "trend-systems",
    indicatorId: "ichimoku",
    title: "Ichimoku Kinko Hyo",
    tag: "Advanced",
    measures:
      "Five lines from one primitive — range midpoints: Tenkan (9-bar midpoint) and Kijun (26) read like fast/slow averages built on highs and lows; Senkou A & B project midpoints 26 bars forward to form the cloud; Chikou plots today's close 26 bars back for an honesty check against past price.",
    read:
      "One glance gives a full verdict: price above the cloud with Tenkan above Kijun is an aligned uptrend. The TK cross is the system's tactical trigger, strongest when it happens above the cloud. A thick cloud ahead = layered support; a thin one = flimsy.",
    pitfall:
      "Ichimoku looks mystical but is just shifted range midpoints — on a fresh breakout from a long range, every line collapses onto the same price and the system goes temporarily blind. The shifted lines also redraw context late; the cloud ahead was computed 26 bars ago.",
    exercise: {
      prompt: "Click a candle where Tenkan crosses above Kijun (a TK cross).",
      tolerance: 1,
      targets(candles) {
        const get = run("ichimoku", candles);
        return crossesAbove(get("tenkan"), get("kijun"));
      },
      describe(i, candles) {
        const get = run("ichimoku", candles);
        return `Tenkan = ${fmt(get("tenkan")[i])}, Kijun = ${fmt(
          get("kijun")[i],
        )} here. You want the bar where the fast midpoint line lifts through the slow one.`;
      },
    },
  },
  {
    id: "lesson-donchian",
    moduleId: "trend-systems",
    indicatorId: "donchian",
    title: "Donchian Channels",
    tag: "Intermediate",
    measures:
      "The purest trend tool there is: the highest high and lowest low of the last n bars. No smoothing, no weights — just the edges of recent price territory.",
    read:
      "A close above the prior n-bar high means price just did something it hasn't done in n bars — the definition of a breakout. The turtle-trader classic: buy 20-bar breakouts, exit on the opposite 10-bar extreme.",
    pitfall:
      "Breakout entries guarantee you buy at the most expensive point of the window, so the win rate is low and the edge lives entirely in the few breakouts that keep running. Without disciplined exits the many small failures eat the few big wins.",
    exercise: {
      prompt: "Click a candle that closes above the previous bar's 20-day Donchian high (breakout).",
      tolerance: 1,
      targets(candles) {
        const upper = run("donchian", candles)("upper");
        const src = closes(candles);
        const out: number[] = [];
        for (let i = 2; i < src.length; i++) {
          if (Number.isNaN(upper[i - 1]) || Number.isNaN(upper[i - 2])) continue;
          if (src[i] > upper[i - 1] && src[i - 1] <= upper[i - 2]) out.push(i);
        }
        return out;
      },
      describe(i, candles) {
        const upper = run("donchian", candles)("upper");
        return `Close = ${fmt(candles[i].close)} vs prior channel top ${fmt(
          upper[Math.max(0, i - 1)],
        )}. You want the first close that pokes above everything the last 20 bars printed.`;
      },
    },
  },

  // ─────────────────────────── Module 6 · Advanced Tools ────────────────────
  {
    id: "lesson-vwap",
    moduleId: "advanced",
    indicatorId: "vwap",
    title: "Anchored VWAP",
    tag: "Advanced",
    measures:
      "The volume-weighted average price since an anchor point: every bar's typical price weighted by how much actually traded there. It is the average holder's cost basis from that anchor onward.",
    read:
      "Anchor it to an event — a major low, a breakout, a dataset start — and the line tells you who's in profit. Price above the anchored VWAP: average buyer since the anchor is up, dips get bought. Price reclaiming VWAP from below is the moment trapped longs stop being trapped.",
    pitfall:
      "VWAP is anchor-dependent: two traders with different anchors see different lines and both call it 'the' VWAP. And since it averages *all* volume since the anchor, it gets heavier and slower the longer it runs — late in the window it barely moves.",
    exercise: {
      prompt: "Click a candle where the close crosses above the anchored VWAP.",
      tolerance: 1,
      targets(candles) {
        const vwap = run("vwap", candles)("vwap");
        return crossesAbove(closes(candles), vwap);
      },
      describe(i, candles) {
        const vwap = run("vwap", candles)("vwap");
        return `Close = ${fmt(candles[i].close)}, VWAP = ${fmt(
          vwap[i],
        )}. Find the bar where price reclaims the volume-weighted cost basis from below.`;
      },
    },
  },
  {
    id: "lesson-fib",
    moduleId: "advanced",
    indicatorId: "fib",
    title: "Fibonacci Retracement",
    tag: "Advanced",
    measures:
      "Ratio levels (23.6 %, 38.2 %, 50 %, 61.8 %, 78.6 %) of the last major swing, drawn as horizontal prices. Here the swing is auto-anchored to the lookback window's extreme high and low.",
    read:
      "After an impulse move, pullbacks often stall at partial retracements. The 0.5–0.618 zone — the 'golden pocket' — is the most-watched: deep enough to shake out weak hands, shallow enough that the original trend is intact.",
    pitfall:
      "There is nothing magical about these ratios; their power is substantially self-fulfilling, and with enough levels drawn, *something* always 'worked' in hindsight. Use them as zones where you look for confirmation, never as standalone triggers.",
    exercise: {
      prompt: "Click a candle that trades into the golden pocket (0.5–0.618 retracement zone).",
      tolerance: 0,
      targets: (candles) => flagged(run("fib", candles)("goldenTouch")),
      describe(i, candles) {
        const get = run("fib", candles);
        const z1 = get("fib5")[get("fib5").length - 1];
        const z2 = get("fib618")[get("fib618").length - 1];
        return `This candle spans ${fmt(candles[i].low)}–${fmt(candles[i].high)}; the golden pocket sits at ${fmt(
          Math.min(z1, z2),
        )}–${fmt(Math.max(z1, z2))}. Find a bar whose range reaches into that zone after the swing completes.`;
      },
    },
  },
  {
    id: "lesson-pivots",
    moduleId: "advanced",
    indicatorId: "pivots",
    title: "Pivot Points",
    tag: "Advanced",
    measures:
      "Mechanical levels computed from the previous period's high, low and close (here: the previous month of synthetic dailies). P is the typical price; R1/S1 and R2/S2 project resistance and support symmetrically around it — classic or Fibonacci-spaced.",
    read:
      "Because everyone computes the identical numbers, pivots work as coordination points: intraday mean-reverters fade R1/S1 touches, breakout traders need closes beyond them. P acts as the session's gravity — above it leans long, below leans short.",
    pitfall:
      "Pivots are pure arithmetic on last period's range — they know nothing about news, gaps or regime changes. After a violent month the new levels can land nowhere near where price actually trades, and 'respect' for them evaporates.",
    exercise: {
      prompt: "Click a candle whose low touches this month's S1 and closes back above it.",
      tolerance: 0,
      targets(candles) {
        const s1 = run("pivots", candles)("s1");
        return candles
          .map((c, i) =>
            !Number.isNaN(s1[i]) && c.low <= s1[i] && c.close > s1[i] ? i : -1,
          )
          .filter((i) => i >= 0);
      },
      describe(i, candles) {
        const s1 = run("pivots", candles)("s1");
        return `This bar spans ${fmt(candles[i].low)}–${fmt(candles[i].high)} with S1 at ${fmt(
          s1[i],
        )}. You want a dip that tags S1 but closes back above it — a defended support test.`;
      },
    },
  },
  {
    id: "lesson-divergence",
    moduleId: "advanced",
    indicatorId: "divergence",
    title: "Divergences",
    tag: "Advanced",
    measures:
      "A disagreement between price and momentum at matching swing points: price prints a lower low while RSI prints a higher low (bullish), or a higher high with a lower RSI high (bearish). The second swing happened on visibly less force.",
    read:
      "Divergence says the move is *decelerating*, not reversing — the sellers made a new low but needed far less conviction to do it. It's a warning light that gets its meaning from confirmation: the bounce, the reclaim, the break of structure that follows.",
    pitfall:
      "In strong trends, divergences stack up and fail repeatedly — momentum can 'diverge' for five swings while price keeps trending. Counter-trend entries on divergence alone are among the most expensive habits in technical trading.",
    exercise: {
      prompt: "Click a candle flagged as a bullish divergence (▲ marker: lower low, higher RSI).",
      tolerance: 1,
      targets: (candles) => flagged(run("divergence", candles)("bullDiv")),
      describe(i, candles) {
        const bear = run("divergence", candles)("bearDiv");
        if (bear[i] === 1)
          return "That's a bearish divergence (higher high, weaker RSI) — you want the bullish one at a swing low.";
        return "No divergence is flagged at this bar. Look for the ▲ markers under swing lows where price made a lower low but RSI didn't.";
      },
    },
  },
];

export const LESSONS_BY_MODULE = MODULES.map((m) => ({
  module: m,
  lessons: LESSONS.filter((l) => l.moduleId === m.id),
}));

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
