import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { claimPayout, fetchPosition } from "../lib/actions";
import { claimFromWallet } from "../lib/walletActions";
import { decodeAnchorError } from "../lib/errors";
import type { DemoWallet } from "../lib/demoWallets";
import type { MarketView } from "../lib/market";
import { useToasts } from "./Toasts";

interface Pos {
  yes: number;
  no: number;
  claimed: boolean;
}

// A claimable actor: either a local demo keypair or the connected browser wallet.
// Both expose a label, its position, and a claim() that returns a tx signature.
interface Claimer {
  key: string;
  label: string;
  pos: Pos;
  claim: () => Promise<string>;
}

function claimable(market: MarketView, pos: Pos): number {
  if (pos.claimed) return 0;
  const pot = market.totalYes + market.totalNo;
  if (market.state === "voided") return pos.yes + pos.no;
  if (market.state === "settledYes") return pos.yes > 0 && market.totalYes > 0 ? (pos.yes * pot) / market.totalYes : 0;
  if (market.state === "settledNo") return pos.no > 0 && market.totalNo > 0 ? (pos.no * pot) / market.totalNo : 0;
  return 0;
}

function toPos(p: { yesAmount: { toString(): string }; noAmount: { toString(): string }; claimed: boolean }): Pos {
  return {
    yes: Number(p.yesAmount.toString()) / 1e6,
    no: Number(p.noAmount.toString()) / 1e6,
    claimed: p.claimed,
  };
}

export function ClaimPanel({
  market,
  wallets,
  onClaimed,
}: {
  market: MarketView;
  wallets: DemoWallet[];
  onClaimed: () => void;
}) {
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [pending, setPending] = useState<string | null>(null);
  const { push } = useToasts();
  const walletCtx = useWallet();
  const walletKey = walletCtx.publicKey?.toBase58() ?? null;

  const load = useCallback(async () => {
    const next: Record<string, Pos> = {};
    await Promise.all(
      wallets.map(async (w) => {
        try {
          const p = await fetchPosition(new PublicKey(market.address), w.keypair.publicKey);
          if (p) next[w.role] = toPos(p);
        } catch {
          // skip
        }
      }),
    );
    // A connected browser wallet (Phantom and friends) reads the same way, keyed
    // under "wallet" so a public visitor can claim winnings they bet from it.
    if (walletCtx.publicKey) {
      try {
        const p = await fetchPosition(new PublicKey(market.address), walletCtx.publicKey);
        if (p) next.wallet = toPos(p);
      } catch {
        // skip
      }
    }
    setPositions(next);
  }, [market.address, wallets, walletKey]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load, market.state, market.totalYes, market.totalNo]);

  const doClaim = async (c: Claimer) => {
    setPending(c.key);
    try {
      const sig = await c.claim();
      const refund = market.state === "voided" ? "Refund" : "Payout";
      push("ok", `${refund} claimed by ${c.label}`, sig);
      await load();
      onClaimed();
    } catch (e) {
      push("err", decodeAnchorError(e));
    } finally {
      setPending(null);
    }
  };

  const demoClaimers: Claimer[] = wallets
    .map((w) => ({ w, pos: positions[w.role] }))
    .filter((x) => x.pos && claimable(market, x.pos) > 0)
    .map(({ w, pos }) => ({
      key: w.role,
      label: w.label,
      pos: pos!,
      claim: () => claimPayout(new PublicKey(market.address), w.keypair),
    }));

  const walletPos = positions.wallet;
  const walletClaimer: Claimer | null =
    walletCtx.connected && walletPos && claimable(market, walletPos) > 0
      ? {
          key: "wallet",
          label: "My wallet",
          pos: walletPos,
          claim: () => claimFromWallet(new PublicKey(market.address), walletCtx),
        }
      : null;

  const claimers = walletClaimer ? [...demoClaimers, walletClaimer] : demoClaimers;

  if (claimers.length === 0) {
    return <div className="muted" style={{ fontSize: 13 }}>No claimable positions.</div>;
  }

  const verb = market.state === "voided" ? "Refund available" : "Winnings available";

  return (
    <div className="stack">
      <div className="section-title" style={{ margin: 0 }}>
        {verb}
      </div>
      {claimers.map((c) => (
        <div className="between" key={c.key}>
          <span>
            {c.label}: <span className="mono">{claimable(market, c.pos).toFixed(2)} USDC</span>
          </span>
          <button className="btn yes sm" disabled={pending === c.key} onClick={() => doClaim(c)}>
            {pending === c.key ? "Claiming..." : "Claim"}
          </button>
        </div>
      ))}
    </div>
  );
}
