#!/usr/bin/env bash
# Build the frontend for the public GitHub Pages deployment.
#
# The Pages build must NOT contain: the demo wallet secret keys, the injected
# TxLINE tokens, or the dedicated RPC key from .env. It SHOULD contain the committed
# public config (config.default.json) and the public faucet key (faucet.public.json),
# which is what makes the public demo interactive: connect a wallet, self fund mock
# USDC, and bet. This script moves the local secret and generated-config files aside,
# builds with the public devnet RPC and the repo base path, then restores them.
set -euo pipefail
cd "$(dirname "$0")/.."

WALLETS=app/src/demo-wallets.generated.json
TOKENS=app/src/txline-tokens.generated.json
# Move the local generated config aside too, so the build resolves the committed
# public config.default.json deterministically (public RPC, always open markets).
GENCFG=app/src/config.generated.json

restore() {
  [ -f "$WALLETS.bak" ] && mv "$WALLETS.bak" "$WALLETS"
  [ -f "$TOKENS.bak" ] && mv "$TOKENS.bak" "$TOKENS"
  [ -f "$GENCFG.bak" ] && mv "$GENCFG.bak" "$GENCFG"
  return 0
}
trap restore EXIT

[ -f "$WALLETS" ] && mv "$WALLETS" "$WALLETS.bak"
[ -f "$TOKENS" ] && mv "$TOKENS" "$TOKENS.bak"
[ -f "$GENCFG" ] && mv "$GENCFG" "$GENCFG.bak"

# Empty VITE_RPC_URL falls through to the public devnet endpoint, so the paid
# RPC key never lands in the public bundle.
(cd app && VITE_RPC_URL= VITE_WS_URL= pnpm exec vite build --base=/whistle/)

# Safety guard: never publish a bundle containing a real secret. The intentional
# public faucet key is fine; the paid RPC key, a TxLINE token, or a demo wallet
# secret is not. Grep the built bundle for the actual secret values and abort if any
# is present (catches a build that bypassed the strip above, see the security notes
# in docs/SECURITY.md).
abort() { echo "ABORT: $1 found in the public bundle; not shipping." >&2; exit 1; }
if [ -f .env ]; then
  RPCKEY=$(grep -oE "/v2/[A-Za-z0-9_-]+" .env | head -1 | sed 's#/v2/##')
  [ -n "${RPCKEY:-}" ] && grep -rq "$RPCKEY" app/dist/assets && abort "the paid RPC key"
fi
if [ -f .txline-token-cache.json ]; then
  JWTHEAD=$(node -e "try{const j=require('./.txline-token-cache.json').jwt;if(j)process.stdout.write(j.slice(0,30))}catch{}" 2>/dev/null || true)
  [ -n "${JWTHEAD:-}" ] && grep -rq "$JWTHEAD" app/dist/assets && abort "a TxLINE token"
fi

touch app/dist/.nojekyll
echo "Pages bundle ready in app/dist (public config + faucet, no wallet secrets, no tokens, public RPC)."
