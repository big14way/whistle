// Offline simulation feed. A scripted sequence of MatchUpdates so the demo runs
// with no network at all. Stats use full game keys (1,2 goals; 7,8 corners) so
// the seeded markets resolve YES on camera:
//   total corners over 9.5  -> 11 total      (YES)
//   match total goals over 2.5 -> 4 total    (YES)
//   winning margin P1 by 2+ -> 3 to 1, margin 2 (YES)
//   P1 goals over 0.5 -> 3                    (YES)

import type { FeedSource, MatchUpdate } from "./feed";

const HOME = "Argentina";
const AWAY = "Brazil";

// Each entry advances the match. ts values are relative and rebased to now at start.
const SCRIPT: Array<Omit<MatchUpdate, "homeName" | "awayName">> = [
  { seq: 1, ts: 0, gameState: 1, stats: { 1: 0, 2: 0, 7: 0, 8: 0 }, homeScore: 0, awayScore: 0, minute: 0 },
  { seq: 2, ts: 60_000, gameState: 2, stats: { 1: 0, 2: 0, 7: 1, 8: 0 }, homeScore: 0, awayScore: 0, minute: 6 },
  { seq: 3, ts: 120_000, gameState: 2, stats: { 1: 1, 2: 0, 7: 2, 8: 1 }, homeScore: 1, awayScore: 0, minute: 18 },
  { seq: 4, ts: 180_000, gameState: 2, stats: { 1: 1, 2: 1, 7: 3, 8: 2 }, homeScore: 1, awayScore: 1, minute: 31 },
  { seq: 5, ts: 240_000, gameState: 3, stats: { 1: 1, 2: 1, 7: 3, 8: 2 }, homeScore: 1, awayScore: 1, minute: 45 },
  { seq: 6, ts: 300_000, gameState: 4, stats: { 1: 2, 2: 1, 7: 4, 8: 3 }, homeScore: 2, awayScore: 1, minute: 58 },
  { seq: 7, ts: 360_000, gameState: 4, stats: { 1: 2, 2: 1, 7: 5, 8: 4 }, homeScore: 2, awayScore: 1, minute: 72 },
  { seq: 8, ts: 420_000, gameState: 4, stats: { 1: 3, 2: 1, 7: 6, 8: 4 }, homeScore: 3, awayScore: 1, minute: 84 },
  { seq: 9, ts: 470_000, gameState: 4, stats: { 1: 3, 2: 1, 7: 6, 8: 5 }, homeScore: 3, awayScore: 1, minute: 90 },
  { seq: 10, ts: 480_000, gameState: 5, stats: { 1: 3, 2: 1, 7: 6, 8: 5 }, homeScore: 3, awayScore: 1, minute: 90 },
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
      onUpdate({ ...u, ts: base + u.ts, homeName: HOME, awayName: AWAY });
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
