// Build a TxlineClient for node scripts from the generated config plus tokens
// provided via env (TXLINE_JWT, TXLINE_API_TOKEN) or a local token cache. The
// on chain subscribe plus activate flow can also be run with a wallet to mint
// fresh tokens; for the demo and tests a pre obtained token via env is simplest.

import fs from "node:fs";
import { TxlineClient } from "../../app/src/lib/txline/client";
import { readConfig, TOKEN_CACHE_PATH } from "./config";

export function makeTxlineClient(): TxlineClient {
  const cfg = readConfig();
  const apiBase = process.env.TXLINE_API_BASE || cfg.apiBase || "https://txline-dev.txodds.com/api/";
  const client = new TxlineClient({ apiBase });
  if (process.env.TXLINE_JWT || process.env.TXLINE_API_TOKEN) {
    client.setTokens({ jwt: process.env.TXLINE_JWT, apiToken: process.env.TXLINE_API_TOKEN });
  } else if (fs.existsSync(TOKEN_CACHE_PATH)) {
    try {
      client.setTokens(JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, "utf8")));
    } catch {
      // ignore a corrupt cache
    }
  }
  return client;
}

export function cacheTokens(jwt?: string, apiToken?: string): void {
  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify({ jwt, apiToken }, null, 2));
}
