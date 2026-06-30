// Set up the full demo scenario: several markets on the demo fixture with bets pre
// placed and STAGGERED resolve times, so during the replay the first half market
// settles and pays at halftime while the full game markets are still locked, then
// the full game markets settle near full time. All settle against the real anchored
// proof at seq 989 (where every demo key validates with period 0). Spaced txs to
// dodge the public RPC rate limit.
//
// Run: pnpm demo-scenario
// Env: LOCK_SECS (40), HT_SECS (60), FT_SECS (130), REPLAY_MS (140000), DEMO_SEQ (989).

import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { RPC_URL } from "../app/src/lib/constants";
import { getConnection, getProgram, getProvider } from "./lib/anchor";
import {
  clusterFromEnv,
  keypairFromSecret,
  loadDeployer,
  readConfig,
  readDemoWallets,
  writeConfig,
  type MarketSeed,
} from "./lib/config";
import { fixturePda, marketPda, positionPda, vaultAuthorityPda, vaultPda } from "./lib/pdas";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function retry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let i = 0; i < 20; i++) {
    try {
      return await fn();
    } catch (e) {
      const wait = Math.min(30000, 5000 + i * 2500);
      console.log(`  ${label} try ${i + 1}: ${String(e).slice(0, 50)}; wait ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error(`${label} exhausted`);
}

const ge = { greaterThan: {} } as any;
const add = { add: {} } as any;
const sub = { subtract: {} } as any;

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
  const home = "Croatia";
  const [fixture] = fixturePda(program.programId, new BN(cfg.demoFixtureId!));

  const lockSecs = Number(process.env.LOCK_SECS || "40");
  const htSecs = Number(process.env.HT_SECS || "60");
  const ftSecs = Number(process.env.FT_SECS || "130");
  const replayMs = Number(process.env.REPLAY_MS || "140000");
  const demoSeq = Number(process.env.DEMO_SEQ || "989");

  // statAPeriod / statBPeriod are 0 because the oracle reports period 0 for every
  // demo key at seq 989 (the period field is sequence dependent, see ORACLE_FACTS).
  const SPECS = [
    { title: "First half: a goal is scored", a: 1001, b: 1002, op: add, thr: 0, resolve: htSecs, minute: 45, yes: 40, no: 15 },
    { title: "Total corners over 4.5 (full game)", a: 7, b: 8, op: add, thr: 4, resolve: ftSecs, minute: 85, yes: 50, no: 20 },
    { title: "Match total goals over 2.5", a: 1, b: 2, op: add, thr: 2, resolve: ftSecs, minute: 85, yes: 35, no: 25 },
  ];

  const startCount = await retry(() => program.account.fixture.fetch(fixture).then((f) => f.marketCount), "count");
  const markets: MarketSeed[] = [];

  // One shared time base for every market, so the staggered windows are measured
  // from a single kickoff instead of each market's own creation time. Otherwise
  // the first market's resolve time would already be in the past by the time the
  // last market and its bets finish seeding.
  const t0 = Math.floor(Date.now() / 1000);
  const spacingMs = Number(process.env.SPACING_MS || "2000");

  for (let i = 0; i < SPECS.length; i++) {
    const s = SPECS[i];
    const marketId = startCount + i;
    const [market] = marketPda(program.programId, fixture, marketId);
    const [vaultAuthority] = vaultAuthorityPda(program.programId, market);
    const [vault] = vaultPda(program.programId, market);
    await retry(
      () =>
        program.methods
          .createMarket({
            marketId,
            statAKey: s.a,
            statAPeriod: 0,
            statBKey: (s.b ?? null) as any,
            statBPeriod: (s.b != null ? 0 : null) as any,
            op: (s.b != null ? s.op : null) as any,
            threshold: s.thr,
            comparison: ge,
            lockTs: new BN(t0 + lockSecs),
            resolveAfterTs: new BN(t0 + s.resolve),
            voidAfterTs: new BN(t0 + 86400),
            title: s.title,
          } as any)
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
          .rpc({ commitment: "confirmed", maxRetries: 5 }),
      `create "${s.title}"`,
    );
    console.log(`created market ${marketId}: ${s.title} (settles minute ${s.minute}, resolve +${s.resolve}s)`);
    await sleep(spacingMs);

    const bet = async (who: typeof bettorA, side: boolean, amt: number) => {
      const p = getProgram(getProvider(conn, who));
      const [position] = positionPda(program.programId, market, who.publicKey);
      const ata = await retry(
        () => getOrCreateAssociatedTokenAccount(conn, who, mint, who.publicKey).then((a) => a.address),
        "ata",
      );
      await retry(
        () =>
          p.methods
            .joinMarket(side, new BN(amt * 1e6))
            .accountsPartial({
              market,
              position,
              vault,
              userTokenAccount: ata,
              user: who.publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .rpc({ commitment: "confirmed", maxRetries: 5 }),
        `bet ${side ? "YES" : "NO"}`,
      );
    };
    await bet(bettorA, true, s.yes);
    await sleep(spacingMs);
    await bet(bettorB, false, s.no);
    await sleep(spacingMs);
    console.log(`  bets placed: YES ${s.yes} / NO ${s.no}`);

    markets.push({ marketId, title: s.title, address: market.toBase58(), settleMinute: s.minute });
  }

  writeConfig({ demoSeq, demoReplayMs: replayMs, markets });
  console.log(`\nDemo scenario ready: ${markets.length} markets, seq ${demoSeq}, replay ${replayMs / 1000}s.`);
  console.log("The first half market is settleable at ~", htSecs, "s while the full game markets lock until ~", ftSecs, "s.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(String(e).slice(0, 200));
    process.exit(1);
  },
);
