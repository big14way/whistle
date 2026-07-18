// Real TxLINE broadcasts, live. Shows every fixture currently flowing on the
// stream other than the demo fixture (whose room is below). TxLINE events carry
// participant ids but no names, so the score line uses neutral home/away labels
// rather than guessing identities.

import { resolveTeam, teamFlag } from "../lib/teams";
import type { LiveFixture } from "../state/useLiveTicker";

// Events carry participant ids, not names; resolve via the World Cup table and
// fall back to neutral Home/Away rather than guessing an unknown id.
function label(id: number | undefined, fallback: string): string {
  const t = resolveTeam(id);
  if (!t) return fallback;
  const flag = teamFlag(t);
  return `${flag ? flag + " " : ""}${t.name}`;
}

export function LiveTicker({ fixtures }: { fixtures: LiveFixture[] }) {
  if (fixtures.length === 0) return null;
  return (
    <div className="banner" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      <span className="pill live">
        <span className="live-dot" aria-hidden="true" />
        LIVE on TxLINE
      </span>
      {fixtures.map((f) => (
        <span key={f.fixtureId}>
          <strong>{label(f.p1Id, "Home")}</strong> <span className="mono">{f.homeGoals} – {f.awayGoals}</span>{" "}
          <strong>{label(f.p2Id, "Away")}</strong>
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
