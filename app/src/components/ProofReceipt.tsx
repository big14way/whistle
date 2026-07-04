// The verifiable resolution receipt as a designed, self contained artifact a judge
// would screenshot: the matchup, the predicate in plain language, the proven stat
// values, the outcome, the measured one block settle time, the pot paid, the CPI
// transaction hash with an explorer link, and a "verified by TxLINE" seal.

import { appConfig } from "../lib/config";
import { explorerAddress, explorerTx } from "../lib/constants";
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

      <details className="rc-verify">
        <summary>Verification details</summary>
        <div className="rc-verify-body">
          <div className="rc-row">
            <span className="rc-k">Predicate</span>
            <span className="mono">
              key {receipt.statAKey}
              {receipt.hasStatB ? ` ${receipt.op === "subtract" ? "-" : "+"} key ${receipt.statBKey}` : ""} {cmp}{" "}
              {receipt.threshold}
            </span>
          </div>
          <div className="rc-row">
            <span className="rc-k">Proven values</span>
            <span className="mono">
              {receipt.valueA}
              {receipt.hasStatB ? `, ${receipt.valueB}` : ""} at seq {receipt.seq}
            </span>
          </div>
          <div className="rc-row">
            <span className="rc-k">Oracle program</span>
            <a
              className="mono"
              href={explorerAddress(appConfig.txoracleProgramId, appConfig.cluster)}
              target="_blank"
              rel="noreferrer"
            >
              {appConfig.txoracleProgramId.slice(0, 8)}...{appConfig.txoracleProgramId.slice(-6)}
            </a>
          </div>
          {receipt.rootsPda && (
            <div className="rc-row">
              <span className="rc-k">Anchored root</span>
              <a
                className="mono"
                href={explorerAddress(receipt.rootsPda, appConfig.cluster)}
                target="_blank"
                rel="noreferrer"
              >
                {receipt.rootsPda.slice(0, 8)}...{receipt.rootsPda.slice(-6)}
              </a>
            </div>
          )}
          <div className="rc-row">
            <span className="rc-k">Settle tx</span>
            <a className="mono" href={explorerTx(receipt.sig, appConfig.cluster)} target="_blank" rel="noreferrer">
              {receipt.sig.slice(0, 8)}...{receipt.sig.slice(-6)}
            </a>
          </div>
          <p className="rc-note">
            The settle transaction carries the Merkle proof. The program CPIs into TxLINE validate_stat, which
            recomputes the proof against the root TxODDS anchored on chain and returns true only if the predicate
            holds. Nothing here is attested by us; every value is independently checkable from the links above.
          </p>
        </div>
      </details>
    </div>
  );
}
