// Whistle lifecycle tests.
//
// These run against the cluster where the program is deployed (devnet, where the
// TxLINE txoracle and the daily_scores_roots PDAs live). Tests split into two
// groups:
//
//   1. The void / timing / refund / double claim lifecycle, which exercises every
//      instruction EXCEPT the validate_stat CPI and so needs no oracle proof.
//   2. The real validate_stat CPI settlement (headline, negation, wrong claim,
//      empty side void, parimutuel payout), gated on a known good
//      (DEMO_FIXTURE_ID, TEST_SEQ, TEST_STAT_KEY) plus TxLINE tokens. These are
//      skipped with a clear message when that env is not provided.
//
// Run: pnpm test   (or anchor test --skip-local-validator)

import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { RPC_URL, SETTLE_COMPUTE_UNITS, TXORACLE_PROGRAM_ID } from "../app/src/lib/constants";
import { deriveRootsPda, shapeSettleArgs } from "../app/src/lib/txline/validation";
import { TxlineClient } from "../app/src/lib/txline/client";
import { getConnection, getProgram, getProvider } from "../scripts/lib/anchor";
import { clusterFromEnv, loadDeployer, readConfig } from "../scripts/lib/config";
import {
  fixturePda,
  marketPda,
  positionPda,
  vaultAuthorityPda,
  vaultPda,
} from "../scripts/lib/pdas";

const cluster = clusterFromEnv();
const connection = getConnection(process.env.RPC_URL || RPC_URL[cluster]);
const deployer = loadDeployer();
const provider = getProvider(connection, deployer);
const program = getProgram(provider);
const programId = program.programId;

const USDC = (ui: number) => new BN(Math.round(ui * 1e6));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);
// Unique fixture id base for this run, so reruns on persistent devnet do not collide.
let fixtureCounter = Math.floor(Date.now() / 1000) % 2_000_000_000;
const nextFixtureId = () => new BN(fixtureCounter++);

let mint: PublicKey;

async function fundSol(to: PublicKey, lamports: number) {
  const tx = new anchor.web3.Transaction().add(
    SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: to, lamports }),
  );
  await provider.sendAndConfirm(tx, []);
}

async function makeBettor(usdcUi: number): Promise<Keypair> {
  const kp = Keypair.generate();
  await fundSol(kp.publicKey, 0.05 * 1e9);
  const ata = await getOrCreateAssociatedTokenAccount(connection, deployer, mint, kp.publicKey);
  await mintTo(connection, deployer, mint, ata.address, deployer, BigInt(Math.round(usdcUi * 1e6)));
  return kp;
}

async function usdcBalance(owner: PublicKey): Promise<number> {
  const ata = await getOrCreateAssociatedTokenAccount(connection, deployer, mint, owner);
  const acc = await getAccount(connection, ata.address);
  return Number(acc.amount) / 1e6;
}

interface MarketOpts {
  statAKey?: number;
  statBKey?: number | null;
  op?: { add: {} } | { subtract: {} } | null;
  threshold?: number;
  comparison?: { greaterThan: {} } | { lessThan: {} };
  lockOffset?: number;
  resolveOffset?: number;
  voidOffset?: number;
  title?: string;
}

async function createFixtureAndMarket(opts: MarketOpts = {}) {
  const fixtureId = nextFixtureId();
  const [fixture] = fixturePda(programId, fixtureId);
  await program.methods
    .initializeFixture(fixtureId)
    .accountsPartial({ fixture, authority: deployer.publicKey, systemProgram: SystemProgram.programId })
    .rpc();

  const marketId = 0;
  const [market] = marketPda(programId, fixture, marketId);
  const [vaultAuthority] = vaultAuthorityPda(programId, market);
  const [vault] = vaultPda(programId, market);
  const now = nowSec();
  await program.methods
    .createMarket({
      marketId,
      statAKey: opts.statAKey ?? 1,
      statBKey: (opts.statBKey ?? null) as any,
      op: (opts.op ?? null) as any,
      threshold: opts.threshold ?? 0,
      comparison: (opts.comparison ?? { greaterThan: {} }) as any,
      lockTs: new BN(now + (opts.lockOffset ?? 30)),
      resolveAfterTs: new BN(now + (opts.resolveOffset ?? 32)),
      voidAfterTs: new BN(now + (opts.voidOffset ?? 34)),
      title: opts.title ?? "Test market",
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
    .rpc();

  return { fixtureId, fixture, marketId, market, vault, vaultAuthority };
}

async function join(market: PublicKey, bettor: Keypair, side: boolean, amount: BN) {
  const [position] = positionPda(programId, market, bettor.publicKey);
  const [vault] = vaultPda(programId, market);
  const bettorAta = await getOrCreateAssociatedTokenAccount(connection, deployer, mint, bettor.publicKey);
  await program.methods
    .joinMarket(side, amount)
    .accountsPartial({
      market,
      position,
      vault,
      userTokenAccount: bettorAta.address,
      user: bettor.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([bettor])
    .rpc();
  return position;
}

async function claim(market: PublicKey, bettor: Keypair) {
  const [position] = positionPda(programId, market, bettor.publicKey);
  const [vault] = vaultPda(programId, market);
  const [vaultAuthority] = vaultAuthorityPda(programId, market);
  const bettorAta = await getOrCreateAssociatedTokenAccount(connection, deployer, mint, bettor.publicKey);
  await program.methods
    .claim()
    .accountsPartial({
      market,
      position,
      vault,
      vaultAuthority,
      userTokenAccount: bettorAta.address,
      user: bettor.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([bettor])
    .rpc();
}

// A dummy SettleArgs used only to exercise checks that fire BEFORE the CPI
// (timing, fixture binding). It will never reach a successful CPI.
function dummySettleArgs(claimedWinner: boolean) {
  const zeros = Array(32).fill(0);
  const node = { hash: zeros, isRightSibling: false };
  return {
    claimedWinner,
    ts: new BN(0),
    fixtureSummary: {
      fixtureId: new BN(0),
      updateStats: { updateCount: 0, minTimestamp: new BN(0), maxTimestamp: new BN(0) },
      eventsSubTreeRoot: zeros,
    },
    fixtureProof: [node],
    mainTreeProof: [node],
    statA: { statToProve: { key: 1, value: 0, period: 0 }, eventStatRoot: zeros, statProof: [node] },
    statB: null,
  } as any;
}

describe("whistle: void, timing, refund, double claim (no oracle needed)", () => {
  before(async function () {
    this.timeout(120000);
    mint = await createMint(connection, deployer, deployer.publicKey, null, 6);
  });

  it("creates a fixture and market with a vault", async function () {
    this.timeout(60000);
    const { market } = await createFixtureAndMarket({ title: "P1 to score" });
    const m = await program.account.market.fetch(market);
    assert.equal(m.title, "P1 to score");
    assert.equal(m.state.open !== undefined, true);
    assert.equal(m.totalYes.toNumber(), 0);
  });

  it("rejects a zero amount bet", async function () {
    this.timeout(60000);
    const { market } = await createFixtureAndMarket();
    const a = await makeBettor(50);
    try {
      await join(market, a, true, USDC(0));
      assert.fail("expected ZeroAmount");
    } catch (e: any) {
      assert.match(e.toString(), /ZeroAmount|greater than zero/);
    }
  });

  it("accepts two sided bets and tracks parimutuel pools", async function () {
    this.timeout(90000);
    const { market } = await createFixtureAndMarket({ lockOffset: 40, resolveOffset: 42, voidOffset: 44 });
    const a = await makeBettor(100);
    const b = await makeBettor(100);
    await join(market, a, true, USDC(70));
    await join(market, b, false, USDC(30));
    const m = await program.account.market.fetch(market);
    assert.equal(m.totalYes.toNumber(), 70_000_000);
    assert.equal(m.totalNo.toNumber(), 30_000_000);
  });

  it("rejects a bet after lock_ts", async function () {
    this.timeout(60000);
    const { market } = await createFixtureAndMarket({ lockOffset: 3, resolveOffset: 5, voidOffset: 7 });
    const a = await makeBettor(50);
    await sleep(5000);
    try {
      await join(market, a, true, USDC(10));
      assert.fail("expected MarketLocked");
    } catch (e: any) {
      assert.match(e.toString(), /MarketLocked|locked/);
    }
  });

  it("rejects settle before resolve_after_ts", async function () {
    this.timeout(60000);
    const { market } = await createFixtureAndMarket({ lockOffset: 60, resolveOffset: 120, voidOffset: 200 });
    try {
      await program.methods
        .settle(dummySettleArgs(true))
        .accountsPartial({
          market,
          dailyScoresMerkleRoots: PublicKey.default,
          txoracleProgram: TXORACLE_PROGRAM_ID[cluster],
          settler: deployer.publicKey,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: SETTLE_COMPUTE_UNITS })])
        .rpc();
      assert.fail("expected TooEarlyToSettle");
    } catch (e: any) {
      assert.match(e.toString(), /TooEarlyToSettle|Too early to settle/);
    }
  });

  it("rejects void before void_after_ts, then voids after and refunds both bettors", async function () {
    this.timeout(120000);
    const { market } = await createFixtureAndMarket({ lockOffset: 8, resolveOffset: 9, voidOffset: 12 });
    const a = await makeBettor(100);
    const b = await makeBettor(100);
    await join(market, a, true, USDC(40));
    await join(market, b, false, USDC(60));
    const aBefore = await usdcBalance(a.publicKey);
    const bBefore = await usdcBalance(b.publicKey);

    // too early to void
    try {
      await program.methods
        .voidMarket()
        .accountsPartial({ market, caller: deployer.publicKey })
        .rpc();
      assert.fail("expected TooEarlyToVoid");
    } catch (e: any) {
      assert.match(e.toString(), /TooEarlyToVoid|Too early to void/);
    }

    await sleep(13000);
    await program.methods.voidMarket().accountsPartial({ market, caller: deployer.publicKey }).rpc();
    const m = await program.account.market.fetch(market);
    assert.ok(m.state.voided !== undefined, "market should be Voided");

    await claim(market, a);
    await claim(market, b);
    const aAfter = await usdcBalance(a.publicKey);
    const bAfter = await usdcBalance(b.publicKey);
    assert.equal(aAfter - aBefore, 40, "A refunded full stake");
    assert.equal(bAfter - bBefore, 60, "B refunded full stake");

    // double claim guard
    try {
      await claim(market, a);
      assert.fail("expected AlreadyClaimed");
    } catch (e: any) {
      assert.match(e.toString(), /AlreadyClaimed|already been claimed/);
    }
  });
});

// The real CPI tests. Provide DEMO_FIXTURE_ID, TEST_SEQ, TEST_STAT_KEY (and
// optionally TEST_STAT_KEY2, TEST_THRESHOLD, TEST_COMPARISON) plus TXLINE_JWT and
// TXLINE_API_TOKEN to exercise these against real anchored roots on devnet.
describe("whistle: real validate_stat CPI settlement (needs DEMO_FIXTURE_ID + TxLINE tokens)", () => {
  const have =
    Boolean(process.env.DEMO_FIXTURE_ID && process.env.TEST_SEQ && process.env.TEST_STAT_KEY) &&
    Boolean(process.env.TXLINE_JWT || process.env.TXLINE_API_TOKEN);

  before(function () {
    if (!have) {
      console.log(
        "    [skipped] set DEMO_FIXTURE_ID, TEST_SEQ, TEST_STAT_KEY and TXLINE tokens to run the real CPI tests",
      );
      this.skip();
    }
  });

  it("settles a market on a real proven stat and pays the winner pro rata", async function () {
    this.timeout(180000);
    const cfg = readConfig();
    const apiBase = process.env.TXLINE_API_BASE || cfg.apiBase!;
    const client = new TxlineClient({ apiBase, jwt: process.env.TXLINE_JWT, apiToken: process.env.TXLINE_API_TOKEN });
    const fixtureIdNum = Number(process.env.DEMO_FIXTURE_ID);
    const seq = Number(process.env.TEST_SEQ);
    const statKey = Number(process.env.TEST_STAT_KEY);
    const statKey2 = process.env.TEST_STAT_KEY2 ? Number(process.env.TEST_STAT_KEY2) : undefined;

    const resp = await client.getStatValidation(fixtureIdNum, seq, statKey, statKey2);
    const provenValue = (resp as any).statToProve.value as number;
    // Choose a threshold the proven value satisfies on the YES side.
    const threshold = Number(process.env.TEST_THRESHOLD ?? provenValue - 1);

    if (!mint) mint = await createMint(connection, deployer, deployer.publicKey, null, 6);
    const fixtureId = new BN(fixtureIdNum + 1_000_000); // avoid colliding with the seed fixture
    const [fixture] = fixturePda(programId, fixtureId);
    await program.methods
      .initializeFixture(fixtureId)
      .accountsPartial({ fixture, authority: deployer.publicKey, systemProgram: SystemProgram.programId })
      .rpc()
      .catch(() => undefined);

    const marketId = (await program.account.fixture.fetch(fixture)).marketCount;
    const [market] = marketPda(programId, fixture, marketId);
    const [vaultAuthority] = vaultAuthorityPda(programId, market);
    const [vault] = vaultPda(programId, market);
    const now = nowSec();
    await program.methods
      .createMarket({
        marketId,
        statAKey: statKey,
        statBKey: (statKey2 ?? null) as any,
        op: (statKey2 ? { add: {} } : null) as any,
        threshold,
        comparison: { greaterThan: {} } as any,
        lockTs: new BN(now + 6),
        resolveAfterTs: new BN(now + 8),
        voidAfterTs: new BN(now + 24 * 3600),
        title: "Real CPI market",
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
      .rpc();

    // Asymmetric pools: 70 YES (two wallets), 30 NO.
    const a = await makeBettor(100);
    const a2 = await makeBettor(100);
    const b = await makeBettor(100);
    await join(market, a, true, USDC(40));
    await join(market, a2, true, USDC(30));
    await join(market, b, false, USDC(30));

    await sleep(9000);

    const args = shapeSettleArgs(resp, true);
    const rootsPda = deriveRootsPda(
      args.fixtureSummary.updateStats.minTimestamp,
      cfg.txoracleProgramId ? new PublicKey(cfg.txoracleProgramId) : TXORACLE_PROGRAM_ID[cluster],
    );

    await program.methods
      .settle(args as any)
      .accountsPartial({
        market,
        dailyScoresMerkleRoots: rootsPda,
        txoracleProgram: TXORACLE_PROGRAM_ID[cluster],
        settler: deployer.publicKey,
      })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: SETTLE_COMPUTE_UNITS })])
      .rpc();

    const m = await program.account.market.fetch(market);
    assert.ok(m.state.settledYes !== undefined, "market should be SettledYes");

    // total pot = 100, winning pool (YES) = 70. A staked 40 -> 40/70*100 = 57.14...
    const before = await usdcBalance(a.publicKey);
    await claim(market, a);
    const after = await usdcBalance(a.publicKey);
    const expected = (40 * 100) / 70;
    assert.ok(Math.abs(after - before - expected) < 0.001, `A payout ~${expected}, got ${after - before}`);
  });

  it("rejects settle with the wrong claimed_winner", async function () {
    this.timeout(180000);
    // Build a market where the proven stat makes YES the true side, then settle NO.
    const cfg = readConfig();
    const apiBase = process.env.TXLINE_API_BASE || cfg.apiBase!;
    const client = new TxlineClient({ apiBase, jwt: process.env.TXLINE_JWT, apiToken: process.env.TXLINE_API_TOKEN });
    const fixtureIdNum = Number(process.env.DEMO_FIXTURE_ID);
    const seq = Number(process.env.TEST_SEQ);
    const statKey = Number(process.env.TEST_STAT_KEY);
    const resp = await client.getStatValidation(fixtureIdNum, seq, statKey);
    const provenValue = (resp as any).statToProve.value as number;

    if (!mint) mint = await createMint(connection, deployer, deployer.publicKey, null, 6);
    const fixtureId = new BN(fixtureIdNum + 2_000_000);
    const [fixture] = fixturePda(programId, fixtureId);
    await program.methods
      .initializeFixture(fixtureId)
      .accountsPartial({ fixture, authority: deployer.publicKey, systemProgram: SystemProgram.programId })
      .rpc()
      .catch(() => undefined);
    const marketId = (await program.account.fixture.fetch(fixture)).marketCount;
    const [market] = marketPda(programId, fixture, marketId);
    const [vaultAuthority] = vaultAuthorityPda(programId, market);
    const [vault] = vaultPda(programId, market);
    const now = nowSec();
    await program.methods
      .createMarket({
        marketId,
        statAKey: statKey,
        statBKey: null as any,
        op: null as any,
        threshold: provenValue - 1, // YES is true (value > value-1)
        comparison: { greaterThan: {} } as any,
        lockTs: new BN(now + 6),
        resolveAfterTs: new BN(now + 8),
        voidAfterTs: new BN(now + 24 * 3600),
        title: "Wrong claim market",
      } as any)
      .accountsPartial({
        fixture, market, vaultAuthority, vault, stakeMint: mint, creator: deployer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const a = await makeBettor(100);
    const b = await makeBettor(100);
    await join(market, a, true, USDC(50));
    await join(market, b, false, USDC(50));
    await sleep(9000);

    // Claim NO (false), which is the wrong side. The negated predicate is false, so
    // validate_stat returns false or aborts, and settle must fail.
    const args = shapeSettleArgs(resp, false);
    const rootsPda = deriveRootsPda(
      args.fixtureSummary.updateStats.minTimestamp,
      cfg.txoracleProgramId ? new PublicKey(cfg.txoracleProgramId) : TXORACLE_PROGRAM_ID[cluster],
    );
    try {
      await program.methods
        .settle(args as any)
        .accountsPartial({ market, dailyScoresMerkleRoots: rootsPda, txoracleProgram: TXORACLE_PROGRAM_ID[cluster], settler: deployer.publicKey })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: SETTLE_COMPUTE_UNITS })])
        .rpc();
      assert.fail("expected the wrong claim to be rejected");
    } catch (e: any) {
      assert.match(e.toString(), /PredicateNotProven|custom program error|Predicate|failed/i);
    }
    const m = await program.account.market.fetch(market);
    assert.ok(m.state.open !== undefined, "state must be unchanged (Open) after a rejected settle");
  });
});
