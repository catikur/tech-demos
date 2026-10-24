import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, ProjectedClose } from "../data/synthetic.ts";
import { lineSegments, projectedClosePoints, seriesPoints } from "./chart-series.ts";

export interface RenderLine {
  key: string;
  title: string;
  values: number[];
  color: string;
  width?: 1 | 2 | 3;
  dashed?: boolean;
  style?: "line" | "hist";
  /** Optional per-bar histogram colors (overrides sign-based coloring). */
  histColors?: (string | undefined)[];
}

export interface RenderPane {
  id: string;
  lines: RenderLine[];
  /** Dashed horizontal guide lines (e.g. RSI 30/70). */
  guides?: number[];
}

export interface ChartMarker {
  time: number;
  kind: "correct" | "wrong" | "target" | "bull" | "bear" | "note";
  text?: string;
}

interface Props {
  /** Real daily candles. Lesson clicks index this array; the tail is not included. */
  candles: Candle[];
  /**
   * Made-up closes after the last candle. Empty hides the path.
   * Indicator `values` longer than `candles` align onto these times and
   * switch stroke at the first projected bar.
   */
  projected: ProjectedClose[];
  /** When set, the time scale opens on the last real bars plus the path. */
  focusTail?: boolean;
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
    path: "#d5deef",
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
    path: "#243049",
  },
} as const;

const TAIL_VIEW_REAL_BARS = 80;

function asLineData(rows: { time: number; value?: number }[]) {
  return rows.map((row) => {
    const time = row.time as UTCTimestamp;
    return row.value === undefined ? { time } : { time, value: row.value };
  });
}

function addSplitLine(
  chart: IChartApi,
  line: RenderLine,
  times: number[],
  realCount: number,
  paneIndex?: number,
): ISeriesApi<"Line"> {
  const segments = lineSegments(line.values.length, realCount);
  const baseStyle = line.dashed ? LineStyle.Dashed : LineStyle.Solid;
  const baseOptions = {
    color: line.color,
    lineWidth: line.width ?? 2,
    lineStyle: baseStyle,
    title: line.title,
    priceLineVisible: false,
    lastValueVisible: false,
    pointMarkersVisible: false,
  };
  const base =
    paneIndex === undefined
      ? chart.addSeries(LineSeries, baseOptions)
      : chart.addSeries(LineSeries, baseOptions, paneIndex);
  base.setData(asLineData(seriesPoints(times, line.values, segments.base.from, segments.base.to)));

  if (segments.projected) {
    const projectedStyle = line.dashed ? LineStyle.SparseDotted : LineStyle.Dashed;
    const tailOptions = {
      color: line.color,
      lineWidth: line.width ?? 2,
      lineStyle: projectedStyle,
      title: "",
      priceLineVisible: false,
      lastValueVisible: false,
      pointMarkersVisible: false,
    };
    const tail =
      paneIndex === undefined
        ? chart.addSeries(LineSeries, tailOptions)
        : chart.addSeries(LineSeries, tailOptions, paneIndex);
    tail.setData(
      asLineData(seriesPoints(times, line.values, segments.projected.from, segments.projected.to)),
    );
  }
  return base;
}

export function Chart({
  candles,
  projected,
  focusTail = false,
  overlays,
  panes,
  markers,
  theme,
  onCandleClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clickRef = useRef(onCandleClick);
  clickRef.current = onCandleClick;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const colors = THEMES[theme];
    const realCount = candles.length;
    const times = [...candles.map((c) => c.time), ...projected.map((p) => p.time)];

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
      timeScale: { borderColor: colors.border, timeVisible: false, rightOffset: 3 },
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

    const last = candles[candles.length - 1];
    if (last && projected.length > 0) {
      const pathSeries = chart.addSeries(LineSeries, {
        color: colors.path,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        title: "Projected close",
        priceLineVisible: false,
        lastValueVisible: false,
        pointMarkersVisible: false,
      });
      pathSeries.setData(asLineData(projectedClosePoints(last, projected)));
    }

    for (const line of overlays) {
      addSplitLine(chart, line, times, realCount);
    }

    const addHistogram = (line: RenderLine, paneIndex: number) => {
      const extendsTail = line.values.length > realCount;
      const barCount = extendsTail ? realCount : Math.min(line.values.length, times.length);
      const series = chart.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false, title: line.title },
        paneIndex,
      );
      series.setData(
        times.slice(0, barCount).map((time, i) =>
          Number.isNaN(line.values[i])
            ? { time: time as UTCTimestamp }
            : {
                time: time as UTCTimestamp,
                value: line.values[i],
                color:
                  line.histColors?.[i] ?? (line.values[i] >= 0 ? colors.volUp : colors.volDown),
              },
        ),
      );
      if (extendsTail) {
        const tail = chart.addSeries(
          LineSeries,
          {
            color: colors.path,
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            title: "",
            priceLineVisible: false,
            lastValueVisible: false,
            pointMarkersVisible: false,
          },
          paneIndex,
        );
        tail.setData(
          asLineData(seriesPoints(times, line.values, realCount - 1, line.values.length)),
        );
      }
    };

    panes.forEach((pane, pi) => {
      const paneIndex = pi + 1;
      let guidesDrawn = false;
      for (const line of pane.lines) {
        if (line.style === "hist") {
          addHistogram(line, paneIndex);
          continue;
        }
        const series = addSplitLine(chart, line, times, realCount, paneIndex);
        if (!guidesDrawn && pane.guides) {
          for (const g of pane.guides) {
            series.createPriceLine({
              price: g,
              color: colors.text,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "",
            });
          }
          guidesDrawn = true;
        }
      }
      chart.panes()[paneIndex]?.setHeight(110);
    });

    if (markers.length > 0) {
      const seriesMarkers: SeriesMarker<Time>[] = markers.map((m) => {
        const time = m.time as UTCTimestamp;
        switch (m.kind) {
          case "correct":
            return { time, position: "aboveBar", color: colors.up, shape: "arrowDown", text: "✓", size: 2 };
          case "wrong":
            return { time, position: "aboveBar", color: colors.down, shape: "arrowDown", text: "✗", size: 2 };
          case "bull":
            return { time, position: "belowBar", color: colors.up, shape: "arrowUp", text: m.text ?? "", size: 1 };
          case "bear":
            return { time, position: "aboveBar", color: colors.down, shape: "arrowDown", text: m.text ?? "", size: 1 };
          case "note":
            return { time, position: "aboveBar", color: "#9aa5bb", shape: "circle", text: m.text ?? "", size: 0 };
          case "target":
            return { time, position: "belowBar", color: "#ffd166", shape: "circle", text: "", size: 1 };
          default: {
            const unreachable: never = m.kind;
            return unreachable;
          }
        }
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

    if (focusTail && projected.length > 0) {
      const total = realCount + projected.length;
      const from = Math.max(0, realCount - TAIL_VIEW_REAL_BARS);
      chart.timeScale().setVisibleLogicalRange({ from, to: total - 1 });
    } else {
      chart.timeScale().fitContent();
    }

    return () => chart.remove();
  }, [candles, projected, focusTail, overlays, panes, markers, theme]);

  return (
    <div
      ref={containerRef}
      className="chart-container"
      style={{ height: 440 + 110 * panes.length }}
    />
  );
}
