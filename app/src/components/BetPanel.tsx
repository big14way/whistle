import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { placeBet } from "../lib/actions";
import { decodeAnchorError } from "../lib/errors";
import type { DemoWallet } from "../lib/demoWallets";
import type { MarketView } from "../lib/market";
import { previewPayout } from "../lib/market";
import type { WalletBalances } from "../state/useDemoWallets";
import { useToasts } from "./Toasts";

const CHIPS = [5, 10, 25, 50];

export function BetPanel({
  market,
  wallets,
  balances,
  onPlaced,
}: {
  market: MarketView;
  wallets: DemoWallet[];
  balances: Record<string, WalletBalances>;
  onPlaced: () => void;
}) {
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState(10);
  const [role, setRole] = useState<DemoWallet["role"]>("bettorA");
  const [pending, setPending] = useState(false);
  const { push } = useToasts();

  // Default wallet by side to make the demo flow obvious.
  const pickSide = (s: "yes" | "no") => {
    setSide(s);
    setRole(s === "yes" ? "bettorA" : "bettorB");
  };

  const wallet = wallets.find((w) => w.role === role);
  const bal = wallet ? balances[wallet.role]?.usdc ?? 0 : 0;
  const payout = previewPayout(market, side, amount);

  const submit = async () => {
    if (!wallet || amount <= 0) return;
    setPending(true);
    try {
      const sig = await placeBet(new PublicKey(market.address), side === "yes", amount, wallet.keypair);
      push("ok", `${wallet.label} bet ${amount} USDC on ${side.toUpperCase()}`, sig);
      onPlaced();
    } catch (e) {
      push("err", decodeAnchorError(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="betpanel">
      <div className="segmented">
        <button className={side === "yes" ? "active yes" : ""} onClick={() => pickSide("yes")}>
          YES
        </button>
        <button className={side === "no" ? "active no" : ""} onClick={() => pickSide("no")}>
          NO
        </button>
      </div>

      <div className="amount">
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
        />
        <span className="muted mono">USDC</span>
      </div>

      <div className="chips">
        {CHIPS.map((c) => (
          <button key={c} className="chip" onClick={() => setAmount(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="between">
        <label className="muted" style={{ fontSize: 13 }}>
          Wallet
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as DemoWallet["role"])}
            style={{
              marginLeft: 8,
              background: "var(--surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "4px 8px",
            }}
          >
            {wallets.map((w) => (
              <option key={w.role} value={w.role}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted mono" style={{ fontSize: 12 }}>
          if {side.toUpperCase()} wins: {payout.toFixed(2)} USDC
        </span>
      </div>

      <button
        className={`btn block ${side === "yes" ? "yes" : "no"}`}
        disabled={pending || amount <= 0 || amount > bal}
        onClick={submit}
      >
        {pending ? "Placing..." : amount > bal ? "Insufficient balance" : `Place ${side.toUpperCase()} bet`}
      </button>
    </div>
  );
}
