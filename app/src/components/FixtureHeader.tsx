import { appConfig } from "../lib/config";
import { PHASE_DISPLAY, VOID_PHASES } from "../lib/txline/statKeys";
import type { MatchUpdate } from "../lib/txline/feed";

const IN_PLAY = new Set([2, 4, 7, 9, 12]); // H1, H2, ET1, ET2, PE

export function FixtureHeader({ update }: { update: MatchUpdate | null }) {
  const home = update?.homeName ?? "Participant 1";
  const away = update?.awayName ?? "Participant 2";
  const hs = update?.homeScore ?? update?.stats?.[1] ?? 0;
  const as = update?.awayScore ?? update?.stats?.[2] ?? 0;
  const phase = update?.gameState ?? 1;
  const phaseLabel = PHASE_DISPLAY[phase] ?? "Not started";
  const live = IN_PLAY.has(phase);
  const voidish = VOID_PHASES.has(phase);

  return (
    <div className="card raised fixture">
      <div className="teams">
        <span>{home}</span>
        <span className="score mono">
          {hs} : {as}
        </span>
        <span>{away}</span>
      </div>
      <div className="grow" />
      <div className="row">
        <span className={`pill ${live ? "live" : voidish ? "locked" : ""}`}>
          {live && <span className="live-dot" />}
          {phaseLabel}
        </span>
        {update?.minute != null && <span className="pill mono">{update.minute}'</span>}
        <span className="pill mono" title="Fixture id">
          #{appConfig.demoFixtureId ?? "?"}
        </span>
      </div>
    </div>
  );
}
