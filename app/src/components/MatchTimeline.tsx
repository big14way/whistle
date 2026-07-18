// The match settlement timeline: a horizontal track from kickoff to full time with
// each market as a node at the match minute it resolves. A playhead tracks the
// replay clock. As the playhead passes a node the market becomes due to settle, and
// when settled the node turns green with the outcome, the pot paid, and the measured
// one block settle time. The emotional read: markets settle and pay at staggered
// moments while the match keeps moving, so wins land before the whistle.

import type { CSSProperties } from "react";
import { marketPhase, type MarketView } from "../lib/market";
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
  nowSec,
}: {
  markets: MarketView[];
  minute: number;
  receipts: Record<string, SettlementReceipt>;
  nowSec: number;
}) {
  // Sort by settle minute, then cluster markets whose minutes fall within CLUSTER of
  // each other so near identical positions (for example two full game markets at
  // minute 85) share a group, and give each a separate stacked lane so neither the
  // dots nor the labels collide, at full time or anywhere else.
  const CLUSTER = 4;
  const nodes = [...markets].sort((a, b) => a.settleMinute - b.settleMinute || a.marketId - b.marketId);
  const lane: Record<string, number> = {};
  let clusterAnchor = -Infinity;
  let clusterLane = -1;
  for (const m of nodes) {
    if (m.settleMinute - clusterAnchor > CLUSTER) {
      clusterAnchor = m.settleMinute;
      clusterLane = 0;
    } else {
      clusterLane += 1;
    }
    lane[m.address] = clusterLane;
  }
  // Grow the track so even a deep stack of same minute markets fits without
  // overflowing the card (lane 0 is the track line, each further lane adds 60px).
  const maxLane = nodes.reduce((mx, m) => Math.max(mx, lane[m.address] ?? 0), 0);
  const trackHeight = Math.max(200, 96 + maxLane * 60);

  return (
    <div className="card timeline">
      <div className="between" style={{ marginBottom: 14 }}>
        <span className="section-title" style={{ margin: 0 }}>
          Settlement timeline
        </span>
        <span className="mono muted">{minute}&apos;</span>
      </div>
      <div className="tl-track" style={{ height: trackHeight }}>
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
          const stack = lane[m.address] ?? 0;
          const settled = m.state === "settledYes" || m.state === "settledNo";
          const voided = m.state === "voided";
          // Due needs both the narrative (the playhead has passed the node) and
          // the chain (the market is actually resolvable at wall clock), so the
          // sprinting Simulation clock cannot flag still open markets.
          const due = !settled && !voided && minute >= mn && marketPhase(m, nowSec) === "resolvable";
          const cls = settled ? "settled" : voided ? "voided" : due ? "due" : "open";
          const r = receipts[m.address];
          const pot = m.totalYes + m.totalNo;
          // Nudge a label toward track center near the edges so a wide label never
          // overflows the card, and stack lanes by 60px so a label clears the next.
          const p = (mn / FULL) * 100;
          const shift = p > 82 ? -56 : p > 70 ? -34 : p < 14 ? 56 : p < 28 ? 34 : 0;
          const style = {
            left: pct(mn),
            top: `${8 + stack * 60}px`,
            ["--tl-shift" as string]: `${shift}px`,
            ["--tl-stack" as string]: stack,
          } as CSSProperties;
          return (
            <div key={m.address} className={`tl-node ${cls}${stack > 0 ? " tl-stacked" : ""}`} style={style}>
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
