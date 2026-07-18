import { useCallback, useEffect, useRef, useState } from "react";
import { appConfig } from "../lib/config";
import { diffEvents, type MatchEvent } from "../lib/matchEvents";
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

const MAX_EVENTS = 24;

export function useMatch() {
  const [mode, setMode] = useState<FeedMode>(defaultMode());
  /// True once the user picks a mode by hand; the proxy auto-upgrade never
  /// overrides an explicit choice.
  const userPicked = useRef(false);
  const pickMode = useCallback((m: FeedMode) => {
    userPicked.current = true;
    setMode(m);
  }, []);

  // Hosted deployments carry a TxLINE proxy (see app/vercel/api/txline) that
  // holds the auth server side, so no browser tokens are needed there. Probe it
  // once: when it answers AND the fixture's replay feed currently has frames
  // (the devnet environment recycles fixtures between broadcast runs), upgrade
  // the tokenless Simulation default to Replay of the real anchored data.
  // GitHub Pages 404s and the dev proxy 403s the probe, so both keep their
  // existing behavior.
  useEffect(() => {
    if (hasTxlineTokens() || appConfig.demoFixtureId == null) return;
    let alive = true;
    fetch(`${window.location.origin}/txline-api/__health?fixture=${appConfig.demoFixtureId}`)
      .then(async (r) => {
        if (!alive || !r.ok || userPicked.current) return;
        const body = (await r.json().catch(() => null)) as { replay?: boolean } | null;
        if (body?.replay) setMode((prev) => (prev === "simulation" ? "replay" : prev));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const [update, setUpdate] = useState<MatchUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  /// Set when a replay/live feed died before its first frame and the hook switched
  /// to the offline Simulation automatically, so the UI can say what happened.
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  /// Discrete goal/corner/card events diffed from the update stream, newest first.
  const [events, setEvents] = useState<MatchEvent[]>([]);
  /// Wall clock time the last update arrived, for the feed freshness indicator.
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const feedRef = useRef<FeedSource | null>(null);
  const lastUpdate = useRef<MatchUpdate | null>(null);

  const buildFeed = useCallback((m: FeedMode): FeedSource => {
    if (m === "simulation") return new SimulationFeed(1500);
    const tokens = getTxlineTokens();
    const client = new TxlineClient({ apiBase: appConfig.apiBase, jwt: tokens.jwt, apiToken: tokens.apiToken });
    const fixtureId = appConfig.demoFixtureId ?? 0;
    if (m === "replay")
      return new HistoricalReplayFeed({ client, fixtureId, targetDurationMs: appConfig.demoReplayMs ?? 90000 });
    return new LiveSseFeed({ client, fixtureId });
  }, []);

  useEffect(() => {
    feedRef.current?.stop();
    setError(null);
    setUpdate(null);
    setEvents([]);
    setReceivedAt(null);
    lastUpdate.current = null;
    let feed: FeedSource;
    try {
      feed = buildFeed(mode);
    } catch (e) {
      setError(String(e));
      return;
    }
    feedRef.current = feed;

    // A Live/Replay feed for a fixture that is not broadcasting stays healthy but
    // silent (LiveSseFeed filters to the demo fixture), which would freeze the room
    // with no error to trigger the fallback. Bound the wait: no first frame in time
    // means "not broadcasting" — fall back to Simulation with a clear note.
    let firstFrameTimer: ReturnType<typeof setTimeout> | null = null;
    if (mode !== "simulation") {
      firstFrameTimer = setTimeout(() => {
        if (lastUpdate.current === null) {
          setFallbackNote(
            `Fixture #${appConfig.demoFixtureId} isn't broadcasting on TxLINE right now. Showing the offline Simulation; live matches appear in the ticker above.`,
          );
          setMode("simulation");
        }
      }, 9000);
    }
    const clearFirstFrame = () => {
      if (firstFrameTimer) {
        clearTimeout(firstFrameTimer);
        firstFrameTimer = null;
      }
    };

    feed.start(
      (u) => {
        // First frame of a working replay/live feed: any earlier fallback note is
        // stale, the real feed is healthy again.
        if (mode !== "simulation" && lastUpdate.current === null) setFallbackNote(null);
        clearFirstFrame();
        const fresh = diffEvents(lastUpdate.current, u);
        lastUpdate.current = u;
        setUpdate(u);
        setReceivedAt(Date.now());
        if (fresh.length > 0) setEvents((prev) => [...fresh.reverse(), ...prev].slice(0, MAX_EVENTS));
      },
      (e) => {
        const msg = typeof e === "string" ? e : (e as Error)?.message ?? "feed error";
        // A feed that dies before producing a single frame leaves the room frozen.
        // Make the promised fallback real: switch to the offline Simulation, and
        // record what happened so the UI can say so.
        if (mode !== "simulation" && lastUpdate.current === null) {
          clearFirstFrame();
          setFallbackNote(
            `TxLINE ${mode} feed unavailable (${msg}). Switched to the offline Simulation; re-select ${mode} once the API recovers.`,
          );
          setMode("simulation");
          return;
        }
        setError(msg);
      },
    );
    return () => {
      clearFirstFrame();
      feed.stop();
    };
  }, [mode, buildFeed]);

  return { mode, setMode: pickMode, update, error, fallbackNote, events, receivedAt };
}
