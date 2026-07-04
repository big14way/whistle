import { BetPanel } from "./BetPanel";
import { ClaimPanel } from "./ClaimPanel";
import { ProofReceipt } from "./ProofReceipt";
import type { DemoWallet } from "../lib/demoWallets";
import { type MarketView, impliedProbs, marketPhase, restate } from "../lib/market";
import type { SettlementReceipt } from "../lib/receipt";
import type { WalletBalances } from "../state/useDemoWallets";

function fmtCountdown(sec: number): string {
  if (sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Canonical lifecycle states: Open, Locked, Ready to settle, Settled, Voided. A
// settled market appends the proven YES/NO outcome so the winning side is conveyed
// by text, not by the badge color alone (the green vs red color reinforces it).
function StateBadge({ market, phase }: { market: MarketView; phase: string }) {
  if (market.state === "settledYes") return <span className="badge yes">Settled YES</span>;
  if (market.state === "settledNo") return <span className="badge no">Settled NO</span>;
  if (market.state === "voided") return <span className="badge voided">Voided</span>;
  if (phase === "open") return <span className="badge open">Open</span>;
  if (phase === "resolvable") return <span className="badge locked">Ready to settle</span>;
  return <span className="badge locked">Locked</span>;
}

export function MarketCard({
  market,
  wallets,
  balances,
  nowSec,
  receipt,
  onAction,
  onOpenSettle,
}: {
  market: MarketView;
  wallets: DemoWallet[];
  balances: Record<string, WalletBalances>;
  nowSec: number;
  receipt?: SettlementReceipt;
  onAction: () => void;
  onOpenSettle: (m: MarketView) => void;
}) {
  const phase = marketPhase(market, nowSec);
  const probs = impliedProbs(market);
  const yesPct = Math.round(probs.yes * 100);
  const noPct = 100 - yesPct;

  return (
    <div className="card market">
      <div className="head">
        <div>
          <div className="title">{market.title}</div>
          <div className="restate mono">{restate(market)}</div>
        </div>
        <StateBadge market={market} phase={phase} />
      </div>

      <div className="pool">
        <div className="pool-labels mono">
          <span className="pool-label yes">
            <span className="pct">{yesPct}%</span> YES {market.totalYes.toFixed(0)}
          </span>
          <span className="pool-label no">
            {market.totalNo.toFixed(0)} NO <span className="pct">{noPct}%</span>
          </span>
        </div>
        <div className="split" role="img" aria-label={`YES pool ${yesPct} percent, NO pool ${noPct} percent`}>
          <div className="seg yes" style={{ flexBasis: `${yesPct}%` }} />
          <div className="seg no" style={{ flexBasis: `${noPct}%` }} />
        </div>
      </div>

      {phase === "open" && (
        <>
          <div className="countdown">Locks in {fmtCountdown(market.lockTs - nowSec)}</div>
          <BetPanel market={market} wallets={wallets} balances={balances} onPlaced={onAction} />
        </>
      )}

      {phase === "locked" && (
        <div className="banner">
          Betting locked. Settle available in {fmtCountdown(market.resolveAfterTs - nowSec)}.
        </div>
      )}

      {phase === "resolvable" && (
        <button
          className="btn primary block"
          disabled={wallets.length === 0}
          title={wallets.length === 0 ? "Demo wallets are local only; run the app locally to settle" : undefined}
          onClick={() => onOpenSettle(market)}
        >
          Settle now (prove on chain)
        </button>
      )}

      {(phase === "settled" || phase === "voided") && (
        <div className="stack" style={{ marginTop: 4 }}>
          <ClaimPanel market={market} wallets={wallets} onClaimed={onAction} />
          {receipt && <ProofReceipt receipt={receipt} />}
        </div>
      )}
    </div>
  );
}
