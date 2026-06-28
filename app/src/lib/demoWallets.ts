// Load the three demo keypairs (Bettor A, Bettor B, Settler) from the generated
// file, mirrored into localStorage so a page refresh mid recording keeps the same
// funded accounts. All storage access is wrapped in try/catch.

import { Keypair } from "@solana/web3.js";
import { demoWalletSecrets } from "./config";

export type WalletRole = "bettorA" | "bettorB" | "settler";

export interface DemoWallet {
  role: WalletRole;
  label: string;
  keypair: Keypair;
}

const LABELS: Record<WalletRole, string> = {
  bettorA: "Bettor A",
  bettorB: "Bettor B",
  settler: "Settler",
};

const ROLES: WalletRole[] = ["bettorA", "bettorB", "settler"];

function readLs(key: string): number[] | null {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function writeLs(key: string, secret: number[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(secret));
  } catch {
    // ignore storage failures
  }
}

function getSecret(role: WalletRole): number[] | null {
  const key = `whistle:wallet:${role}`;
  const ls = readLs(key);
  if (ls) return ls;
  const fromConfig = demoWalletSecrets[role];
  if (fromConfig) {
    writeLs(key, fromConfig);
    return fromConfig;
  }
  return null;
}

export function loadDemoWallets(): DemoWallet[] {
  const out: DemoWallet[] = [];
  for (const role of ROLES) {
    const secret = getSecret(role);
    if (secret) {
      try {
        out.push({ role, label: LABELS[role], keypair: Keypair.fromSecretKey(Uint8Array.from(secret)) });
      } catch {
        // skip a corrupt entry
      }
    }
  }
  return out;
}
