// One command to get TxLINE World Cup free tier tokens. It subscribes the deployer
// wallet on chain to a free service level (no TxL tokens required, just a tx), then
// runs guest/start, signs the message, and activates the API token. The jwt and
// apiToken are cached to .txline-token-cache.json and printed as env exports.
//
// Usage:
//   pnpm txline-auth                 (devnet, service level 1)
//   SOLANA_CLUSTER=mainnet-beta pnpm txline-auth
//   SERVICE_LEVEL=12 pnpm txline-auth   (real time)
//
// Env: SOLANA_CLUSTER, RPC_URL, TXLINE_API_BASE, TXLINE_AUTH_BASE, SERVICE_LEVEL, WEEKS.

import { Program, type Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import txoracleIdl from "../programs/whistle/idls/txoracle.full.json";
import { RPC_URL, TXL_TOKEN_MINT, TXLINE_API_BASE, TXORACLE_PROGRAM_ID } from "../app/src/lib/constants";
import { TxlineClient } from "../app/src/lib/txline/client";
import { getConnection, getProvider } from "./lib/anchor";
import { cacheTokens } from "./lib/txline";
import { clusterFromEnv, loadDeployer } from "./lib/config";

async function main() {
  const cluster = clusterFromEnv();
  const rpcUrl = process.env.RPC_URL || RPC_URL[cluster];
  const apiBase = process.env.TXLINE_API_BASE || TXLINE_API_BASE[cluster];
  const serviceLevel = Number(process.env.SERVICE_LEVEL || "1");
  const weeks = Number(process.env.WEEKS || "4");
  const leagues: number[] = [];

  const connection = getConnection(rpcUrl);
  const deployer = loadDeployer();
  const provider = getProvider(connection, deployer);

  const txoracleProgramId = TXORACLE_PROGRAM_ID[cluster];
  const txlMint = new PublicKey(TXL_TOKEN_MINT[cluster]);

  const program = new Program(txoracleIdl as Idl, provider);

  const [pricingMatrix] = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")], txoracleProgramId);
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("token_treasury_v2")], txoracleProgramId);
  const tokenTreasuryVault = getAssociatedTokenAddressSync(txlMint, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID);
  const userTokenAccount = getAssociatedTokenAddressSync(txlMint, deployer.publicKey, false, TOKEN_2022_PROGRAM_ID);

  console.log("cluster:", cluster);
  console.log("subscriber wallet:", deployer.publicKey.toBase58());
  console.log("service level:", serviceLevel, "| weeks:", weeks);
  console.log("pricing_matrix:", pricingMatrix.toBase58());

  // The subscribe instruction expects the user TxL token account to exist already,
  // so create it idempotently first (Token-2022, empty, no payment needed).
  await createAssociatedTokenAccountIdempotent(
    connection,
    deployer,
    txlMint,
    deployer.publicKey,
    {},
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  console.log("user TxL token account ready:", userTokenAccount.toBase58());

  // 1. Subscribe on chain (free tier).
  let txSig: string;
  try {
    txSig = await program.methods
      .subscribe(serviceLevel, weeks)
      .accountsPartial({
        user: deployer.publicKey,
        pricingMatrix,
        tokenMint: txlMint,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("subscribed, txSig:", txSig);
  } catch (e) {
    console.error("subscribe failed:", String(e).slice(0, 400));
    console.error(
      "\nIf this is a double subscribe within the active period, paste a prior subscribe txSig as TXLINE_TX_SIG to reuse it.",
    );
    if (process.env.TXLINE_TX_SIG) {
      txSig = process.env.TXLINE_TX_SIG;
      console.log("reusing TXLINE_TX_SIG:", txSig);
    } else {
      process.exit(1);
    }
  }

  // 2 to 4. guest/start, sign, activate.
  const authBase = process.env.TXLINE_AUTH_BASE || apiBase; // client derives the /auth host from this
  const client = new TxlineClient({ apiBase: authBase });
  const jwt = await client.guestStart();
  console.log("guest jwt obtained");
  const apiToken = await client.activate(txSig!, deployer.secretKey, leagues);
  console.log("api token activated");

  cacheTokens(jwt, apiToken);

  console.log("\n=== TxLINE tokens (cached to .txline-token-cache.json) ===");
  console.log("export TXLINE_JWT='" + jwt + "'");
  console.log("export TXLINE_API_TOKEN='" + apiToken + "'");
  console.log("\nIn the frontend, click 'Set tokens' and paste these.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
