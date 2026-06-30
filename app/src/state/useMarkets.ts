import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { appConfig } from "../lib/config";
import { fetchMarket } from "../lib/actions";
import { mapMarket, type MarketView } from "../lib/market";

export function useMarkets() {
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const seeds = appConfig.markets ?? [];
    const out: MarketView[] = [];
    await Promise.all(
      seeds.map(async (s) => {
        try {
          const acc = await fetchMarket(new PublicKey(s.address));
          if (acc) {
            const view = mapMarket(s.address, acc);
            if (s.settleMinute != null) view.settleMinute = s.settleMinute;
            out.push(view);
          }
        } catch {
          // skip a market that cannot be read
        }
      }),
    );
    out.sort((a, b) => a.marketId - b.marketId);
    setMarkets(out);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
    const t = setInterval(() => refresh().catch(() => undefined), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  return { markets, loading, refresh };
}
