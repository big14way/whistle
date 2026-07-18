// Vercel Edge proxy for TxLINE, the hosted analogue of the Vite dev-server
// /txline-api proxy. It makes the public deployment's Replay and Live feeds real:
//
//   browser -> /txline-api/scores/*   (vercel.json rewrites to /api/txline?path=scores/*)
//           -> this function adds auth -> https://txline-dev.txodds.com/api/*
//
// Auth model (see docs/ORACLE_FACTS.md and app/src/lib/txline/client.ts): data
// calls need a guest JWT (Authorization: Bearer) plus an activated API token
// (X-Api-Token). The JWT is IP bound at mint (maybeClientIp), so this function
// mints its OWN guest jwt via /auth/guest/start — the minting and the data call
// then share an egress IP, which is what makes the binding hold from a cloud
// host. The API token is a standalone activation credential (verified: a fresh
// jwt pairs with an existing apiToken) held in the TXLINE_API_TOKEN env var, so
// it never ships in the client bundle (docs/SECURITY.md: never publish tokens).
//
// Scope guard: GET under scores/* only — the read-only data surface. The proxy
// exposes free-tier World Cup devnet data, nothing else.

export const config = { runtime: "edge" };

// The deploy directory is dependency-free, so the cloud compile has no
// @types/node; declare the one Node global the Edge runtime provides.
declare const process: { env: Record<string, string | undefined> };

const UPSTREAM = "https://txline-dev.txodds.com";

// Cached per warm isolate; re-minted on 401/403 (isolate egress IP can change
// between invocations, and a re-mint from this invocation always matches).
let cachedJwt: string | null = null;

async function mintJwt(): Promise<string> {
  const res = await fetch(`${UPSTREAM}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest/start failed: ${res.status}`);
  const body = (await res.json()) as Record<string, string | undefined>;
  const jwt = body.jwt ?? body.token ?? body.access_token;
  if (!jwt) throw new Error("guest/start returned no jwt");
  cachedJwt = jwt;
  return jwt;
}

/// Does the fixture's historical feed have at least one SSE frame right now?
/// The devnet environment recycles fixtures (GameState flips back to scheduled
/// and the replay stream runs dry between broadcast runs), so the app only
/// upgrades its default Simulation feed to Replay when there is real data.
async function replayHasData(fixtureId: string, apiToken: string): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const hit = (jwt: string) =>
      fetch(`${UPSTREAM}/api/scores/historical/${encodeURIComponent(fixtureId)}`, {
        headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken, Accept: "text/event-stream" },
        signal: ctl.signal,
      });
    let res = await hit(cachedJwt ?? (await mintJwt()));
    // A warm isolate's cached JWT is IP-bound-stale after an egress IP change;
    // re-mint once so a live fixture is not misreported as having no data.
    if (res.status === 401 || res.status === 403) res = await hit(await mintJwt());
    if (!res.ok || !res.body) {
      clearTimeout(timer);
      return false;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (buf.includes("data:")) return true;
      }
    } finally {
      clearTimeout(timer);
      ctl.abort();
    }
    return false;
  } catch {
    return false;
  }
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") ?? "";

  // Lets the app detect the proxy (GitHub Pages 404s here, the Vite dev proxy
  // forwards it upstream where it 403s) and auto-enable the real TxLINE feeds.
  // With ?fixture= it also reports whether that fixture's replay feed currently
  // has frames, so the app never auto-switches into an empty feed.
  if (path === "__health") {
    const fixture = url.searchParams.get("fixture");
    const token = process.env.TXLINE_API_TOKEN;
    const body =
      fixture && token
        ? JSON.stringify({ ok: true, replay: await replayHasData(fixture, token) })
        : JSON.stringify({ ok: true, replay: false });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  // Allowlist the read-only scores/* surface. Reject dot-segments: fetch
  // normalizes `..`, so `scores/../../auth/guest/start` would otherwise pass the
  // prefix check yet resolve outside /api/scores/ while still carrying our creds.
  if (req.method !== "GET" || path.includes("..") || !path.startsWith("scores/")) {
    return new Response("forbidden", { status: 403 });
  }

  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!apiToken) {
    return new Response("proxy not configured (TXLINE_API_TOKEN unset)", { status: 503 });
  }

  // Forward the original query params (fixtureId, seq, statKey, ...) minus the
  // rewrite-injected path.
  const qs = new URLSearchParams(url.searchParams);
  qs.delete("path");
  const suffix = qs.toString();
  const upstream = `${UPSTREAM}/api/${path}${suffix ? `?${suffix}` : ""}`;
  const call = (jwt: string) =>
    fetch(upstream, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": apiToken,
        Accept: req.headers.get("accept") ?? "application/json",
      },
    });

  let res: Response;
  try {
    let jwt = cachedJwt ?? (await mintJwt());
    res = await call(jwt);
    if (res.status === 401 || res.status === 403) {
      jwt = await mintJwt();
      res = await call(jwt);
    }
  } catch (e) {
    return new Response(`upstream error: ${String(e)}`, { status: 502 });
  }

  // Pass the body through as a stream so SSE (scores/stream, scores/historical)
  // flows frame by frame instead of buffering.
  const headers = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  headers.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, headers });
}
