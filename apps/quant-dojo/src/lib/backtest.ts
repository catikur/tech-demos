import { applicableRoi, maxDrawdown, sharpeLike } from "./metrics.ts";
import { buildSeries, firstReadyIndex, signalAt } from "./signals.ts";
import type {
  BacktestConfig,
  Candle,
  ExitReason,
  Strategy,
  Trade,
} from "./types.ts";
import { barMinutes } from "./types.ts";

export type EquityPoint = { time: number; equity: number };

export type BacktestResult = {
  trades: Trade[];
  equity: EquityPoint[];
  buyHoldEquity: EquityPoint[];
  totalReturn: number;
  buyHoldReturn: number;
  maxDrawdown: number;
  winRate: number | null;
  sharpe: number | null;
  finalEquity: number;
  initialEquity: number;
};

type Position = {
  qty: number;
  entryPrice: number;
  entryCost: number;
  entryIndex: number;
  entryTime: number;
};

type Pending = { kind: "entry" } | { kind: "exit" };

export type EntryWindow = { from: number; to: number };

export function backtest(
  candles: Candle[],
  strategy: Strategy,
  config: BacktestConfig,
  window?: EntryWindow,
): BacktestResult {
  const map = buildSeries(candles, strategy);
  const minutes = barMinutes(strategy.timeframe);
  const entryFrom = window?.from ?? 0;
  const entryTo = window?.to ?? candles.length;
  const lastTradeBar = Math.min(candles.length, Math.max(entryTo, 0)) - 1;
  const book: { cash: number; position: Position | null } = {
    cash: config.initialEquity,
    position: null,
  };
  let pending: Pending | null = null;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];

  const closeTrade = (index: number, price: number, reason: ExitReason) => {
    const open = book.position;
    if (!open) return;
    const proceeds = open.qty * price * (1 - config.fee);
    const pnl = proceeds - open.entryCost;
    trades.push({
      entryIndex: open.entryIndex,
      exitIndex: index,
      entryTime: open.entryTime,
      exitTime: candles[index]?.time ?? open.entryTime,
      entryPrice: open.entryPrice,
      exitPrice: price,
      reason,
      pnl,
      pnlPct: open.entryCost === 0 ? 0 : proceeds / open.entryCost - 1,
    });
    book.cash += proceeds;
    book.position = null;
  };

  const openTrade = (index: number, price: number) => {
    const candle = candles[index];
    if (!candle || price <= 0) return;
    const spend = Math.min(config.stake, book.cash);
    if (spend <= 0) return;
    book.cash -= spend;
    book.position = {
      qty: (spend * (1 - config.fee)) / price,
      entryPrice: price,
      entryCost: spend,
      entryIndex: index,
      entryTime: candle.time,
    };
  };

  for (let j = 0; j < candles.length; j++) {
    const candle = candles[j];
    if (!candle) continue;
    const isLast = j === lastTradeBar;

    const held = book.position;
    if (held && pending?.kind === "exit") {
      const stopPrice = stopLevel(strategy, held.entryPrice);
      if (stopPrice != null && candle.open <= stopPrice) closeTrade(j, candle.open, "stoploss");
      else closeTrade(j, candle.open, "signal");
      pending = null;
    } else if (!held && pending?.kind === "entry") {
      openTrade(j, candle.open);
      pending = null;
    } else {
      pending = null;
    }

    const live = book.position;
    if (live) {
      const elapsed = (j - live.entryIndex) * minutes;
      const stopPrice = stopLevel(strategy, live.entryPrice);
      const roiProfit = applicableRoi(strategy.roi, elapsed);
      const roiPrice = roiProfit == null ? null : live.entryPrice * (1 + roiProfit);
      if (stopPrice != null && candle.open <= stopPrice) {
        closeTrade(j, candle.open, "stoploss");
      } else if (roiPrice != null && candle.open >= roiPrice) {
        closeTrade(j, candle.open, "roi");
      } else if (stopPrice != null && candle.low <= stopPrice) {
        closeTrade(j, stopPrice, "stoploss");
      } else if (roiPrice != null && candle.high >= roiPrice) {
        closeTrade(j, roiPrice, "roi");
      } else if (isLast) {
        closeTrade(j, candle.close, "end");
      } else if (signalAt(map, strategy.exit, j, "any") && j !== live.entryIndex) {
        pending = { kind: "exit" };
      }
    }

    const inWindow = j >= entryFrom && j < entryTo;
    if (!book.position && !isLast && pending?.kind !== "exit" && inWindow && signalAt(map, strategy.entry, j)) {
      if (strategy.entryFill === "signal_close") openTrade(j, candle.close);
      else pending = { kind: "entry" };
    }

    const marked = book.position ? book.cash + book.position.qty * candle.close : book.cash;
    equity.push({ time: candle.time, equity: marked });
  }

  const equities = equity.map((point) => point.equity);
  const finalEquity = equities[equities.length - 1] ?? config.initialEquity;
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const buyHold = buyHoldPath(candles, strategy, config, map);

  return {
    trades,
    equity,
    buyHoldEquity: buyHold.equity,
    totalReturn: config.initialEquity === 0 ? 0 : finalEquity / config.initialEquity - 1,
    buyHoldReturn: buyHold.totalReturn,
    maxDrawdown: maxDrawdown(equities, config.initialEquity),
    winRate: trades.length === 0 ? null : wins / trades.length,
    sharpe: sharpeLike(equities, config.initialEquity),
    finalEquity,
    initialEquity: config.initialEquity,
  };
}

function stopLevel(strategy: Strategy, entryPrice: number): number | null {
  if (strategy.stoploss == null || strategy.stoploss >= 0) return null;
  return entryPrice * (1 + strategy.stoploss);
}

function buyHoldPath(
  candles: Candle[],
  strategy: Strategy,
  config: BacktestConfig,
  map: ReturnType<typeof buildSeries>,
): { equity: EquityPoint[]; totalReturn: number } {
  const ready = firstReadyIndex(
    map,
    strategy.indicators.map((spec) => spec.id),
  );
  const fill = ready + 1;
  const equity: EquityPoint[] = [];
  if (fill >= candles.length || !candles[fill] || candles[fill].open <= 0) {
    for (const candle of candles) equity.push({ time: candle.time, equity: config.initialEquity });
    return { equity, totalReturn: 0 };
  }
  const qty = (config.initialEquity * (1 - config.fee)) / candles[fill].open;
  for (let j = 0; j < candles.length; j++) {
    const candle = candles[j];
    if (!candle) continue;
    if (j < fill) {
      equity.push({ time: candle.time, equity: config.initialEquity });
      continue;
    }
    const marked = qty * candle.close * (j === candles.length - 1 ? 1 - config.fee : 1);
    equity.push({ time: candle.time, equity: marked });
  }
  const last = equity[equity.length - 1]?.equity ?? config.initialEquity;
  return {
    equity,
    totalReturn: config.initialEquity === 0 ? 0 : last / config.initialEquity - 1,
  };
}
