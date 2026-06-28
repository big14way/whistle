// Market view model: normalize the on chain Market account, restate the predicate,
// and evaluate it against live feed stats so the UI can preview the outcome.

import { decodeKey, baseLabel, periodLabel } from "./txline/statKeys";

export type MarketStateName = "open" | "settledYes" | "settledNo" | "voided";

export interface MarketView {
  address: string;
  marketId: number;
  fixtureId: number;
  creator: string;
  stakeMint: string;
  statAKey: number;
  statBKey: number;
  hasStatB: boolean;
  op: "add" | "subtract";
  threshold: number;
  comparison: "greaterThan" | "lessThan";
  lockTs: number;
  resolveAfterTs: number;
  voidAfterTs: number;
  totalYes: number; // USDC ui units
  totalNo: number;
  state: MarketStateName;
  feeBps: number;
  title: string;
}

function enumName(v: Record<string, unknown> | undefined, fallback: string): string {
  if (!v) return fallback;
  const keys = Object.keys(v);
  return keys[0] ?? fallback;
}

// account is the value returned by program.account.market.fetch (BN fields etc.)
export function mapMarket(address: string, account: any): MarketView {
  return {
    address,
    marketId: account.marketId,
    fixtureId: Number(account.fixtureId.toString()),
    creator: account.creator.toBase58(),
    stakeMint: account.stakeMint.toBase58(),
    statAKey: account.statAKey,
    statBKey: account.statBKey,
    hasStatB: account.hasStatB,
    op: enumName(account.op, "add") as "add" | "subtract",
    threshold: account.threshold,
    comparison: enumName(account.comparison, "greaterThan") as "greaterThan" | "lessThan",
    lockTs: Number(account.lockTs.toString()),
    resolveAfterTs: Number(account.resolveAfterTs.toString()),
    voidAfterTs: Number(account.voidAfterTs.toString()),
    totalYes: Number(account.totalYes.toString()) / 1e6,
    totalNo: Number(account.totalNo.toString()) / 1e6,
    state: enumName(account.state, "open") as MarketStateName,
    feeBps: account.feeBps,
    title: account.title,
  };
}

/// Restate the predicate in plain English from the integer threshold.
export function restate(m: MarketView): string {
  const cmp = m.comparison === "greaterThan" ? ">" : "<";
  const a = `${baseLabel(decodeKey(m.statAKey).base)}`;
  if (!m.hasStatB) {
    return `${a} ${cmp} ${m.threshold} (${periodLabel(decodeKey(m.statAKey).period)})`;
  }
  const opSym = m.op === "subtract" ? "-" : "+";
  const b = `${baseLabel(decodeKey(m.statBKey).base)}`;
  return `${a} ${opSym} ${b} ${cmp} ${m.threshold} (${periodLabel(decodeKey(m.statAKey).period)})`;
}

/// Compute the predicate left hand value from live stats, or null if unknown.
export function predicateValue(m: MarketView, stats: Record<number, number>): number | null {
  const a = stats[m.statAKey];
  if (a === undefined) return null;
  if (!m.hasStatB) return a;
  const b = stats[m.statBKey];
  if (b === undefined) return null;
  return m.op === "subtract" ? a - b : a + b;
}

/// Evaluate YES (predicate satisfied) against live stats, or null if unknown.
export function evalYes(m: MarketView, stats: Record<number, number>): boolean | null {
  const v = predicateValue(m, stats);
  if (v === null) return null;
  return m.comparison === "greaterThan" ? v > m.threshold : v < m.threshold;
}

export type MarketPhase = "open" | "locked" | "resolvable" | "settled" | "voided";

export function marketPhase(m: MarketView, nowSec: number): MarketPhase {
  if (m.state === "voided") return "voided";
  if (m.state === "settledYes" || m.state === "settledNo") return "settled";
  if (nowSec >= m.resolveAfterTs) return "resolvable";
  if (nowSec >= m.lockTs) return "locked";
  return "open";
}

export function impliedProbs(m: MarketView): { yes: number; no: number } {
  const pot = m.totalYes + m.totalNo;
  if (pot <= 0) return { yes: 0.5, no: 0.5 };
  return { yes: m.totalYes / pot, no: m.totalNo / pot };
}

/// Parimutuel payout if a side wins: stake * totalPot / winningPool.
export function previewPayout(m: MarketView, side: "yes" | "no", stakeUi: number): number {
  const pot = m.totalYes + m.totalNo + stakeUi;
  const winningPool = (side === "yes" ? m.totalYes : m.totalNo) + stakeUi;
  if (winningPool <= 0) return 0;
  return (stakeUi * pot) / winningPool;
}
