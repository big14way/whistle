import { useCallback, useEffect, useRef, useState } from "react";
import { appConfig } from "../lib/config";
import { TxlineClient } from "../lib/txline/client";
import type { FeedMode, FeedSource, MatchUpdate } from "../lib/txline/feed";
import { HistoricalReplayFeed } from "../lib/txline/historicalReplay";
import { LiveSseFeed } from "../lib/txline/liveSse";
import { SimulationFeed } from "../lib/txline/simulation";
import { getTxlineTokens, hasTxlineTokens } from "../lib/txlineTokens";

function defaultMode(): FeedMode {
  // Replay against the seeded fixture when tokens are present, else the offline
  // Simulation feed so the UI always runs.
  return hasTxlineTokens() && appConfig.demoFixtureId != null ? "replay" : "simulation";
}

export function useMatch() {
  const [mode, setMode] = useState<FeedMode>(defaultMode());
  const [update, setUpdate] = useState<MatchUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<FeedSource | null>(null);

  const buildFeed = useCallback((m: FeedMode): FeedSource => {
    if (m === "simulation") return new SimulationFeed(1500);
    const tokens = getTxlineTokens();
    const client = new TxlineClient({ apiBase: appConfig.apiBase, jwt: tokens.jwt, apiToken: tokens.apiToken });
    const fixtureId = appConfig.demoFixtureId ?? 0;
    if (m === "replay") return new HistoricalReplayFeed({ client, fixtureId, stepMs: 1500 });
    return new LiveSseFeed({ client, fixtureId });
  }, []);

  useEffect(() => {
    feedRef.current?.stop();
    setError(null);
    setUpdate(null);
    let feed: FeedSource;
    try {
      feed = buildFeed(mode);
    } catch (e) {
      setError(String(e));
      return;
    }
    feedRef.current = feed;
    feed.start(
      (u) => setUpdate(u),
      (e) => setError(typeof e === "string" ? e : (e as Error)?.message ?? "feed error"),
    );
    return () => feed.stop();
  }, [mode, buildFeed]);

  return { mode, setMode, update, error };
}
