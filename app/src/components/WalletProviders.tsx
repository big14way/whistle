// Solana wallet adapter context, wrapping the whole app so a real user can connect
// Phantom and bet from their own wallet. This is additive: the demo flow uses local
// demo keypairs and never touches this context, so nothing here can affect the demo.
// An empty adapter list is intentional, modern wallets (Phantom, Backpack, Solflare)
// register themselves via the Wallet Standard and appear in the modal automatically,
// which keeps the bundle lean.

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { appConfig } from "../lib/config";

export function WalletProviders({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={appConfig.rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
