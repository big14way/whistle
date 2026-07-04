// Verifiable resolution receipts, persisted in localStorage so they survive a page
// refresh during a recording.

export interface SettlementReceipt {
  marketAddress: string;
  title: string;
  fixtureId: number;
  seq: number;
  statAKey: number;
  valueA: number;
  hasStatB: boolean;
  statBKey?: number;
  valueB?: number;
  threshold: number;
  comparison: string;
  op?: string;
  outcome: string;
  sig: string;
  ts: number;
  /// Measured wall clock seconds from clicking Settle to the tx confirming.
  settleSeconds?: number;
  /// USDC pot paid to the winning side.
  pot?: number;
  /// The matchup, captured at settle time for the shareable receipt.
  home?: string;
  away?: string;
  homeFlag?: string;
  awayFlag?: string;
  /// The daily_scores_roots PDA the proof was verified against, so the receipt can
  /// link the anchored Merkle root account for independent re verification.
  rootsPda?: string;
}

const KEY = "whistle:receipts";

export function loadReceipts(): Record<string, SettlementReceipt> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveReceipt(r: SettlementReceipt): void {
  try {
    const all = loadReceipts();
    all[r.marketAddress] = r;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore storage failures
  }
}

/// One time cleanup, meant to run on load: drop any receipt whose fixtureId is not
/// the current demo fixture (or is missing) from localStorage, so a stale cross
/// fixture entry disappears without the user clearing storage by hand. Returns the
/// surviving, fixture scoped map so the caller can seed state in a single pass, and
/// only writes back when something was actually removed.
export function pruneReceiptsToFixture(
  fixtureId: number,
  addresses?: string[],
): Record<string, SettlementReceipt> {
  // When the current market addresses are known, also drop receipts whose market is
  // no longer on the board. Re-seeding the same fixture mints new market addresses,
  // so this self cleans the activity feed across re-seeds, not just across fixtures.
  const allow = addresses && addresses.length ? new Set(addresses) : null;
  try {
    const all = loadReceipts();
    const kept: Record<string, SettlementReceipt> = {};
    for (const [k, r] of Object.entries(all)) {
      if (r.fixtureId === fixtureId && (!allow || allow.has(r.marketAddress))) kept[k] = r;
    }
    if (Object.keys(kept).length !== Object.keys(all).length) {
      localStorage.setItem(KEY, JSON.stringify(kept));
    }
    return kept;
  } catch {
    return {};
  }
}
