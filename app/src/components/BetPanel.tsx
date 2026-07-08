import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { placeBet } from "../lib/actions";
import { placeBetFromWallet } from "../lib/walletActions";
import { decodeAnchorError } from "../lib/errors";
import type { DemoWallet } from "../lib/demoWallets";
import type { MarketView } from "../lib/market";
import { previewPayout } from "../lib/market";
import type { WalletBalances } from "../state/useDemoWallets";
import { useToasts } from "./Toasts";

const CHIPS = [5, 10, 25, 50];

// The demo wallet roles plus a sentinel for a connected browser wallet.
type Actor = DemoWallet["role"] | "wallet";

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
  const [role, setRole] = useState<Actor>("bettorA");
  const [pending, setPending] = useState(false);
  const { push } = useToasts();
  const walletCtx = useWallet();

  // Default wallet by side to make the demo flow obvious, but keep a connected
  // browser wallet selected if the user chose it.
  const pickSide = (s: "yes" | "no") => {
    setSide(s);
    setRole((prev) => (prev === "wallet" ? "wallet" : s === "yes" ? "bettorA" : "bettorB"));
  };

  const isWallet = role === "wallet";
  const demoWallet = wallets.find((w) => w.role === role);
  const bal = isWallet ? null : demoWallet ? balances[demoWallet.role]?.usdc ?? 0 : 0;
  const payout = previewPayout(market, side, amount);
  const disabled = pending || amount <= 0 || (isWallet ? !walletCtx.connected : !demoWallet);

  const submit = async () => {
    if (amount <= 0) return;
    setPending(true);
    try {
      if (isWallet) {
        if (!walletCtx.publicKey || !walletCtx.signTransaction) {
          push("err", "Connect a wallet first");
          return;
        }
        const sig = await placeBetFromWallet(new PublicKey(market.address), side === "yes", amount, walletCtx);
        push("ok", `Your wallet bet ${amount} USDC on ${side.toUpperCase()}`, sig);
        onPlaced();
        return;
      }
      if (!demoWallet) return;
      if (amount > (bal ?? 0)) {
        push("err", `${demoWallet.label} has only ${(bal ?? 0).toFixed(0)} USDC`);
        return;
      }
      const sig = await placeBet(new PublicKey(market.address), side === "yes", amount, demoWallet.keypair);
      push("ok", `${demoWallet.label} bet ${amount} USDC on ${side.toUpperCase()}`, sig);
      onPlaced();
    } catch (e) {
      push("err", decodeAnchorError(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="betpanel">
      <div className="segmented" role="group" aria-label="Bet side">
        <button className={side === "yes" ? "active yes" : ""} aria-pressed={side === "yes"} onClick={() => pickSide("yes")}>
          YES
        </button>
        <button className={side === "no" ? "active no" : ""} aria-pressed={side === "no"} onClick={() => pickSide("no")}>
          NO
        </button>
      </div>

      <div className="amount">
        <input
          id={`amt-${market.address}`}
          name="amount"
          type="number"
          inputMode="decimal"
          min={0}
          aria-label="Bet amount in USDC"
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
            onChange={(e) => setRole(e.target.value as Actor)}
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
            {walletCtx.connected && <option value="wallet">My wallet (Phantom)</option>}
          </select>
        </label>
        <span className="muted mono" style={{ fontSize: 12 }}>
          if {side.toUpperCase()} wins: {payout.toFixed(2)} USDC
        </span>
      </div>

      <button
        className={`btn block ${side === "yes" ? "yes" : "no"}`}
        disabled={disabled}
        title={!isWallet && !demoWallet ? "Demo wallets are local only; run the app locally to bet" : undefined}
        onClick={submit}
      >
        {pending ? "Placing…" : `Place ${side.toUpperCase()} bet`}
      </button>
    </div>
  );
}
