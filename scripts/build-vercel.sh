#!/usr/bin/env bash
# Build the frontend for the Vercel deployment (https://whistlesol.vercel.app).
#
# Same strip-and-guard rules as build-pages.sh (no wallet secrets, no TxLINE
# tokens, no paid RPC key in the bundle), with two differences: the base path is
# / (Vercel serves at the domain root, Pages at /whistle/), and the deployable
# extras in app/vercel/ (vercel.json plus the TxLINE Edge proxy under api/) are
# copied into dist so the hosted site gets real Replay/Live feeds. The proxy
# reads TXLINE_API_TOKEN from the Vercel env — set once with:
#   vercel env add TXLINE_API_TOKEN production
# Deploy from app/dist with: vercel deploy --prod --yes
set -euo pipefail
cd "$(dirname "$0")/.."

WALLETS=app/src/demo-wallets.generated.json
TOKENS=app/src/txline-tokens.generated.json
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
(cd app && VITE_RPC_URL= VITE_WS_URL= pnpm exec vite build --base=/)

# Safety guard: never publish a bundle containing a real secret (see
# docs/SECURITY.md and the identical guard in build-pages.sh).
abort() { echo "ABORT: $1 found in the public bundle; not shipping." >&2; exit 1; }
if [ -f .env ]; then
  RPCKEY=$(grep -oE "/v2/[A-Za-z0-9_-]+" .env | head -1 | sed 's#/v2/##')
  [ -n "${RPCKEY:-}" ] && grep -rq "$RPCKEY" app/dist/assets && abort "the paid RPC key"
fi
if [ -f .txline-token-cache.json ]; then
  JWTHEAD=$(node -e "try{const j=require('./.txline-token-cache.json').jwt;if(j)process.stdout.write(j.slice(0,30))}catch{}" 2>/dev/null || true)
  [ -n "${JWTHEAD:-}" ] && grep -rq "$JWTHEAD" app/dist && abort "a TxLINE token"
  APIHEAD=$(node -e "try{const t=require('./.txline-token-cache.json').apiToken;if(t)process.stdout.write(t.slice(0,20))}catch{}" 2>/dev/null || true)
  [ -n "${APIHEAD:-}" ] && grep -rq "$APIHEAD" app/dist && abort "a TxLINE api token"
fi

# Deployable extras: the SPA/proxy rewrites and the TxLINE Edge function. The
# minimal package.json makes Vercel's zero-config treat the directory as a
# project with api/ functions rather than a bare static file listing.
cp app/vercel/vercel.json app/dist/vercel.json
mkdir -p app/dist/api
cp -R app/vercel/api/ app/dist/api/
printf '{\n  "name": "whistlesol-site",\n  "private": true\n}\n' > app/dist/package.json

echo "Vercel bundle ready in app/dist (base=/, public config + faucet, TxLINE proxy, no secrets)."
