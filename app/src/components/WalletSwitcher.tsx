import { useEffect, useRef, useState } from "react";
import type { DemoWallet } from "../lib/demoWallets";
import type { WalletBalances } from "../state/useDemoWallets";

// Tween a balance from its previous value to the next over ~600ms, so a payout
// visibly counts up on camera when a winner claims. Returns undefined while the
// balance is still loading, snaps on the first real value and when
// prefers-reduced-motion is set, and always converges to the exact target so it can
// never render a wrong number.
function useCountUp(value: number | undefined, durationMs = 600): number | undefined {
  const [display, setDisplay] = useState<number | undefined>(value);
  const fromRef = useRef<number | undefined>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === undefined) {
      fromRef.current = undefined;
      setDisplay(undefined);
      return;
    }
    const from = fromRef.current;
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Snap on first real value or no motion; only animate a genuine change.
    if (from === undefined || reduce || from === value) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(from + (value - from) * eased);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
        setDisplay(value);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs]);

  return display;
}

function WalletChip({
  wallet,
  balance,
  isFunding,
  onFund,
}: {
  wallet: DemoWallet;
  balance: number | undefined;
  isFunding: boolean;
  onFund: () => void;
}) {
  const usdc = useCountUp(balance);
  return (
    <div className="wchip">
      <span className="wcol">
        <span className="name">{wallet.label}</span>
        <span className="bal mono">{usdc === undefined ? "…" : `${Math.round(usdc)} USDC`}</span>
      </span>
      <button
        className="wfund"
        title={`Fund ${wallet.label} with 100 mock USDC`}
        aria-label={`Fund ${wallet.label} with 100 mock USDC`}
        disabled={isFunding}
        onClick={onFund}
      >
        {isFunding ? "…" : "+"}
      </button>
    </div>
  );
}

export function WalletSwitcher({
  wallets,
  balances,
  onFund,
}: {
  wallets: DemoWallet[];
  balances: Record<string, WalletBalances>;
  onFund: (role: DemoWallet["role"]) => Promise<void>;
}) {
  const [funding, setFunding] = useState<string | null>(null);

  const fund = async (role: DemoWallet["role"]) => {
    setFunding(role);
    try {
      await onFund(role);
    } finally {
      setFunding(null);
    }
  };

  return (
    <div className="wallets">
      {wallets.map((w) => (
        <WalletChip
          key={w.role}
          wallet={w}
          balance={balances[w.role]?.usdc}
          isFunding={funding === w.role}
          onFund={() => fund(w.role)}
        />
      ))}
    </div>
  );
}
