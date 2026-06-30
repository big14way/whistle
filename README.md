# Whistle

Trustless parametric prop settlement on Solana, settled by a Cross Program
Invocation into the TxLINE `validate_stat` oracle.

Every market is a predicate over a real match statistic from the TxLINE oracle,
for example "total corners over 9.5", "match total goals over 2.5", or "winning
margin 2 or more goals". Bettors lock USDC into a program owned vault. The instant
the match stat is anchored on chain by TxLINE, anyone can settle: the program does
a CPI into TxLINE `validate_stat`, which cryptographically verifies the stat
against the on chain Merkle root and returns a boolean. The winning side is paid
pro rata from a parimutuel pool. No dispute window, no central resolver, no trusted
admin. The proof is the authorization.

This is the one settlement category that is structurally impossible for
UMA or Chainlink based competitors: instant, dispute free, cryptographically
verifiable per event settlement.

## Why this wins

- It leans entirely on TxLINE's unique verifiable settlement primitive.
- The wow moment: a goal lands on the live feed and USDC hits the winning wallet
  in the same minute, with the explorer showing the inner CPI to `validate_stat`
  returning `true`.
- The resolution logic is small, deterministic, and auditable.

Competitors (Polymarket via UMA, Drift, Hedgehog, Overtime) settle slowly or
trustfully and only at game level. Whistle settles fine grained in game props
instantly and trustlessly because TxLINE gives per stat verifiable settlement.

## Architecture

One Anchor program plus a Vite React frontend.

```
programs/whistle/        the on chain program (Rust, Anchor 0.31)
  src/lib.rs             entry, declare_id, declare_program!(txoracle)
  src/state.rs           Fixture, Market, Position accounts and enums
  src/errors.rs          WhistleError
  src/oracle.rs          txoracle CPI glue (mirror types, predicate negation, return read)
  src/instructions/      initialize_fixture, create_market, join_market, settle, claim, void_market, probe_validate
  idls/txoracle.json     minimal txoracle IDL (validate_stat only) for declare_program!
  idls/txoracle.full.json the full 28 instruction txoracle IDL, kept for reference
docs/
  ORACLE_FACTS.md        confirmed values from Milestone 0
  SETTLEMENT.md          plain language settlement and safety spec
  DEMO_SCRIPT.md         the 5 minute video script
scripts/                 create-mock-usdc, seed-demo, fetch-validation, probe-oracle
tests/whistle.ts         full lifecycle test including the real validate_stat CPI
app/                     Vite + React + TypeScript frontend
```

### Instructions

| Instruction | Who | What |
| --- | --- | --- |
| `initialize_fixture` | anyone | create the per match container |
| `create_market` | anyone | create a parimutuel prop market with a stat predicate |
| `join_market` | bettor | stake USDC on YES or NO |
| `settle` | anyone (permissionless) | prove the predicate (or its negation) via the validate_stat CPI |
| `claim` | winner | pull the pro rata payout (or a refund when Voided) |
| `void_market` | anyone | safety valve for abandoned or coverage cancelled matches |
| `probe_validate` | anyone | Milestone 0 gate: prove the CPI in isolation |

### The settlement trust model in one paragraph

The settler is anyone and supplies only proof material plus a claimed winning side.
The contract owns the predicate: it builds `(threshold, comparison)` from stored
market fields, never from settler input, and validates that the proof binds to the
right match (`fixture_summary.fixture_id == market.fixture_id`) and the right stat
keys. If the claim is correct the predicate holds and `validate_stat` returns true;
if the claim is wrong that side's predicate is false, so either the boolean is
false (a `require!` fails) or the CPI aborts (the whole transaction fails). In every
case the only way state changes is a genuinely satisfied predicate. GreaterThan and
LessThan are complementary under negation and partition every integer, so exactly
one side is always provable and there are no pushes. See docs/SETTLEMENT.md.

## Toolchain (the working pair)

| Tool | Version |
| --- | --- |
| Rust (host) | 1.92 (any recent stable) |
| Solana CLI (Agave) | 2.1.6 |
| SBF rustc (platform-tools) | v1.43 (rustc 1.79) |
| Anchor | 0.31.1 |
| Node | 20 LTS or newer (built on 22) |
| Package manager | pnpm 10 |

### One toolchain note worth reading

The crates.io ecosystem has moved to `edition2024` and rust 1.85 minimums in recent
patch releases, but the Solana SBF toolchain still ships rustc 1.79 (platform-tools
v1.43). A fresh resolve therefore pulls crates (`block-buffer 0.12`, `zeroize_derive
1.5`, `unicode-segmentation 1.13`, and friends) that the SBF rustc cannot parse.

The fix, applied in this repo and committed in `Cargo.lock`:

1. `programs/whistle/Cargo.toml` declares `rust-version = "1.79.0"`.
2. The lockfile was regenerated with the MSRV aware resolver:
   `cargo generate-lockfile --config 'resolver.incompatible-rust-versions="fallback"'`.
3. `blake3` is pinned to `1.5.5` (the last release on the `digest 0.10` line, which
   keeps the whole crypto subtree off `edition2024`).

With that lockfile the program builds cleanly on rustc 1.79. This is captured in the
TxLINE feedback notes below.

## Setup, deploy, seed, run

```bash
pnpm install
anchor build
anchor deploy --provider.cluster devnet
pnpm mock-usdc                         # deploy the mock USDC mint, writes app/src/config.generated.json

# TxLINE World Cup free tier access (subscribes on chain, no TxL tokens needed):
pnpm txline-auth                       # caches jwt + apiToken to .txline-token-cache.json
pnpm find-fixture                      # finds a real (fixtureId, seq, statKey, statKey2) with anchored stats

# Milestone 0 oracle CPI gate (run before relying on the CPI):
pnpm probe <fixtureId> <seq> <statKey> # calls probe_validate via real .rpc(), asserts validate_stat returns true

DEMO_FIXTURE_ID=<fixtureId> pnpm seed  # fixture + four markets + three funded demo wallets
pnpm app                               # start the frontend
```

The frontend reads `app/src/config.generated.json` (program id, mock USDC mint,
cluster, API base URL) and `app/src/demo-wallets.generated.json` (the three funded
demo wallets), both written by the scripts and both gitignored. In the app, click
"Set tokens" and paste the jwt and apiToken from `pnpm txline-auth` to enable Replay,
Live, and the real settle.

### Dedicated RPC (recommended for a smooth demo)

The public devnet RPC (`api.devnet.solana.com`) rate limits per IP, which slows
seeding and the frontend. Point everything at a free Helius, QuickNode, or Alchemy
devnet endpoint:

```bash
export RPC_URL=https://your-devnet-rpc      # scripts (seed, demo-scenario, probe)
# app/.env.local:  VITE_RPC_URL=https://your-devnet-rpc
```

The public endpoint stays the default fallback.

### Demo scenario (the staggered settlement showcase)

```bash
pnpm demo-scenario   # markets with bets and staggered resolve times on the demo fixture
```

This seeds a first half market that becomes settleable at halftime while the full
game markets are still locked, so on camera one market settles and pays out while the
match clock keeps running. Run it right before recording so the windows are fresh.

### Live deployment (devnet)

| Thing | Value |
| --- | --- |
| Whistle program | `9zhvjPzcUw4DZYBB7qSQ92pXyupkfV8ircrHW6dMAJpW` |
| Mock USDC mint | `AjUYguAuwip6sqs3SimPGv4QLLuuEs3nwmUraTYN6v9Q` |
| Demo fixture | `17588323` (a completed World Cup fixture, 4 markets) |
| Milestone 0 gate | PASSED, `validate_stat` returns true from a real CPI (see docs/ORACLE_FACTS.md) |

The oracle CPI is proven on chain: `probe_validate` returned `true` for a satisfied
predicate and `false` for an unsatisfied one, both from real `.rpc()` transactions.

## TxLINE feedback notes

What worked well:

- `validate_stat` is genuinely a settlement primitive, not just a feed. It returns a
  Borsh `bool` that a calling program reads with `get_return_data` after a real CPI,
  so trustless on chain settlement composes cleanly.
- The program addresses, the soccer feed stat key encoding, and the on chain
  validation reference flow in the docs matched the live on chain IDL exactly.
- Pulling the IDL straight from the docs (and cross checking the on chain program)
  meant `declare_program!` could generate the CPI client with zero hand transcription.

Where we hit friction:

- The full devnet IDL (28 instructions, the trading scaffold) made
  `declare_program!` emit invalid tokens for several hardcoded addresses in the
  trading instructions ("invalid suffix for number literal"). We worked around it
  with a minimal IDL containing only `validate_stat` and its types, with the exact
  on chain discriminator preserved. A docs note that `declare_program!` users should
  trim to the instructions they CPI would save time.
- The SBF toolchain pinned to rustc 1.79 versus the edition2024 crate creep (see the
  toolchain note above) cost real time. A recommended, lock pinned dependency set for
  the current platform-tools would help every integrator.
- The exact per update SSE stat shape and the two stat `eventStatRoot` mapping are
  not fully spelled out in the docs; we built tolerant parsers and confirmed them
  against a live payload (hashes are number arrays, both stats share one
  `eventStatRoot`, `subTreeProof` can be empty, `period` is 0 for full game keys).
- The guest JWT is bound to the IP it was issued from (`maybeClientIp` in the
  token), so a browser on a different IP than the activating wallet gets 401 on data
  calls. The frontend proxies TxLINE calls through the Vite dev server so they
  originate from the issuing IP. A header documenting the IP binding would help.
- The activate endpoint returns the API token as a plain text body, not JSON, and
  the documented "Authorization: Bearer apiToken" for data calls is actually
  "Authorization: Bearer jwt" plus "X-Api-Token: apiToken". Confirmed empirically.
- The devnet `/api/fixtures/snapshot` lists only upcoming fixtures; completed
  fixtures with anchored stats are found through the `scores/updates` windows of past
  anchored days. A "completed fixtures" listing would simplify finding demo data.

## License

MIT
