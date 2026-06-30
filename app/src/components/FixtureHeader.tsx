import { appConfig } from "../lib/config";
import { resolveTeam, teamFlag } from "../lib/teams";
import { PHASE_DISPLAY, VOID_PHASES } from "../lib/txline/statKeys";
import type { MatchUpdate } from "../lib/txline/feed";

const IN_PLAY = new Set([2, 4, 7, 9, 12]); // H1, H2, ET1, ET2, PE

export function FixtureHeader({ update }: { update: MatchUpdate | null }) {
  const homeTeam = resolveTeam(update?.p1Id);
  const awayTeam = resolveTeam(update?.p2Id);
  const home = homeTeam?.name ?? update?.homeName ?? "Home";
  const away = awayTeam?.name ?? update?.awayName ?? "Away";
  const homeFlag = teamFlag(homeTeam);
  const awayFlag = teamFlag(awayTeam);
  const hs = update?.homeScore ?? update?.stats?.[1] ?? 0;
  const as = update?.awayScore ?? update?.stats?.[2] ?? 0;
  const phase = update?.gameState ?? 1;
  const phaseLabel = PHASE_DISPLAY[phase] ?? "Not started";
  const live = IN_PLAY.has(phase);
  const voidish = VOID_PHASES.has(phase);

  return (
    <div className="card raised fixture">
      <div className="teams">
        <span className="team">
          {homeFlag && (
            <span className="flag" aria-hidden="true">
              {homeFlag}
            </span>
          )}
          {home}
        </span>
        <span className="score mono">
          {hs} : {as}
        </span>
        <span className="team">
          {awayFlag && (
            <span className="flag" aria-hidden="true">
              {awayFlag}
            </span>
          )}
          {away}
        </span>
      </div>
      <div className="grow" />
      <div className="row">
        <span className={`pill ${live ? "live" : voidish ? "locked" : ""}`}>
          {live && <span className="live-dot" aria-hidden="true" />}
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
