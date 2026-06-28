// Historical Replay feed. Fetches the full ordered update sequence for a
// completed fixture from /api/scores/historical/{fixtureId} and emits the updates
// on a timer so the UI shows the match unfolding. This is the default demo mode:
// fully deterministic, needs no live match, and resolves against real anchored
// roots.

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
    const stepMs = this.opts.stepMs ?? 1500;

    const run = (updates: MatchUpdate[]) => {
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
      run(this.opts.preloaded);
      return;
    }

    this.opts.client
      .getHistorical(this.opts.fixtureId)
      .then((raw) => {
        if (this.stopped) return;
        const updates = extractHistorical(raw);
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
