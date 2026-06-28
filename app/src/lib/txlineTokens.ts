// TxLINE auth tokens for the browser, kept in localStorage (gitignored secrets are
// never bundled). The demo defaults to the offline Simulation feed; Replay and Live
// SSE plus the real settle proof fetch use these tokens when present.

export interface BrowserTokens {
  jwt?: string;
  apiToken?: string;
}

export function getTxlineTokens(): BrowserTokens {
  try {
    return {
      jwt: localStorage.getItem("whistle:txline:jwt") || undefined,
      apiToken: localStorage.getItem("whistle:txline:apiToken") || undefined,
    };
  } catch {
    return {};
  }
}

export function setTxlineTokens(jwt?: string, apiToken?: string): void {
  try {
    if (jwt) localStorage.setItem("whistle:txline:jwt", jwt);
    if (apiToken) localStorage.setItem("whistle:txline:apiToken", apiToken);
  } catch {
    // ignore storage failures
  }
}

export function hasTxlineTokens(): boolean {
  const t = getTxlineTokens();
  return Boolean(t.jwt || t.apiToken);
}
