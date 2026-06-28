// PDA derivations, mirroring the seeds in programs/whistle/src/state.rs.

import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const FIXTURE = Buffer.from("fixture");
const MARKET = Buffer.from("market");
const POSITION = Buffer.from("position");
const VAULT = Buffer.from("vault");
const VAULT_AUTHORITY = Buffer.from("vault_authority");

function i64le(n: number | BN): Buffer {
  return new BN(n).toTwos(64).toArrayLike(Buffer, "le", 8);
}

function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

export function fixturePda(programId: PublicKey, fixtureId: number | BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([FIXTURE, i64le(fixtureId)], programId);
}

export function marketPda(programId: PublicKey, fixture: PublicKey, marketId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MARKET, fixture.toBuffer(), u32le(marketId)], programId);
}

export function positionPda(programId: PublicKey, market: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([POSITION, market.toBuffer(), user.toBuffer()], programId);
}

export function vaultPda(programId: PublicKey, market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT, market.toBuffer()], programId);
}

export function vaultAuthorityPda(programId: PublicKey, market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_AUTHORITY, market.toBuffer()], programId);
}
