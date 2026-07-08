import { useEffect, useMemo, useState } from "react";
import { ActivityFeed } from "./components/ActivityFeed";
import { AppShell } from "./components/AppShell";
import { FeedPanel } from "./components/FeedPanel";
import { FixtureHeader } from "./components/FixtureHeader";
import { LiveStatStrip } from "./components/LiveStatStrip";
import { MarketCard } from "./components/MarketCard";
import { MatchTimeline } from "./components/MatchTimeline";
import { PnlStrip } from "./components/PnlStrip";
import { SettlementModal } from "./components/SettlementModal";
import { appConfig, isSeeded } from "./lib/config";
import type { MarketView } from "./lib/market";
import { pruneReceiptsToFixture, type SettlementReceipt } from "./lib/receipt";
import { useDemoWallets } from "./state/useDemoWallets";
import { useMarkets } from "./state/useMarkets";
import { useMatch } from "./state/useMatch";

export function App() {
  const { wallets, balances, refresh: refreshWallets, fund } = useDemoWallets();
  const { markets, loading: marketsLoading, refresh: refreshMarkets } = useMarkets();
  const { mode, setMode, update, error, fallbackNote, events, receivedAt } = useMatch();
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [settling, setSettling] = useState<MarketView | null>(null);
  // Scope receipts to the current demo fixture and prune any from older fixtures
  // once, on first load, so the Settlement activity feed and the timeline never show
  // stale cross fixture entries. With no fixture configured we start empty.
  const [receipts, setReceipts] = useState<Record<string, SettlementReceipt>>(() =>
    appConfig.demoFixtureId != null
      ? pruneReceiptsToFixture(
          appConfig.demoFixtureId,
          appConfig.markets?.map((m) => m.address),
        )
      : {},
  );

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const settler = useMemo(() => wallets.find((w) => w.role === "settler"), [wallets]);
  const minute = update?.minute ?? 0;

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
          Feed error in {mode} mode: {error}. Hard refresh to retry, or switch the feed to Simulation, which runs
          fully offline.
        </div>
      )}
      {fallbackNote && mode === "simulation" && (
        <div className="banner" style={{ marginBottom: 16 }}>
          {fallbackNote}
        </div>
      )}
      {isSeeded && wallets.length === 0 && (
        <div className="banner" style={{ marginBottom: 16 }}>
          Read only deployment: the markets, pools, and settled outcomes below are live devnet accounts, but the
          demo wallets and TxLINE tokens stay local. Clone the repo and run <span className="mono">pnpm app</span>{" "}
          for the full bet and settle flow, or watch the demo video.
        </div>
      )}

      <FixtureHeader update={update} />
      <div style={{ height: 16 }} />
      <MatchTimeline markets={markets} minute={minute} receipts={receipts} />

      <div className="layout" style={{ marginTop: 24 }}>
        <div className="col">
          <h2 className="section-title" style={{ margin: 0 }}>
            Prop markets
          </h2>
          {markets.length === 0 ? (
            marketsLoading ? (
              <div className="skeleton-grid">
                <div className="skeleton-card" />
                <div className="skeleton-card" />
              </div>
            ) : (
              <div className="muted">
                No markets found for fixture #{appConfig.demoFixtureId ?? "?"}. Seed the demo to create them.
              </div>
            )
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
        </div>

        <div className="col">
          <FeedPanel mode={mode} update={update} events={events} receivedAt={receivedAt} />
          <LiveStatStrip update={update} />
          <PnlStrip markets={markets} />
          <div className="card">
            <h2 className="section-title" style={{ margin: "0 0 8px" }}>
              Settlement activity
            </h2>
            <ActivityFeed receipts={receipts} />
          </div>
        </div>
      </div>

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
