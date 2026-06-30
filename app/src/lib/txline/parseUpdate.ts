// Normalize a raw TxLINE scores event into a MatchUpdate. Confirmed against the
// live historical feed for fixture 17588323: events are PascalCase
// ({ Seq, Ts, GameState, Stats, Clock, Participant1Id, Participant2Id }) and the
// stats are a flat object keyed by statKey. The parser is tolerant (it also
// accepts camelCase) and every caller wraps it in try/catch so a malformed line
// cannot crash a feed.

import type { MatchUpdate } from "./feed";

function num(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

/// Pull a stats map (statKey -> value) out of the event.
function extractStats(raw: any): Record<number, number> {
  const out: Record<number, number> = {};
  const s = raw?.Stats ?? raw?.stats ?? raw?.scoreStats ?? raw?.statValues;
  if (Array.isArray(s)) {
    for (const item of s) {
      const key = num(item?.key ?? item?.statKey ?? item?.k);
      const val = num(item?.value ?? item?.v ?? item?.val);
      if (key !== undefined && val !== undefined) out[key] = val;
    }
  } else if (s && typeof s === "object") {
    for (const [k, v] of Object.entries(s)) {
      const key = num(k);
      const val = num(v);
      if (key !== undefined && val !== undefined) out[key] = val;
    }
  }
  return out;
}

// The devnet feed reports GameState as a string. Map the known strings to the
// soccer feed phase ids; default to Not started.
const STATE_MAP: Record<string, number> = {
  scheduled: 1,
  ns: 1,
  "1h": 2,
  "1st": 2,
  firsthalf: 2,
  ht: 3,
  halftime: 3,
  "2h": 4,
  "2nd": 4,
  secondhalf: 4,
  ft: 5,
  f: 5,
  fulltime: 5,
};

function mapGameState(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const key = v.toLowerCase().replace(/[^a-z0-9]/g, "");
    return STATE_MAP[key] ?? 1;
  }
  return 1;
}

export function parseUpdate(raw: any): MatchUpdate | null {
  if (!raw || typeof raw !== "object") return null;
  const seq = num(raw.Seq ?? raw.seq ?? raw.sequence ?? raw.updateCount) ?? 0;
  const ts = num(raw.Ts ?? raw.ts ?? raw.timestamp ?? raw.maxTimestamp) ?? Date.now();
  const stats = extractStats(raw);

  const clockSec = num(raw.Clock?.Seconds ?? raw.clock?.seconds);
  const minute = clockSec !== undefined ? Math.floor(clockSec / 60) : num(raw.minute ?? raw.matchMinute);

  // Full game goals are keys 1 (P1) and 2 (P2).
  const homeScore = num(raw.homeScore ?? raw.participant1Score ?? stats[1]) ?? 0;
  const awayScore = num(raw.awayScore ?? raw.participant2Score ?? stats[2]) ?? 0;

  return {
    seq,
    ts,
    gameState: mapGameState(raw.GameState ?? raw.gameState ?? raw.phase ?? raw.state),
    stats,
    homeName: raw.homeName ?? raw.Participant1 ?? raw.participant1,
    awayName: raw.awayName ?? raw.Participant2 ?? raw.participant2,
    homeScore,
    awayScore,
    minute,
    p1Id: num(raw.Participant1Id ?? raw.participant1Id),
    p2Id: num(raw.Participant2Id ?? raw.participant2Id),
    raw,
  };
}

/// Parse all events out of a list of raw historical events.
export function extractHistorical(events: any[]): MatchUpdate[] {
  const out: MatchUpdate[] = [];
  for (const item of Array.isArray(events) ? events : []) {
    const u = parseUpdate(item);
    if (u) out.push(u);
  }
  out.sort((a, b) => a.seq - b.seq || a.ts - b.ts);
  return out;
}
