// Normalize a raw TxLINE scores update (SSE event or a historical/snapshot entry)
// into a MatchUpdate. The exact per update stat shape is a [VERIFY] item: log a
// real SSE line and a /api/scores/snapshot response in the deploy phase and tune
// this if the field names differ. The parser is deliberately tolerant and is
// wrapped in try/catch by every caller so a malformed line cannot crash a feed.

import type { MatchUpdate } from "./feed";

function num(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

/// Pull a stats map (statKey -> value) out of several plausible encodings.
function extractStats(raw: any): Record<number, number> {
  const out: Record<number, number> = {};
  const s = raw?.stats ?? raw?.scoreStats ?? raw?.statValues;
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

export function parseUpdate(raw: any): MatchUpdate | null {
  if (!raw || typeof raw !== "object") return null;
  const seq = num(raw.seq ?? raw.sequence ?? raw.updateCount) ?? 0;
  const ts = num(raw.ts ?? raw.timestamp ?? raw.maxTimestamp ?? raw.minTimestamp) ?? Date.now();
  const gameState = num(raw.gameState ?? raw.phase ?? raw.gamePhase ?? raw.state) ?? 0;
  const stats = extractStats(raw);

  const homeScore = num(raw.homeScore ?? raw.participant1Score ?? raw.p1Score ?? stats[1]);
  const awayScore = num(raw.awayScore ?? raw.participant2Score ?? raw.p2Score ?? stats[2]);

  return {
    seq,
    ts,
    gameState,
    stats,
    homeName: raw.homeName ?? raw.participant1 ?? raw.home,
    awayName: raw.awayName ?? raw.participant2 ?? raw.away,
    homeScore,
    awayScore,
    minute: num(raw.minute ?? raw.clock ?? raw.matchMinute),
    raw,
  };
}

/// Pull an ordered list of updates from a /api/scores/historical/{fixtureId}
/// response, which may be an array or wrapped in a field.
export function extractHistorical(raw: any): MatchUpdate[] {
  const list = Array.isArray(raw)
    ? raw
    : raw?.updates ?? raw?.history ?? raw?.events ?? raw?.data ?? [];
  const out: MatchUpdate[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    const u = parseUpdate(item);
    if (u) out.push(u);
  }
  out.sort((a, b) => a.seq - b.seq || a.ts - b.ts);
  return out;
}
