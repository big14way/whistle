import { appConfig } from "../lib/config";

export function ClusterBadge() {
  const label = appConfig.cluster === "mainnet-beta" ? "Mainnet" : "Devnet";
  return (
    <span className="pill" title={appConfig.rpcUrl}>
      {label}
    </span>
  );
}
