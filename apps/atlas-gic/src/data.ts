import type { Agent, Scenario } from "./types";

export const AGENTS: Agent[] = [
  {
    id: "regime-sentinel",
    name: "Regime Sentinel",
    role: "Macro regime classifier",
    layer: "macro",
    emoji: "🌐",
    baseWeight: 1.62,
  },
  {
    id: "liquidity-desk",
    name: "Rates & Liquidity Desk",
    role: "Fed path, dollar, credit spreads",
    layer: "macro",
    emoji: "💧",
    baseWeight: 1.18,
  },
  {
    id: "sector-analyst",
    name: "Sector Fundamentals",
    role: "Industry KPIs & guidance",
    layer: "sector",
    emoji: "🏭",
    baseWeight: 1.85,
  },
  {
    id: "flow-scanner",
    name: "Flow & Momentum Scanner",
    role: "Options flow, breadth, tape",
    layer: "sector",
    emoji: "📈",
    baseWeight: 0.94,
  },
  {
    id: "compounder",
    name: "The Compounder",
    role: "Buffett-style quality value",
    layer: "superinvestor",
    emoji: "🪙",
    baseWeight: 2.31,
  },
  {
    id: "macro-raider",
    name: "The Macro Raider",
    role: "Druckenmiller-style top-down bets",
    layer: "superinvestor",
    emoji: "⚡",
    baseWeight: 1.74,
  },
  {
    id: "growth-zealot",
    name: "The Growth Zealot",
    role: "Lynch-style earnings-momentum growth",
    layer: "superinvestor",
    emoji: "🚀",
    baseWeight: 1.02,
  },
  {
    id: "skeptic",
    name: "The Skeptic",
    role: "Chanos-style forensic short seller",
    layer: "superinvestor",
    emoji: "🔍",
    baseWeight: 0.58,
  },
  {
    id: "cro",
    name: "CRO — Risk Officer",
    role: "Sizing caps, veto, drawdown guard",
    layer: "decision",
    emoji: "🛡️",
    baseWeight: 2.5,
  },
  {
    id: "cio",
    name: "CIO — Chief Allocator",
    role: "Weighted synthesis & final call",
    layer: "decision",
    emoji: "🎯",
    baseWeight: 2.5,
  },
];

export const SCENARIOS: Scenario[] = [
  {
    id: "nvda-beat",
    ticker: "NVDA",
    company: "NVIDIA Corp.",
    date: "2026-09-18",
    regime: "RISK-ON",
    headline: "Hyperscaler capex guides up 22% — accelerator demand outruns supply again",
    tape: "Pre-market +3.8% · IV crush post-earnings · Breadth 74% advancers",
    takes: {
      "regime-sentinel": {
        stance: "LONG",
        conviction: 0.78,
        take: "Regime model reads RISK-ON: VIX term structure in contango, credit spreads tightening, equity vol supply heavy. Beta-friendly window for the next 5–10 sessions.",
      },
      "liquidity-desk": {
        stance: "LONG",
        conviction: 0.55,
        take: "Real yields drifting lower and the Fed pause is priced but not fully believed. Net liquidity mildly supportive; no dollar squeeze on the tape today.",
      },
      "sector-analyst": {
        stance: "LONG",
        conviction: 0.86,
        take: "Datacenter revenue +61% y/y, supply-constrained through mid-2027 per commentary. Capex guide-ups from top-3 hyperscalers are direct backlog for NVDA.",
      },
      "flow-scanner": {
        stance: "LONG",
        conviction: 0.62,
        take: "Call skew steep but dealer gamma flips positive above 1,240 — momentum ignition likely if we hold VWAP through the first hour.",
      },
      compounder: {
        stance: "FLAT",
        conviction: 0.44,
        take: "Wonderful business, uncomfortable price. 38x forward with supply catching up in 2027. I don't short quality, but I won't pay this multiple — pass.",
      },
      "macro-raider": {
        stance: "LONG",
        conviction: 0.81,
        take: "When the fiscal + capex impulse and the tape agree, you press. This is the bull market's spine — size it while the regime is friendly and stop out below the gap.",
      },
      "growth-zealot": {
        stance: "LONG",
        conviction: 0.9,
        take: "Estimates are still too low. Every quarter for six quarters the sell-side has under-modeled datacenter. PEG under 1.1 on real numbers. Own it.",
      },
      skeptic: {
        stance: "SHORT",
        conviction: 0.35,
        take: "Circular vendor-financing fingerprints in the neocloud channel. Not today's trade, but the accounting asymmetry is building. Token short for discipline.",
      },
    },
    croNote:
      "Risk-on regime: max single-name exposure 8.0% of book. Gap risk elevated post-earnings — hard stop mandated at −2.4% from entry.",
    croCapPct: 8.0,
    cioBullets: [
      "Macro and sector layers align LONG with high conviction; only the Skeptic dissents at low weight.",
      "The Compounder's valuation abstention lowers sizing but does not flip direction.",
      "Flow desk confirms positive dealer gamma above 1,240 — entry staged in two clips.",
    ],
    autoresearch: {
      worstAgentId: "skeptic",
      attribution: "−38 bps over last 20 sessions · stance-vs-outcome hit rate 31%",
      promptBefore:
        "You are a forensic short seller. Hunt for accounting red flags and always propose a short thesis for the day's ticker.",
      promptAfter:
        "You are a forensic short seller. Hunt for accounting red flags, but output FLAT unless fraud evidence is corroborated by two independent signals; never short pure momentum leaders in a RISK-ON regime.",
      rationale:
        "Attribution shows the Skeptic bleeding in risk-on tapes by shorting momentum leaders on thesis alone. Gate the short trigger on corroboration + regime.",
      backtestDelta: "+0.42 Sharpe · −31% max drawdown on 90-day replay",
      weightDeltaOnKeep: 0.24,
    },
  },
  {
    id: "xom-shock",
    ticker: "XOM",
    company: "Exxon Mobil Corp.",
    date: "2026-09-18",
    regime: "RISK-OFF",
    headline: "Strait disruption headlines — Brent +9% overnight, equities gap down",
    tape: "Pre-market −2.1% SPX · Brent 104.20 +9.3% · VIX 28.4",
    takes: {
      "regime-sentinel": {
        stance: "SHORT",
        conviction: 0.71,
        take: "Regime flipped RISK-OFF on the shock: vol term structure inverted, correlation-to-one behavior. Energy is the only green — treat rallies elsewhere as suspect.",
      },
      "liquidity-desk": {
        stance: "FLAT",
        conviction: 0.5,
        take: "Oil shock is stagflationary — cuts get repriced out while growth fears rise. Dollar bid. For XOM specifically the macro is a tailwind, but liquidity overall is deteriorating.",
      },
      "sector-analyst": {
        stance: "LONG",
        conviction: 0.83,
        take: "XOM torque: every $10 on Brent ≈ +$2.4B annualized FCF. Balance sheet can fund buybacks through the cycle. Supply outage is real, not rumor — inventory draw confirms.",
      },
      "flow-scanner": {
        stance: "LONG",
        conviction: 0.68,
        take: "Massive call sweep activity in XOM 1-month upside, energy sector RS breaking out of a 6-month base on volume. Crowd is chasing but the base supports it.",
      },
      compounder: {
        stance: "LONG",
        conviction: 0.66,
        take: "Bought this at 9x earnings for the capital-return story; a supply shock is optionality I didn't pay for. Adding modestly — but I won't chase a geopolitical spike.",
      },
      "macro-raider": {
        stance: "LONG",
        conviction: 0.77,
        take: "Supply shocks in tight physical markets trend. Long XOM against short SPX beta is the clean expression — you're paid on both legs if the disruption sticks.",
      },
      "growth-zealot": {
        stance: "FLAT",
        conviction: 0.4,
        take: "No earnings-revision story here, just a headline spike. Commodity torque isn't compounding growth. I'll watch from the sidelines.",
      },
      skeptic: {
        stance: "SHORT",
        conviction: 0.52,
        take: "Geopolitical spikes mean-revert 70% of the time within 10 sessions. Everyone chasing calls today is the exit liquidity next week. Fade the panic premium.",
      },
    },
    croNote:
      "Risk-off regime: single-name cap tightened to 4.5% of book, correlated energy exposure netted. Headline-reversal risk high — time stop of 5 sessions imposed.",
    croCapPct: 4.5,
    cioBullets: [
      "Sector fundamentals + flow + two superinvestor personas align LONG; dissent is the mean-reversion fade.",
      "Regime is RISK-OFF, so the CRO halves the normal cap — conviction is expressed via a tighter cap, not a bigger bet.",
      "Pair-trade overlay (short index beta) approved to isolate the supply-shock alpha.",
    ],
    autoresearch: {
      worstAgentId: "growth-zealot",
      attribution: "−22 bps over last 20 sessions · abstained on 6 of 9 winning energy calls",
      promptBefore:
        "You are a growth investor. Only engage when there is an earnings-revision story; otherwise output FLAT.",
      promptAfter:
        "You are a growth investor. Prioritize earnings-revision stories, but treat commodity-driven FCF inflections as revision stories when forward estimates lag spot by >15%.",
      rationale:
        "The Growth Zealot systematically abstains on commodity FCF inflections that later show up as estimate revisions — widen its definition of a revision story.",
      backtestDelta: "+0.18 Sharpe · +9% hit rate on energy subset (90-day replay)",
      weightDeltaOnKeep: 0.19,
    },
  },
  {
    id: "tsla-chop",
    ticker: "TSLA",
    company: "Tesla, Inc.",
    date: "2026-09-18",
    regime: "CHOP",
    headline: "Deliveries miss by 4%, but robotaxi permit expands to two new states",
    tape: "Pre-market −0.6% after ±3% whipsaw · Realized vol 5-day 61% · No breadth signal",
    takes: {
      "regime-sentinel": {
        stance: "FLAT",
        conviction: 0.64,
        take: "Chop regime: conflicting macro prints, vol elevated but directionless, index pinned to max-gamma strike. Edge decays fast here — smaller and faster or not at all.",
      },
      "liquidity-desk": {
        stance: "FLAT",
        conviction: 0.47,
        take: "Nothing in rates or the dollar resolves this name today. Idiosyncratic story; macro layer should stand down and let the stock pickers argue.",
      },
      "sector-analyst": {
        stance: "SHORT",
        conviction: 0.58,
        take: "Auto gross margin ex-credits compressing 3rd straight quarter and the deliveries miss is demand, not logistics — China share loss to BYD is structural.",
      },
      "flow-scanner": {
        stance: "LONG",
        conviction: 0.45,
        take: "Weekly options flow leans call-heavy into the robotaxi headline cycle and short interest built up 2 points this month — squeeze fuel if any catalyst lands.",
      },
      compounder: {
        stance: "FLAT",
        conviction: 0.72,
        take: "I can't underwrite either leg: the car company doesn't justify the price, the robotaxi option I can't value. No position is a position.",
      },
      "macro-raider": {
        stance: "SHORT",
        conviction: 0.49,
        take: "Chop regimes punish conviction. Small short against the delivery trend, tight stop above the robotaxi headline high. If it squeezes, I'm out in minutes.",
      },
      "growth-zealot": {
        stance: "LONG",
        conviction: 0.69,
        take: "The robotaxi permit expansion is the estimate-revision seed nobody has modeled. Miss on deliveries is stale news; the option value grows two states at a time.",
      },
      skeptic: {
        stance: "SHORT",
        conviction: 0.61,
        take: "Regulatory-credit dependency plus a demand miss dressed up with a permit headline. The robotaxi narrative has moved goalposts four times in three years.",
      },
    },
    croNote:
      "Chop regime: single-name cap 3.0% of book, no overnight adds, all entries must be limit orders inside the day's value area.",
    croCapPct: 3.0,
    cioBullets: [
      "Debate is genuinely split — weighted net conviction is thin, so the book expresses a lean, not a bet.",
      "Chop regime caps size at 3%; the CRO's no-overnight-adds rule keeps the position tactical.",
      "Growth vs. Skeptic disagreement flagged for the autoresearch queue — one of them is mis-specified.",
    ],
    autoresearch: {
      worstAgentId: "flow-scanner",
      attribution: "−41 bps over last 20 sessions · chased 5 failed squeezes in chop regimes",
      promptBefore:
        "You are a flow and momentum scanner. Report options flow and short interest, and lean in the direction of the dominant flow.",
      promptAfter:
        "You are a flow and momentum scanner. Report options flow and short interest, but in CHOP regimes require flow AND a realized-vol contraction before leaning directional; otherwise output FLAT.",
      rationale:
        "Flow-chasing bleeds in chop: five straight failed squeeze calls. Require a second confirming condition before the scanner is allowed to lean.",
      backtestDelta: "+0.31 Sharpe · 5 fewer whipsaw entries on 90-day replay",
      weightDeltaOnKeep: 0.27,
    },
  },
];
