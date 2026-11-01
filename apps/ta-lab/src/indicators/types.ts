import type { Candle } from "../data/synthetic.ts";
import type { Primitives, Series } from "./primitives.ts";

export type Params = Record<string, number>;

export interface ParamMeta {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface OutputLine {
  key: string;
  title: string;
  values: Series;
  /** Hint for the renderer; "hidden" lines carry data (signals, states) but aren't plotted. */
  style?: "line" | "hist" | "hidden";
}

export type ModuleId =
  | "foundations"
  | "moving-averages"
  | "oscillators"
  | "volatility"
  | "trend-systems"
  | "advanced";

export interface IndicatorDef {
  id: string;
  name: string;
  module: ModuleId;
  /** overlay = drawn on the price chart; pane = separate sub-pane. */
  kind: "overlay" | "pane";
  defaults: Params;
  paramMeta: ParamMeta[];
  /** Dashed horizontal guide lines for pane indicators (e.g. RSI 30/70). */
  guides?: number[];
  compute(candles: Candle[], params: Params, P: Primitives): OutputLine[];
}

export const closes = (candles: Candle[]): Series => candles.map((c) => c.close);
export const highs = (candles: Candle[]): Series => candles.map((c) => c.high);
export const lows = (candles: Candle[]): Series => candles.map((c) => c.low);
export const volumes = (candles: Candle[]): Series => candles.map((c) => c.volume);
