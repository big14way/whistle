// A connect button styled to the app's design system (instead of the default
// wallet-adapter button), using the wallet modal for the wallet picker.

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function ConnectWalletButton() {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    const b58 = publicKey.toBase58();
    return (
      <button
        className="btn ghost sm mono"
        onClick={() => disconnect()}
        title="Disconnect wallet"
        aria-label={`Disconnect wallet ${b58}`}
      >
        {b58.slice(0, 4)}…{b58.slice(-4)} <span aria-hidden="true">✕</span>
      </button>
    );
  }
  return (
    <button className="btn ghost sm" onClick={() => setVisible(true)}>
      Connect wallet
    </button>
  );
}
