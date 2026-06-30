// Offline simulation feed. A scripted sequence of MatchUpdates so the demo runs
// with no network at all. It mirrors the demo fixture (Croatia vs Ghana, a 2 to 1
// result with five corners) so the offline view is consistent with the real replay
// and the seeded market thresholds (corners over 4.5, goals over 2.5, Croatia to
// score, Croatia margin 1 or more all settle YES).

import type { FeedSource, MatchUpdate } from "./feed";

const HOME = "Croatia";
const AWAY = "Ghana";
const P1_ID = 1766; // Croatia
const P2_ID = 2043; // Ghana

// Full game keys: 1/2 goals, 7/8 corners. gameState: 1 NS, 2 H1, 3 HT, 4 H2, 5 FT.
const SCRIPT: Array<Omit<MatchUpdate, "homeName" | "awayName" | "p1Id" | "p2Id">> = [
  { seq: 1, ts: 0, gameState: 1, stats: { 1: 0, 2: 0, 7: 0, 8: 0 }, homeScore: 0, awayScore: 0, minute: 0 },
  { seq: 2, ts: 60_000, gameState: 2, stats: { 1: 0, 2: 0, 7: 1, 8: 0 }, homeScore: 0, awayScore: 0, minute: 6 },
  { seq: 3, ts: 120_000, gameState: 2, stats: { 1: 1, 2: 0, 7: 1, 8: 1 }, homeScore: 1, awayScore: 0, minute: 18 },
  { seq: 4, ts: 180_000, gameState: 2, stats: { 1: 1, 2: 0, 7: 2, 8: 1 }, homeScore: 1, awayScore: 0, minute: 31 },
  { seq: 5, ts: 240_000, gameState: 3, stats: { 1: 1, 2: 0, 7: 2, 8: 1 }, homeScore: 1, awayScore: 0, minute: 45 },
  { seq: 6, ts: 300_000, gameState: 4, stats: { 1: 1, 2: 1, 7: 2, 8: 2 }, homeScore: 1, awayScore: 1, minute: 58 },
  { seq: 7, ts: 360_000, gameState: 4, stats: { 1: 2, 2: 1, 7: 3, 8: 2 }, homeScore: 2, awayScore: 1, minute: 72 },
  { seq: 8, ts: 420_000, gameState: 4, stats: { 1: 2, 2: 1, 7: 3, 8: 2 }, homeScore: 2, awayScore: 1, minute: 84 },
  { seq: 9, ts: 480_000, gameState: 5, stats: { 1: 2, 2: 1, 7: 3, 8: 2 }, homeScore: 2, awayScore: 1, minute: 90 },
];

export class SimulationFeed implements FeedSource {
  readonly mode = "simulation" as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private idx = 0;
  private intervalMs: number;

  constructor(intervalMs = 1500) {
    this.intervalMs = intervalMs;
  }

  start(onUpdate: (u: MatchUpdate) => void, _onError: (e: unknown) => void): void {
    this.idx = 0;
    const base = Date.now();
    const tick = () => {
      if (this.idx >= SCRIPT.length) {
        this.stop();
        return;
      }
      const u = SCRIPT[this.idx++];
      onUpdate({ ...u, ts: base + u.ts, homeName: HOME, awayName: AWAY, p1Id: P1_ID, p2Id: P2_ID });
    };
    tick();
    this.timer = setInterval(tick, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
