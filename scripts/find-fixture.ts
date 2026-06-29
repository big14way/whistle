// Find a known good (fixtureId, seq, statKey, statKey2) triple with real anchored
// stats. The devnet /api/fixtures/snapshot only lists upcoming fixtures, so this
// scans the /api/scores/updates/{epochDay}/{hour}/{interval} windows for past
// anchored days to find completed matches with goal/corner stats, then confirms a
// seq with stat-validation. Prints the triple and the env exports for the demo.
//
// Usage: pnpm find-fixture            (scans recent anchored days)
//        pnpm find-fixture 20631      (scan a specific epochDay)
// Env: TXLINE_API_BASE, TXLINE_JWT, TXLINE_API_TOKEN (or the token cache).

import { MS_PER_DAY } from "../app/src/lib/constants";
import { makeTxlineClient } from "./lib/txline";

const STAT_A = 7; // P1 corners (full game)
const STAT_B = 8; // P2 corners (full game)

async function main() {
  const client = makeTxlineClient();
  if (!client.hasTokens()) {
    console.error("No TxLINE tokens. Run `pnpm txline-auth` first.");
    process.exit(1);
  }
  const apiBase = (client as any).apiBase as string;
  const headers: Record<string, string> = {};
  if ((client as any).jwt) headers["Authorization"] = `Bearer ${(client as any).jwt}`;
  if ((client as any).apiToken) headers["X-Api-Token"] = (client as any).apiToken;

  const arg = process.argv[2];
  const today = Math.floor(Date.now() / MS_PER_DAY);
  const days = arg ? [Number(arg)] : Array.from({ length: 9 }, (_, i) => today - i);

  const fetchWindow = async (day: number, hour: number, interval: number) => {
    try {
      const r = await fetch(`${apiBase}scores/updates/${day}/${hour}/${interval}`, { headers });
      if (!r.ok) return [];
      const t = await r.text();
      return t ? (JSON.parse(t) as any[]) : [];
    } catch {
      return [];
    }
  };

  for (const day of days) {
    const found = new Map<number, { maxSeq: number; stats: Record<number, number> }>();
    const windows: [number, number][] = [];
    for (let h = 0; h < 24; h++) for (let i = 0; i < 12; i++) windows.push([h, i]);

    // Scan in concurrent batches.
    const BATCH = 24;
    for (let k = 0; k < windows.length; k += BATCH) {
      const slice = windows.slice(k, k + BATCH);
      const results = await Promise.all(slice.map(([h, i]) => fetchWindow(day, h, i)));
      for (const updates of results) {
        for (const it of updates) {
          if (!it?.Stats || Object.keys(it.Stats).length === 0) continue;
          const fid = it.FixtureId as number;
          const e = found.get(fid) ?? { maxSeq: 0, stats: {} };
          if ((it.Seq ?? 0) > e.maxSeq) e.maxSeq = it.Seq;
          for (const [sk, v] of Object.entries(it.Stats)) e.stats[Number(sk)] = v as number;
          found.set(fid, e);
        }
      }
    }

    if (found.size === 0) {
      console.log(`epochDay ${day}: no anchored stats`);
      continue;
    }

    // Rank by total corners + goals so the demo markets resolve interestingly.
    const ranked = [...found.entries()].sort((a, b) => {
      const score = (s: Record<number, number>) => (s[7] ?? 0) + (s[8] ?? 0) + (s[1] ?? 0) + (s[2] ?? 0);
      return score(b[1].stats) - score(a[1].stats);
    });

    for (const [fid, info] of ranked.slice(0, 6)) {
      // Find a seq near the end where stat-validation succeeds for both stats.
      for (let seq = info.maxSeq; seq > Math.max(0, info.maxSeq - 40); seq--) {
        try {
          const resp = await client.getStatValidation(fid, seq, STAT_A, STAT_B);
          const a = (resp as any).statToProve.value;
          const b = (resp as any).statToProve2.value;
          console.log("\n=== found a known good triple ===");
          console.log(`fixtureId = ${fid}`);
          console.log(`seq       = ${seq}`);
          console.log(`statKey   = ${STAT_A}  (P1 corners = ${a})`);
          console.log(`statKey2  = ${STAT_B}  (P2 corners = ${b}, total ${a + b})`);
          console.log(`epochDay  = ${day}`);
          console.log("\nexport DEMO_FIXTURE_ID=" + fid + " TEST_SEQ=" + seq + " TEST_STAT_KEY=" + STAT_A + " TEST_STAT_KEY2=" + STAT_B);
          console.log("\nSeed the demo with: DEMO_FIXTURE_ID=" + fid + " pnpm seed");
          return;
        } catch {
          // try the next seq
        }
      }
    }
    console.log(`epochDay ${day}: found ${found.size} fixtures with stats but no seq validated, trying next day`);
  }
  console.error("No validatable fixture found in the scanned days.");
  process.exit(1);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
