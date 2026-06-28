// Soccer feed stat key helpers, confirmed from
// https://txline-docs.txodds.com/documentation/scores/soccer-feed.md
//
// Stat key formula: key = period * 1000 + base_key.

/// Base stat keys (1 to 8). Period is layered on top via the multiplier.
export const BASE = {
  P1_GOALS: 1,
  P2_GOALS: 2,
  P1_YELLOW: 3,
  P2_YELLOW: 4,
  P1_RED: 5,
  P2_RED: 6,
  P1_CORNERS: 7,
  P2_CORNERS: 8,
} as const;

/// Period index used in the key formula. The multiplier is index * 1000.
/// FULL = 0 (+0), H1 = 1 (+1000), H2 = 2 (+2000), ET1 = 3 (+3000),
/// ET2 = 4 (+4000), PENS = 5 (+5000).
export const PERIOD = {
  FULL: 0,
  H1: 1,
  H2: 2,
  ET1: 3,
  ET2: 4,
  PENS: 5,
} as const;

const BASE_LABEL: Record<number, string> = {
  1: "P1 goals",
  2: "P2 goals",
  3: "P1 yellow cards",
  4: "P2 yellow cards",
  5: "P1 red cards",
  6: "P2 red cards",
  7: "P1 corners",
  8: "P2 corners",
};

const PERIOD_LABEL: Record<number, string> = {
  0: "full game",
  1: "H1",
  2: "H2",
  3: "ET1",
  4: "ET2",
  5: "penalties",
};

/// Game phase ids from the soccer feed. 15 to 18 are the "will not resolve
/// normally" phases (A, C, TXCC, TXCS): the void path.
export const PHASE: Record<number, string> = {
  1: "NS",
  2: "H1",
  3: "HT",
  4: "H2",
  5: "F",
  6: "WET",
  7: "ET1",
  8: "HTET",
  9: "ET2",
  10: "FET",
  11: "WPE",
  12: "PE",
  13: "FPE",
  14: "I",
  15: "A",
  16: "C",
  17: "TXCC",
  18: "TXCS",
  19: "P",
};

/// Phases that mean the match will not resolve normally (settle as void).
export const VOID_PHASES = new Set([15, 16, 17, 18]);

/// Friendly phase names for the UI chip.
export const PHASE_DISPLAY: Record<number, string> = {
  1: "Not started",
  2: "1st half",
  3: "Half time",
  4: "2nd half",
  5: "Full time",
  6: "Extra time pending",
  7: "ET 1st half",
  8: "ET half time",
  9: "ET 2nd half",
  10: "ET full time",
  11: "Penalties pending",
  12: "Penalties",
  13: "Penalties finished",
  14: "Interrupted",
  15: "Abandoned",
  16: "Cancelled",
  17: "Coverage cancelled",
  18: "Coverage suspended",
  19: "Postponed",
};

export function encodeKey(period: number, base: number): number {
  return period * 1000 + base;
}

export function decodeKey(key: number): { period: number; base: number } {
  return { period: Math.floor(key / 1000), base: key % 1000 };
}

export function baseLabel(base: number): string {
  return BASE_LABEL[base] ?? `base ${base}`;
}

export function periodLabel(period: number): string {
  return PERIOD_LABEL[period] ?? `period ${period}`;
}

/// Plain language label for a single stat key, for example "P1 corners (H1)".
export function statKeyLabel(key: number): string {
  const { period, base } = decodeKey(key);
  return `${baseLabel(base)} (${periodLabel(period)})`;
}

/// Minimal predicate shape the label helper needs. Matches the on chain Market.
export interface MarketPredicate {
  statAKey: number;
  statBKey: number;
  hasStatB: boolean;
  op: { add?: unknown } | { subtract?: unknown } | string;
  threshold: number;
  comparison: { greaterThan?: unknown } | { lessThan?: unknown } | string;
  title?: string;
}

function opSymbol(op: MarketPredicate["op"]): string {
  if (typeof op === "string") return op.toLowerCase().startsWith("sub") ? "-" : "+";
  if ("subtract" in op) return "-";
  return "+";
}

function cmpSymbol(c: MarketPredicate["comparison"]): string {
  if (typeof c === "string") return c.toLowerCase().startsWith("less") ? "<" : ">";
  if ("lessThan" in c) return "<";
  return ">";
}

/// Turn a stored predicate into plain English. Prefers the authored title when
/// present, otherwise restates the predicate using the integer threshold.
export function labelForMarket(m: MarketPredicate): string {
  if (m.title && m.title.length > 0) return m.title;
  const cmp = cmpSymbol(m.comparison);
  if (!m.hasStatB) {
    return `${statKeyLabel(m.statAKey)} ${cmp} ${m.threshold}`;
  }
  const { period } = decodeKey(m.statAKey);
  const left = `${baseLabel(decodeKey(m.statAKey).base)} ${opSymbol(m.op)} ${baseLabel(
    decodeKey(m.statBKey).base,
  )}`;
  return `${left} ${cmp} ${m.threshold} (${periodLabel(period)})`;
}

/// Parimutuel implied probability of a side: that side's pool over the total pot.
export function impliedProb(sidePool: number, totalPot: number): number {
  if (totalPot <= 0) return 0.5;
  return sidePool / totalPot;
}
