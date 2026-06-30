// Historical Replay feed. The /api/scores/historical/{fixtureId} endpoint is an
// SSE stream of PascalCase events. We read it fully, keep the frames where the
// stats actually change (so the replay focuses on the match unfolding rather than
// hundreds of identical keep alives), and synthesize a moving clock and phase from
// progress, because the devnet feed reports GameState "scheduled" throughout and a
// compressed clock. Settlement still uses the real anchored proof, not this clock.

import { TxlineClient } from "./client";
import type { FeedSource, MatchUpdate } from "./feed";
import { extractHistorical } from "./parseUpdate";

export interface HistoricalReplayOptions {
  client: TxlineClient;
  fixtureId: number | string;
  /// Milliseconds between emitted updates.
  stepMs?: number;
  /// Optional pre fetched updates (for offline replay from a cached payload).
  preloaded?: MatchUpdate[];
  /// Cap on the number of frames emitted (keeps the replay snappy).
  maxFrames?: number;
  /// Total replay duration in ms. When set, stepMs is derived so the synthesized
  /// clock lines up with the staggered on chain resolve times.
  targetDurationMs?: number;
}

function statsKey(s: Record<number, number>): string {
  return Object.keys(s)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => `${k}:${s[k]}`)
    .join(",");
}

/// Keep the frames where the stats changed, cap the count, and synthesize a moving
/// match clock and phase from progress.
export function prepareReplay(all: MatchUpdate[], maxFrames = 70): MatchUpdate[] {
  const kept: MatchUpdate[] = [];
  let prevKey: string | null = null;
  for (const u of all) {
    const k = statsKey(u.stats);
    if (k !== prevKey) {
      kept.push(u);
      prevKey = k;
    }
  }
  if (kept.length === 0 && all.length > 0) kept.push(all[0]);
  if (all.length > 0 && kept[kept.length - 1] !== all[all.length - 1]) kept.push(all[all.length - 1]);

  let seq = kept;
  if (kept.length > maxFrames) {
    seq = [];
    for (let i = 0; i < maxFrames; i++) {
      seq.push(kept[Math.floor((i / (maxFrames - 1)) * (kept.length - 1))]);
    }
  }

  const n = seq.length;
  return seq.map((u, i) => {
    const progress = n > 1 ? i / (n - 1) : 1;
    const minute = Math.round(progress * 92);
    const gameState = i === 0 ? 1 : minute < 45 ? 2 : minute < 48 ? 3 : minute < 90 ? 4 : 5;
    return { ...u, minute, gameState };
  });
}

export class HistoricalReplayFeed implements FeedSource {
  readonly mode = "replay" as const;
  private opts: HistoricalReplayOptions;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(opts: HistoricalReplayOptions) {
    this.opts = opts;
  }

  start(onUpdate: (u: MatchUpdate) => void, onError: (e: unknown) => void): void {
    this.stopped = false;

    const run = (updates: MatchUpdate[]) => {
      // Derive the step so the whole replay spans targetDurationMs when set.
      const stepMs = this.opts.targetDurationMs
        ? Math.max(250, Math.floor(this.opts.targetDurationMs / Math.max(1, updates.length)))
        : this.opts.stepMs ?? 1200;
      let i = 0;
      const tick = () => {
        if (this.stopped || i >= updates.length) {
          this.stop();
          return;
        }
        try {
          onUpdate(updates[i++]);
        } catch (e) {
          onError(e);
        }
      };
      tick();
      this.timer = setInterval(tick, stepMs);
    };

    if (this.opts.preloaded && this.opts.preloaded.length > 0) {
      run(prepareReplay(this.opts.preloaded, this.opts.maxFrames));
      return;
    }

    this.opts.client
      .getHistoricalEvents(this.opts.fixtureId)
      .then((events) => {
        if (this.stopped) return;
        const updates = prepareReplay(extractHistorical(events), this.opts.maxFrames);
        if (updates.length === 0) {
          onError(new Error("Historical feed returned no updates for this fixture"));
          return;
        }
        run(updates);
      })
      .catch(onError);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
