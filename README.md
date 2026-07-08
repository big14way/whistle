# Whistle

Trustless parametric prop settlement on Solana, settled by a Cross Program
Invocation into the TxLINE `validate_stat` oracle.

**Live read only demo:** https://big14way.github.io/whistle/ shows the real devnet
markets, pools, and settled outcomes over the public RPC with the offline Simulation
feed. The demo wallets and TxLINE tokens never leave your machine, so betting and
settling need a local run (`pnpm install && pnpm app`) or the demo video.

**Demo video:** add your uploaded YouTube or Loom link here. A full cut and a 60 second
social cut are produced from `video/` (a Remotion project, see `video/README.md`).

## The problem

On-chain sports betting has one bottleneck: the oracle. Today's markets settle a single
question, the final result, and they settle slowly. Polymarket's optimistic oracle takes
hours on the happy path and a multi day token vote when a market is disputed. That model
cannot resolve the fine grained, in game questions fans actually care about mid match, a
first half goal, total corners, cards, a winning margin, because there is no trustless way
to prove them true the instant they happen. So those markets either do not exist on chain
or they settle trustfully at game level, hours after the moment has passed.

Whistle removes the bottleneck. TxLINE anchors every match stat on Solana with a Merkle
proof, so a market can settle any stat, trustlessly, in a single block, the instant it is
provable, even while the match is still being played.

## How Whistle works

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
  DEMO_SCRIPT.md         the video script (v3, judge cut)
scripts/                 create-mock-usdc, seed-demo, fetch-validation, probe-oracle
tests/whistle.ts         full lifecycle test including the real validate_stat CPI
app/                     Vite + React + TypeScript frontend
video/                   Remotion project that renders the demo and social videos
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

To bet from your own wallet instead of the demo keypairs, click "Connect wallet"
(Phantom or any Wallet Standard wallet), press "Fund 100" in the Your wallet panel to
mint mock USDC, then pick "My wallet" in the Wallet dropdown of any open market. The
demo keypairs and the connect flow are independent, so either works.

### Dedicated RPC (recommended for a smooth demo)

The public devnet RPC (`api.devnet.solana.com`) rate limits per IP, which slows
seeding and the frontend. Point everything at a free Helius, QuickNode, or Alchemy
devnet endpoint. Copy `.env.example` to `.env` at the repo root (gitignored) and set
both variables to the same URL:

```bash
# .env  (repo root, gitignored)
VITE_RPC_URL=https://your-devnet-rpc        # frontend (Vite reads it via envDir: "..")
RPC_URL=https://your-devnet-rpc             # scripts (loaded with dotenv)
```

The frontend reads `VITE_RPC_URL` and the scripts read `RPC_URL`, both falling back
to `https://api.devnet.solana.com` when unset. Vite only reads `.env` at startup, so
restart the dev server after editing it.

### Demo scenario (the staggered settlement showcase)

```bash
pnpm demo-scenario   # markets with bets and staggered resolve times on the demo fixture
```

This seeds a first half market that becomes settleable at halftime while the full
game markets are still locked, so on camera one market settles and pays out while the
match clock keeps running. Run it right before recording so the windows are fresh.

A note on the lock policy, because parimutuel pools make it matter: once an outcome
starts becoming knowable, late bets are informed bets, so a production market should
set `lock_ts` at kickoff. The demo seeds a short in play window (betting closes
around replay minute 26) purely so betting can happen on camera; the program enforces
whatever cutoff the market creator sets, and the `rejects a bet after lock_ts` test
covers it.

### Live deployment (devnet)

| Thing | Value |
| --- | --- |
| Whistle program | `9zhvjPzcUw4DZYBB7qSQ92pXyupkfV8ircrHW6dMAJpW` |
| Mock USDC mint | `AjUYguAuwip6sqs3SimPGv4QLLuuEs3nwmUraTYN6v9Q` |
| Demo fixture | `17588245` (Croatia 2 : 1 Ghana, completed and anchored, six staggered markets) |
| Milestone 0 gate | PASSED, `validate_stat` returns true from a real CPI (see docs/ORACLE_FACTS.md) |

The oracle CPI is proven on chain: `probe_validate` returned `true` for a satisfied
predicate and `false` for an unsatisfied one, both from real `.rpc()` transactions.

## Reviewing the resolution logic

The entire trustless settlement path is about 500 lines of documented Rust. The
recommended reading order:

| File | Lines | What it decides |
| --- | --- | --- |
| `programs/whistle/src/instructions/settle.rs` | 176 | The settle instruction: binds the proof to the market's fixture, stat keys, and periods, builds the predicate from stored fields (never from settler input), CPIs into `validate_stat`, requires the returned bool, pays nothing itself (state only) |
| `programs/whistle/src/oracle.rs` | 196 | The CPI glue: mirror types for the oracle's Borsh layout, `predicate_for_claim` (the negation trick that makes exactly one side provable), `read_oracle_bool` via `get_return_data` |
| `programs/whistle/src/state.rs` | 141 | `Fixture`, `Market`, `Position` accounts and the state machine (`Open` to `SettledYes`/`SettledNo`/`Voided`) |
| `programs/whistle/src/instructions/claim.rs` | 139 | Pro rata parimutuel payout math and the refund path for voided markets |
| `tests/whistle.ts` | 524 | The full lifecycle against devnet, including the real `validate_stat` CPI (both a satisfied and an unsatisfied predicate) |

Determinism in one sentence: the outcome is a pure function of the on chain market
fields and the oracle anchored stat, the settler supplies only proof material, and
`GreaterThan`/`LessThan` partition the integers so every market resolves to exactly
one side with no pushes (see `docs/SETTLEMENT.md` for the safety argument).

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

## Roadmap

Whistle is a working proof of the settlement primitive, deployed and settling on devnet.
What turns it into a product:

Near term
- Wallet connect is live for betting: connect Phantom or any Wallet Standard wallet, fund
  with mock USDC, and place bets from your own wallet (pick "My wallet" in any market). Next
  is settling and claiming from the connected wallet and a real, non mock USDC path.
- Permissionless market creation in the UI: pick a fixture, a stat, a threshold, and a lock
  time; the predicate and the program owned vault are derived on chain.
- Mainnet deployment behind the same CPI, gated on TxLINE mainnet coverage.

Medium term
- Every sport and stat TxLINE anchors, not only soccer. The predicate engine is already
  stat agnostic: any stat key, add or subtract of two stats, per period, greater or less
  than a threshold.
- Live match markets end to end. The Live SSE path exists; the work is hardening
  reconnection and settlement timing against an in play feed.
- A permissionless keeper that auto settles any resolvable market the instant its stat is
  anchored, so payouts land with no human in the loop.

Longer term
- Liquidity depth: an optional AMM or LP backed side alongside the parimutuel pools, for
  thin in game markets.
- Composability: settlement is a single CPI that returns a verified boolean, so other
  Solana programs (perps, structured products, fantasy) can settle against the same
  primitive.
- A market registry and creator reputation so front ends can surface well formed,
  trustworthy markets.

## License

MIT
