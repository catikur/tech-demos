import { applySlippage, positionQty } from "../src/shared/engine";
import type { BookSnapshot, Settings } from "../src/shared/types";
import {
  closePosition,
  getCash,
  getDebate,
  insertPosition,
  markDebateBooked,
  openPositions,
  setCash,
} from "./db";
import { fetchQuote } from "./market";

export async function snapshotBook(): Promise<BookSnapshot> {
  const cash = getCash();
  const positions = openPositions();
  const quoted = await Promise.all(
    positions.map(async (p) => {
      try {
        const q = await fetchQuote(p.ticker);
        const last = q.price;
        const pnl =
          p.side === "LONG" ? (last - p.avgPrice) * p.qty : (p.avgPrice - last) * p.qty;
        const mtm = p.side === "LONG" ? last * p.qty : -last * p.qty;
        return { ...p, last, mtm, pnl };
      } catch {
        return { ...p, last: undefined, mtm: 0, pnl: 0 };
      }
    }),
  );
  const equity = cash + quoted.reduce((s, p) => s + (p.mtm ?? 0), 0);
  return { cash, equity, positions: quoted };
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
  const quote = await fetchQuote(debate.ticker);
  const book = await snapshotBook();
  const side = debate.direction as "LONG" | "SHORT";
  const fill = applySlippage(quote.price, side, settings.slippageBps);
  const qty = positionQty(book.equity > 0 ? book.equity : settings.startingCash, debate.sizePct, fill);
  if (qty <= 0) throw new Error("Computed quantity is 0");
  const notional = qty * fill;
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
  return snapshotBook();
}

export async function closePos(id: number) {
  const pos = openPositions().find((p) => p.id === id);
  if (!pos) throw new Error("Position not found");
  const quote = await fetchQuote(pos.ticker);
  const proceeds = pos.qty * quote.price;
  const cash = getCash();
  const pnl =
    pos.side === "LONG" ? (quote.price - pos.avgPrice) * pos.qty : (pos.avgPrice - quote.price) * pos.qty;
  if (pos.side === "LONG") setCash(cash + proceeds);
  else setCash(cash - proceeds);
  closePosition(id, pnl);
  return snapshotBook();
}
