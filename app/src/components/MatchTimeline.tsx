// The match settlement timeline: a horizontal track from kickoff to full time with
// each market as a node at the match minute it resolves. A playhead tracks the
// replay clock. As the playhead passes a node the market becomes due to settle, and
// when settled the node turns green with the outcome, the pot paid, and the measured
// one block settle time. The emotional read: markets settle and pay at staggered
// moments while the match keeps moving, so wins land before the whistle.

import type { MarketView } from "../lib/market";
import type { SettlementReceipt } from "../lib/receipt";

const FULL = 95; // minutes spanned by the track
const pct = (m: number) => `${Math.min(100, Math.max(0, (m / FULL) * 100))}%`;

function shorten(title: string): string {
  return title.length > 26 ? title.slice(0, 24) + "..." : title;
}

export function MatchTimeline({
  markets,
  minute,
  receipts,
}: {
  markets: MarketView[];
  minute: number;
  receipts: Record<string, SettlementReceipt>;
}) {
  const nodes = [...markets].sort((a, b) => a.settleMinute - b.settleMinute || a.marketId - b.marketId);
  const stackSeen: Record<number, number> = {};

  return (
    <div className="card timeline">
      <div className="between" style={{ marginBottom: 14 }}>
        <span className="section-title" style={{ margin: 0 }}>
          Settlement timeline
        </span>
        <span className="mono muted">{minute}&apos;</span>
      </div>
      <div className="tl-track">
        <div className="tl-line" />
        <div className="tl-tick" style={{ left: pct(45) }}>
          <span>HT</span>
        </div>
        <div className="tl-tick" style={{ left: pct(90) }}>
          <span>FT</span>
        </div>
        <div className="tl-playhead" style={{ left: pct(minute) }} aria-hidden="true">
          <span className="tl-ph-dot" />
        </div>
        {nodes.map((m) => {
          const mn = m.settleMinute;
          const stack = (stackSeen[mn] = (stackSeen[mn] ?? -1) + 1);
          const settled = m.state === "settledYes" || m.state === "settledNo";
          const voided = m.state === "voided";
          const due = !settled && !voided && minute >= mn;
          const cls = settled ? "settled" : voided ? "voided" : due ? "due" : "open";
          const r = receipts[m.address];
          const pot = m.totalYes + m.totalNo;
          return (
            <div key={m.address} className={`tl-node ${cls}`} style={{ left: pct(mn), top: `${8 + stack * 30}px` }}>
              <span className="tl-dot" aria-hidden="true" />
              <div className="tl-label">
                <span className="tl-title">{shorten(m.title)}</span>
                {settled && (
                  <span className={`tl-chip ${m.state === "settledYes" ? "yes" : "no"}`}>
                    {m.state === "settledYes" ? "YES" : "NO"} +{pot.toFixed(0)} USDC
                    {r?.settleSeconds != null ? ` · ${r.settleSeconds.toFixed(1)}s` : " · 1 block"}
                  </span>
                )}
                {voided && <span className="tl-chip">Voided</span>}
                {due && <span className="tl-chip due">Ready to settle</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
