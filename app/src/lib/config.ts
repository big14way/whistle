// Browser side config loader. Reads app/src/config.generated.json (written by the
// seed scripts) via Vite glob, falling back to safe devnet defaults so the app
// renders an informative "not seeded yet" state before the demo is seeded.

import { RPC_URL, TXLINE_API_BASE, TXORACLE_PROGRAM_ID, type Cluster } from "./constants";

export interface MarketSeed {
  marketId: number;
  title: string;
  address: string;
  /// The match minute this market narratively resolves at (for the timeline).
  settleMinute?: number;
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
  /// Target replay duration in ms, so the synthesized clock lines up with the
  /// staggered on chain resolve times.
  demoReplayMs?: number;
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

// config.default.json is committed (all public devnet values plus the always open
// public markets), so a fresh clone and the public Pages build both point at the live
// deployment out of the box. config.generated.json is the gitignored local override
// written by the seed scripts; when present it wins.
const defaultMods = import.meta.glob("../config.default.json", { eager: true }) as Record<
  string,
  { default: Partial<AppConfig> }
>;
const defaultLoaded = Object.values(defaultMods)[0]?.default ?? {};

const configMods = import.meta.glob("../config.generated.json", { eager: true }) as Record<
  string,
  { default: Partial<AppConfig> }
>;
const loaded = Object.values(configMods)[0]?.default ?? {};

const merged: AppConfig = { ...DEFAULTS, ...defaultLoaded, ...loaded };

// In the browser, route TxLINE calls through the dev server proxy (/txline-api)
// so they originate from this host's IP (the guest token is IP bound) and avoid
// CORS. The proxy is configured in vite.config.ts.
if (typeof window !== "undefined") {
  merged.apiBase = `${window.location.origin}/txline-api/`;
}

// A dedicated RPC avoids the public devnet rate limits. Set VITE_RPC_URL to use one.
const rpcOverride = import.meta.env?.VITE_RPC_URL as string | undefined;
if (rpcOverride) merged.rpcUrl = rpcOverride;

export const appConfig: AppConfig = merged;

export const isSeeded = Boolean(appConfig.programId && appConfig.usdcMint && appConfig.demoFixtureId != null);

const walletMods = import.meta.glob("../demo-wallets.generated.json", { eager: true }) as Record<
  string,
  { default: Record<string, number[]> }
>;
export const demoWalletSecrets: Record<string, number[]> = Object.values(walletMods)[0]?.default ?? {};

// The committed public faucet key (the mock USDC mint authority). Present in every
// build, so the Fund button works on the public deployment where the local demo
// wallets are stripped. Its only power is minting a worthless devnet test token.
const faucetMods = import.meta.glob("../faucet.public.json", { eager: true }) as Record<
  string,
  { default: { secretKey?: number[] } }
>;
export const faucetSecret: number[] | undefined = Object.values(faucetMods)[0]?.default?.secretKey;

// Injected demo TxLINE tokens (written by the deploy phase, gitignored). When
// present the app uses them directly so no manual paste is needed.
const tokenMods = import.meta.glob("../txline-tokens.generated.json", { eager: true }) as Record<
  string,
  { default: { jwt?: string; apiToken?: string } }
>;
export const injectedTokens: { jwt?: string; apiToken?: string } = Object.values(tokenMods)[0]?.default ?? {};
