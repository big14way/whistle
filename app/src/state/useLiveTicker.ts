// Live broadcast ticker. The room is pinned to the seeded demo fixture, but the
// TxLINE stream carries whatever the devnet is anchoring right now (during the
// World Cup, real matches). This hook watches the unfiltered stream and surfaces
// the latest state of every OTHER fixture currently broadcasting, so the app can
// show real live scores the moment they flow.

import { useEffect, useRef, useState } from "react";
import { appConfig } from "../lib/config";
import { TxlineClient } from "../lib/txline/client";
import { getTxlineTokens, hasTxlineTokens } from "../lib/txlineTokens";

export interface LiveFixture {
  fixtureId: number;
  /// Full game goals, stat keys 1 (P1/home) and 2 (P2/away).
  homeGoals: number;
  awayGoals: number;
  /// TxLINE participant ids, resolved to names/flags via lib/teams.
  p1Id?: number;
  p2Id?: number;
  /// Match minute derived from the clock, when present.
  minute?: number;
  clockRunning: boolean;
  /// Wall clock ms of the last event, for staleness pruning.
  receivedAt: number;
}

/// Drop fixtures with no event for this long (half time is 15 minutes).
const STALE_MS = 20 * 60 * 1000;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function useLiveTicker(): LiveFixture[] {
  const [fixtures, setFixtures] = useState<Record<number, LiveFixture>>({});
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let abort: AbortController | null = null;
    let backoff = 2000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped.current) return;
      abort?.abort(); // never leave a prior stream running
      const ctl = new AbortController();
      abort = ctl;
      const client = new TxlineClient({ apiBase: appConfig.apiBase, ...getTxlineTokens() });
      client
        .streamScores(
          (evt: any) => {
            try {
              const id = num(evt?.FixtureId ?? evt?.fixtureId);
              if (id === undefined || id === appConfig.demoFixtureId) return;
              const stats = evt?.Stats ?? evt?.stats ?? {};
              const clockSec = num(evt?.Clock?.Seconds ?? evt?.clock?.seconds);
              backoff = 2000; // healthy data resets backoff
              setFixtures((prev) => ({
                ...prev,
                [id]: {
                  fixtureId: id,
                  homeGoals: num(stats[1]) ?? prev[id]?.homeGoals ?? 0,
                  awayGoals: num(stats[2]) ?? prev[id]?.awayGoals ?? 0,
                  p1Id: num(evt?.Participant1Id ?? evt?.participant1Id) ?? prev[id]?.p1Id,
                  p2Id: num(evt?.Participant2Id ?? evt?.participant2Id) ?? prev[id]?.p2Id,
                  minute: clockSec !== undefined ? Math.floor(clockSec / 60) : prev[id]?.minute,
                  clockRunning: Boolean(evt?.Clock?.Running ?? evt?.clock?.running),
                  receivedAt: Date.now(),
                },
              }));
            } catch {
              // one bad frame never kills the ticker
            }
          },
          // streamScores swallows its own errors then RESOLVES, so reconnect
          // only from .then — wiring onError here too would double every cycle.
          () => undefined,
          ctl.signal,
        )
        .then(() => scheduleReconnect());
    };

    const scheduleReconnect = () => {
      if (stopped.current || timer) return; // never stack timers
      const wait = backoff;
      backoff = Math.min(backoff * 2, 60000);
      timer = setTimeout(() => {
        timer = null;
        connect();
      }, wait);
    };

    // Only stream where a TxLINE path exists: injected/pasted tokens (local dev)
    // or the hosted proxy (see app/vercel/api/txline.ts). GitHub Pages has
    // neither, so the probe 404s and the ticker stays off with zero requests.
    if (hasTxlineTokens()) {
      connect();
    } else {
      fetch(`${window.location.origin}/txline-api/__health`)
        .then((r) => {
          if (!stopped.current && r.ok) connect();
        })
        .catch(() => undefined);
    }

    const prune = setInterval(() => {
      setFixtures((prev) => {
        const cutoff = Date.now() - STALE_MS;
        const entries = Object.entries(prev).filter(([, f]) => f.receivedAt >= cutoff);
        return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries);
      });
    }, 60000);

    return () => {
      stopped.current = true;
      abort?.abort();
      if (timer) clearTimeout(timer);
      clearInterval(prune);
    };
  }, []);

  return Object.values(fixtures).sort((a, b) => b.receivedAt - a.receivedAt);
}
