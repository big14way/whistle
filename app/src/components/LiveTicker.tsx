// Real TxLINE broadcasts, live. Shows every fixture currently flowing on the
// stream other than the demo fixture (whose room is below). TxLINE events carry
// participant ids but no names, so the score line uses neutral home/away labels
// rather than guessing identities.

import type { LiveFixture } from "../state/useLiveTicker";

export function LiveTicker({ fixtures }: { fixtures: LiveFixture[] }) {
  if (fixtures.length === 0) return null;
  return (
    <div className="banner" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      <span className="pill live">LIVE on TxLINE</span>
      {fixtures.map((f) => (
        <span key={f.fixtureId}>
          World Cup fixture <span className="mono">#{f.fixtureId}</span>:{" "}
          <span className="mono">
            Home {f.homeGoals} – {f.awayGoals} Away
          </span>
          {f.minute !== undefined && (
            <span className="muted"> · {f.minute}&prime;{f.clockRunning ? "" : " (stopped)"}</span>
          )}
        </span>
      ))}
      <span className="muted" style={{ fontSize: 12 }}>
        real anchored data, streaming over the same oracle that settles the markets below
      </span>
    </div>
  );
}
