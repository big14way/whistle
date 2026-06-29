// Browser side config loader. Reads app/src/config.generated.json (written by the
// seed scripts) via Vite glob, falling back to safe devnet defaults so the app
// renders an informative "not seeded yet" state before the demo is seeded.

import { RPC_URL, TXLINE_API_BASE, TXORACLE_PROGRAM_ID, type Cluster } from "./constants";

export interface MarketSeed {
  marketId: number;
  title: string;
  address: string;
}

export interface AppConfig {
  cluster: Cluster;
  rpcUrl: string;
  programId: string;
  txoracleProgramId: string;
  apiBase: string;
  usdcMint?: string;
  usdcMintAuthority?: string;
  usdcDecimals: number;
  demoFixtureId?: number;
  demoFixtureAddress?: string;
  /// The anchored sequence number whose stat the demo settles against.
  demoSeq?: number;
  markets?: MarketSeed[];
}

const DEFAULTS: AppConfig = {
  cluster: "devnet",
  rpcUrl: RPC_URL.devnet,
  programId: "",
  txoracleProgramId: TXORACLE_PROGRAM_ID.devnet.toBase58(),
  apiBase: TXLINE_API_BASE.devnet,
  usdcDecimals: 6,
};

const configMods = import.meta.glob("../config.generated.json", { eager: true }) as Record<
  string,
  { default: Partial<AppConfig> }
>;
const loaded = Object.values(configMods)[0]?.default ?? {};

const merged: AppConfig = { ...DEFAULTS, ...loaded };

// In the browser, route TxLINE calls through the dev server proxy (/txline-api)
// so they originate from this host's IP (the guest token is IP bound) and avoid
// CORS. The proxy is configured in vite.config.ts.
if (typeof window !== "undefined") {
  merged.apiBase = `${window.location.origin}/txline-api/`;
}

export const appConfig: AppConfig = merged;

export const isSeeded = Boolean(appConfig.programId && appConfig.usdcMint && appConfig.demoFixtureId != null);

const walletMods = import.meta.glob("../demo-wallets.generated.json", { eager: true }) as Record<
  string,
  { default: Record<string, number[]> }
>;
export const demoWalletSecrets: Record<string, number[]> = Object.values(walletMods)[0]?.default ?? {};

// Injected demo TxLINE tokens (written by the deploy phase, gitignored). When
// present the app uses them directly so no manual paste is needed.
const tokenMods = import.meta.glob("../txline-tokens.generated.json", { eager: true }) as Record<
  string,
  { default: { jwt?: string; apiToken?: string } }
>;
export const injectedTokens: { jwt?: string; apiToken?: string } = Object.values(tokenMods)[0]?.default ?? {};
