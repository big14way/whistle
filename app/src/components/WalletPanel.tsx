// Shown only when a browser wallet is connected: its mock USDC balance, a Fund
// button (mints via the local mint authority, so it works on a local run), and a
// hint to bet from it. Renders nothing when no wallet is connected, so the demo is
// untouched.

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { fundWallet, getUsdcBalance } from "../lib/actions";
import { useToasts } from "./Toasts";

export function WalletPanel() {
  const { publicKey, connected } = useWallet();
  const { push } = useToasts();
  const [usdc, setUsdc] = useState<number | null>(null);
  const [funding, setFunding] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    try {
      setUsdc(await getUsdcBalance(publicKey));
    } catch {
      setUsdc(null);
    }
  }, [publicKey]);

  useEffect(() => {
    if (!connected) {
      setUsdc(null);
      return;
    }
    refresh().catch(() => undefined);
    const t = setInterval(() => refresh().catch(() => undefined), 5000);
    return () => clearInterval(t);
  }, [connected, refresh]);

  if (!connected || !publicKey) return null;

  const fund = async () => {
    setFunding(true);
    try {
      const sig = await fundWallet(publicKey, 100);
      push("ok", "Funded your wallet with 100 mock USDC", sig);
      await refresh();
    } catch (e) {
      push("err", (e as Error).message ?? "Fund failed (the mock mint authority is local only)");
    } finally {
      setFunding(false);
    }
  };

  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 8 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Your wallet
        </h2>
        <span className="mono muted" style={{ fontSize: 12 }}>
          {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
        </span>
      </div>
      <div className="between">
        <span className="mono" style={{ fontSize: 20 }}>
          {usdc == null ? "…" : usdc.toFixed(0)} <span className="muted" style={{ fontSize: 13 }}>USDC</span>
        </span>
        <button className="btn ghost sm" disabled={funding} onClick={fund}>
          {funding ? "Funding…" : "Fund 100"}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Bet from your own wallet: pick "My wallet" in the Wallet dropdown of any open market below.
      </p>
    </div>
  );
}
