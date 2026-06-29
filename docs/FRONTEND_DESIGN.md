# Whistle frontend: design documentation

A precise description of how the UI is built and how it looks, so the design can be
discussed and improved. This documents the current implementation (Vite + React +
TypeScript, a single dark themed page), not an aspiration. Use the "Design analysis"
and "Open questions" sections at the end to drive deeper design conversations.

## 1. Design intent

The brand idea is "verifiable data": this is a settlement protocol where the whole
point is cryptographic proof, so the interface should read as financial, exact, and
trustworthy rather than playful or casino like. Concretely:

- **Dark first.** A near black background with layered dark surfaces, so bright data and
  the single accent pop.
- **Numbers are the hero.** Every balance, pool, odd, stat, and transaction hash is set
  in a monospace face with tabular figures, so digits line up and read as precise
  financial data. Prose is a humanist sans; headings are a geometric display sans.
- **One accent, semantic color elsewhere.** A single blue accent for primary actions.
  Green means YES / verified / live / positive. Red means NO / negative. Amber means
  pending / locked. No decorative gradients.
- **Calm motion.** Short ease out transitions (150 to 250 ms), a pulsing live dot, a
  subtle value bump when a stat changes, and one celebratory "pop" on the settlement
  checkmark. Motion is used to confirm events, not to decorate.

## 2. The design system (tokens)

All tokens live in `app/src/theme/tokens.css` as CSS custom properties; component styles
in `app/src/theme/global.css` reference them. There is no CSS framework; styling is a
single hand written stylesheet of semantic class names.

### Color

| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#0A0E14` | page background (near black, slight blue) |
| `--surface` | `#121821` | cards, raised panels |
| `--surface-2` | `#1A2230` | inputs, chips, secondary fills |
| `--border` | `#232C3B` | hairline borders |
| `--text` | `#E8EDF4` | primary text (near white) |
| `--text-muted` | `#8A97A8` | secondary text, labels |
| `--yes` | `#00E5A0` | YES, verified, live, positive (mint green) |
| `--no` | `#FF5C5C` | NO, negative (coral red) |
| `--accent` | `#4D7CFF` | primary actions, links (blue) |
| `--pending` | `#FFB84D` | awaiting, locked (amber) |

### Typography

| Token | Family | Use |
| --- | --- | --- |
| `--font-display` | Space Grotesk (600/700) | headings, the wordmark, market titles |
| `--font-body` | Inter (400/500/600) | body copy, labels, buttons |
| `--font-mono` | JetBrains Mono | every number, balance, stat, hash, countdown |

Fonts load from Google Fonts in `index.html`. Mono numbers use
`font-variant-numeric: tabular-nums` so columns of digits align.

### Spacing, radius, elevation, motion

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 (tokens `--s1` to `--s12`).
- Radii: cards 16 px, buttons 10 px, pills 999 px.
- Elevation: two soft, low opacity shadows (`--shadow-1` subtle, `--shadow-2` for
  raised surfaces and modals). No hard borders for depth, just hairlines plus shadow.
- Motion: `--t-fast` 150 ms and `--t-mid` 250 ms with a custom ease out curve.

## 3. Layout and information architecture

Single page, one fixture in focus (multi fixture is post MVP). Top down:

```
+------------------------------------------------------------------+
|  (*) Whistle   [Devnet]      [Live | Replay | Simulation]  [Set tokens]   <- sticky top bar
+------------------------------------------------------------------+
|                              [ BettorA 1000 USDC  Fund+100 ]     |
|                              [ BettorB 1000 USDC  Fund+100 ]     |  <- wallet switcher (right)
|                              [ Settler 1000 USDC  Fund+100 ]     |
|                                                                  |
|  Argentina   1 : 5   Brazil    (* 2nd half)  72'   #17588323     |  <- fixture header (raised card)
|                                                                  |
|        3        Goals        1                                   |
|        6       Corners       5            <- live stat strip (mono, animates on change)
|        2       Yellow        1                                   |
|        0        Red          0                                   |
|                                                                  |
|  MARKETS                                                         |
|  +----------------------+  +----------------------+              |
|  | Total corners > 9.5  |  | Match goals > 2.5    |   <- market grid (auto fill, min 320px)
|  | P1+P2 corners > 9    |  | P1+P2 goals > 2      |              |
|  | [#### YES 50 (71%) | (29%) 20 NO ##]            |  <- split pool bar
|  | Locks in 4:12                                   |              |
|  | [ YES | NO ]  [ 10 ] USDC  [5][10][25][50]      |  <- bet panel
|  | wallet: BettorA      if YES wins: 57.14 USDC    |              |
|  | [        Place YES bet        ]                 |              |
|  +----------------------+  +----------------------+              |
+------------------------------------------------------------------+
                                              [ toast: bet placed (sig) ]  <- toasts (bottom right)
```

Components and files:

- `AppShell` (top bar + page frame) `components/AppShell.tsx`
- `ClusterBadge`, `FeedModeToggle`, `WalletSwitcher`
- `FixtureHeader`, `LiveStatStrip`
- `MarketCard` containing `BetPanel`, `ClaimPanel`, `ProofReceipt`
- `SettlementModal` (overlay), `Toasts` (context + viewport)

State hooks: `useDemoWallets` (wallets + live balances), `useMarkets` (on chain markets
for the fixture, polled), `useMatch` (feed source: Live SSE, Historical Replay, or
Simulation). The feed is abstracted behind one `FeedSource` interface so the UI is
decoupled from the data source.

## 4. Component inventory

### Top bar (AppShell)

Sticky, translucent dark with backdrop blur and a hairline bottom border. Left: the
wordmark "Whistle" with a small pulsing green dot (the live/verified motif). Then a
`ClusterBadge` pill ("Devnet"). Right: the `FeedModeToggle` (a segmented control, Live /
Replay / Simulation) and a "Set tokens" ghost button.

### WalletSwitcher

A right aligned row of three compact wallet chips (Bettor A, Bettor B, Settler). Each
chip shows the role name, the USDC balance in mono, and a small "Fund +100" ghost button
that mints mock USDC. The active wallet gets an accent border. This is the demo wallet
model: three pre funded local keypairs so the demo never depends on a browser wallet.

### FixtureHeader

A raised card. The two participants flank a large mono scoreline ("1 : 5"). A phase pill
shows the match phase (Not started, 1st half, Half time, 2nd half, Full time, ET, PENS),
with a pulsing green live dot when the match is in play and an amber tone for the void
phases (abandoned, cancelled). A mono minute pill and a fixture id pill sit alongside.

### LiveStatStrip

A card with a three column grid (home value, centered label, away value) for Goals,
Corners, Yellow, Red. Values are mono tabular figures. When a value changes (driven by
the feed), it briefly flashes green (the `.bump` class) so a goal or corner is felt.

### MarketCard (the core unit)

One card per market. Top: the plain language title (display font) and a mono restatement
of the predicate ("P1 + P2 corners > 9 (full game)"), with a state badge on the right
(Open / Locked / Settled YES / Settled NO / Voided, color coded). Then a horizontal
split pool bar: a green YES segment and a red NO segment whose widths track the pool
sizes, each labeled with the pool amount and the implied probability (a side's pool over
the total pot). Below, the card shows one of:

- **Open:** a lock countdown plus the `BetPanel`.
- **Locked:** an amber banner "Betting locked. Settle available in M:SS."
- **Resolvable:** a prominent blue "Settle now (prove on chain)" button.
- **Settled or Voided:** the `ClaimPanel` and, once settled here, the `ProofReceipt`.

### BetPanel

A YES/NO segmented toggle (YES fills mint green, NO fills coral when active), an amount
input in mono with quick chips (5, 10, 25, 50), a wallet selector (defaults Bettor A for
YES, Bettor B for NO to make the demo flow obvious), a live "if YES wins: X USDC"
parimutuel preview, and a full width Place bet button colored to the chosen side. The
button disables while pending or when the amount exceeds the balance.

### SettlementModal (the signature moment)

A centered modal over a blurred scrim, intended to feel like an event. It runs a short
staged sequence with visible status lines:

1. "Reading match feed: {predicate} = {value}"
2. "Fetching cryptographic proof from TxLINE"
3. "Verifying on chain via validate_stat (CPI)"

Each step shows a pending dot, an active spinner, then a green check as it completes. On
success: a large green checkmark that pops in, "Verified. Predicate proven on chain.", a
Settled YES/NO badge, the transaction signature in mono, and a primary "View inner
instruction on Explorer" button. A footnote drives the narrative: "No dispute window. No
resolver. The goal paid out the instant it was provable. Optimistic oracle markets
settle this in hours. Whistle settled it in one block." Errors render a clear, safe to
retry message (state is unchanged).

### ProofReceipt

A saved card per settled market: fixture id, sequence, the stat key(s) and their proven
values, the predicate, the outcome, and the settlement tx with an explorer link. This is
the "verifiable resolution receipt", a traceable record without trusting an external
oracle. Persisted in localStorage so it survives a refresh.

### ClaimPanel

For winning (or refunded) wallets: a labeled list of each demo wallet's claimable amount
in mono with a Claim button. "Winnings available" when settled, "Refund available" when
voided.

### Toasts

Non blocking notifications, bottom right, for bet placed, settling, settled, claimed,
and errors, each with a left color bar by kind and the tx signature as an explorer link.
Auto dismiss after a few seconds.

## 5. Motion and feedback

- Pulsing live dot in the wordmark and phase chip (1.6 s ease loop).
- Stat values flash green for ~0.9 s when they change.
- Modal scrim fades in, the panel rises 12 px, the success check pops with a slight
  overshoot.
- Buttons lift 1 px on hover; the split pool bar animates its segment widths.
- Optimistic feel: actions disable their button while pending and confirm with a toast
  carrying the signature; on chain market and balance state is then refetched so the UI
  reflects confirmed chain state, not guesses.

## 6. Robustness choices baked into the UI

- All browser storage is wrapped in try/catch.
- Feed parsing is guarded so a malformed line cannot crash the stream loop.
- Three feed modes, with Simulation fully offline so the UI always runs even with no
  network, and Replay as the deterministic default when tokens are present.
- The settlement transaction always includes the 1,400,000 compute unit pre instruction.

## 7. Design analysis: current strengths

- **Strong, coherent visual identity.** The dark "verifiable data" aesthetic, mono
  numerals, and the single accent give it a precise, financial feel that matches the
  product thesis, distinct from typical casino style betting UIs.
- **The settlement modal is the right hero.** Staging the proof fetch and the CPI as a
  visible sequence makes the unique primitive (instant trustless settlement) legible,
  which is exactly what the product needs to communicate.
- **Information hierarchy is clear** for a single market: title, predicate restated,
  pools with implied odds, then the action. The split bar communicates the parimutuel
  odds at a glance.
- **Semantics are consistent:** green/red for YES/NO everywhere, amber for locked,
  blue only for primary actions.

## 8. Design analysis: tensions, gaps, and open questions

These are the threads worth pulling on for "how do we make it better". They are honest
gaps in the current implementation.

1. **Density and rhythm.** The MarketCard packs title, restatement, split bar,
   countdown, a full bet panel, and a payout preview into one card. With several cards in
   a responsive grid, the page can feel busy. Open question: should betting move into a
   focused panel or drawer, leaving the cards as scannable summaries?
2. **The split pool bar vs real odds.** Implied probability is just pool share, which is
   intuitive but can mislead (it is not a price you can trade against). Open question:
   how to present parimutuel odds honestly and legibly (payout multiple? "you would win
   X" framing already exists in the bet panel, should the card lead with that)?
3. **Empty, loading, and error states are minimal.** "No markets found" and a feed error
   banner exist, but there is no skeleton loading, no per card spinner while on chain
   state refetches, and balances briefly show 0 (which disables the bet button) before
   they load. Open question: a considered loading and empty state system.
4. **Two wallet models coexist.** The demo wallet switcher is the default; a real wallet
   adapter path is intended but secondary. Open question: how to make demo mode obviously
   a demo without it looking unfinished, and how the real wallet path should feel.
5. **Responsive and mobile.** The layout is desktop first (the wallet row is right
   aligned, the fixture header is a wide row, the grid is min 320 px). The market is
   mobile first (Lagos, in play micro betting). Open question: a real mobile layout, the
   bet flow on a small screen, thumb reach.
6. **Accessibility.** Color carries a lot of meaning (YES/NO), contrast on muted text and
   on the colored segments should be checked, focus states are mostly browser default,
   the modal is not yet a focus trap with proper ARIA roles, and motion has no reduced
   motion fallback. Open question: an accessibility pass (WCAG contrast, focus
   management, prefers-reduced-motion, ARIA for the modal and live regions for stat
   updates and toasts).
7. **Single accent constraint.** One blue accent is elegant but the page leans heavily on
   green/red, which can feel like a lot of saturated color when many markets are open.
   Open question: is the palette balanced across a full page, or does it need a calmer
   resting state with color reserved for moments?
8. **The "moment" pacing.** The settlement modal uses a fixed short delay then real
   network calls. Under RPC latency the "Verifying on chain" step can hang with just a
   spinner. Open question: better progress signal (substeps, the tx signature appearing
   as soon as it is sent, an explorer link to "watch it confirm").
9. **Typography scale.** There is a display, a body, and a mono face, but only a few
   sizes are used. Open question: a deliberate type scale (display sizes for the
   scoreline vs market titles vs labels) to strengthen hierarchy.
10. **Data visualization headroom.** Beyond the split bar, there is no visualization of
    the match timeline, the stat trajectory, or how a market moved. Open question: would
    a small sparkline of the stat over the match, or a timeline of when the predicate
    flipped, make the "in play" story stronger?
11. **Dark only.** There is no light theme. Open question: is dark only correct for the
    brand, or is a light mode worth it for daytime/mobile use?
12. **The proof receipt could be the brand artifact.** It currently renders as a plain
    key/value card. Open question: should the verifiable receipt be a designed,
    shareable object (the thing users screenshot), since it is the unique trust proof?

## 9. Web Interface Guidelines review (concrete findings)

A pass against the Vercel Web Interface Guidelines. Grouped by theme, highest impact
first. These are the actionable items behind the open questions above.

### Accessibility (highest priority)

- **No visible focus states anywhere.** `global.css` strips button borders and never adds
  a `:focus-visible` ring, so keyboard users get no focus indicator on buttons, inputs,
  chips, the segmented toggles, or links. This is the single biggest a11y gap.
- **The settlement modal is not an accessible dialog.** It lacks `role="dialog"` and
  `aria-modal="true"`, does not trap focus, has no Escape to close, and does not restore
  focus on close. The spinner is a silent loading state (needs `role="status"` and a
  label), and the staged steps should announce via `aria-live`.
- **Live updates are not announced.** The LiveStatStrip values and the Toasts both change
  asynchronously with no `aria-live` region, so a screen reader never hears a goal land or
  a bet confirm. Toasts need `role="status"` plus `aria-live="polite"`.
- **No real heading structure.** There is no `<h1>` (the wordmark is a `<div>`) and the
  "Markets" section label is a styled `<div>`, so the heading outline is empty.
- **Toggle state is not exposed.** The YES/NO bet toggle and the feed mode toggle are
  plain buttons with no `aria-pressed` (or radiogroup/tab roles).
- **Decorative elements are not hidden.** The pulsing dots and the success check should be
  `aria-hidden="true"`.

### Forms

- The amount input has no associated `<label>`, no `name`, no `aria-label`, and uses
  `type="number"` rather than `inputmode="decimal"`.
- The Place bet button is disabled on validation (amount exceeds balance), against the
  guideline to keep submit enabled until the request starts. This caused the "Insufficient
  balance" state before balances finished loading.

### Animation and motion

- None of the keyframe animations honor `prefers-reduced-motion: reduce`. Add a media
  query that disables or shortens them.

### Dark mode and native controls

- `<html>` has no `color-scheme: dark` and there is no `<meta name="theme-color">`, so
  native controls (the wallet `<select>` dropdown, scrollbars) render light.

### Touch and mobile

- No `touch-action: manipulation` or `-webkit-tap-highlight-color` on interactive
  elements; the modal lacks `overscroll-behavior: contain`. Combined with the desktop
  first layout (section 8, item 5), mobile needs real attention.

### Typography polish

- Loading and placeholder text uses "..." rather than the ellipsis character; headings
  could use `text-wrap: balance`; numerals already use `tabular-nums` (good).

### A suggested fix order

1. Add a global `:focus-visible` ring and a `prefers-reduced-motion` block (small CSS, big
   accessibility and polish win).
2. Make the settlement modal a proper dialog (role, aria-modal, focus trap, Escape, focus
   return), since it is the signature moment.
3. Add `aria-live` to toasts and the stat strip; add a real `<h1>` and section headings.
4. Fix the amount input (label, name, inputmode) and stop disabling submit on validation.
5. Add `color-scheme: dark`, `theme-color`, touch tokens, and the mobile layout.

## 10. Where to look in the code

- Tokens: `app/src/theme/tokens.css`
- All component styles: `app/src/theme/global.css`
- Components: `app/src/components/*`
- Screens and state: `app/src/App.tsx`, `app/src/state/*`
- The feed abstraction: `app/src/lib/txline/feed.ts` and the three implementations
- The settlement flow: `app/src/components/SettlementModal.tsx`
