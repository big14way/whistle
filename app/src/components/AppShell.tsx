import type { ReactNode } from "react";
import { ClusterBadge } from "./ClusterBadge";
import { FeedModeToggle } from "./FeedModeToggle";
import { WalletSwitcher } from "./WalletSwitcher";
import type { DemoWallet } from "../lib/demoWallets";
import type { FeedMode } from "../lib/txline/feed";
import type { WalletBalances } from "../state/useDemoWallets";
import { hasTxlineTokens, setTxlineTokens } from "../lib/txlineTokens";

export function AppShell({
  mode,
  onMode,
  wallets,
  balances,
  onFund,
  children,
}: {
  mode: FeedMode;
  onMode: (m: FeedMode) => void;
  wallets: DemoWallet[];
  balances: Record<string, WalletBalances>;
  onFund: (role: DemoWallet["role"]) => Promise<void>;
  children: ReactNode;
}) {
  const setTokens = () => {
    const jwt = window.prompt("TxLINE JWT (Authorization Bearer):", "") ?? "";
    const apiToken = window.prompt("TxLINE API token (X-Api-Token):", "") ?? "";
    if (jwt || apiToken) {
      setTxlineTokens(jwt || undefined, apiToken || undefined);
      window.location.reload();
    }
  };

  return (
    <>
      <header className="topbar">
        <div className="wordmark">
          <span className="dot" />
          Whistle
        </div>
        <ClusterBadge />
        <div className="grow" />
        <FeedModeToggle mode={mode} onChange={onMode} />
        <button className="btn ghost sm" onClick={setTokens} title="Set TxLINE tokens for Replay, Live, and settle">
          {hasTxlineTokens() ? "Tokens set" : "Set tokens"}
        </button>
      </header>
      <div className="shell">
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 0" }}>
          <WalletSwitcher wallets={wallets} balances={balances} onFund={onFund} />
        </div>
        {children}
      </div>
    </>
  );
}
