// Node side config helpers. The generated config and demo wallet files are the
// single source of truth shared between the scripts, the tests, and the frontend.
// Both are gitignored.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Keypair } from "@solana/web3.js";

export const ROOT = path.resolve(__dirname, "..", "..");
export const CONFIG_PATH = path.join(ROOT, "app", "src", "config.generated.json");
export const DEMO_WALLETS_PATH = path.join(ROOT, "app", "src", "demo-wallets.generated.json");
export const TOKEN_CACHE_PATH = path.join(ROOT, ".txline-token-cache.json");

export type Cluster = "devnet" | "mainnet-beta";

export interface MarketSeed {
  marketId: number;
  title: string;
  address: string;
}

export interface GeneratedConfig {
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
  markets?: MarketSeed[];
}

export function readConfig(): Partial<GeneratedConfig> {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function writeConfig(patch: Partial<GeneratedConfig>): GeneratedConfig {
  const merged = { ...readConfig(), ...patch } as GeneratedConfig;
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

export interface DemoWallets {
  bettorA?: number[];
  bettorB?: number[];
  settler?: number[];
  /// Dedicated mock USDC mint authority, so the frontend Fund button can mint
  /// without ever holding the deployer key. Created by create-mock-usdc.ts.
  mintAuthority?: number[];
}

export function readDemoWallets(): DemoWallets {
  if (!fs.existsSync(DEMO_WALLETS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DEMO_WALLETS_PATH, "utf8"));
  } catch {
    return {};
  }
}

/// Merge into the demo wallets file, preserving any keys not in the patch.
export function writeDemoWallets(patch: DemoWallets): DemoWallets {
  const merged = { ...readDemoWallets(), ...patch };
  fs.mkdirSync(path.dirname(DEMO_WALLETS_PATH), { recursive: true });
  fs.writeFileSync(DEMO_WALLETS_PATH, JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

export function keypairFromSecret(secret: number[]): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

/// Load a keypair from a Solana CLI json file (array of bytes).
export function loadKeypairFile(p: string): Keypair {
  const resolved = p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
  const secret = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

/// The deployer keypair: WHISTLE_DEPLOYER_KEYPAIR env, else the Solana CLI default.
export function loadDeployer(): Keypair {
  const p = process.env.WHISTLE_DEPLOYER_KEYPAIR || path.join(os.homedir(), ".config", "solana", "id.json");
  return loadKeypairFile(p);
}

export function clusterFromEnv(): Cluster {
  const c = (process.env.SOLANA_CLUSTER || "devnet").toLowerCase();
  return c.startsWith("main") ? "mainnet-beta" : "devnet";
}
