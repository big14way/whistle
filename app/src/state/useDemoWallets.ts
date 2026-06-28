import { useCallback, useEffect, useMemo, useState } from "react";
import { loadDemoWallets, type DemoWallet, type WalletRole } from "../lib/demoWallets";
import { fundWallet, getSolBalance, getUsdcBalance } from "../lib/actions";

export interface WalletBalances {
  sol: number;
  usdc: number;
}

export function useDemoWallets() {
  const wallets = useMemo<DemoWallet[]>(() => loadDemoWallets(), []);
  const [balances, setBalances] = useState<Record<string, WalletBalances>>({});

  const refresh = useCallback(async () => {
    const next: Record<string, WalletBalances> = {};
    await Promise.all(
      wallets.map(async (w) => {
        const [sol, usdc] = await Promise.all([
          getSolBalance(w.keypair.publicKey),
          getUsdcBalance(w.keypair.publicKey),
        ]);
        next[w.role] = { sol, usdc };
      }),
    );
    setBalances(next);
  }, [wallets]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const fund = useCallback(
    async (role: WalletRole, amount = 100) => {
      const w = wallets.find((x) => x.role === role);
      if (!w) return;
      await fundWallet(w.keypair.publicKey, amount);
      await refresh();
    },
    [wallets, refresh],
  );

  return { wallets, balances, refresh, fund };
}
