import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Bar } from "../lib/ohlcv";
import type { ForecastResult } from "../lib/forecast";

interface Props {
  bars: Bar[];
  forecast: ForecastResult | null;
  anchorTime: number | null;
  anchorPrice: number | null;
  pricePrecision: number;
  minMove: number;
  /** Changes when the view should refit. Live candle ticks keep this stable. */
  fitToken: string;
}

const PATH_COLORS = [
  "rgba(96, 165, 250, 0.55)",
  "rgba(52, 211, 153, 0.55)",
  "rgba(251, 146, 60, 0.55)",
  "rgba(196, 181, 253, 0.55)",
  "rgba(244, 114, 182, 0.55)",
  "rgba(94, 234, 212, 0.55)",
];

export function CandleChart({ bars, forecast, anchorTime, anchorPrice, pricePrecision, minMove, fitToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const forecastRef = useRef<ISeriesApi<"Line">[]>([]);
  const fitRef = useRef("");
  const drawnRef = useRef("");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b93a7",
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(139, 147, 167, 0.08)" },
        horzLines: { color: "rgba(139, 147, 167, 0.08)" },
      },
      rightPriceScale: {
        borderColor: "rgba(139, 147, 167, 0.2)",
        scaleMargins: { top: 0.06, bottom: 0.26 },
      },
      timeScale: { borderColor: "rgba(139, 147, 167, 0.2)", timeVisible: true, secondsVisible: false },
      crosshair: {
        horzLine: { color: "rgba(245, 166, 35, 0.4)", labelBackgroundColor: "#2a2f3e" },
        vertLine: { color: "rgba(245, 166, 35, 0.4)", labelBackgroundColor: "#2a2f3e" },
      },
      autoSize: true,
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "rgba(38, 166, 154, 0.7)",
      wickDownColor: "rgba(239, 83, 80, 0.7)",
      priceFormat: { type: "price", precision: pricePrecision, minMove },
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      visible: false,
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      forecastRef.current = [];
    };
  }, []);

  useEffect(() => {
    candleRef.current?.applyOptions({
      priceFormat: { type: "price", precision: pricePrecision, minMove },
    });
  }, [pricePrecision, minMove]);

  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleRef.current;
    const volume = volumeRef.current;
    if (!chart || !candles || !volume) return;

    candles.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    volume.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? "rgba(38, 166, 154, 0.45)" : "rgba(239, 83, 80, 0.4)",
      })),
    );

    // Rebuild forecast lines only when the snapshot identity changes, so a
    // forming-candle poll does not reset the time scale.
    if (drawnRef.current !== fitToken) {
      for (const series of forecastRef.current) chart.removeSeries(series);
      forecastRef.current = [];
      if (forecast && anchorTime !== null && anchorPrice !== null) {
        const anchor = { time: anchorTime as UTCTimestamp, value: anchorPrice };
        const created: ISeriesApi<"Line">[] = [];
        forecast.paths.forEach((path, i) => {
          const series = chart.addSeries(LineSeries, {
            color: PATH_COLORS[i % PATH_COLORS.length],
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          series.setData([anchor, ...path.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))]);
          created.push(series);
        });
        for (const band of [forecast.p10, forecast.p90]) {
          const series = chart.addSeries(LineSeries, {
            color: "rgba(245, 166, 35, 0.45)",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          series.setData([anchor, ...band.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))]);
          created.push(series);
        }
        const meanSeries = chart.addSeries(LineSeries, {
          color: "#f5a623",
          lineWidth: 2,
          priceLineVisible: false,
          title: "mean path",
        });
        meanSeries.setData([anchor, ...forecast.mean.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))]);
        created.push(meanSeries);
        forecastRef.current = created;
      }
      drawnRef.current = fitToken;
    }

    if (fitRef.current !== fitToken && bars.length > 0) {
      chart.timeScale().fitContent();
      fitRef.current = fitToken;
    }
  }, [bars, forecast, anchorTime, anchorPrice, fitToken]);

  return <div ref={containerRef} className="chart-container" />;
}
