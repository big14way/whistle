// One command to a demo ready state, idempotent:
//   1. ensure the deployer has SOL
//   2. create or load the mock USDC mint
//   3. create three demo wallets (Bettor A, Bettor B, Settler), fund them with a
//      little SOL and 1000 mock USDC each, persist their secret keys
//   4. initialize_fixture for the chosen fixtureId
//   5. create_market for four flagship props
//   6. print a summary
//
// Run with: pnpm seed
// Env: DEMO_FIXTURE_ID (the real TxLINE fixture for live settle), LOCK_SECS,
// RESOLVE_SECS, SOLANA_CLUSTER, RPC_URL, TXLINE_API_BASE.

import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, getAccount } from "@solana/spl-token";
import { RPC_URL } from "../app/src/lib/constants";
import { getConnection, getProgram, getProvider } from "./lib/anchor";
import { ensureMockUsdc, mintToOwner } from "./create-mock-usdc";
import {
  clusterFromEnv,
  keypairFromSecret,
  loadDeployer,
  readDemoWallets,
  writeConfig,
  writeDemoWallets,
  type MarketSeed,
} from "./lib/config";
import { fixturePda, marketPda, vaultAuthorityPda, vaultPda } from "./lib/pdas";

type Cmp = "greaterThan" | "lessThan";
type Op = "add" | "subtract";
interface MarketSpec {
  title: string;
  statAKey: number;
  statBKey: number | null;
  op: Op | null;
  threshold: number;
  comparison: Cmp;
}

// Market index is the marketId. These must stay in this order across reruns.
const MARKET_SPECS: MarketSpec[] = [
  { title: "Total corners over 9.5 (full game)", statAKey: 7, statBKey: 8, op: "add", threshold: 9, comparison: "greaterThan" },
  { title: "Match total goals over 2.5", statAKey: 1, statBKey: 2, op: "add", threshold: 2, comparison: "greaterThan" },
  { title: "Winning margin: Participant 1 by 2+", statAKey: 1, statBKey: 2, op: "subtract", threshold: 1, comparison: "greaterThan" },
  { title: "Participant 1 to score (over 0.5 goals)", statAKey: 1, statBKey: null, op: null, threshold: 0, comparison: "greaterThan" },
];

// Anchor's generated enum arg types are discriminated unions that a helper return
// type cannot satisfy cleanly, so these are typed as any (the runtime shape is the
// standard Anchor enum encoding).
const cmp = (s: Cmp): any => (s === "greaterThan" ? { greaterThan: {} } : { lessThan: {} });
const binop = (s: Op | null): any => (s == null ? null : s === "add" ? { add: {} } : { subtract: {} });

async function ensureSol(connection: ReturnType<typeof getConnection>, who: PublicKey, minSol: number) {
  const bal = await connection.getBalance(who);
  if (bal >= minSol * 1e9) return;
  try {
    const sig = await connection.requestAirdrop(who, Math.max(2, minSol) * 1e9);
    await connection.confirmTransaction(sig, "confirmed");
  } catch (e) {
    console.warn(`airdrop for ${who.toBase58()} failed, continuing:`, String(e).slice(0, 100));
  }
}

async function loadOrCreateWallet(
  connection: ReturnType<typeof getConnection>,
  deployer: Keypair,
  mint: PublicKey,
  mintAuthority: Keypair,
  name: "bettorA" | "bettorB" | "settler",
): Promise<Keypair> {
  const wallets = readDemoWallets();
  const existing = wallets[name];
  if (existing) {
    const kp = keypairFromSecret(existing);
    await ensureSol(connection, kp.publicKey, 0.1);
    await getOrCreateAssociatedTokenAccount(connection, deployer, mint, kp.publicKey);
    return kp;
  }
  const kp = Keypair.generate();
  writeDemoWallets({ [name]: Array.from(kp.secretKey) });
  await ensureSol(connection, kp.publicKey, 0.2);
  await mintToOwner(connection, deployer, mint, mintAuthority, kp.publicKey, 1000);
  console.log(`created ${name}: ${kp.publicKey.toBase58()} funded with 1000 mock USDC`);
  return kp;
}

async function main() {
  const cluster = clusterFromEnv();
  const rpcUrl = process.env.RPC_URL || RPC_URL[cluster];
  const connection = getConnection(rpcUrl);
  const deployer = loadDeployer();
  const provider = getProvider(connection, deployer);
  const program = getProgram(provider);

  console.log("cluster:", cluster, "| program:", program.programId.toBase58());
  await ensureSol(connection, deployer.publicKey, 1);

  const { mint, mintAuthority } = await ensureMockUsdc(connection, deployer);
  console.log("mock USDC mint:", mint.toBase58());

  const bettorA = await loadOrCreateWallet(connection, deployer, mint, mintAuthority, "bettorA");
  const bettorB = await loadOrCreateWallet(connection, deployer, mint, mintAuthority, "bettorB");
  const settler = await loadOrCreateWallet(connection, deployer, mint, mintAuthority, "settler");

  const fixtureIdNum = Number(process.env.DEMO_FIXTURE_ID || "0");
  if (!process.env.DEMO_FIXTURE_ID) {
    console.warn(
      "\nWARNING: DEMO_FIXTURE_ID is not set, using 0. The on chain markets seed fine,",
      "\nbut a real validate_stat settle needs a real TxLINE fixtureId. Set it in the deploy phase.\n",
    );
  }
  const fixtureId = new BN(fixtureIdNum);
  const [fixture] = fixturePda(program.programId, fixtureId);

  // 4. initialize_fixture (idempotent)
  const fixtureAcc = await program.account.fixture.fetchNullable(fixture);
  if (!fixtureAcc) {
    await program.methods
      .initializeFixture(fixtureId)
      .accountsPartial({ fixture, authority: deployer.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("initialized fixture", fixtureIdNum, "at", fixture.toBase58());
  } else {
    console.log("fixture already exists at", fixture.toBase58(), "with", fixtureAcc.marketCount, "markets");
  }

  // 5. create_market for each spec from the current count onward (idempotent)
  const now = Math.floor(Date.now() / 1000);
  const lockSecs = Number(process.env.LOCK_SECS || "120");
  let resolveSecs = Number(process.env.RESOLVE_SECS || String(lockSecs + 10));
  if (resolveSecs <= lockSecs) resolveSecs = lockSecs + 10;
  const lockTs = new BN(now + lockSecs);
  const resolveAfterTs = new BN(now + resolveSecs);
  const voidAfterTs = new BN(now + 24 * 3600);

  const startCount = (await program.account.fixture.fetch(fixture)).marketCount;
  const markets: MarketSeed[] = [];
  for (let marketId = 0; marketId < MARKET_SPECS.length; marketId++) {
    const [market] = marketPda(program.programId, fixture, marketId);
    const spec = MARKET_SPECS[marketId];
    if (marketId < startCount) {
      markets.push({ marketId, title: spec.title, address: market.toBase58() });
      continue;
    }
    const [vaultAuthority] = vaultAuthorityPda(program.programId, market);
    const [vault] = vaultPda(program.programId, market);
    await program.methods
      .createMarket({
        marketId,
        statAKey: spec.statAKey,
        // Period index encoded in the soccer key (key = period*1000 + base).
        statAPeriod: Math.floor(spec.statAKey / 1000),
        statBKey: spec.statBKey,
        statBPeriod: spec.statBKey != null ? Math.floor(spec.statBKey / 1000) : null,
        op: binop(spec.op),
        threshold: spec.threshold,
        comparison: cmp(spec.comparison),
        lockTs,
        resolveAfterTs,
        voidAfterTs,
        title: spec.title,
      })
      .accountsPartial({
        fixture,
        market,
        vaultAuthority,
        vault,
        stakeMint: mint,
        creator: deployer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log(`created market ${marketId}: "${spec.title}"`);
    markets.push({ marketId, title: spec.title, address: market.toBase58() });
  }

  writeConfig({ demoFixtureId: fixtureIdNum, demoFixtureAddress: fixture.toBase58(), markets });

  // 6. summary
  const usdcBal = async (owner: PublicKey) => {
    try {
      const ata = await getOrCreateAssociatedTokenAccount(connection, deployer, mint, owner);
      const acc = await getAccount(connection, ata.address);
      return Number(acc.amount) / 1e6;
    } catch {
      return 0;
    }
  };
  console.log("\n=== Whistle demo seeded ===");
  console.log("fixture:", fixtureIdNum, "(", fixture.toBase58(), ")");
  console.log("markets:");
  for (const m of markets) console.log(`  [${m.marketId}] ${m.title}  ${m.address}`);
  console.log("wallets:");
  for (const [n, kp] of [["BettorA", bettorA], ["BettorB", bettorB], ["Settler", settler]] as const) {
    console.log(`  ${n}: ${kp.publicKey.toBase58()}  ${await usdcBal(kp.publicKey)} USDC`);
  }
  console.log("\napp: run `pnpm app` and open the printed URL");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
