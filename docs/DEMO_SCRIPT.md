# Whistle: 5 minute demo script

The video is judged heavily, and the trust story is its spine. The single
undeniable proof is the explorer showing the inner CPI to `validate_stat` returning
true for a real settled market. Everything else supports that moment.

Default to Historical Replay against a completed fixture with real anchored roots, so
the demo is deterministic and the proof is real. Keep Simulation mode ready as an
offline fallback if the API is unreachable at record time. Keep Live SSE as a bonus
"it also works live" beat if a match is on.

Before recording, confirm:

- `anchor deploy` done on devnet, `pnpm mock-usdc` and `pnpm seed` run, the three
  demo wallets show 1000 USDC each in the top right.
- A real `DEMO_FIXTURE_ID` is set and its markets are seeded.
- TxLINE tokens are set in the UI (the Set tokens button) so Replay and the real
  settle proof fetch work.
- One market is chosen for the headline settle, ideally a stat that resolves early
  and clearly (corners or first half goals), not a 90th minute stat.

## Scene 1, the problem (0:00 to 0:40)

On screen: a simple title card, then the Whistle match room loading.

Narration: "On chain sports betting has one bottleneck, the oracle. Polymarket
settles through an optimistic oracle: two to four hours on the happy path, and a 48
to 96 hour token vote when a market is disputed, a vote that investigations have shown
is captured by the largest wallets. Drift and others lean on a centralized resolver.
Every one of them either waits hours, trusts a committee, or only resolves coarse game
level outcomes. None can settle a fine grained in game prop instantly and trustlessly.
That is exactly what TxLINE makes possible, and it is what Whistle is."

## Scene 2, the match room (0:40 to 1:30)

On screen: the match room. Point out the fixture header with the live scoreline and a
pulsing phase chip, the live stat strip (goals, corners, cards) updating as Replay
advances, and three parimutuel markets: total corners over 9.5, match total goals over
2.5, and winning margin by 2 or more.

Narration: "This is a real World Cup fixture replaying with the stats TxLINE anchored
on chain. Each market is just a predicate over one of those stats. Total corners over
9.5 is corners for both sides added together, greater than 9. The contract stores that
predicate as integers. There is no AMM here, just two parimutuel pools, YES and NO."

## Scene 3, two sided betting (1:30 to 2:30)

On screen: in the corners market, select YES, type 50, confirm Bettor A is selected,
click Place YES bet. A toast confirms with the transaction signature. Switch to NO,
the wallet auto switches to Bettor B, type 30, Place NO bet. Watch the split bar move
and the implied probabilities update. The top right balances drop accordingly.

Narration: "Bettor A backs YES with 50 USDC. Bettor B backs NO with 30. The pool bar
updates, the implied odds are just each side over the pot. Both stakes are now locked
in a program owned vault. Real devnet USDC, real on chain transactions."

## Scene 4, the wow moment (2:30 to 3:40)

On screen: let Replay advance until the corner count crosses the line in the live stat
strip (the corners number ticks up and briefly glows). The market hits its resolve
time and a prominent Settle now button appears. Click it.

The settlement modal runs its staged sequence on camera:

1. "Reading match feed: corners P1 + corners P2 > 9 = 11"
2. "Fetching cryptographic proof from TxLINE"
3. "Verifying on chain via validate_stat (CPI)"

Then a large green checkmark, "Verified. Predicate proven on chain.", the Settled YES
badge, and the transaction signature in mono.

Narration: "The eleventh corner lands. Anyone can settle now, it is permissionless. The
app fetches the cryptographic proof from TxLINE, and our program does a single Cross
Program Invocation into validate_stat, which checks the proof against the Merkle root
TxODDS anchored, and returns true. One transaction. No challenge window. No vote. No
resolver."

## Scene 5, the proof (3:40 to 4:20)

On screen: click View inner instruction on Explorer. On the Solana explorer, expand the
transaction's inner instructions and point at the CPI into the txoracle program calling
validate_stat, returning true. Then back in the app, Bettor A clicks Claim, and the top
right USDC balance counts up by the parimutuel payout.

Narration: "Here is the receipt the whole category cannot produce. The inner instruction,
a call into the TxLINE oracle, validate_stat, returning true, recorded on chain. And the
winning wallet is paid out of the vault in the same flow. The proof is the authorization."

On screen: show the saved proof receipt card under the market: fixture id, sequence, the
proven stat values, the predicate, the outcome, and the explorer link.

## Scene 6, the contrast and close (4:20 to 5:00)

On screen: a split card, Polymarket two to four hours versus Whistle one block. Then the
caption from the modal: "No dispute window. No resolver. The goal paid out the instant it
was provable."

Narration: "Optimistic oracle markets settle this in hours, and only if nobody disputes.
A goal just paid out on Whistle in one block, trustlessly, because TxLINE gives per stat
verifiable settlement. That is the one thing UMA and Chainlink based competitors
structurally cannot do, and it is the whole product. Whistle. Settle on the whistle."

## Fallbacks during recording

- If the API is unreachable, switch the feed to Simulation. The match still unfolds and
  betting still works on chain. The real settle needs a proof, so do the headline settle
  in Replay with tokens set, and use Simulation only as a visual backup.
- If a transaction is slow to confirm, the buttons stay disabled and a toast reports the
  result. Nothing in the UI breaks; just wait for the confirmation toast.
- Keep one already settled market visible so the proof receipt and the explorer link are
  available even if a live settle needs a retry.
