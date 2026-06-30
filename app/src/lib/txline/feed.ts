// The feed abstraction. The UI is decoupled from the data source so the demo can
// run as Live SSE, Historical Replay (default, deterministic), or Simulation
// (offline). All three produce the same MatchUpdate stream.

/// One normalized scores update. Stats are keyed by statKey (period*1000+base).
export interface MatchUpdate {
  seq: number;
  ts: number; // milliseconds
  gameState: number; // phase id from the soccer feed encoding (1..19)
  /// Parsed stats: statKey -> value. Exact per update shape is normalized in each
  /// feed source from a real SSE line or a /api/scores/snapshot response.
  stats: Record<number, number>;
  /// Convenience: participant names and scoreline if the source carries them.
  homeName?: string;
  awayName?: string;
  homeScore?: number;
  awayScore?: number;
  /// Match clock in minutes if available.
  minute?: number;
  /// Participant ids (used to resolve team names and flags).
  p1Id?: number;
  p2Id?: number;
  raw?: unknown;
}

export type FeedMode = "live" | "replay" | "simulation";

export interface FeedSource {
  readonly mode: FeedMode;
  start(onUpdate: (u: MatchUpdate) => void, onError: (e: unknown) => void): void;
  stop(): void;
}
