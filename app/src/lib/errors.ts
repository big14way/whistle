// Decode an Anchor or Solana error into a readable message for a toast.

import { AnchorError } from "@coral-xyz/anchor";

export function decodeAnchorError(e: unknown): string {
  try {
    if (e instanceof AnchorError) return e.error.errorMessage;
    const any = e as any;
    if (any?.error?.errorMessage) return any.error.errorMessage;
    const logs: string[] = any?.logs || any?.transactionLogs || any?.transactionMessage?.logs || [];
    for (const l of logs) {
      const m = l.match(/Error Message: (.+)$/);
      if (m) return m[1].trim();
    }
    const msg: string = any?.message ?? String(e);
    if (msg.includes("0x1") && msg.toLowerCase().includes("insufficient")) return "Insufficient funds";
    return msg.length > 220 ? msg.slice(0, 220) + "..." : msg;
  } catch {
    return String(e);
  }
}
