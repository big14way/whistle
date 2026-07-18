// The TxLINE feed made visible: a status pill (mode, sequence, freshness) plus a
// ticker of the discrete events diffed from the update stream. This panel is the
// on screen answer to "does the app ingest the TxLINE feed": the seq climbs and
// the ticker fills as SSE frames arrive.

import { useEffect, useState } from "react";
import { EVENT_LABEL, type MatchEvent } from "../lib/matchEvents";
import type { FeedMode, MatchUpdate } from "../lib/txline/feed";
import { resolveTeam, teamFlag } from "../lib/teams";

const MODE_LABEL: Record<FeedMode, string> = {
  live: "Live",
  replay: "Replay",
  simulation: "Simulation",
};

function freshness(receivedAt: number | null, now: number): "fresh" | "slow" | "stale" {
  if (receivedAt == null) return "stale";
  const age = (now - receivedAt) / 1000;
  return age < 6 ? "fresh" : age < 20 ? "slow" : "stale";
}

export function FeedPanel({
  mode,
  update,
  events,
  receivedAt,
}: {
  mode: FeedMode;
  update: MatchUpdate | null;
  events: MatchEvent[];
  receivedAt: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // A finished one-shot feed (replay and simulation stop at full time) is done,
  // not stale; keep the pill healthy instead of decaying to a grey warning.
  const state = update?.gameState === 5 ? "fresh" : freshness(receivedAt, now);
  const home = resolveTeam(update?.p1Id);
  const away = resolveTeam(update?.p2Id);
  const teamName = (side: "home" | "away") => {
    const t = side === "home" ? home : away;
    const flag = teamFlag(t);
    return t ? `${flag ? flag + " " : ""}${t.name}` : side === "home" ? "Home" : "Away";
  };

  return (
    <div className="card feedpanel">
      <div className="between" style={{ marginBottom: 8 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          TxLINE feed
        </h2>
        <span className={`feed-pill ${state}`} role="status" aria-label={`Feed ${MODE_LABEL[mode]}, ${state}`}>
          <span className="feed-dot" aria-hidden="true" />
          {MODE_LABEL[mode]}
          {update?.seq != null && <span className="mono seq">seq {update.seq}</span>}
        </span>
      </div>
      {events.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Waiting for match events. Goals, corners, and cards from the feed appear here.
        </div>
      ) : (
        <div className="feed-events" aria-live="polite">
          {events.slice(0, 7).map((e) => (
            <div className="feed-evt" key={e.id}>
              <span className="mono min">{e.minute}&apos;</span>
              <span className={`evt-dot ${e.kind}`} aria-hidden="true" />
              <span className="evt-label">{EVENT_LABEL[e.kind]}</span>
              <span className="evt-team">{teamName(e.side)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
