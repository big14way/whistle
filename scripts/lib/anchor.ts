// Load the Whistle Anchor program for node scripts and tests.

import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import whistleIdl from "../../target/idl/whistle.json";
import type { Whistle } from "../../target/types/whistle";

export type { Whistle };

export function getConnection(rpcUrl: string, wsUrl?: string): Connection {
  // Many HTTP RPC providers (Alchemy and QuickNode free tiers, for example) do
  // not serve `signatureSubscribe` on their websocket, so web3.js
  // `confirmTransaction` times out even though the HTTP send already landed the
  // tx, and the retry then fails simulation because the PDA already exists. Use a
  // websocket that does support subscriptions (the public devnet endpoint) for the
  // confirmation path while keeping the fast HTTP provider for everything else.
  const ws = wsUrl ?? process.env.WS_URL ?? defaultWsEndpoint(rpcUrl);
  return ws
    ? new Connection(rpcUrl, { commitment: "confirmed", wsEndpoint: ws })
    : new Connection(rpcUrl, "confirmed");
}

/// A websocket endpoint for confirmations. When the HTTP RPC is itself a public
/// Solana endpoint its derived websocket works, so return undefined (let web3.js
/// derive it). For any custom devnet provider, confirm via the public devnet ws.
function defaultWsEndpoint(rpcUrl: string): string | undefined {
  if (/api\.(devnet|testnet|mainnet-beta)\.solana\.com/.test(rpcUrl)) return undefined;
  return "wss://api.devnet.solana.com/";
}

export function getProvider(connection: Connection, keypair: Keypair): AnchorProvider {
  const wallet = new Wallet(keypair);
  return new AnchorProvider(connection, wallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
}

export function getProgram(provider: AnchorProvider): Program<Whistle> {
  return new Program(whistleIdl as Idl as Whistle, provider);
}

export const WHISTLE_IDL = whistleIdl;
