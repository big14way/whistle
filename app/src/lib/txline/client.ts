// Authenticated TxLINE HTTP client. Isomorphic (browser and node): uses global
// fetch and tweetnacl for the wallet signature. The World Cup auth flow is:
//   1. subscribe on chain to a free service level (caller supplies txSig)
//   2. POST /auth/guest/start  -> jwt
//   3. sign "{txSig}:{leagues}:{jwt}" with the wallet (NaCl detached, base64)
//   4. POST /api/token/activate -> apiToken
//   5. data calls send Authorization: Bearer {jwt} and X-Api-Token: {apiToken}
//
// For the demo and tests a token can also be supplied directly (env or cache) so
// data calls work without repeating the on chain subscribe each run. The exact
// header pair is confirmed against a live 200 in the deploy phase (see
// docs/ORACLE_FACTS.md).

import nacl from "tweetnacl";
import type { StatValidationResponse } from "./validation";

export interface TxlineTokens {
  jwt?: string;
  apiToken?: string;
}

export interface TxlineClientOptions extends TxlineTokens {
  /// e.g. https://txline-dev.txodds.com/api/
  apiBase: string;
}

function trimApi(apiBase: string): string {
  // host root used for /auth/guest/start (which is not under /api/)
  return apiBase.replace(/\/api\/?$/, "");
}

// Transient 5xx retry policy for data calls: the devnet API 503s in short bursts
// (observed twice during recording sessions), so ride out roughly 10s of outage
// before giving up. 4 attempts total, backing off 1.5s / 3s / 5s between them.
const RETRIES = 4;
const RETRY_DELAYS_MS = [1500, 3000, 5000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TxlineClient {
  apiBase: string;
  authBase: string;
  jwt?: string;
  apiToken?: string;

  constructor(opts: TxlineClientOptions) {
    this.apiBase = opts.apiBase.endsWith("/") ? opts.apiBase : opts.apiBase + "/";
    this.authBase = trimApi(this.apiBase);
    this.jwt = opts.jwt;
    this.apiToken = opts.apiToken;
  }

  setTokens(t: TxlineTokens) {
    if (t.jwt) this.jwt = t.jwt;
    if (t.apiToken) this.apiToken = t.apiToken;
  }

  hasTokens(): boolean {
    return Boolean(this.jwt && this.apiToken);
  }

  /// Step 2: get a guest JWT.
  async guestStart(): Promise<string> {
    const res = await fetch(`${this.authBase}/auth/guest/start`, { method: "POST" });
    if (!res.ok) throw new Error(`guest/start failed: ${res.status} ${await safeText(res)}`);
    const body = await res.json();
    const jwt = body.jwt ?? body.token ?? body.access_token;
    if (!jwt) throw new Error("guest/start did not return a jwt");
    this.jwt = jwt;
    return jwt;
  }

  /// Build the message the wallet must sign.
  static authMessage(txSig: string, leagues: Array<number | string>, jwt: string): string {
    return `${txSig}:${leagues.join(",")}:${jwt}`;
  }

  /// Step 4: activate the API token using the wallet signature over the message.
  async activate(
    txSig: string,
    walletSecretKey: Uint8Array,
    leagues: Array<number | string>,
  ): Promise<string> {
    if (!this.jwt) await this.guestStart();
    const message = TxlineClient.authMessage(txSig, leagues, this.jwt!);
    const sig = nacl.sign.detached(new TextEncoder().encode(message), walletSecretKey);
    const walletSignature = toBase64(sig);
    const res = await fetch(`${this.apiBase}token/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.jwt}` },
      body: JSON.stringify({ txSig, walletSignature, leagues }),
    });
    if (!res.ok) throw new Error(`token/activate failed: ${res.status} ${await safeText(res)}`);
    // The endpoint may return the token as JSON ({ token } / { apiToken }) or as a
    // raw plain text string. Handle both.
    const text = await res.text();
    let apiToken: string | undefined;
    try {
      const body = JSON.parse(text);
      apiToken = typeof body === "string" ? body : body.apiToken ?? body.api_token ?? body.token;
    } catch {
      apiToken = text.trim();
    }
    if (!apiToken) throw new Error("token/activate did not return an apiToken");
    this.apiToken = apiToken;
    return apiToken;
  }

  private headers(): Record<string, string> {
    // Confirmed against the live devnet API: data calls authenticate with the jwt
    // as the bearer and the apiToken in X-Api-Token. We prefer the jwt for the
    // bearer, falling back to the apiToken if only that is available.
    const h: Record<string, string> = {};
    const bearer = this.jwt ?? this.apiToken;
    if (bearer) h["Authorization"] = `Bearer ${bearer}`;
    if (this.apiToken) h["X-Api-Token"] = this.apiToken;
    return h;
  }

  private async getJson<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(this.apiBase + path.replace(/^\//, ""));
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    // The devnet API 503s in short bursts. Ride those out with a few retries so a
    // blip cannot fail a settle mid demo; 4xx (auth, bad request) surfaces at once.
    let lastErr: Error = new Error(`GET ${path} failed`);
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
      let res: Response;
      try {
        res = await fetch(url.toString(), { headers: this.headers() });
      } catch (e) {
        lastErr = e as Error;
        continue;
      }
      if (res.ok) return (await res.json()) as T;
      lastErr = new Error(`GET ${path} failed: ${res.status} ${await safeText(res)}`);
      if (res.status < 500) break;
    }
    throw lastErr;
  }

  getStatValidation(
    fixtureId: number | string,
    seq: number,
    statKey: number,
    statKey2?: number,
  ): Promise<StatValidationResponse> {
    return this.getJson<StatValidationResponse>("scores/stat-validation", {
      fixtureId,
      seq,
      statKey,
      statKey2,
    });
  }

  getSnapshot(fixtureId: number | string): Promise<unknown> {
    return this.getJson(`scores/snapshot/${fixtureId}`);
  }

  /// The historical scores feed is an SSE stream (text/event-stream), not JSON.
  /// Read it fully and return the parsed events in order.
  async getHistoricalEvents(fixtureId: number | string, signal?: AbortSignal): Promise<unknown[]> {
    const out: unknown[] = [];
    await this.readSse(`scores/historical/${fixtureId}`, (e) => out.push(e), signal);
    return out;
  }

  /// Stream the live SSE scores feed. Calls onMessage with each parsed event.
  async streamScores(
    onMessage: (evt: unknown) => void,
    onError: (e: unknown) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.readSse("scores/stream", onMessage, signal);
    } catch (e) {
      onError(e);
    }
  }

  /// Extract the JSON object from one SSE frame. Per the SSE spec a frame can have
  /// multiple data: lines, which are concatenated. Returns null for keep alives,
  /// comments, or malformed payloads (guarded so one bad frame cannot break a feed).
  private parseSseFrame(frame: string): unknown | null {
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (dataLines.length === 0) return null;
    const payload = dataLines.join("\n").trim();
    if (!payload) return null;
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  /// Read an SSE endpoint, buffering across chunks and splitting on blank lines so
  /// frames that span chunk boundaries are handled. Calls onEvent per parsed frame.
  private async readSse(
    path: string,
    onEvent: (evt: unknown) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    // Retry the stream OPEN through transient 5xx bursts (the devnet API 503s in
    // blips); once the stream is delivering, a mid stream failure is surfaced to
    // the caller instead, since silently rewinding a half consumed feed would
    // replay events the UI already showed.
    let res: Response | null = null;
    let lastErr: Error = new Error(`GET ${path} failed`);
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
      if (signal?.aborted) throw lastErr;
      let r: Response;
      try {
        r = await fetch(this.apiBase + path, {
          headers: { ...this.headers(), Accept: "text/event-stream" },
          signal,
        });
      } catch (e) {
        lastErr = e as Error;
        continue;
      }
      if (r.ok && r.body) {
        res = r;
        break;
      }
      lastErr = new Error(`GET ${path} failed: ${r.status} ${await safeText(r)}`);
      if (r.status < 500) break;
    }
    if (!res || !res.body) throw lastErr;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? ""; // keep the trailing partial frame
      for (const frame of frames) {
        const evt = this.parseSseFrame(frame);
        if (evt) onEvent(evt);
      }
    }
    const last = this.parseSseFrame(buffer);
    if (last) onEvent(last);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

function toBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  // node
  return Buffer.from(bytes).toString("base64");
}
