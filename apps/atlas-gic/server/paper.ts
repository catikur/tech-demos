import { applySlippage, positionQty } from "../src/shared/engine";
import type { BookSnapshot, Settings } from "../src/shared/types";
import {
  closePosition,
  closedPositions,
  getCash,
  getDebate,
  insertPosition,
  logEvent,
  markDebateBooked,
  openPositions,
  setCash,
} from "./db";
import { quoteAny } from "./market";

export async function snapshotBook(): Promise<BookSnapshot> {
  const cash = getCash();
  const positions = openPositions();
  const quoted = await Promise.all(
    positions.map(async (p) => {
      try {
        const q = await quoteAny(p.ticker);
        const last = q.price;
        const pnl = p.side === "LONG" ? (last - p.avgPrice) * p.qty : (p.avgPrice - last) * p.qty;
        const mtm = p.side === "LONG" ? last * p.qty : -last * p.qty;
        return { ...p, last, mtm, pnl };
      } catch {
        return { ...p, last: undefined, mtm: 0, pnl: 0 };
      }
    }),
  );
  const equity = cash + quoted.reduce((s, p) => s + (p.mtm ?? 0), 0);
  const gross = quoted.reduce((s, p) => s + Math.abs(p.mtm ?? 0), 0);
  const net = quoted.reduce((s, p) => s + (p.mtm ?? 0), 0);
  const base = equity > 0 ? equity : 1;
  return {
    cash,
    equity,
    grossPct: (gross / base) * 100,
    netPct: (net / base) * 100,
    positions: quoted,
    closed: closedPositions(),
  };
}

export async function bookDebate(debateId: number, settings: Settings) {
  const debate = getDebate(debateId);
  if (!debate) throw new Error("Debate not found");
  if (debate.booked) throw new Error("Already booked");
  if (debate.direction === "STAND DOWN" || debate.sizePct <= 0) {
    throw new Error("STAND DOWN — nothing to book");
  }
  if (debate.direction === "SHORT" && !settings.allowShort) {
    throw new Error("Shorts disabled in settings");
  }
  const quote = await quoteAny(debate.ticker);
  const book = await snapshotBook();
  const side = debate.direction as "LONG" | "SHORT";
  const fill = applySlippage(quote.price, side, settings.slippageBps);
  const equity = book.equity > 0 ? book.equity : settings.startingCash;
  const qty = positionQty(equity, debate.sizePct, fill);
  if (qty <= 0) throw new Error("Computed quantity is 0");
  const notional = qty * fill;
  const existing = book.positions
    .filter((p) => p.ticker === debate.ticker)
    .reduce((s, p) => s + Math.abs(p.mtm ?? p.qty * p.avgPrice), 0);
  if (settings.maxNamePct > 0 && ((existing + notional) / equity) * 100 > settings.maxNamePct) {
    throw new Error("Name cap");
  }
  const cash = getCash();
  if (side === "LONG") {
    if (cash < notional) throw new Error("Not enough cash");
    setCash(cash - notional);
  } else {
    setCash(cash + notional);
  }
  insertPosition({
    ticker: debate.ticker,
    side,
    qty,
    avgPrice: fill,
    debateId,
  });
  markDebateBooked(debateId);
  logEvent("book", `${side} ${debate.ticker} ${qty.toFixed(4)} @ ${fill.toFixed(4)}`, String(debateId));
  return snapshotBook();
}

export async function closePos(id: number) {
  const pos = openPositions().find((p) => p.id === id);
  if (!pos) throw new Error("Position not found");
  const quote = await quoteAny(pos.ticker);
  const proceeds = pos.qty * quote.price;
  const cash = getCash();
  const pnl =
    pos.side === "LONG" ? (quote.price - pos.avgPrice) * pos.qty : (pos.avgPrice - quote.price) * pos.qty;
  if (pos.side === "LONG") setCash(cash + proceeds);
  else setCash(cash - proceeds);
  closePosition(id, pnl);
  logEvent("book", `close ${pos.side} ${pos.ticker} pnl ${pnl.toFixed(2)}`, String(id));
  return snapshotBook();
}

export async function applyRiskExits(settings: Settings) {
  if (settings.stopPct <= 0 && settings.targetPct <= 0) return;
  for (const p of openPositions()) {
    try {
      const q = await quoteAny(p.ticker);
      const ret =
        p.side === "LONG"
          ? ((q.price - p.avgPrice) / p.avgPrice) * 100
          : ((p.avgPrice - q.price) / p.avgPrice) * 100;
      const stop = settings.stopPct > 0 && ret <= -settings.stopPct;
      const target = settings.targetPct > 0 && ret >= settings.targetPct;
      if (stop || target) {
        await closePos(p.id);
        logEvent("book", `auto ${stop ? "stop" : "target"} ${p.ticker} ${ret.toFixed(1)}%`);
      }
    } catch (err) {
      console.error("risk exit skipped", p.ticker, err instanceof Error ? err.message : err);
    }
  }
}
