# ORACLE_FACTS.md

Confirmed values from Milestone 0. Everything downstream uses these. Verified against
the live TxLINE docs at https://txline-docs.txodds.com and the on-chain devnet IDL on
2026-06-28.

## Settlement cluster

Primary: **devnet**. The TxLINE txoracle program and the daily_scores_roots PDAs that
carry World Cup data are anchored on devnet, so Whistle is deployed to devnet and the
`settle` CPI targets the devnet txoracle program. (If a future check shows the World Cup
roots only exist on mainnet, redeploy to mainnet with the mainnet program id below and
keep using the mock USDC mint, per BUILD section 3.2 step 2.)

## txoracle program ids

| Cluster | Program id |
| --- | --- |
| devnet | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| mainnet | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` |

Source: https://txline-docs.txodds.com/documentation/programs/addresses.md

The IDL contains `"address": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"`, so
`declare_program!(txoracle)` derives the devnet program id constant directly from the IDL.
The IDL JSON is saved at `programs/whistle/idls/txoracle.json` (28 instructions, 31 types).

## validate_stat (confirmed from the on-chain IDL)

Argument order and types (snake_case names as in the IDL):

```
validate_stat(
  ts: i64,
  fixture_summary: ScoresBatchSummary,
  fixture_proof: Vec<ProofNode>,
  main_tree_proof: Vec<ProofNode>,
  predicate: TraderPredicate,
  stat_a: StatTerm,
  stat_b: Option<StatTerm>,
  op: Option<BinaryExpression>,
) -> bool
```

Single account: `daily_scores_merkle_roots` (read only, no signer).

Type definitions (exact field names and types):

```
ScoresBatchSummary { fixture_id: i64, update_stats: ScoresUpdateStats, events_sub_tree_root: [u8; 32] }
ScoresUpdateStats  { update_count: i32, min_timestamp: i64, max_timestamp: i64 }
ProofNode          { hash: [u8; 32], is_right_sibling: bool }
TraderPredicate    { threshold: i32, comparison: Comparison }
Comparison         enum { GreaterThan, LessThan, EqualTo }
StatTerm           { stat_to_prove: ScoreStat, event_stat_root: [u8; 32], stat_proof: Vec<ProofNode> }
ScoreStat          { key: u32, value: i32, period: i32 }
BinaryExpression   enum { Add, Subtract }
```

Whistle defines its own `Comparison { GreaterThan, LessThan }` (EqualTo excluded on
purpose, see BUILD guardrails) and `BinaryOp { Add, Subtract }`, and maps them to the
txoracle types at CPI time.

## stat-validation API

Endpoint: `GET /api/scores/stat-validation`
Params: `fixtureId`, `seq`, `statKey`, and optional `statKey2`.

Response fields: `summary`, `subTreeProof[]`, `mainTreeProof[]`, `statToProve`,
`eventStatRoot`, `statProof[]`, and for two stat markets `statToProve2`, `statProof2`.
`summary` = `{ fixtureId, updateStats { updateCount, minTimestamp, maxTimestamp }, eventStatsSubTreeRoot }`.
Each proof node is `{ hash, isRightSibling }`.

The settle argument mapping (camelCase API field, snake_case Rust field):

| API field | settle arg |
| --- | --- |
| `summary.fixtureId` | `fixture_summary.fixture_id` |
| `summary.updateStats.updateCount` | `fixture_summary.update_stats.update_count` |
| `summary.updateStats.minTimestamp` | `fixture_summary.update_stats.min_timestamp` |
| `summary.updateStats.maxTimestamp` | `fixture_summary.update_stats.max_timestamp` |
| `summary.eventStatsSubTreeRoot` | `fixture_summary.events_sub_tree_root` |
| `subTreeProof[]` | `fixture_proof` |
| `mainTreeProof[]` | `main_tree_proof` |
| `statToProve` | `stat_a.stat_to_prove` |
| `eventStatRoot` | `stat_a.event_stat_root` |
| `statProof[]` | `stat_a.stat_proof` |
| `statToProve2` | `stat_b.stat_to_prove` |
| (eventStatRoot reused) | `stat_b.event_stat_root` |
| `statProof2` | `stat_b.stat_proof` |

`ts` is the timestamp passed to the call. We pass `summary.updateStats.minTimestamp`.

Source: https://txline-docs.txodds.com/documentation/examples/onchain-validation.md

## daily_scores_roots PDA

Seeds: `["daily_scores_roots", epochDay as u16 little endian (2 bytes)]` under the
**txoracle program id** (not the Whistle program id).
`epochDay = floor(min_timestamp / 86_400_000)`. Timestamps are in milliseconds.

The client derives this PDA and passes it as `daily_scores_merkle_roots` to settle.
Whistle does not derive it in program (find_program_address is compute heavy and the
Merkle proof is the real guard: a wrong roots account makes validate_stat fail).

## Compute budget

`settle` (and `probe_validate`) require a `ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })`
pre-instruction. Merkle verification is compute heavy.

## false vs abort behavior (to confirm empirically in the deploy phase)

Per the idea doc, some failure paths abort the transaction (`PredicateFailed = 6021`,
`InvalidStatProof = 6023`) rather than returning `false`. Whistle is safe either way: the
settler only ever submits the predicate that should be true for the side they claim. If the
claim is correct the predicate holds and the bool is true; if the claim is wrong that side's
predicate is false, so either the bool is false (the `require!(verified)` fails) or the CPI
aborts (the whole transaction fails). Either path leaves state unchanged. `probe_validate`
plus `scripts/probe-oracle.ts` record the actual behavior during the deploy phase.

## Soccer feed encoding (confirmed)

Stat key formula: `key = period * 1000 + base_key`.

Base keys:

| Base | Meaning |
| --- | --- |
| 1 | Participant 1 total goals |
| 2 | Participant 2 total goals |
| 3 | Participant 1 yellow cards |
| 4 | Participant 2 yellow cards |
| 5 | Participant 1 red cards |
| 6 | Participant 2 red cards |
| 7 | Participant 1 corners |
| 8 | Participant 2 corners |

Period multipliers: full game = 0, H1 = +1000, H2 = +2000, ET1 = +3000, ET2 = +4000,
penalties = +5000.

Game phases (id: name): 1 NS, 2 H1, 3 HT, 4 H2, 5 F, 6 WET, 7 ET1, 8 HTET, 9 ET2,
10 FET, 11 WPE, 12 PE, 13 FPE, 14 I, 15 A, 16 C, 17 TXCC, 18 TXCS, 19 P.
Treat 15, 16, 17, 18 (A, C, TXCC, TXCS) as "match will not resolve normally" (void path).

Source: https://txline-docs.txodds.com/documentation/scores/soccer-feed.md

## API base URLs

| Cluster | Base URL |
| --- | --- |
| mainnet | https://txline.txodds.com/api/ |
| devnet | https://txline-dev.txodds.com/api/ |

Both hosts resolve. The base URL serving World Cup data for the settlement cluster is set
in the deploy phase (`TXLINE_API_BASE` env), defaulting to the devnet base above.

## Auth flow (World Cup free tier)

1. Subscribe on chain to a free World Cup service level (Service Level 1 = 60s delay,
   Service Level 12 = real time, both free, no TxL tokens) via the txoracle `subscribe`
   instruction. Capture the transaction signature `txSig`.
2. `POST /auth/guest/start` to get a JWT.
3. Sign the message `"{txSig}:{leagues}:{jwt}"` with the subscribing wallet (NaCl detached,
   base64). Note: the docs quickstart phrases the message as txSig, comma separated league
   ids, and the JWT concatenated. We build it as `{txSig}:{leagues}:{jwt}` per BUILD and
   confirm the exact separator against a live 200 response in the deploy phase.
4. `POST /api/token/activate` with `{ txSig, walletSignature, leagues }` and header
   `Authorization: Bearer {jwt}` to get the API token.
5. Subsequent data calls send `Authorization: Bearer {jwt}` and `X-Api-Token: {apiToken}`.
   (The docs summary also mentions using the API token as the bearer on later calls. The
   TxLINE client sends both headers and is configured so either scheme works; confirm the
   exact pair against a live 200 in the deploy phase.)

Source: https://txline-docs.txodds.com/documentation/worldcup.md and the quickstart.

## Known good (fixtureId, seq, statKey[, statKey2]) triple

TO BE FILLED in the deploy phase from a real `GET /api/scores/stat-validation` call
against a completed or in progress World Cup or International Friendly fixture (picked from
`/api/scores/snapshot` or the schedule page). Record the triple here so the headline test
and the demo seed use a known outcome.

```
fixtureId = <fill>
seq       = <fill>
statKey   = <fill>
statKey2  = <fill or none>
```

## Mock USDC mint

Written by `scripts/create-mock-usdc.ts` into `app/src/config.generated.json` and echoed
here in the deploy phase:

```
mint          = <fill>
mintAuthority = <fill>
decimals      = 6
```

## Whistle program id

`9zhvjPzcUw4DZYBB7qSQ92pXyupkfV8ircrHW6dMAJpW` (devnet). Run `anchor keys sync` after the
first build to confirm `declare_id!` and Anchor.toml match the deploy keypair.
