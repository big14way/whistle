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

## false vs abort behavior (CONFIRMED on devnet)

Resolved empirically via `scripts/probe-oracle.ts` against the deployed program on
devnet (fixture 17588323, seq 944, statKey 7):

- A valid proof with a SATISFIED predicate (5 > 4): `validate_stat` returns `true`.
  Real .rpc() tx: 576ENK6HMT1HfXhnh583ZdB9USodM37ThSYSCBpERWN6T7DnaGcFrmKD5rRQSWp2tN19D2imsxSmUXeP596r3XL9
- A valid proof with an UNSATISFIED predicate (5 > 1005): `validate_stat` returns
  `false` (it does NOT abort).
  Real .rpc() tx: 2kYYHXEJWoJHwpi5WarvRATA5qoxZk1g4FgaRP92yynWjFvaRYXQ37YSsj1Q3QXNK9vbhbmuDAnQ5MFWweWXUagP

So a valid-but-unsatisfied predicate returns `false`, which `require!(verified)`
catches. (An INVALID proof aborts.) Whistle is safe either way: the settler only ever
submits the predicate that should be true for the side they claim, so a wrong claim
gets `false` (require fails) or an abort, leaving state unchanged.

## Auth scheme (CONFIRMED on devnet)

Data calls authenticate with BOTH headers:
`Authorization: Bearer {jwt}` AND `X-Api-Token: {apiToken}`.
(Bearer jwt alone gives "Missing API token"; the World Cup doc's "Bearer apiToken"
phrasing is for a different context.) `token/activate` returns the API token as a
plain text string (not JSON). The free subscribe needs the user's TxL Token-2022 ATA
to exist first (the instruction does not create it).

## Proof shape (CONFIRMED from a real two stat payload)

From `GET /api/scores/stat-validation?fixtureId=17588323&seq=944&statKey=7&statKey2=8`:
- proof node hashes are JSON number arrays of length 32 (not hex or base64).
- `eventStatRoot` is a number array, shared by BOTH stats (there is no `eventStatRoot2`).
- `subTreeProof` can be empty (length 0); `mainTreeProof`, `statProof`, `statProof2`
  are present.
- top level `ts` equals `summary.updateStats.minTimestamp`, so we use minTimestamp for
  both the `ts` argument and the epochDay roots derivation.
- `statToProve.period` is `0` for full game keys, matching `floor(key / 1000)`.

## period is sequence dependent (important for non full game markets)

The oracle's `period` field is NOT always `floor(key / 1000)`. It varies by sequence
for the same key. For the demo fixture 17588245: at seq 989 EVERY queried key
(corners 7/8, goals 1/2, and first half goals 1001/1002) reports `period 0`, while at
seq 985 the same first half keys reported `period 5`. So the market `stat_a_period`
must be set to the value the oracle returns at the chosen settle seq, determined
empirically with `fetch-validation`, not derived from the key. The demo settles every
market at seq 989 with period 0. The settle period binding (a settler cannot prove a
different period) is still correct: it binds whatever value was stored at creation.

## Demo fixture (current): Croatia vs Ghana

```
fixtureId = 17588245   (completed, Croatia 2 Ghana 1, five corners, anchored epochDay)
seq       = 989
keys      = corners 7+8, goals 1+2, first half goals 1001+1002 (all period 0 at seq 989)
teams     = Participant1 id 1766 Croatia, Participant2 id 2043 Ghana (app/src/lib/teams.ts)
```

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

## Known good (fixtureId, seq, statKey[, statKey2]) triple (CONFIRMED)

Discovered by scanning `/api/scores/updates/{epochDay}/{hour}/{interval}` for an
anchored day and confirmed with `stat-validation`. Devnet, completed match:

```
fixtureId = 17588323   (a completed World Cup fixture, anchored on epochDay 20631)
seq       = 944
statKey   = 7          (Participant 1 corners, full game, value 5)
statKey2  = 8          (Participant 2 corners, full game, value 8)
```

Proven values at seq 944: P1 goals (key 1) = 1, P2 goals (key 2) = 5, P1 corners
(key 7) = 5, P2 corners (key 8) = 8. So total corners 13 (over 9.5 is YES), total
goals 6 (over 2.5 is YES), margin P1 by 2+ is NO, P1 to score is YES. The seed uses
this fixture, so three of the four demo markets settle YES.

The daily_scores_roots PDA for epochDay 20631 (minTimestamp 1782536731866) is
`BByGFqzPF3Ks6GjWMUZcvzY9ShMFQrdDcyf1vcAi67oe` and exists on devnet.

Note: the devnet `/api/fixtures/snapshot` lists UPCOMING fixtures (all "scheduled");
completed fixtures with anchored stats are found via the `scores/updates` windows on
past anchored days (`scripts/find-fixture.ts` automates this).

## TxL subscription (free World Cup tier)

```
devnet TxL mint  = 4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG (Token-2022)
pricing_matrix   = B4hHn1FpD1YPPrcM4yUrQhBPF18zFWgijHLTsumGzeKi  (seeds ["pricing_matrix"])
token_treasury   = Eqqd7rZQGzn2HA9L11NwBMhknxArM3L4KETyUuujK3LB  (seeds ["token_treasury_v2"])
```

`scripts/txline-auth.ts` runs the full free tier flow (subscribe, guest/start, sign,
activate) and caches the jwt and apiToken to `.txline-token-cache.json`.

## Mock USDC mint (CONFIRMED, devnet)

```
mint          = AjUYguAuwip6sqs3SimPGv4QLLuuEs3nwmUraTYN6v9Q
mintAuthority = 6nuFo7QAJAspQH62MXBP3Dwk7fmdCTEDwxx1vaMhvJCe (dedicated, not the deployer)
decimals      = 6
```

## Whistle program id (DEPLOYED, devnet)

`9zhvjPzcUw4DZYBB7qSQ92pXyupkfV8ircrHW6dMAJpW`
Deploy tx: 587HpTUmtj7jwrxqAAV1ht45CiH9WYPohZcKhxtDCtnPQWhKF8EmFz5ZZcfnZSDXgehuGvxQRBnn4Tu2GgtWENYG
declare_id, Anchor.toml, and the deploy keypair all match.
