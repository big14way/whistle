// On chain actions for the demo: place a bet, settle, claim, fund a wallet, and
// read USDC balances. Each action signs with the relevant local demo keypair.

import { BN } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
} from "@solana/spl-token";
import { SETTLE_COMPUTE_UNITS } from "./constants";
import { demoWalletSecrets } from "./config";
import { connection, PROGRAM_ID, TXORACLE_ID, USDC_MINT, programFor, readProgram } from "./program";
import { marketPda, positionPda, vaultAuthorityPda, vaultPda } from "./pdas";
import type { SettleArgs } from "./txline/validation";

function requireMint(): PublicKey {
  if (!USDC_MINT) throw new Error("Mock USDC mint is not configured. Run pnpm mock-usdc and pnpm seed.");
  return USDC_MINT;
}

export async function getUsdcBalance(owner: PublicKey): Promise<number> {
  const mint = requireMint();
  try {
    const ata = getAssociatedTokenAddressSync(mint, owner);
    const acc = await getAccount(connection, ata);
    return Number(acc.amount) / 1e6;
  } catch {
    return 0;
  }
}

export async function getSolBalance(owner: PublicKey): Promise<number> {
  return (await connection.getBalance(owner)) / 1e9;
}

/// Place a bet (side true = YES). Returns the transaction signature.
export async function placeBet(
  market: PublicKey,
  side: boolean,
  amountUi: number,
  bettor: Keypair,
): Promise<string> {
  const mint = requireMint();
  const program = programFor(bettor);
  const amount = new BN(Math.round(amountUi * 1e6));
  const position = positionPda(PROGRAM_ID, market, bettor.publicKey);
  const vault = vaultPda(PROGRAM_ID, market);
  // Ensure the bettor has a USDC ATA (created and signed by the bettor).
  const ata = await getOrCreateAssociatedTokenAccount(connection, bettor, mint, bettor.publicKey);
  return program.methods
    .joinMarket(side, amount)
    .accountsPartial({
      market,
      position,
      vault,
      userTokenAccount: ata.address,
      user: bettor.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

/// Settle a market with the shaped proof args and the derived roots PDA.
export async function settleMarket(
  market: PublicKey,
  args: SettleArgs,
  rootsPda: PublicKey,
  settler: Keypair,
): Promise<string> {
  const program = programFor(settler);
  return program.methods
    .settle(args as never)
    .accountsPartial({
      market,
      dailyScoresMerkleRoots: rootsPda,
      txoracleProgram: TXORACLE_ID,
      settler: settler.publicKey,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: SETTLE_COMPUTE_UNITS })])
    .rpc();
}

/// Claim a payout or refund.
export async function claimPayout(market: PublicKey, user: Keypair): Promise<string> {
  const mint = requireMint();
  const program = programFor(user);
  const position = positionPda(PROGRAM_ID, market, user.publicKey);
  const vault = vaultPda(PROGRAM_ID, market);
  const vaultAuthority = vaultAuthorityPda(PROGRAM_ID, market);
  const ata = await getOrCreateAssociatedTokenAccount(connection, user, mint, user.publicKey);
  return program.methods
    .claim()
    .accountsPartial({
      market,
      position,
      vault,
      vaultAuthority,
      userTokenAccount: ata.address,
      user: user.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/// Mint uiAmount mock USDC to an owner using the dedicated mint authority (loaded
/// from the demo wallets file). Powers the Fund button.
export async function fundWallet(owner: PublicKey, uiAmount: number): Promise<string> {
  const mint = requireMint();
  if (!demoWalletSecrets.mintAuthority) {
    throw new Error("Mint authority key not available. Run pnpm mock-usdc.");
  }
  const mintAuthority = Keypair.fromSecretKey(Uint8Array.from(demoWalletSecrets.mintAuthority));
  const ata = await getOrCreateAssociatedTokenAccount(connection, mintAuthority, mint, owner);
  return mintTo(connection, mintAuthority, mint, ata.address, mintAuthority, BigInt(Math.round(uiAmount * 1e6)));
}

/// Fetch a market account, or null.
export async function fetchMarket(market: PublicKey) {
  return readProgram.account.market.fetchNullable(market);
}

/// Fetch a position account, or null.
export async function fetchPosition(market: PublicKey, user: PublicKey) {
  return readProgram.account.position.fetchNullable(positionPda(PROGRAM_ID, market, user));
}

export { marketPda };
