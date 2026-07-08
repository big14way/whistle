# Security notes

## The public faucet key is intentional

The public demo (https://big14way.github.io/whistle/) ships exactly one keypair,
`app/src/faucet.public.json`, pubkey `6nuFo7QAJAspQH62MXBP3Dwk7fmdCTEDwxx1vaMhvJCe`.
This is deliberate: it lets any visitor self fund mock USDC and bet from their own
wallet without the operator handing out anything.

Its only on chain power is minting the mock USDC token
(`AjUYguAuwip6sqs3SimPGv4QLLuuEs3nwmUraTYN6v9Q`), a worthless devnet test token used
only as the stake asset in the demo markets. Verified on chain:

- It is NOT the Whistle program upgrade authority (that is the deployer,
  `J9jU2xwpUDxys7N1i4iYnZBeus3W3WN1bWCTHLyiuRSX`).
- It is NOT a vault authority, market creator, or fixture authority in the program.
- The mock USDC mint has no freeze authority at all, so no token account freeze
  griefing is possible.
- Unlimited minting cannot steal other bettors' deposits: the parimutuel vault stays
  solvent and payouts are bounded by the amounts actually joined.

### Accepted low risks (worthless devnet only, reversible)

An adversarial review confirmed two capabilities beyond "mint worthless tokens", both
low severity because they only affect a worthless devnet demo:

1. The faucet holds a little devnet SOL to pay mint fees, which anyone with the key
   can drain. If drained, the Fund button stops paying fees until the key is
   re-airdropped (free).
2. Anyone with the key can reassign or revoke the mock mint authority
   (`SetAuthority`), which would brick minting. Recovery is deploying a fresh mock
   mint and updating `app/src/config.default.json`.

Neither risks any real value. The planned hardening (see the roadmap) is to replace
the exposed mint authority key with a program controlled faucet PDA, so minting is
permissionless but the raw authority is never exposed.

## Real secrets never ship

The deployer key, the demo wallet secret keys, the TxLINE guest tokens, and the paid
Alchemy RPC key are all gitignored, never committed, and never in git history. The
public bundle is built by `scripts/build-pages.sh`, which moves the local secret and
generated config files aside, builds with the public devnet RPC, and then greps the
built bundle for the actual RPC key and TxLINE token values and aborts the build if
either is present. So even a mistake cannot publish a real secret.
