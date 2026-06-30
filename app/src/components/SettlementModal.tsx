import { useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { appConfig } from "../lib/config";
import { explorerTx } from "../lib/constants";
import { fetchMarket, settleMarket } from "../lib/actions";
import { decodeAnchorError } from "../lib/errors";
import type { DemoWallet } from "../lib/demoWallets";
import { type MarketView, predicateValue, restate } from "../lib/market";
import { saveReceipt, type SettlementReceipt } from "../lib/receipt";
import { TXORACLE_ID } from "../lib/program";
import type { MatchUpdate } from "../lib/txline/feed";
import { TxlineClient } from "../lib/txline/client";
import { deriveRootsPda, shapeSettleArgs } from "../lib/txline/validation";
import { getTxlineTokens } from "../lib/txlineTokens";

type Stage = "reading" | "fetching" | "verifying" | "done" | "error";

export function SettlementModal({
  market,
  update,
  settler,
  onClose,
  onSettled,
}: {
  market: MarketView;
  update: MatchUpdate | null;
  settler: DemoWallet;
  onClose: () => void;
  onSettled: (r: SettlementReceipt) => void;
}) {
  const [stage, setStage] = useState<Stage>("reading");
  const [error, setError] = useState<string>("");
  const [sig, setSig] = useState<string>("");
  const [outcome, setOutcome] = useState<string>("");
  const [settleSeconds, setSettleSeconds] = useState<number | null>(null);
  const started = useRef(false);

  const feedValue = predicateValue(market, update?.stats ?? {});

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        // 1. Read the match feed (display only).
        setStage("reading");
        await sleep(700);

        // 2. Fetch the cryptographic proof from TxLINE.
        setStage("fetching");
        const tokens = getTxlineTokens();
        const client = new TxlineClient({ apiBase: appConfig.apiBase, jwt: tokens.jwt, apiToken: tokens.apiToken });
        const fixtureId = appConfig.demoFixtureId ?? market.fixtureId;
        // Use the anchored demo seq when set; the live feed seq rarely matches the
        // exact sequence whose stat is final and anchored.
        const seq = appConfig.demoSeq ?? update?.seq ?? 0;
        const resp: any = await client.getStatValidation(
          fixtureId,
          seq,
          market.statAKey,
          market.hasStatB ? market.statBKey : undefined,
        );

        // Determine the winning side from the real proven values.
        const a = resp.statToProve.value as number;
        const b = (resp.statToProve2?.value as number) ?? 0;
        const value = market.hasStatB ? (market.op === "subtract" ? a - b : a + b) : a;
        const claimedWinner = market.comparison === "greaterThan" ? value > market.threshold : value < market.threshold;

        // 3. Verify on chain via validate_stat (CPI).
        setStage("verifying");
        const args = shapeSettleArgs(resp, claimedWinner);
        const rootsPda = deriveRootsPda(args.fixtureSummary.updateStats.minTimestamp, TXORACLE_ID);
        // Measure the wall clock from sending the settle to its confirmation.
        const t0 = Date.now();
        const txSig = await settleMarket(new PublicKey(market.address), args, rootsPda, settler.keypair);
        const secs = (Date.now() - t0) / 1000;
        setSettleSeconds(secs);
        setSig(txSig);

        // Read back the resolved state (it may Void if the winning pool was empty).
        const refreshed = await fetchMarket(new PublicKey(market.address));
        const state = refreshed
          ? Object.keys(refreshed.state as Record<string, unknown>)[0]
          : claimedWinner
            ? "settledYes"
            : "settledNo";
        const outcomeLabel =
          state === "settledYes" ? "Settled YES" : state === "settledNo" ? "Settled NO" : "Voided";
        setOutcome(outcomeLabel);

        const receipt: SettlementReceipt = {
          marketAddress: market.address,
          title: market.title,
          fixtureId,
          seq,
          statAKey: market.statAKey,
          valueA: a,
          hasStatB: market.hasStatB,
          statBKey: market.hasStatB ? market.statBKey : undefined,
          valueB: market.hasStatB ? b : undefined,
          threshold: market.threshold,
          comparison: market.comparison,
          op: market.hasStatB ? market.op : undefined,
          outcome: outcomeLabel,
          sig: txSig,
          ts: Date.now(),
          settleSeconds: secs,
          pot: market.totalYes + market.totalNo,
        };
        saveReceipt(receipt);
        setStage("done");
        onSettled(receipt);
      } catch (e) {
        setError(decodeAnchorError(e));
        setStage("error");
      }
    })();
  }, [market, settler, update, onSettled]);

  return (
    <div className="scrim" onClick={stage === "done" || stage === "error" ? onClose : undefined}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {stage !== "done" && stage !== "error" && (
          <>
            <h2 className="display">Settling on chain</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              {market.title}
            </p>
            <div className="steps">
              <Step
                state={stepState(stage, "reading")}
                label={`Reading match feed: ${restate(market)}${feedValue != null ? ` = ${feedValue}` : ""}`}
              />
              <Step state={stepState(stage, "fetching")} label="Fetching cryptographic proof from TxLINE" />
              <Step state={stepState(stage, "verifying")} label="Verifying on chain via validate_stat (CPI)" />
            </div>
          </>
        )}

        {stage === "done" && (
          <div style={{ textAlign: "center" }}>
            <div className="check-big">✓</div>
            <h2 className="display">Verified. Predicate proven on chain.</h2>
            <p style={{ marginTop: 8 }}>
              <span className={`badge ${outcome.includes("YES") ? "yes" : outcome.includes("NO") ? "no" : "voided"}`}>
                {outcome}
              </span>
            </p>
            {settleSeconds != null && (
              <div className="settle-time">
                <span className="big-time mono">{settleSeconds.toFixed(1)}s</span>
                <span className="muted"> verified on chain (one block)</span>
              </div>
            )}
            <p className="mono muted" style={{ fontSize: 12, wordBreak: "break-all", margin: "12px 0" }}>
              {sig}
            </p>
            <a className="btn primary" href={explorerTx(sig, appConfig.cluster)} target="_blank" rel="noreferrer">
              View inner instruction on Explorer
            </a>
            <div className="footnote">
              No dispute window. No resolver. The goal paid out the instant it was provable. Optimistic oracle
              markets settle this in hours. Whistle settled it in one block.
            </div>
            <button className="btn ghost block" style={{ marginTop: 12 }} onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {stage === "error" && (
          <div>
            <h2 className="display" style={{ color: "var(--no)" }}>
              Settlement could not complete
            </h2>
            <p className="muted" style={{ marginTop: 8 }}>
              {error}
            </p>
            <div className="footnote">
              The real settle needs a TxLINE proof: set a JWT and API token (Settings) and use a real fixture with
              anchored roots. The market state is unchanged, so this is safe to retry.
            </div>
            <button className="btn ghost block" style={{ marginTop: 12 }} onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ state, label }: { state: "pending" | "active" | "done"; label: string }) {
  return (
    <div className={`step ${state}`}>
      {state === "active" ? (
        <span className="spinner" />
      ) : (
        <span className="ic">{state === "done" ? "✓" : ""}</span>
      )}
      <span>{label}</span>
    </div>
  );
}

const ORDER: Stage[] = ["reading", "fetching", "verifying"];
function stepState(current: Stage, step: Stage): "pending" | "active" | "done" {
  if (current === "done") return "done";
  const ci = ORDER.indexOf(current);
  const si = ORDER.indexOf(step);
  if (ci === si) return "active";
  return ci > si ? "done" : "pending";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
