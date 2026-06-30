// Live winnings strip. As markets settle during the match, the count of settled
// markets and the USDC paid to winners tick up, reinforcing that payouts land mid
// match rather than after full time.

import type { MarketView } from "../lib/market";

export function PnlStrip({ markets }: { markets: MarketView[] }) {
  const settled = markets.filter((m) => m.state === "settledYes" || m.state === "settledNo");
  const paid = settled.reduce((sum, m) => sum + m.totalYes + m.totalNo, 0);

  return (
    <div className="card pnl">
      <div className="pnl-item">
        <span className="pnl-num mono">{settled.length}</span>
        <span className="muted">markets settled</span>
      </div>
      <div className="pnl-item">
        <span className="pnl-num mono yes">+{paid.toFixed(0)}</span>
        <span className="muted">USDC paid to winners</span>
      </div>
    </div>
  );
}
