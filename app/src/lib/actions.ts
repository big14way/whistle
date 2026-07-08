// On chain actions for the demo: place a bet, settle, claim, fund a wallet, and
// read USDC balances. Each action signs with the relevant local demo keypair.
//
// Confirmations poll getSignatureStatuses over HTTP instead of using web3.js
// confirmTransaction: that API waits on a websocket signatureSubscribe
// notification, and when the websocket is slow or blocked the wait drags on for
// many seconds (or until blockheight expiry) even though the transaction already
// landed in a block. Polling the fast HTTP RPC every ~350ms reports confirmation
// within a beat of it actually happening, which is what makes the measured settle
// time on camera read as the one block reality.

import { BN } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  getAccount,
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/// Wait for a signature to reach confirmed by polling the HTTP RPC. Throws on a
/// transaction error or after timeoutMs without a confirmation.
export async function confirmSigFast(sig: string, timeoutMs = 45000): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    const { value } = await connection.getSignatureStatuses([sig]);
    const st = value[0];
    if (st?.err) throw new Error(`Transaction ${sig} failed on chain: ${JSON.stringify(st.err)}`);
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return;
    if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out waiting for confirmation of ${sig}`);
    await sleep(350);
  }
}

/// Sign, send, and poll confirm a transaction with one signer. onSent fires with
/// the signature the instant the send returns, before confirmation, so the UI can
/// show it rather than a bare spinner.
async function sendAndConfirmFast(tx: Transaction, signer: Keypair, onSent?: (sig: string) => void): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(signer);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
  onSent?.(sig);
  await confirmSigFast(sig);
  return sig;
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
  const tx = await program.methods
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
    .transaction();
  return sendAndConfirmFast(tx, bettor);
}

/// Settle a market with the shaped proof args and the derived roots PDA. The
/// onSent callback fires with the signature the instant the transaction is sent,
/// before confirmation, so the UI can show it and a "watch it confirm" link rather
/// than a bare spinner under RPC latency.
export async function settleMarket(
  market: PublicKey,
  args: SettleArgs,
  rootsPda: PublicKey,
  settler: Keypair,
  onSent?: (sig: string) => void,
): Promise<string> {
  const program = programFor(settler);
  const tx = await program.methods
    .settle(args as never)
    .accountsPartial({
      market,
      dailyScoresMerkleRoots: rootsPda,
      txoracleProgram: TXORACLE_ID,
      settler: settler.publicKey,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: SETTLE_COMPUTE_UNITS })])
    .transaction();
  return sendAndConfirmFast(tx, settler, onSent);
}

/// Claim a payout or refund.
export async function claimPayout(market: PublicKey, user: Keypair): Promise<string> {
  const mint = requireMint();
  const program = programFor(user);
  const position = positionPda(PROGRAM_ID, market, user.publicKey);
  const vault = vaultPda(PROGRAM_ID, market);
  const vaultAuthority = vaultAuthorityPda(PROGRAM_ID, market);
  const ata = await getOrCreateAssociatedTokenAccount(connection, user, mint, user.publicKey);
  const tx = await program.methods
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
    .transaction();
  return sendAndConfirmFast(tx, user);
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
  const tx = new Transaction().add(
    createMintToInstruction(mint, ata.address, mintAuthority.publicKey, BigInt(Math.round(uiAmount * 1e6))),
  );
  return sendAndConfirmFast(tx, mintAuthority);
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
