# How Whistle settlement works

A plain language spec of the settlement and safety model. The whole point of
Whistle is that settlement is trustless, deterministic, and instant. This document
explains exactly how, so the logic can be audited without reading Rust.

## A market is a predicate plus an escrow

A market asks one yes or no question about a real match statistic, for example:

- "Total corners over 9.5" means corners(P1) + corners(P2) > 9
- "Match total goals over 2.5" means goals(P1) + goals(P2) > 2
- "Winning margin: Participant 1 by 2 or more" means goals(P1) - goals(P2) > 1

The question is stored on chain as integer fields on the Market account:

- `stat_a_key`, and optionally `stat_b_key` with a binary operator `op` (Add or Subtract)
- a `threshold` (i32) and a `comparison` (GreaterThan or LessThan)

Note that "over 4.5" maps to an integer strict inequality: "over 4.5 corners" is
`GreaterThan(4)`, because the count is an integer and `value > 4` is the same as
`value >= 5`. There are no half goals, so there are no pushes.

YES means the predicate is satisfied. NO is its exact logical negation.

Bettors lock USDC into a program owned vault (an SPL token account whose authority
is a PDA). Each side is a pool. This is a parimutuel market: winners split the
combined pot pro rata. There is no AMM, no order book, and so no impermanent loss
or toxic flow failure mode.

## Settlement is permissionless and the settler cannot cheat

Anyone can settle once the stat is final. The settler is not trusted. They supply
only two things:

1. The proof material from TxLINE (the fixture summary, the Merkle proofs, and the
   stat terms), fetched from `GET /api/scores/stat-validation`.
2. A claimed winning side (`claimed_winner`: true for YES, false for NO).

The settler does NOT supply the predicate. The contract builds the predicate itself
from the stored market fields. The settle handler then does the following, in order:

1. State and timing. The market must be Open, and the clock must be at or past
   `resolve_after_ts` (the moment the stat is final, for example half time or full
   time). Otherwise the transaction fails.
2. Bind to the right match. It requires
   `fixture_summary.fixture_id == market.fixture_id`. Without this a settler could
   try to prove a stat from a different match.
3. Bind to the right stat keys. It requires the proof's `stat_a` key to equal
   `market.stat_a_key`. For a two stat market it requires a second stat whose key
   equals `market.stat_b_key`. For a single stat market it requires no second stat.
4. Build the predicate in program. If the settler claims YES, the contract uses the
   stored `(threshold, comparison)`. If the settler claims NO, the contract uses the
   logical negation:
   - not(x > T) is x <= T which is x < T + 1, so GreaterThan(T) becomes LessThan(T + 1)
   - not(x < T) is x >= T which is x > T - 1, so LessThan(T) becomes GreaterThan(T - 1)
   The arithmetic is checked. These two predicates partition every integer, so for
   any real stat value exactly one side is provable.
5. CPI into TxLINE `validate_stat` with the proof material and the contract built
   predicate. `validate_stat` verifies the proof against the on chain Merkle root
   that TxODDS itself anchored, and returns a boolean.
6. Read the boolean with `get_return_data` and require it to be true.

## Why a wrong claim can never settle a market

The settler only ever submits the predicate that should be true for the side they
claim. Two cases:

- The claim is correct. That side's predicate holds, `validate_stat` returns true,
  and the market settles to that side.
- The claim is wrong. That side's predicate is false. Then one of two things happens,
  and both are safe:
  - `validate_stat` returns false, and the `require!(verified)` fails, so the whole
    transaction reverts and the market stays Open.
  - `validate_stat` aborts the transaction on the failed predicate (some TxLINE
    failure paths abort rather than return false), so again the whole transaction
    reverts and the market stays Open.

In every case the only way the market state changes is a genuinely satisfied
predicate verified against the anchored Merkle root. There is no admin override and
no resolver. The proof is the authorization.

## The roots account

`validate_stat` reads the `daily_scores_roots` PDA, which holds the day's Merkle
root. Whistle passes this account straight through as a read only account rather than
deriving it in program, because deriving a PDA in program is compute heavy and the
proof is the real guard: if a settler passes the wrong roots account, the Merkle
proof will not validate against it and `validate_stat` fails. The client derives the
correct PDA from the fixture summary timestamp (seeds
`["daily_scores_roots", epochDay u16 little endian]` under the txoracle program id,
where `epochDay = floor(min_timestamp_ms / 86_400_000)`).

## The empty winning side case

If the side that wins has an empty pool (nobody backed it), the market is set to
Voided instead of Settled, so everyone can take a full refund. This avoids a divide
by zero in the payout math and avoids stranding the losing side's funds.

## The void safety valve

If a market is still Open at or past `void_after_ts`, anyone can void it. This covers
abandoned or coverage cancelled matches (TxLINE phases A, C, TXCC, TXCS) and any case
where no valid proof ever arrives. Refunds then flow through the claim path.

## The claim math (parimutuel)

A position records how much the user staked on each side. On claim:

- Voided: payout is the full stake back (yes_amount + no_amount), no fee.
- Settled: let `winning_stake` be the user's stake on the winning side (must be > 0).
  Let `total_pot = total_yes + total_no` and `winning_pool` be the winning side's
  pool (guaranteed > 0, because settle voids when it is empty). Then:

  ```
  gross  = winning_stake * total_pot / winning_pool
  fee    = gross * fee_bps / 10000        (MVP fee_bps = 0)
  payout = gross - fee
  ```

All intermediate math uses u128 to avoid overflow, with checked arithmetic. The vault
authority PDA signs the transfer out of the vault via invoke_signed. A position can be
claimed once; a second claim fails.

## Worked example

A market has 100 USDC of total stakes: 70 on YES across two wallets (40 and 30) and
30 on NO. The real stat makes YES true. The market settles to SettledYes. The wallet
that staked 40 on YES claims `40 * 100 / 70 = 57.142857 USDC`. The wallet that staked
30 on YES claims `30 * 100 / 70 = 42.857142 USDC`. The NO wallet has nothing to claim.
The two YES payouts sum to 100 USDC, the whole pot.

## What this gives you

No dispute window. No DVM vote. No trusted resolver. A market resolves the instant the
stat is anchored on chain, in a single transaction, and the only authorization for a
payout is a Merkle proof that verifies against the root TxODDS anchored. That is the
category that optimistic oracle and centralized resolver designs structurally cannot
offer.
