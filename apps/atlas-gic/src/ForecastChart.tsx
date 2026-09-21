import { useEffect, useRef, useState } from "react";
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
import { api } from "./api";
import { TIMEFRAMES, priceScaleFor, type ChartPayload, type TimeframeId } from "./shared/forecast";
import type { Settings } from "./shared/types";

const PATH_COLORS = [
  "rgba(96, 165, 250, 0.55)",
  "rgba(52, 211, 153, 0.55)",
  "rgba(251, 146, 60, 0.55)",
  "rgba(196, 181, 253, 0.55)",
  "rgba(244, 114, 182, 0.55)",
  "rgba(94, 234, 212, 0.55)",
];

export function ForecastChart({
  symbol,
  settings,
  onInterval,
}: {
  symbol: string;
  settings: Settings;
  onInterval: (id: TimeframeId) => void;
}) {
  const [payload, setPayload] = useState<ChartPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const forecastRef = useRef<ISeriesApi<"Line">[]>([]);

  const interval = settings.forecastInterval;
  const lookback = settings.forecastLookback;
  const predLen = settings.forecastPredLen;
  const temperature = settings.forecastTemperature;
  const topP = settings.forecastTopP;
  const sampleCount = settings.forecastSampleCount;
  const seed = settings.forecastSeed;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#a1a1aa",
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(161, 161, 170, 0.08)" },
        horzLines: { color: "rgba(161, 161, 170, 0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(161, 161, 170, 0.2)" },
      timeScale: { borderColor: "rgba(161, 161, 170, 0.2)", timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: "rgba(56, 189, 248, 0.35)", labelBackgroundColor: "#27272a" },
        horzLine: { color: "rgba(56, 189, 248, 0.35)", labelBackgroundColor: "#27272a" },
      },
      autoSize: true,
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#fb7185",
      borderVisible: false,
      wickUpColor: "#34d399",
      wickDownColor: "#fb7185",
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
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
    let cancel = false;
    setBusy(true);
    setErr(null);
    const q = new URLSearchParams({ symbol, interval });
    api<{ chart: ChartPayload }>(`/api/chart?${q}`)
      .then((r) => {
        if (!cancel) setPayload(r.chart);
      })
      .catch((e: unknown) => {
        if (!cancel) {
          setPayload(null);
          setErr(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancel) setBusy(false);
      });
    return () => {
      cancel = true;
    };
  }, [symbol, interval, lookback, predLen, temperature, topP, sampleCount, seed]);

  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleRef.current;
    const volume = volumeRef.current;
    if (!chart || !candles || !volume) return;
    if (!payload || payload.symbol !== symbol) {
      if (!payload) {
        candles.setData([]);
        volume.setData([]);
        for (const series of forecastRef.current) chart.removeSeries(series);
        forecastRef.current = [];
      }
      return;
    }
    const scale = priceScaleFor(payload.anchorPrice);
    candles.applyOptions({ priceFormat: { type: "price", precision: scale.precision, minMove: scale.minMove } });
    candles.setData(
      payload.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    volume.setData(
      payload.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? "rgba(52, 211, 153, 0.35)" : "rgba(251, 113, 133, 0.35)",
      })),
    );
    for (const series of forecastRef.current) chart.removeSeries(series);
    forecastRef.current = [];
    const anchor = { time: payload.anchorTime as UTCTimestamp, value: payload.anchorPrice };
    payload.paths.forEach((path, i) => {
      const series = chart.addSeries(LineSeries, {
        color: PATH_COLORS[i % PATH_COLORS.length],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      series.setData([anchor, ...path.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))]);
      forecastRef.current.push(series);
    });
    for (const band of [payload.p10, payload.p90]) {
      const series = chart.addSeries(LineSeries, {
        color: "rgba(251, 191, 36, 0.55)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      series.setData([anchor, ...band.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))]);
      forecastRef.current.push(series);
    }
    const mean = chart.addSeries(LineSeries, {
      color: "#fbbf24",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    mean.setData([anchor, ...payload.mean.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))]);
    forecastRef.current.push(mean);
    chart.timeScale().fitContent();
  }, [payload, symbol]);

  const venue = payload?.venue === "bitget" ? "Bitget" : "Bybit";

  return (
    <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-widest text-zinc-500">
          {venue} · {symbol}
          {busy ? " · yükleniyor" : ""}
        </span>
        <div className="ml-auto flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              type="button"
              onClick={() => onInterval(tf.id)}
              className={`rounded-md px-2 py-1 font-mono text-[10px] ${
                interval === tf.id ? "bg-sky-500/20 text-sky-300" : "text-zinc-500 hover:bg-zinc-800"
              }`}
            >
              {tf.id}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="h-80 w-full" />
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      {payload?.note && <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">{payload.note}</p>}
    </section>
  );
}
