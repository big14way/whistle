// A compact list of recent settlements with the measured time and an explorer link,
// so the trustless settlement activity is visible at a glance.

import { appConfig } from "../lib/config";
import { explorerTx } from "../lib/constants";
import type { SettlementReceipt } from "../lib/receipt";

export function ActivityFeed({ receipts }: { receipts: Record<string, SettlementReceipt> }) {
  const items = Object.values(receipts).sort((a, b) => b.ts - a.ts).slice(0, 6);
  if (items.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        No settlements yet. Settle a market and it appears here with its on chain proof.
      </div>
    );
  }
  return (
    <div className="activity">
      {items.map((r) => {
        const side = r.outcome.includes("YES") ? "yes" : r.outcome.includes("NO") ? "no" : "voided";
        return (
          <div className="act" key={r.sig}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span className={`badge ${side}`}>{r.outcome.replace("Settled ", "")}</span> {r.title}
            </span>
            <a className="mono" href={explorerTx(r.sig, appConfig.cluster)} target="_blank" rel="noreferrer">
              {r.settleSeconds != null ? `${r.settleSeconds.toFixed(1)}s` : "tx"}
            </a>
          </div>
        );
      })}
    </div>
  );
}
