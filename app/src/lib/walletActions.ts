// Bet and claim from a connected browser wallet (Phantom and friends), as opposed to
// the local demo keypairs in actions.ts. Kept in a separate module so the demo path
// is untouched. The wallet signs; funding a wallet with mock USDC still goes through
// actions.fundWallet, which mints with the local mint authority (no wallet signature).

import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { confirmSigFast } from "./actions";
import { connection, PROGRAM_ID, USDC_MINT, readProgram } from "./program";
import { positionPda, vaultAuthorityPda, vaultPda } from "./pdas";

/// The slice of the wallet adapter we need: a public key and a transaction signer.
export interface WalletSigner {
  publicKey: PublicKey | null;
  signTransaction?: <T extends Transaction>(tx: T) => Promise<T>;
}

function requireMint(): PublicKey {
  if (!USDC_MINT) throw new Error("Mock USDC mint is not configured. Run pnpm mock-usdc.");
  return USDC_MINT;
}

function requireSigner(wallet: WalletSigner): { owner: PublicKey; sign: NonNullable<WalletSigner["signTransaction"]> } {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error("Connect a wallet first.");
  return { owner: wallet.publicKey, sign: wallet.signTransaction };
}

/// Sign a built transaction with the wallet, send it, and poll confirm over HTTP.
async function signSendConfirm(
  tx: Transaction,
  owner: PublicKey,
  sign: NonNullable<WalletSigner["signTransaction"]>,
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = owner;
  tx.recentBlockhash = blockhash;
  const signed = await sign(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 5 });
  await confirmSigFast(sig);
  return sig;
}

/// Place a bet from the connected wallet. Creates the wallet's USDC account in the
/// same transaction if it does not exist yet.
export async function placeBetFromWallet(
  market: PublicKey,
  side: boolean,
  amountUi: number,
  wallet: WalletSigner,
): Promise<string> {
  const { owner, sign } = requireSigner(wallet);
  const mint = requireMint();
  const amount = new BN(Math.round(amountUi * 1e6));
  const position = positionPda(PROGRAM_ID, market, owner);
  const vault = vaultPda(PROGRAM_ID, market);
  const ata = getAssociatedTokenAddressSync(mint, owner);

  const tx = new Transaction();
  try {
    await getAccount(connection, ata);
  } catch {
    tx.add(createAssociatedTokenAccountInstruction(owner, ata, owner, mint));
  }
  tx.add(
    await readProgram.methods
      .joinMarket(side, amount)
      .accountsPartial({
        market,
        position,
        vault,
        userTokenAccount: ata,
        user: owner,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction(),
  );
  return signSendConfirm(tx, owner, sign);
}

/// Claim a payout or refund to the connected wallet.
export async function claimFromWallet(market: PublicKey, wallet: WalletSigner): Promise<string> {
  const { owner, sign } = requireSigner(wallet);
  const mint = requireMint();
  const position = positionPda(PROGRAM_ID, market, owner);
  const vault = vaultPda(PROGRAM_ID, market);
  const vaultAuthority = vaultAuthorityPda(PROGRAM_ID, market);
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const tx = new Transaction().add(
    await readProgram.methods
      .claim()
      .accountsPartial({
        market,
        position,
        vault,
        vaultAuthority,
        userTokenAccount: ata,
        user: owner,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction(),
  );
  return signSendConfirm(tx, owner, sign);
}
