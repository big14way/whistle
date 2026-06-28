// Shape a TxLINE /api/scores/stat-validation response into the exact argument
// struct the Whistle settle instruction expects, and derive the daily_scores_roots
// PDA. This logic is shared by scripts/fetch-validation.ts and the frontend
// SettlementModal so the demo and the tests build identical args.
//
// Field name mapping is recorded in docs/ORACLE_FACTS.md. The proof node hash
// encoding (hex vs base64 vs array) is normalized by toBytes32; the exact wire
// form is confirmed against a live payload in the deploy phase.

import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { DAILY_SCORES_ROOTS_SEED, MS_PER_DAY } from "../constants";

/// A proof node as the Whistle program expects it (camelCase Anchor args).
export interface ProofNodeArg {
  hash: number[]; // 32 bytes
  isRightSibling: boolean;
}

export interface ScoreStatArg {
  key: number;
  value: number;
  period: number;
}

export interface StatTermArg {
  statToProve: ScoreStatArg;
  eventStatRoot: number[]; // 32 bytes
  statProof: ProofNodeArg[];
}

export interface ScoresUpdateStatsArg {
  updateCount: number;
  minTimestamp: BN;
  maxTimestamp: BN;
}

export interface ScoresBatchSummaryArg {
  fixtureId: BN;
  updateStats: ScoresUpdateStatsArg;
  eventsSubTreeRoot: number[]; // 32 bytes
}

export interface SettleArgs {
  claimedWinner: boolean;
  ts: BN;
  fixtureSummary: ScoresBatchSummaryArg;
  fixtureProof: ProofNodeArg[];
  mainTreeProof: ProofNodeArg[];
  statA: StatTermArg;
  statB: StatTermArg | null;
}

/// The raw API response shape (camelCase as returned by the endpoint).
export interface StatValidationResponse {
  summary: {
    fixtureId: number | string;
    updateStats: {
      updateCount: number;
      minTimestamp: number | string;
      maxTimestamp: number | string;
    };
    eventStatsSubTreeRoot: HashLike;
  };
  subTreeProof: RawProofNode[];
  mainTreeProof: RawProofNode[];
  statToProve: RawScoreStat;
  eventStatRoot: HashLike;
  statProof: RawProofNode[];
  // Two stat markets.
  statToProve2?: RawScoreStat;
  statProof2?: RawProofNode[];
  eventStatRoot2?: HashLike;
}

type HashLike = string | number[] | { type: "Buffer"; data: number[] } | Uint8Array;
interface RawProofNode {
  hash: HashLike;
  isRightSibling: boolean;
}
interface RawScoreStat {
  key: number;
  value: number;
  period: number;
}

/// Normalize a hash from hex string, base64 string, byte array, or node Buffer
/// JSON into a 32 byte number array.
export function toBytes32(h: HashLike): number[] {
  let bytes: number[];
  if (typeof h === "string") {
    const hex = h.startsWith("0x") ? h.slice(2) : h;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      bytes = [];
      for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
    } else {
      // base64
      const bin = typeof atob === "function" ? atob(h) : Buffer.from(h, "base64").toString("binary");
      bytes = Array.from(bin, (c) => c.charCodeAt(0));
    }
  } else if (h instanceof Uint8Array) {
    bytes = Array.from(h);
  } else if (Array.isArray(h)) {
    bytes = h.slice();
  } else if (h && typeof h === "object" && "data" in h) {
    bytes = (h as { data: number[] }).data.slice();
  } else {
    throw new Error("Unrecognized hash encoding in stat-validation response");
  }
  if (bytes.length !== 32) {
    throw new Error(`Expected a 32 byte hash, got ${bytes.length} bytes`);
  }
  return bytes;
}

function toNode(n: RawProofNode): ProofNodeArg {
  return { hash: toBytes32(n.hash), isRightSibling: n.isRightSibling };
}

function toStatTerm(stat: RawScoreStat, eventStatRoot: HashLike, proof: RawProofNode[]): StatTermArg {
  return {
    statToProve: { key: stat.key, value: stat.value, period: stat.period },
    eventStatRoot: toBytes32(eventStatRoot),
    statProof: proof.map(toNode),
  };
}

/// Build the settle args from a raw stat-validation response plus the claimed side.
export function shapeSettleArgs(resp: StatValidationResponse, claimedWinner: boolean): SettleArgs {
  const min = new BN(String(resp.summary.updateStats.minTimestamp));
  const statB = resp.statToProve2
    ? toStatTerm(
        resp.statToProve2,
        // Two stat event root: prefer an explicit eventStatRoot2 when present, else
        // reuse eventStatRoot (both stats share the fixture event subtree root).
        // Confirmed against a live two stat payload in the deploy phase.
        resp.eventStatRoot2 ?? resp.eventStatRoot,
        resp.statProof2 ?? [],
      )
    : null;

  return {
    claimedWinner,
    ts: min,
    fixtureSummary: {
      fixtureId: new BN(String(resp.summary.fixtureId)),
      updateStats: {
        updateCount: resp.summary.updateStats.updateCount,
        minTimestamp: min,
        maxTimestamp: new BN(String(resp.summary.updateStats.maxTimestamp)),
      },
      eventsSubTreeRoot: toBytes32(resp.summary.eventStatsSubTreeRoot),
    },
    fixtureProof: resp.subTreeProof.map(toNode),
    mainTreeProof: resp.mainTreeProof.map(toNode),
    statA: toStatTerm(resp.statToProve, resp.eventStatRoot, resp.statProof),
    statB,
  };
}

/// Derive the txoracle daily_scores_roots PDA for the day of minTimestamp (ms).
/// Seeds: ["daily_scores_roots", epochDay as u16 little endian]. epochDay =
/// floor(minTimestampMs / 86_400_000), under the txoracle program id.
export function deriveRootsPda(minTimestampMs: number | BN, txoracleProgramId: PublicKey): PublicKey {
  const min = BN.isBN(minTimestampMs) ? (minTimestampMs as BN).toNumber() : (minTimestampMs as number);
  const epochDay = Math.floor(min / MS_PER_DAY);
  const epochSeed = new Uint8Array(2);
  epochSeed[0] = epochDay & 0xff;
  epochSeed[1] = (epochDay >> 8) & 0xff;
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode(DAILY_SCORES_ROOTS_SEED), epochSeed],
    txoracleProgramId,
  );
  return pda;
}

/// epochDay for a given ms timestamp (exposed for tests and diagnostics).
export function epochDayFor(minTimestampMs: number): number {
  return Math.floor(minTimestampMs / MS_PER_DAY);
}
