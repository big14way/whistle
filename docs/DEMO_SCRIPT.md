# Whistle: demo video script (v3, judge cut)

Target length 3:45 to 4:00. Judges review many entries and the criteria say the video
carries the evaluation, so this cut front loads the one thing nobody else can show:
a market settling and paying at halftime, on chain, while the match is still running.

Production note: record ONE full take of the flow (scenes 2 to 7), then in the edit
lift the settle moment out of scene 5 and place it at 0:00 as the cold open. Do not
try to settle the same market twice; the cold open is reused footage.

On screen captions are part of the script. Keep them short, bottom third, one at a
time. They let a judge who watches muted still get every beat.

## Before you record (run down this list in order)

1. RPC: `.env` has the Alchemy devnet URL in `VITE_RPC_URL` and `RPC_URL`. Restart the
   dev server, then confirm in the browser Network tab that calls hit
   `solana-devnet.g.alchemy.com`.
2. Fresh state: clear localStorage for the app origin (receipts persist by design),
   run `pnpm demo-scenario`, wait for "Demo scenario ready: 6 markets", then hard
   refresh within a few seconds. Use the port `pnpm app` prints; another project's
   dev server may already hold 5173. The timing is tuned so betting locks around replay
   minute 26, the first half market resolves at halftime, and the full game markets
   resolve right at full time.
3. Confirm on screen: Croatia vs Ghana with flags, six markets, the TxLINE feed panel
   pill green with the seq climbing, the timeline showing nodes at 45, 81, 85, 85,
   88, and 90 minutes.
4. Demo mode on, three wallets visible and funded (the scenario tops them up), TxLINE
   tokens set, Replay selected.
5. Know your two headline moments: the first half market settles YES at halftime; the
   "Match total goals over 4.5" market settles NO at full time (three goals were
   scored, so the oracle proves the negation). Both are wow beats, in that order.
6. Clean capture: hide bookmarks, high resolution, Solana explorer tab already open,
   and no wallet extension popups.

## 0:00 to 0:25, cold open (reused footage from scene 5)

On screen: the match room mid replay at minute 45. The "First half: a goal is scored"
card reads Ready to settle while every other market reads Locked. Click Settle now.
The staged modal runs: reading the feed, fetching the proof, verifying via
validate_stat. Green check. Settled YES. The measured time shows. The timeline node
turns green and the winnings strip ticks up.

Caption: "Halftime. This market just settled and paid, on chain. The match is still
running."

Narration: "This prediction market settled at halftime, while the match was still
being played. One transaction, one block, no oracle committee, no dispute window.
This is Whistle, and here is how it works."

## 0:25 to 0:50, the problem

On screen: title card "Whistle. Settle on the whistle.", then a simple two row
contrast: "optimistic oracle: hours to days, final result only" against "Whistle: one
block, any stat, mid match".

Narration: "On chain sports betting has one bottleneck: the oracle. Today's markets
mostly settle one thing, the final result, and they settle slowly. Polymarket's
optimistic oracle takes hours on the happy path and a token vote when disputed. None
of them can settle a fine grained in game prop instantly and trustlessly. TxLINE
anchors every match stat on Solana with a Merkle proof, which makes exactly that
possible."

## 0:50 to 1:30, the match room and the feed

On screen: the match room. Croatia 2 : 1 Ghana with flags, the replay running. Point
the cursor at the TxLINE feed panel: the pill (Replay, seq climbing, green dot) and
the event ticker filling with goals, corners, and cards as frames arrive. Then the
stat strip, then the settlement timeline with six markets sitting at different
minutes.

Caption: "Live TxLINE feed. Every event you see is a data frame from the anchored
stream."

Narration: "This is a real World Cup fixture replaying from the stats TxODDS anchored
on chain. The feed panel shows the ingestion live: every goal, corner, and card is a
frame from the TxLINE stream. Each market here is just a predicate over one of those
stats: goals, corners, cards, sums, differences, first half only. And look at the
timeline: they do not all resolve at the end. The first half market settles at
halftime. The rest settle at full time. Multiple predictions on one match, resolving
at different moments."

## 1:30 to 2:05, two sided betting and the odds

On screen: open "First half: a goal is scored". Select YES, the wallet auto switches
to Bettor A, stake 40, place it. Toast with the transaction signature. Select NO, the
wallet auto switches to Bettor B, stake 15, place it. Watch the pool bar and the
implied percentages move as the second bet lands, and the payout preview update.

Caption: "Parimutuel pools. The odds are the pools. Real devnet transactions."

Narration: "Bettor A backs a first half goal with forty test USDC. Bettor B takes the
other side. Watch the implied odds move as the second stake lands: there is no market
maker and no order book, just two pools, and the odds are simply each side over the
pot. Both stakes sit in a program owned vault. No middleman holds the funds."

## 2:05 to 2:50, the wow moment, settlement before the whistle

On screen: the replay reaches halftime. The first half market flips to Ready to
settle while every other card stays Locked and the clock runs into the second half.
Click Settle now. The modal stages run on camera: "Reading match feed", "Fetching
cryptographic proof from TxLINE", "Verifying on chain via validate_stat (CPI)". Green
check, "Verified. Predicate proven on chain.", Settled YES, the measured time, the
signature. The timeline node pops green while the full game markets sit locked.

Caption: "One CPI into TxLINE validate_stat. It returned true."

Narration: "Halftime. The first half market is now settleable, and anyone can settle
it, the caller here is a neutral third wallet, not the market creator and not a
bettor. The app fetches the Merkle proof from TxLINE and the program makes a single
cross program invocation into validate_stat, which checks the proof against the root
TxODDS anchored and returns true. One transaction, one block, and this market paid
out while the match was still being played. Wins before the whistle."

## 2:50 to 3:15, the proof and the payout

On screen: click "View inner instruction on Explorer". On the explorer, expand inner
instructions and hold on the CPI into the txoracle program. Back in the app, the
winner claims and the wallet balance visibly counts up. Open the settlement receipt
and expand "Verification details": the raw predicate, the proven values, the oracle
program, the anchored root account, the settle transaction.

Caption: "The proof is the authorization. Every link is independently checkable."

Narration: "Here is the receipt this category cannot usually produce. The inner
instruction is a call into the TxLINE oracle returning true, recorded on chain
forever. The winner claims and the balance counts up, paid pro rata from the vault.
And the receipt links everything an analyst needs to re verify it independently: the
predicate, the proven values, the anchored Merkle root. We attest nothing. The chain
does."

## 3:15 to 3:45, full time, including the market that settles NO

On screen: the replay reaches full time. The five remaining markets flip to Ready to
settle. Settle "Total corners over 4.5" (YES), then "Match total goals over 4.5",
which settles NO. Show the red Settled NO badge and Bettor B's balance counting up.
Let the winnings strip and the activity feed fill.

Caption: "Three goals were scored. Over 4.5 is false, so it settles NO. The oracle
proves negations too."

Narration: "At full time the rest of the card settles the same way, each in a single
transaction against its own anchored stat. And note this one: total goals over four
and a half. Only three were scored, so it settles NO, the program proves the
negation, and the NO side gets paid. Exactly one side of every market is provable, so
there are no pushes and no disputes, in either direction."

## 3:45 to 4:00, close

On screen: end card. "No dispute window. No resolver. Paid the instant it was
provable." Below it: the GitHub repo URL, the program ID
9zhvjPzcUw4DZYBB7qSQ92pXyupkfV8ircrHW6dMAJpW, and "Whistle. Settle on the whistle."

Narration: "Six markets on one match, each settled in one block, one of them before
the match even ended, and one of them settled NO with the same proof machinery. That
is what per stat verifiable settlement unlocks, and it is the whole product. Whistle.
Settle on the whistle."

## Key lines that must land

- "This market settled at halftime, while the match was still being played."
- "Every event you see is a data frame from the anchored TxLINE stream."
- "The odds are simply each side over the pot."
- "Anyone can settle it. The caller is a neutral third wallet."
- "One cross program invocation into validate_stat. It returned true."
- "It settles NO. The oracle proves negations too."
- "Settle on the whistle."

## Fallbacks during recording

- If the TxLINE API is unreachable, switch the feed to Simulation. The match still
  unfolds, the feed panel still ticks, and betting still works on chain. The real
  settle needs a proof, so do the headline settle in Replay with tokens set.
- If a transaction is slow, nothing hangs silently: the modal shows the signature
  with a watch it confirm link the moment it is sent. Wait for the toast.
- If a settle window passes before you reach it, rerun `pnpm demo-scenario` and hard
  refresh. The scenario tops up the wallets and reprints fresh windows every run, and
  the receipts panel self cleans old markets.
- Keep one already settled market from a practice run available as a backup, so the
  receipt and explorer shots exist even if a live settle needs a retry.
