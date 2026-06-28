// Milestone 0 gate runner. Proves the validate_stat CPI works end to end through a
// real .rpc() transaction (not just .view()), and empirically records the false vs
// abort behavior of an unsatisfied but valid predicate. Run this first, before
// relying on the CPI in settle.
//
// Usage:
//   pnpm probe <fixtureId> <seq> <statKey>
//   env: TXLINE_API_BASE, TXLINE_JWT, TXLINE_API_TOKEN, SOLANA_CLUSTER, RPC_URL
//
// It calls probe_validate twice with the same valid proof: once with a satisfied
// predicate (expect true) and once with an unsatisfiable predicate (expect false
// or a transaction abort). Either outcome is safe for settle; see docs/SETTLEMENT.md.

import { ComputeBudgetProgram } from "@solana/web3.js";
import { RPC_URL, SETTLE_COMPUTE_UNITS } from "../app/src/lib/constants";
import { getConnection, getProgram, getProvider } from "./lib/anchor";
import { clusterFromEnv, loadDeployer } from "./lib/config";
import { fetchAndShape } from "./fetch-validation";

async function runProbe(
  program: ReturnType<typeof getProgram>,
  rootsPda: import("@solana/web3.js").PublicKey,
  txoracleId: import("@solana/web3.js").PublicKey,
  settler: import("@solana/web3.js").PublicKey,
  args: Awaited<ReturnType<typeof fetchAndShape>>["args"],
  threshold: number,
  label: string,
): Promise<{ ok: boolean; verified?: boolean; aborted?: boolean; error?: string }> {
  const probeArgs = {
    ts: args.ts,
    fixtureSummary: args.fixtureSummary,
    fixtureProof: args.fixtureProof,
    mainTreeProof: args.mainTreeProof,
    threshold,
    comparison: { greaterThan: {} },
    statA: args.statA,
    statB: null,
    op: null,
  };
  try {
    const sig = await program.methods
      .probeValidate(probeArgs as never)
      .accountsPartial({ dailyScoresMerkleRoots: rootsPda, txoracleProgram: txoracleId, settler })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: SETTLE_COMPUTE_UNITS })])
      .rpc({ commitment: "confirmed" });
    const tx = await program.provider.connection.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = tx?.meta?.logMessages ?? [];
    const line = logs.find((l) => l.includes("validate_stat returned"));
    const verified = line ? line.includes("true") : undefined;
    console.log(`[${label}] tx ${sig}`);
    console.log(`[${label}] log: ${line ?? "(no probe log found)"}`);
    return { ok: true, verified };
  } catch (e) {
    console.log(`[${label}] transaction aborted: ${String(e).slice(0, 200)}`);
    return { ok: false, aborted: true, error: String(e).slice(0, 200) };
  }
}

async function main() {
  const [fixtureId, seqStr, statKeyStr] = process.argv.slice(2);
  if (!fixtureId || !seqStr || !statKeyStr) {
    console.error("Usage: pnpm probe <fixtureId> <seq> <statKey>");
    process.exit(1);
  }
  const seq = Number(seqStr);
  const statKey = Number(statKeyStr);

  const cluster = clusterFromEnv();
  const connection = getConnection(process.env.RPC_URL || RPC_URL[cluster]);
  const deployer = loadDeployer();
  const program = getProgram(getProvider(connection, deployer));

  const { args, rootsPda, txoracleId } = await fetchAndShape(fixtureId, seq, statKey, undefined, true);
  const value = args.statA.statToProve.value;
  console.log(`proven stat value = ${value}; roots PDA = ${rootsPda.toBase58()}`);
  console.log(`txoracle program = ${txoracleId.toBase58()}\n`);

  // Satisfied: value > value-1 is always true.
  const satisfied = await runProbe(program, rootsPda, txoracleId, deployer.publicKey, args, value - 1, "satisfied");
  // Unsatisfiable: value > value+1000 is always false.
  const unsat = await runProbe(program, rootsPda, txoracleId, deployer.publicKey, args, value + 1000, "unsatisfiable");

  console.log("\n=== Milestone 0 gate result ===");
  console.log("satisfied predicate returned:", satisfied.verified);
  if (satisfied.verified !== true) {
    console.log("GATE NOT PASSED: the satisfied predicate did not return true. Investigate.");
  } else {
    console.log("GATE PASSED: validate_stat returned true from a real .rpc() call.");
  }
  console.log(
    "unsatisfied predicate behavior:",
    unsat.aborted ? "ABORTS the transaction" : `returns ${unsat.verified}`,
  );
  console.log(
    "Either way settle is safe: it only ever submits the predicate that should be true for the claimed side.",
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
