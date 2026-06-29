import { PublicKey } from "@solana/web3.js";

/// Cluster names we support. devnet is primary (where the World Cup roots live).
export type Cluster = "devnet" | "mainnet-beta";

/// TxLINE txoracle program ids, confirmed from
/// https://txline-docs.txodds.com/documentation/programs/addresses.md
export const TXORACLE_PROGRAM_ID: Record<Cluster, PublicKey> = {
  devnet: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
  "mainnet-beta": new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
};

/// TxLINE API base URLs. The base serving World Cup data for the settlement
/// cluster is confirmed in the deploy phase (TXLINE_API_BASE env can override).
export const TXLINE_API_BASE: Record<Cluster, string> = {
  devnet: "https://txline-dev.txodds.com/api/",
  "mainnet-beta": "https://txline.txodds.com/api/",
};

/// Solana RPC endpoints.
export const RPC_URL: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

/// TxL subscription token mint (Token-2022), used by the free World Cup subscribe.
/// Confirmed from the addresses doc.
export const TXL_TOKEN_MINT: Record<Cluster, string> = {
  devnet: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
  "mainnet-beta": "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL",
};

/// PDA seed for the txoracle daily_scores_roots account.
export const DAILY_SCORES_ROOTS_SEED = "daily_scores_roots";

/// Timestamps from TxLINE are in milliseconds. epochDay = floor(ms / MS_PER_DAY).
export const MS_PER_DAY = 86_400_000;

/// USDC has 6 decimals. 1 USDC = 1_000_000 base units.
export const USDC_DECIMALS = 6;
export const USDC_UNIT = 1_000_000;

/// Compute unit limit required for the validate_stat CPI (Merkle heavy).
export const SETTLE_COMPUTE_UNITS = 1_400_000;

export function explorerTx(sig: string, cluster: Cluster): string {
  const c = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${sig}${c}`;
}

export function explorerAddress(addr: string, cluster: Cluster): string {
  const c = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/address/${addr}${c}`;
}
