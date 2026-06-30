// The verifiable resolution receipt as a designed, self contained artifact a judge
// would screenshot: the matchup, the predicate in plain language, the proven stat
// values, the outcome, the measured one block settle time, the pot paid, the CPI
// transaction hash with an explorer link, and a "verified by TxLINE" seal.

import { appConfig } from "../lib/config";
import { explorerTx } from "../lib/constants";
import { statKeyLabel } from "../lib/txline/statKeys";
import type { SettlementReceipt } from "../lib/receipt";

export function ProofReceipt({ receipt }: { receipt: SettlementReceipt }) {
  const cmp = receipt.comparison === "greaterThan" ? ">" : "<";
  const predicate = receipt.hasStatB
    ? `${statKeyLabel(receipt.statAKey)} ${receipt.op === "subtract" ? "-" : "+"} ${statKeyLabel(receipt.statBKey!)} ${cmp} ${receipt.threshold}`
    : `${statKeyLabel(receipt.statAKey)} ${cmp} ${receipt.threshold}`;
  const side = receipt.outcome.includes("YES") ? "yes" : receipt.outcome.includes("NO") ? "no" : "voided";

  return (
    <div className="receipt-card">
      <div className="rc-head">
        <div className="rc-match">
          <span aria-hidden="true">{receipt.homeFlag}</span> {receipt.home ?? "Home"}
          <span className="rc-vs">vs</span>
          {receipt.away ?? "Away"} <span aria-hidden="true">{receipt.awayFlag}</span>
        </div>
        <span className="rc-label">Settlement receipt</span>
      </div>

      <div className="rc-predicate mono">{predicate}</div>

      <div className="rc-proven">
        Proven: <span className="mono">{statKeyLabel(receipt.statAKey)} = {receipt.valueA}</span>
        {receipt.hasStatB && (
          <span className="mono">
            {" "}
            , {statKeyLabel(receipt.statBKey!)} = {receipt.valueB}
          </span>
        )}
      </div>

      <div className="rc-result">
        <span className={`badge ${side}`}>{receipt.outcome}</span>
        {receipt.settleSeconds != null && (
          <span className="rc-time mono">{receipt.settleSeconds.toFixed(1)}s, one block</span>
        )}
        {receipt.pot != null && <span className="rc-pot mono">+{receipt.pot.toFixed(0)} USDC paid</span>}
      </div>

      <div className="rc-foot">
        <span className="rc-seal">
          <span className="rc-tick" aria-hidden="true">
            &#10003;
          </span>
          verified by TxLINE validate_stat
        </span>
        <a className="mono" href={explorerTx(receipt.sig, appConfig.cluster)} target="_blank" rel="noreferrer">
          {receipt.sig.slice(0, 8)}...{receipt.sig.slice(-8)}
        </a>
      </div>
      <div className="rc-meta mono">
        fixture {receipt.fixtureId} &middot; seq {receipt.seq}
      </div>
    </div>
  );
}
