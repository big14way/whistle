import { appConfig } from "../lib/config";
import { explorerTx } from "../lib/constants";
import { statKeyLabel } from "../lib/txline/statKeys";
import type { SettlementReceipt } from "../lib/receipt";

export function ProofReceipt({ receipt }: { receipt: SettlementReceipt }) {
  const cmp = receipt.comparison === "greaterThan" ? ">" : "<";
  const predicate = receipt.hasStatB
    ? `(${statKeyLabel(receipt.statAKey)} ${receipt.op === "subtract" ? "-" : "+"} ${statKeyLabel(
        receipt.statBKey!,
      )}) ${cmp} ${receipt.threshold}`
    : `${statKeyLabel(receipt.statAKey)} ${cmp} ${receipt.threshold}`;

  return (
    <div className="card" style={{ background: "var(--surface-2)" }}>
      <div className="section-title" style={{ margin: "0 0 8px" }}>
        Verifiable resolution receipt
      </div>
      <div className="receipt">
        <span className="k">Fixture</span>
        <span className="v">{receipt.fixtureId}</span>
        <span className="k">Sequence</span>
        <span className="v">{receipt.seq}</span>
        <span className="k">Predicate</span>
        <span className="v">{predicate}</span>
        <span className="k">Proven {statKeyLabel(receipt.statAKey)}</span>
        <span className="v">{receipt.valueA}</span>
        {receipt.hasStatB && (
          <>
            <span className="k">Proven {statKeyLabel(receipt.statBKey!)}</span>
            <span className="v">{receipt.valueB}</span>
          </>
        )}
        <span className="k">Outcome</span>
        <span className="v">{receipt.outcome}</span>
        <span className="k">Settlement tx</span>
        <span className="v">
          <a href={explorerTx(receipt.sig, appConfig.cluster)} target="_blank" rel="noreferrer">
            {receipt.sig.slice(0, 10)}...{receipt.sig.slice(-10)}
          </a>
        </span>
      </div>
    </div>
  );
}
