import type { ReactNode } from "react";
import { ClusterBadge } from "./ClusterBadge";
import { ConnectWalletButton } from "./ConnectWalletButton";
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
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <h1 className="wordmark" style={{ margin: 0 }}>
            <span className="dot" aria-hidden="true" />
            Whistle
          </h1>
          <span className="muted brand-sub" style={{ fontSize: 12, lineHeight: 1.2 }}>
            Prop bets settled on-chain in one block, proven by the TxLINE oracle
          </span>
        </div>
        <ClusterBadge />
        <div className="grow" />
        <WalletSwitcher wallets={wallets} balances={balances} onFund={onFund} />
        <FeedModeToggle mode={mode} onChange={onMode} />
        {/* Pasting a JWT via window.prompt is a local-dev affordance; the hosted
            site gets its feeds through the server-side proxy, so hide it there. */}
        {import.meta.env.DEV && (
          <button className="btn ghost sm" onClick={setTokens} title="Set TxLINE tokens for Replay, Live, and settle">
            {hasTxlineTokens() ? "Tokens set" : "Set tokens"}
          </button>
        )}
        <ConnectWalletButton />
      </header>
      <div className="shell">{children}</div>
    </>
  );
}
