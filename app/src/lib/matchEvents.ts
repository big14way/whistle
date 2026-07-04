// Derive discrete match events (goal, corner, card) from consecutive feed updates
// by diffing the full game stat keys. This is what makes the TxLINE ingestion
// visible in the UI: every increment the feed delivers becomes a ticker line.

import type { MatchUpdate } from "./txline/feed";

export type MatchEventKind = "goal" | "corner" | "yellow" | "red";

export interface MatchEvent {
  /// Stable identity for React keys: seq, key, and the running value.
  id: string;
  seq: number;
  minute: number;
  kind: MatchEventKind;
  side: "home" | "away";
}

// Full game base keys per side, in the soccer feed encoding.
const KINDS: { kind: MatchEventKind; home: number; away: number }[] = [
  { kind: "goal", home: 1, away: 2 },
  { kind: "corner", home: 7, away: 8 },
  { kind: "yellow", home: 3, away: 4 },
  { kind: "red", home: 5, away: 6 },
];

/// Events implied by moving from prev to next. A stat that jumps by more than one
/// (a replay frame can skip updates) emits one event per increment so the count in
/// the ticker always matches the stat strip.
export function diffEvents(prev: MatchUpdate | null, next: MatchUpdate): MatchEvent[] {
  const out: MatchEvent[] = [];
  const minute = next.minute ?? 0;
  for (const k of KINDS) {
    for (const side of ["home", "away"] as const) {
      const key = side === "home" ? k.home : k.away;
      const before = prev?.stats[key] ?? 0;
      const after = next.stats[key] ?? 0;
      for (let v = before + 1; v <= after; v++) {
        out.push({ id: `${next.seq}:${key}:${v}`, seq: next.seq, minute, kind: k.kind, side });
      }
    }
  }
  return out;
}

export const EVENT_LABEL: Record<MatchEventKind, string> = {
  goal: "Goal",
  corner: "Corner",
  yellow: "Yellow card",
  red: "Red card",
};
