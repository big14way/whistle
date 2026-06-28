import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/AppShell";
import { FixtureHeader } from "./components/FixtureHeader";
import { LiveStatStrip } from "./components/LiveStatStrip";
import { MarketCard } from "./components/MarketCard";
import { SettlementModal } from "./components/SettlementModal";
import { appConfig, isSeeded } from "./lib/config";
import type { MarketView } from "./lib/market";
import { loadReceipts, type SettlementReceipt } from "./lib/receipt";
import { useDemoWallets } from "./state/useDemoWallets";
import { useMarkets } from "./state/useMarkets";
import { useMatch } from "./state/useMatch";

export function App() {
  const { wallets, balances, refresh: refreshWallets, fund } = useDemoWallets();
  const { markets, refresh: refreshMarkets } = useMarkets();
  const { mode, setMode, update, error } = useMatch();
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [settling, setSettling] = useState<MarketView | null>(null);
  const [receipts, setReceipts] = useState<Record<string, SettlementReceipt>>(() => loadReceipts());

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const settler = useMemo(() => wallets.find((w) => w.role === "settler"), [wallets]);

  const onAction = () => {
    refreshMarkets().catch(() => undefined);
    refreshWallets().catch(() => undefined);
  };

  const onSettled = (r: SettlementReceipt) => {
    setReceipts((m) => ({ ...m, [r.marketAddress]: r }));
    onAction();
  };

  return (
    <AppShell mode={mode} onMode={setMode} wallets={wallets} balances={balances} onFund={fund}>
      {!isSeeded && (
        <div className="banner" style={{ marginBottom: 16 }}>
          This build is not seeded yet. Run <span className="mono">anchor deploy</span>, then{" "}
          <span className="mono">pnpm mock-usdc</span> and <span className="mono">pnpm seed</span>. The UI runs in
          Simulation mode meanwhile.
        </div>
      )}
      {error && mode !== "simulation" && (
        <div className="banner" style={{ marginBottom: 16 }}>
          Feed error in {mode} mode: {error}. Set TxLINE tokens, or switch to Simulation.
        </div>
      )}

      <FixtureHeader update={update} />
      <div style={{ height: 16 }} />
      <LiveStatStrip update={update} />

      <div className="section-title">Markets</div>
      {markets.length === 0 ? (
        <div className="muted">No markets found for fixture #{appConfig.demoFixtureId ?? "?"}. Seed the demo to create them.</div>
      ) : (
        <div className="cols">
          {markets.map((m) => (
            <MarketCard
              key={m.address}
              market={m}
              wallets={wallets}
              balances={balances}
              nowSec={nowSec}
              receipt={receipts[m.address]}
              onAction={onAction}
              onOpenSettle={setSettling}
            />
          ))}
        </div>
      )}

      {settling && settler && (
        <SettlementModal
          market={settling}
          update={update}
          settler={settler}
          onClose={() => setSettling(null)}
          onSettled={onSettled}
        />
      )}
    </AppShell>
  );
}
