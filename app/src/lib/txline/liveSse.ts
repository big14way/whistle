// Live SSE feed. Connects to GET {base}/api/scores/stream, filters events to the
// demo fixture, maps them into MatchUpdate, and reconnects with backoff on drop.
// Parsing is guarded so a malformed line never crashes the stream loop.

import { TxlineClient } from "./client";
import type { FeedSource, MatchUpdate } from "./feed";
import { parseUpdate } from "./parseUpdate";

export interface LiveSseOptions {
  client: TxlineClient;
  fixtureId: number | string;
  maxBackoffMs?: number;
}

export class LiveSseFeed implements FeedSource {
  readonly mode = "live" as const;
  private opts: LiveSseOptions;
  private abort: AbortController | null = null;
  private stopped = false;
  private backoff = 1000;

  constructor(opts: LiveSseOptions) {
    this.opts = opts;
  }

  start(onUpdate: (u: MatchUpdate) => void, onError: (e: unknown) => void): void {
    this.stopped = false;
    this.backoff = 1000;
    const fixtureId = String(this.opts.fixtureId);

    const connect = () => {
      if (this.stopped) return;
      this.abort = new AbortController();
      this.opts.client
        .streamScores(
          (evt: any) => {
            // Filter to the demo fixture, then normalize. Guard every line.
            try {
              const eid = String(evt?.fixtureId ?? evt?.summary?.fixtureId ?? evt?.fixture_id ?? "");
              if (eid && eid !== fixtureId) return;
              const u = parseUpdate(evt);
              if (u) {
                this.backoff = 1000; // healthy data resets backoff
                onUpdate(u);
              }
            } catch (e) {
              onError(e);
            }
          },
          (e) => {
            onError(e);
            scheduleReconnect();
          },
          this.abort.signal,
        )
        .then(() => {
          // stream ended cleanly, reconnect unless stopped
          scheduleReconnect();
        })
        .catch((e) => {
          onError(e);
          scheduleReconnect();
        });
    };

    const scheduleReconnect = () => {
      if (this.stopped) return;
      const wait = this.backoff;
      this.backoff = Math.min(this.backoff * 2, this.opts.maxBackoffMs ?? 15000);
      setTimeout(connect, wait);
    };

    connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.abort) {
      this.abort.abort();
      this.abort = null;
    }
  }
}
