// Set up a single market that is about to become settle-able, with bets already
// placed (BettorA YES, BettorB NO), so the demo is one click: wait for the Settle
// button, click it, watch the validate_stat CPI pay BettorA. Spaced txs to dodge
// the public RPC rate limit.
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { RPC_URL } from "../app/src/lib/constants";
import { getConnection, getProgram, getProvider } from "./lib/anchor";
import { clusterFromEnv, keypairFromSecret, loadDeployer, readConfig, readDemoWallets, writeConfig } from "./lib/config";
import { fixturePda, marketPda, positionPda, vaultAuthorityPda, vaultPda } from "./lib/pdas";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function retry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let i = 0; i < 10; i++) {
    try { return await fn(); }
    catch (e) { console.log(`  ${label} try ${i + 1}: ${String(e).slice(0, 50)}; wait 10s`); await sleep(10000); }
  }
  throw new Error(`${label} exhausted`);
}

async function main() {
  const cluster = clusterFromEnv();
  const conn = getConnection(process.env.RPC_URL || RPC_URL[cluster]);
  const deployer = loadDeployer();
  const program = getProgram(getProvider(conn, deployer));
  const cfg = readConfig();
  const wallets = readDemoWallets();
  const bettorA = keypairFromSecret(wallets.bettorA!);
  const bettorB = keypairFromSecret(wallets.bettorB!);
  const mint = new PublicKey(cfg.usdcMint!);
  const [fixture] = fixturePda(program.programId, new BN(cfg.demoFixtureId!));

  // Lock window: enough to place 2 bets under rate limiting, settle shortly after.
  const lockSecs = Number(process.env.LOCK_SECS || "150");
  const marketId = await retry(() => program.account.fixture.fetch(fixture).then((f) => f.marketCount), "count");
  const [market] = marketPda(program.programId, fixture, marketId);
  const [vaultAuthority] = vaultAuthorityPda(program.programId, market);
  const [vault] = vaultPda(program.programId, market);
  const now = Math.floor(Date.now() / 1000);
  const cornersThreshold = Number(process.env.CORNERS_THRESHOLD || "4");
  const title = `Total corners over ${cornersThreshold}.5 (full game)`;
  await retry(() => program.methods.createMarket({
    marketId, statAKey: 7, statAPeriod: 0, statBKey: 8 as any, statBPeriod: 0 as any,
    op: { add: {} } as any, threshold: cornersThreshold, comparison: { greaterThan: {} } as any,
    lockTs: new BN(now + lockSecs), resolveAfterTs: new BN(now + lockSecs + 15), voidAfterTs: new BN(now + 86400),
    title,
  } as any).accountsPartial({
    fixture, market, vaultAuthority, vault, stakeMint: mint, creator: deployer.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
  }).rpc({ commitment: "confirmed", maxRetries: 5 }), "createMarket");
  console.log(`created demo market ${marketId} (${title}), lock in ${lockSecs}s`);
  await sleep(8000);

  const bet = async (who: typeof bettorA, side: boolean, amt: number) => {
    const p = getProgram(getProvider(conn, who));
    const [position] = positionPda(program.programId, market, who.publicKey);
    const ata = await retry(() => getOrCreateAssociatedTokenAccount(conn, who, mint, who.publicKey).then((a) => a.address), "ata");
    await retry(() => p.methods.joinMarket(side, new BN(amt * 1e6)).accountsPartial({
      market, position, vault, userTokenAccount: ata, user: who.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).rpc({ commitment: "confirmed", maxRetries: 5 }), `bet ${side ? "YES" : "NO"}`);
    console.log(`  ${side ? "BettorA YES" : "BettorB NO"} ${amt} USDC placed`);
  };
  await bet(bettorA, true, 50);
  await sleep(8000);
  await bet(bettorB, false, 20);

  const demoSeq = Number(process.env.DEMO_SEQ || "989");
  writeConfig({ demoSeq, markets: [{ marketId, title, address: market.toBase58() }] });
  console.log(`\nDemo ready. Market ${market.toBase58()} has YES 50 / NO 20. Settle-able in ~${lockSecs + 15}s from creation.`);
  console.log("Corners total = 13 > 9, so it settles YES and BettorA wins the 70 USDC pot.");
}
main().then(() => process.exit(0), (e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
