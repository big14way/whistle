import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { claimPayout, fetchPosition } from "../lib/actions";
import { decodeAnchorError } from "../lib/errors";
import type { DemoWallet } from "../lib/demoWallets";
import type { MarketView } from "../lib/market";
import { useToasts } from "./Toasts";

interface Pos {
  yes: number;
  no: number;
  claimed: boolean;
}

function claimable(market: MarketView, pos: Pos): number {
  if (pos.claimed) return 0;
  const pot = market.totalYes + market.totalNo;
  if (market.state === "voided") return pos.yes + pos.no;
  if (market.state === "settledYes") return pos.yes > 0 && market.totalYes > 0 ? (pos.yes * pot) / market.totalYes : 0;
  if (market.state === "settledNo") return pos.no > 0 && market.totalNo > 0 ? (pos.no * pot) / market.totalNo : 0;
  return 0;
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

  const load = useCallback(async () => {
    const next: Record<string, Pos> = {};
    await Promise.all(
      wallets.map(async (w) => {
        try {
          const p = await fetchPosition(new PublicKey(market.address), w.keypair.publicKey);
          if (p) {
            next[w.role] = {
              yes: Number(p.yesAmount.toString()) / 1e6,
              no: Number(p.noAmount.toString()) / 1e6,
              claimed: p.claimed,
            };
          }
        } catch {
          // skip
        }
      }),
    );
    setPositions(next);
  }, [market.address, wallets]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load, market.state, market.totalYes, market.totalNo]);

  const doClaim = async (w: DemoWallet) => {
    setPending(w.role);
    try {
      const sig = await claimPayout(new PublicKey(market.address), w.keypair);
      const refund = market.state === "voided" ? "Refund" : "Payout";
      push("ok", `${refund} claimed by ${w.label}`, sig);
      await load();
      onClaimed();
    } catch (e) {
      push("err", decodeAnchorError(e));
    } finally {
      setPending(null);
    }
  };

  const claimers = wallets
    .map((w) => ({ w, pos: positions[w.role] }))
    .filter((x) => x.pos && claimable(market, x.pos) > 0);

  if (claimers.length === 0) {
    return <div className="muted" style={{ fontSize: 13 }}>No claimable positions for the demo wallets.</div>;
  }

  const verb = market.state === "voided" ? "Refund available" : "Winnings available";

  return (
    <div className="stack">
      <div className="section-title" style={{ margin: 0 }}>
        {verb}
      </div>
      {claimers.map(({ w, pos }) => (
        <div className="between" key={w.role}>
          <span>
            {w.label}: <span className="mono">{claimable(market, pos!).toFixed(2)} USDC</span>
          </span>
          <button className="btn yes sm" disabled={pending === w.role} onClick={() => doClaim(w)}>
            {pending === w.role ? "Claiming..." : "Claim"}
          </button>
        </div>
      ))}
    </div>
  );
}
