import { useState } from "react";
import type { DemoWallet } from "../lib/demoWallets";
import type { WalletBalances } from "../state/useDemoWallets";

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
      {wallets.map((w) => {
        const b = balances[w.role];
        return (
          <div key={w.role} className="wchip">
            <span className="wcol">
              <span className="name">{w.label}</span>
              <span className="bal mono">{b ? b.usdc.toFixed(0) : "…"} USDC</span>
            </span>
            <button
              className="wfund"
              title={`Fund ${w.label} with 100 mock USDC`}
              aria-label={`Fund ${w.label} with 100 mock USDC`}
              disabled={funding === w.role}
              onClick={() => fund(w.role)}
            >
              {funding === w.role ? "…" : "+"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
