#!/usr/bin/env bash
# Build the frontend for the public GitHub Pages deployment.
#
# The Pages build must NOT contain: the demo wallet secret keys, the injected
# TxLINE tokens, or the dedicated RPC key from .env. This script moves the two
# generated secret files aside, builds with the public devnet RPC and the repo
# base path, then restores them. The result in app/dist is a read only demo:
# real on chain markets over the public RPC, Simulation feed by default.
set -euo pipefail
cd "$(dirname "$0")/.."

WALLETS=app/src/demo-wallets.generated.json
TOKENS=app/src/txline-tokens.generated.json

restore() {
  [ -f "$WALLETS.bak" ] && mv "$WALLETS.bak" "$WALLETS"
  [ -f "$TOKENS.bak" ] && mv "$TOKENS.bak" "$TOKENS"
  return 0
}
trap restore EXIT

[ -f "$WALLETS" ] && mv "$WALLETS" "$WALLETS.bak"
[ -f "$TOKENS" ] && mv "$TOKENS" "$TOKENS.bak"

# Empty VITE_RPC_URL falls through to the public devnet endpoint, so the paid
# RPC key never lands in the public bundle.
(cd app && VITE_RPC_URL= VITE_WS_URL= pnpm exec vite build --base=/whistle/)

touch app/dist/.nojekyll
echo "Pages bundle ready in app/dist (no wallet secrets, no tokens, public RPC)."
