import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "../data/synthetic.ts";

export interface RenderLine {
  key: string;
  title: string;
  values: number[];
  color: string;
  width?: 1 | 2 | 3;
  dashed?: boolean;
  style?: "line" | "hist";
}

export interface RenderPane {
  id: string;
  lines: RenderLine[];
  /** Dashed horizontal guide lines (e.g. RSI 30/70). */
  guides?: number[];
}

export interface ChartMarker {
  time: number;
  kind: "correct" | "wrong" | "target";
}

interface Props {
  candles: Candle[];
  overlays: RenderLine[];
  panes: RenderPane[];
  markers: ChartMarker[];
  theme: "dark" | "light";
  onCandleClick?: (index: number) => void;
}

const THEMES = {
  dark: {
    bg: "#10141f",
    text: "#98a2b8",
    grid: "rgba(148, 163, 190, 0.08)",
    border: "rgba(148, 163, 190, 0.2)",
    up: "#2fbf8f",
    down: "#f2545b",
    volUp: "rgba(47, 191, 143, 0.35)",
    volDown: "rgba(242, 84, 91, 0.35)",
  },
  light: {
    bg: "#ffffff",
    text: "#5a6478",
    grid: "rgba(42, 55, 80, 0.07)",
    border: "rgba(42, 55, 80, 0.18)",
    up: "#189d74",
    down: "#e03e45",
    volUp: "rgba(24, 157, 116, 0.35)",
    volDown: "rgba(224, 62, 69, 0.35)",
  },
} as const;

function lineData(candles: Candle[], values: number[]) {
  return candles.map((c, i) =>
    Number.isNaN(values[i])
      ? { time: c.time as UTCTimestamp }
      : { time: c.time as UTCTimestamp, value: values[i] },
  );
}

export function Chart({ candles, overlays, panes, markers, theme, onCandleClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clickRef = useRef(onCandleClick);
  clickRef.current = onCandleClick;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const colors = THEMES[theme];

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: colors.bg },
        textColor: colors.text,
        attributionLogo: false,
        panes: { separatorColor: colors.border, enableResize: false },
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border, timeVisible: false },
      crosshair: { mode: 0 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.22 } });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? colors.volUp : colors.volDown,
      })),
    );
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    for (const line of overlays) {
      const s = chart.addSeries(LineSeries, {
        color: line.color,
        lineWidth: line.width ?? 2,
        lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
        title: line.title,
        priceLineVisible: false,
        lastValueVisible: false,
        pointMarkersVisible: false,
      });
      s.setData(lineData(candles, line.values));
    }

    panes.forEach((pane, pi) => {
      const paneIndex = pi + 1;
      let first = true;
      for (const line of pane.lines) {
        if (line.style === "hist") {
          const s = chart.addSeries(
            HistogramSeries,
            { priceLineVisible: false, lastValueVisible: false, title: line.title },
            paneIndex,
          );
          s.setData(
            candles.map((c, i) =>
              Number.isNaN(line.values[i])
                ? { time: c.time as UTCTimestamp }
                : {
                    time: c.time as UTCTimestamp,
                    value: line.values[i],
                    color: line.values[i] >= 0 ? colors.volUp : colors.volDown,
                  },
            ),
          );
          continue;
        }
        const s = chart.addSeries(
          LineSeries,
          {
            color: line.color,
            lineWidth: line.width ?? 2,
            lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
            title: line.title,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          paneIndex,
        );
        s.setData(lineData(candles, line.values));
        if (first && pane.guides) {
          for (const g of pane.guides) {
            s.createPriceLine({
              price: g,
              color: colors.text,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "",
            });
          }
        }
        first = false;
      }
      chart.panes()[paneIndex]?.setHeight(110);
    });

    if (markers.length > 0) {
      const seriesMarkers: SeriesMarker<Time>[] = markers.map((m) => {
        if (m.kind === "correct") {
          return {
            time: m.time as UTCTimestamp,
            position: "aboveBar",
            color: colors.up,
            shape: "arrowDown",
            text: "✓",
            size: 2,
          };
        }
        if (m.kind === "wrong") {
          return {
            time: m.time as UTCTimestamp,
            position: "aboveBar",
            color: colors.down,
            shape: "arrowDown",
            text: "✗",
            size: 2,
          };
        }
        return {
          time: m.time as UTCTimestamp,
          position: "belowBar",
          color: "#ffd166",
          shape: "circle",
          text: "",
          size: 1,
        };
      });
      createSeriesMarkers(candleSeries, seriesMarkers);
    }

    const timeToIndex = new Map<number, number>();
    candles.forEach((c, i) => timeToIndex.set(c.time, i));
    chart.subscribeClick((param) => {
      if (param.time === undefined) return;
      const idx = timeToIndex.get(param.time as number);
      if (idx !== undefined) clickRef.current?.(idx);
    });

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [candles, overlays, panes, markers, theme]);

  return <div ref={containerRef} className="chart-container" />;
}
