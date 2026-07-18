# Whistle: project status

> Historical snapshot from the Milestone 0 phase. For the current, authoritative
> state (Vercel deployment, wallet connect, live TxLINE proxy, demo fixture
> **17588245** Croatia–Ghana) see the top-level `README.md`.

A snapshot of what is built, what is proven, and where we are. For the settlement
trust model see SETTLEMENT.md, for the demo see DEMO_SCRIPT.md, for the confirmed
oracle facts see ORACLE_FACTS.md, and for the UI see FRONTEND_DESIGN.md.

## What Whistle is

A trustless parametric prop settlement protocol on Solana. Every market is a predicate
over a real match statistic from the TxLINE oracle (for example "total corners over
9.5"). Bettors lock USDC into a program owned vault. The instant the stat is anchored
on chain by TxLINE, anyone can settle: the program does a CPI into TxLINE
`validate_stat`, which verifies the stat against the on chain Merkle root and returns a
boolean. The winning side is paid pro rata from a parimutuel pool. No dispute window,
no central resolver, no trusted admin. The proof is the authorization.

The wedge: competitors (Polymarket via UMA, Drift, Hedgehog, Overtime) settle slowly or
trustfully and only at game level. Whistle settles fine grained in game props instantly
and trustlessly because TxLINE gives per stat verifiable settlement.

## Status: live on devnet, proven end to end

| Thing | Value |
| --- | --- |
| Whistle program (devnet) | `9zhvjPzcUw4DZYBB7qSQ92pXyupkfV8ircrHW6dMAJpW` |
| Deploy tx | `587HpTUmtj7jwrxqAAV1ht45CiH9WYPohZcKhxtDCtnPQWhKF8EmFz5ZZcfnZSDXgehuGvxQRBnn4Tu2GgtWENYG` |
| Mock USDC mint | `AjUYguAuwip6sqs3SimPGv4QLLuuEs3nwmUraTYN6v9Q` (6 decimals) |
| Demo fixture | `17588323`, a completed World Cup match (13 corners, 6 goals) |
| TxLINE txoracle (devnet) | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| Repo | github.com/big14way/whistle (main) |

### What is proven

- **Milestone 0 oracle CPI gate PASSED.** Real `.rpc()` transactions: a satisfied
  predicate returned `validate_stat = true`, an unsatisfied one returned `false`
  (never aborts on a valid but unsatisfied predicate). This de risks the entire thesis.
- **Full test suite green, 8 of 8.** Six lifecycle tests (create, two sided betting,
  all timing guards, void plus full refunds, double claim guard) and two real CPI tests
  (settle on a real proven stat with correct parimutuel payout, and wrong claim
  rejection with state unchanged), all against the live devnet program and real
  anchored roots.
- **Browser demo verified end to end.** In the running frontend: a bet placed on chain,
  then the Settle button fetched the real TxLINE proof, CPI'd into `validate_stat`, and
  the market resolved to SettledYes, after which the winner can claim the pot. This was
  observed live (the market is `settledYes` on chain).

### One adversarial review finding, fixed

A multi agent correctness review caught a real high severity bug: `settle` bound the
proof stat key and fixture id but not the oracle leaf's `period`. The TxLINE stat leaf
is `{key, value, period}`, so a settler could have proven the same key under a different
period to flip an outcome. Fixed: the market now stores `stat_a_period` and
`stat_b_period`, and settle requires the proof periods to match.

## Architecture

```
programs/whistle/        Anchor program (Rust), compiles to SBF, IDL generated
  src/lib.rs             entry, declare_id, declare_program!(txoracle)
  src/state.rs           Fixture, Market, Position accounts and enums
  src/errors.rs          WhistleError (21 variants)
  src/oracle.rs          txoracle CPI glue: mirror types, predicate negation, return read
  src/instructions/      initialize_fixture, create_market, join_market, settle, claim,
                         void_market, probe_validate (the Milestone 0 gate)
  idls/txoracle.json     minimal validate_stat only IDL (declare_program! needs this)
scripts/                 mock USDC, seed, fetch-validation, txline-auth, find-fixture,
                         probe-oracle, demo-settle-setup
tests/whistle.ts         full lifecycle plus gated real CPI tests
app/                     Vite + React + TypeScript frontend (see FRONTEND_DESIGN.md)
docs/                    ORACLE_FACTS, SETTLEMENT, DEMO_SCRIPT, PROJECT_STATUS, FRONTEND_DESIGN
```

### Instructions

| Instruction | Who | What |
| --- | --- | --- |
| initialize_fixture | anyone | create the per match container |
| create_market | anyone | create a parimutuel prop market with a stat predicate |
| join_market | bettor | stake USDC on YES or NO |
| settle | anyone (permissionless) | prove the predicate (or its negation) via the validate_stat CPI |
| claim | winner | pull the pro rata payout (or a refund when Voided) |
| void_market | anyone | safety valve for abandoned or coverage cancelled matches |
| probe_validate | anyone | Milestone 0 gate: prove the CPI in isolation |

## Toolchain (the working pair)

Rust host 1.92, Solana CLI (Agave) 2.1.6, SBF rustc 1.79 (platform-tools v1.43),
Anchor 0.31.1, Node 22, pnpm 10. The classic edition2024 / rust 1.85 crate creep that
breaks the SBF build is solved with the MSRV aware resolver plus a blake3 pin, committed
in Cargo.lock.

## Known environmental frictions (not code issues)

- **Public devnet RPC throttling.** `api.devnet.solana.com` rate limits this IP, which
  slows seeding and the frontend. Workaround: scripts space transactions out; a
  dedicated RPC (Helius, QuickNode, Alchemy) makes everything instant. This is the main
  thing degrading the live experience, not the contract.
- **IP bound guest token.** The TxLINE guest JWT is tied to the IP that issued it, so a
  browser on a different IP gets 401. The frontend proxies TxLINE calls through the Vite
  dev server so they originate from the issuing IP.

## What is left

- Record the 5 minute demo video (DEMO_SCRIPT.md). The on camera proof is the explorer
  inner instruction showing the CPI to `validate_stat` returning true.
- Optional polish: a dedicated RPC for a smooth live demo, frontend design improvements
  (see FRONTEND_DESIGN.md), and the in program Merkle verification fallback (Section 12
  of the build spec) is not needed since the CPI works, but is documented as a backup.
- Optional: deploy to mainnet (the World Cup roots also live there) with the same mock
  USDC approach, if a mainnet demo is wanted. The settlement logic is identical.
