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
    const body = await res.json();
    const apiToken = body.apiToken ?? body.api_token ?? body.token;
    if (!apiToken) throw new Error("token/activate did not return an apiToken");
    this.apiToken = apiToken;
    return apiToken;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.jwt) h["Authorization"] = `Bearer ${this.jwt}`;
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
    const res = await fetch(url.toString(), { headers: this.headers() });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await safeText(res)}`);
    return (await res.json()) as T;
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

  getHistorical(fixtureId: number | string): Promise<unknown> {
    return this.getJson(`scores/historical/${fixtureId}`);
  }

  /// Stream the SSE scores feed. Calls onMessage with each parsed JSON event.
  async streamScores(
    onMessage: (evt: unknown) => void,
    onError: (e: unknown) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const res = await fetch(this.apiBase + "scores/stream", {
        headers: { ...this.headers(), Accept: "text/event-stream" },
        signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`scores/stream failed: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
          if (!payload) continue;
          // Guard parsing: a malformed line must not crash the loop.
          try {
            onMessage(JSON.parse(payload));
          } catch {
            // ignore non JSON keepalives
          }
        }
      }
    } catch (e) {
      onError(e);
    }
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
