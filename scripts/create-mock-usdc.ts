// Create the mock USDC SPL mint (6 decimals) on the configured cluster. The mint
// authority is a dedicated generated keypair (not the deployer) so the frontend
// Fund button can mint without ever holding the deployer key. Writes the mint and
// authority to app/src/config.generated.json and the authority secret to
// app/src/demo-wallets.generated.json. Idempotent: reuses an existing live mint.

import { Keypair, PublicKey } from "@solana/web3.js";
import { createMint, getMint, mintTo, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import whistleIdl from "../target/idl/whistle.json";
import { RPC_URL, TXLINE_API_BASE, TXORACLE_PROGRAM_ID, USDC_DECIMALS } from "../app/src/lib/constants";
import { getConnection } from "./lib/anchor";
import {
  clusterFromEnv,
  keypairFromSecret,
  loadDeployer,
  readConfig,
  readDemoWallets,
  writeConfig,
  writeDemoWallets,
} from "./lib/config";

async function ensureSol(connection: ReturnType<typeof getConnection>, who: PublicKey, minSol = 1) {
  const bal = await connection.getBalance(who);
  if (bal >= minSol * 1e9) return;
  try {
    const sig = await connection.requestAirdrop(who, 2 * 1e9);
    await connection.confirmTransaction(sig, "confirmed");
  } catch (e) {
    console.warn("airdrop failed (devnet faucet flaky), continuing with", bal / 1e9, "SOL:", String(e).slice(0, 120));
  }
}

/// Ensure the mock USDC mint and its dedicated authority exist, writing config and
/// the authority secret. Idempotent. Returns the mint and authority.
export async function ensureMockUsdc(
  connection: ReturnType<typeof getConnection>,
  deployer: Keypair,
): Promise<{ mint: PublicKey; mintAuthority: Keypair }> {
  const cluster = clusterFromEnv();
  const rpcUrl = process.env.RPC_URL || RPC_URL[cluster];

  // Reuse a dedicated mint authority keypair if one already exists.
  const wallets = readDemoWallets();
  const mintAuthority = wallets.mintAuthority ? keypairFromSecret(wallets.mintAuthority) : Keypair.generate();
  if (!wallets.mintAuthority) {
    writeDemoWallets({ mintAuthority: Array.from(mintAuthority.secretKey) });
    await ensureSol(connection, mintAuthority.publicKey, 0.2);
  }

  // Reuse an existing live mint if config points at one, else create it.
  const existing = readConfig();
  let mint: PublicKey | null = null;
  if (existing.usdcMint) {
    try {
      await getMint(connection, new PublicKey(existing.usdcMint));
      mint = new PublicKey(existing.usdcMint);
      console.log("reusing existing mock USDC mint:", mint.toBase58());
    } catch {
      mint = null;
    }
  }
  if (!mint) {
    mint = await createMint(connection, deployer, mintAuthority.publicKey, null, USDC_DECIMALS);
    console.log("created mock USDC mint:", mint.toBase58());
  }

  writeConfig({
    cluster,
    rpcUrl,
    programId: (whistleIdl as { address: string }).address,
    txoracleProgramId: TXORACLE_PROGRAM_ID[cluster].toBase58(),
    apiBase: process.env.TXLINE_API_BASE || TXLINE_API_BASE[cluster],
    usdcMint: mint.toBase58(),
    usdcMintAuthority: mintAuthority.publicKey.toBase58(),
    usdcDecimals: USDC_DECIMALS,
  });

  return { mint, mintAuthority };
}

async function main() {
  const cluster = clusterFromEnv();
  const rpcUrl = process.env.RPC_URL || RPC_URL[cluster];
  const connection = getConnection(rpcUrl);
  const deployer = loadDeployer();
  console.log("cluster:", cluster, "deployer:", deployer.publicKey.toBase58());

  await ensureSol(connection, deployer.publicKey, 1);
  const { mint, mintAuthority } = await ensureMockUsdc(connection, deployer);

  console.log("\nwrote app/src/config.generated.json");
  console.log("Also record in docs/ORACLE_FACTS.md:");
  console.log("  mint          =", mint.toBase58());
  console.log("  mintAuthority =", mintAuthority.publicKey.toBase58());
}

/// Mint uiAmount tokens of the mock USDC to an owner. Reused by seed-demo.
export async function mintToOwner(
  connection: ReturnType<typeof getConnection>,
  payer: Keypair,
  mint: PublicKey,
  mintAuthority: Keypair,
  owner: PublicKey,
  uiAmount: number,
): Promise<void> {
  const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner);
  await mintTo(connection, payer, mint, ata.address, mintAuthority, BigInt(Math.round(uiAmount * 10 ** USDC_DECIMALS)));
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
