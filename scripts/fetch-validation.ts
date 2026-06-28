// Pull a /api/scores/stat-validation payload for a fixture/seq/statKey(/statKey2)
// and print it shaped into the exact settle argument structs, plus the derived
// daily_scores_roots PDA. The frontend validation.ts reuses the same shaping
// logic. The headline test and probe-oracle.ts call this.
//
// Usage:
//   pnpm fetch-validation <fixtureId> <seq> <statKey> [statKey2]
//   env: TXLINE_API_BASE, TXLINE_JWT, TXLINE_API_TOKEN

import { PublicKey } from "@solana/web3.js";
import { TXORACLE_PROGRAM_ID } from "../app/src/lib/constants";
import { deriveRootsPda, shapeSettleArgs } from "../app/src/lib/txline/validation";
import { clusterFromEnv, readConfig } from "./lib/config";
import { makeTxlineClient } from "./lib/txline";

export async function fetchAndShape(
  fixtureId: number | string,
  seq: number,
  statKey: number,
  statKey2: number | undefined,
  claimedWinner: boolean,
) {
  const client = makeTxlineClient();
  if (!client.hasTokens()) {
    console.warn(
      "WARNING: no TxLINE tokens set (TXLINE_JWT / TXLINE_API_TOKEN). The call may be",
      "rejected. Obtain a guest token via the World Cup auth flow in the deploy phase.",
    );
  }
  const resp = await client.getStatValidation(fixtureId, seq, statKey, statKey2);
  const args = shapeSettleArgs(resp, claimedWinner);

  const cfg = readConfig();
  const cluster = clusterFromEnv();
  const txoracleId = cfg.txoracleProgramId
    ? new PublicKey(cfg.txoracleProgramId)
    : TXORACLE_PROGRAM_ID[cluster];
  const rootsPda = deriveRootsPda(args.fixtureSummary.updateStats.minTimestamp, txoracleId);

  return { resp, args, rootsPda, txoracleId };
}

async function main() {
  const [fixtureId, seqStr, statKeyStr, statKey2Str] = process.argv.slice(2);
  if (!fixtureId || !seqStr || !statKeyStr) {
    console.error("Usage: pnpm fetch-validation <fixtureId> <seq> <statKey> [statKey2]");
    process.exit(1);
  }
  const seq = Number(seqStr);
  const statKey = Number(statKeyStr);
  const statKey2 = statKey2Str ? Number(statKey2Str) : undefined;

  const { resp, args, rootsPda } = await fetchAndShape(fixtureId, seq, statKey, statKey2, true);

  console.log("=== raw stat-validation response ===");
  console.log(JSON.stringify(resp, null, 2));
  console.log("\n=== shaped settle args ===");
  console.log(
    JSON.stringify(
      args,
      (_k, v) => (v && v.toString && v._bn ? v.toString() : v),
      2,
    ),
  );
  console.log("\ndaily_scores_roots PDA:", rootsPda.toBase58());
  console.log("epochDay from minTimestamp:", Math.floor(Number(args.fixtureSummary.updateStats.minTimestamp.toString()) / 86_400_000));
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
