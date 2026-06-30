// Browser Anchor client for the Whistle program. Demo wallets are local Keypairs,
// so each action builds a provider whose wallet is the acting demo wallet. A
// throwaway read program is used for account fetches.

import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  type Transaction,
} from "@solana/web3.js";
import whistleIdl from "../../../target/idl/whistle.json";
import type { Whistle } from "../../../target/types/whistle";
import { appConfig } from "./config";

// Confirmations use a websocket subscription. Some HTTP RPC providers (Alchemy
// and QuickNode free tiers, for example) do not serve `signatureSubscribe`, which
// makes confirmTransaction hang even though the send landed. When the RPC is a
// custom provider, confirm over the public devnet websocket (which does support
// it) while still reading and sending over the fast provider. VITE_WS_URL can
// override. A public solana endpoint derives a working websocket on its own.
const wsOverride = (import.meta.env?.VITE_WS_URL as string | undefined) ?? undefined;
const wsEndpoint =
  wsOverride ??
  (/api\.(devnet|testnet|mainnet-beta)\.solana\.com/.test(appConfig.rpcUrl)
    ? undefined
    : "wss://api.devnet.solana.com/");
export const connection = new Connection(
  appConfig.rpcUrl,
  wsEndpoint ? { commitment: "confirmed", wsEndpoint } : "confirmed",
);
export const PROGRAM_ID = new PublicKey(appConfig.programId || (whistleIdl as { address: string }).address);
export const TXORACLE_ID = new PublicKey(appConfig.txoracleProgramId);
export const USDC_MINT = appConfig.usdcMint ? new PublicKey(appConfig.usdcMint) : null;

class KeypairWallet {
  constructor(public payer: Keypair) {}
  get publicKey() {
    return this.payer.publicKey;
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) tx.sign([this.payer]);
    else (tx as Transaction).partialSign(this.payer);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    for (const tx of txs) await this.signTransaction(tx);
    return txs;
  }
}

export function providerFor(kp: Keypair): AnchorProvider {
  return new AnchorProvider(connection, new KeypairWallet(kp) as never, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

export function programFor(kp: Keypair): Program<Whistle> {
  return new Program(whistleIdl as Idl as Whistle, providerFor(kp));
}

// A read only program for fetching accounts (wallet is a throwaway key).
export const readProgram = programFor(Keypair.generate());

export { whistleIdl };
export type WhistleProgram = Program<Whistle>;
