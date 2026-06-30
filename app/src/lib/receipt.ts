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
