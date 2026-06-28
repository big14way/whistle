// Load the Whistle Anchor program for node scripts and tests.

import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import whistleIdl from "../../target/idl/whistle.json";
import type { Whistle } from "../../target/types/whistle";

export type { Whistle };

export function getConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, "confirmed");
}

export function getProvider(connection: Connection, keypair: Keypair): AnchorProvider {
  const wallet = new Wallet(keypair);
  return new AnchorProvider(connection, wallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
}

export function getProgram(provider: AnchorProvider): Program<Whistle> {
  return new Program(whistleIdl as Idl as Whistle, provider);
}

export const WHISTLE_IDL = whistleIdl;
