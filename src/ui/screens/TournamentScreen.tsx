import type { DraftState } from '../../core/model';
import { selectTournamentStage } from '../../core/tournament';
import { ResultsGrid, type ResultsGridProps } from '../components/ResultsGrid';
import { StandingsTable } from '../components/StandingsTable';
import { TopBar, type TopBarProps } from '../components/TopBar';

import './TournamentScreen.css';

/**
 * The tournament surfaces — the round robin, the cut, the bracket and the recap.
 *
 * ## It branches and computes nothing
 *
 * `FeasibilityBar.tsx:6-16` is the shipped statement of the rule and it is not restated
 * here: the stage comes from `selectTournamentStage`, and every standing, pairing, seed
 * and count on the surfaces below comes from a selector in `src/core/`. If a surface here
 * seems to need this file to decide a rule, the selector is missing — add the selector.
 *
 * ## Why the tournament is a FIFTH `Screen` and not a mode inside the draft screen
 *
 * The same arithmetic the fourth member was argued on, one measurement further along, and
 * recorded in `app.tsx`'s `Screen` doc block too so nobody reverses it. `05-UI-SPEC`
 * §Layout Budget: the 8-player crosstable wants 204px columns, `.app-shell`'s 1200px cap
 * yields 114px, and `--results-col-min` is 188px. 114 cannot hold 188 and 204 can. That is
 * `02-UI-SPEC`'s 86px round cell forcing sprite-only board chips, applied to a table
 * instead of a chip — full-bleed is forced by measurement rather than chosen.
 *
 * ## The host arrives here because they chose to
 *
 * `screenForState` deliberately does not return this member, and the reason is written
 * beside that function. Routing on the fold would move the host off the per-player export
 * panels the instant the last pick landed. `CompletedDraft` offers the entry control
 * instead, and this screen offers the way back.
 *
 * ## The three regions below are a stated plan, not accreted markup
 *
 * This plan mounts the round robin's results grid. 05-11 mounts the standings, the
 * tiebreak override and the cut; 05-13 mounts the bracket; 05-14 mounts the recap. Each
 * lands inside the stage block it belongs to, so a later plan adds a child rather than
 * re-deciding the shell.
 */

export interface TournamentScreenProps {
  state: DraftState;
  /**
   * `TopBar`'s six props as one bag — `BanStageScreen`'s idiom and its reason.
   *
   * Export, import, undo and abandon are app-level concerns that predate this screen and
   * that it must not grow an opinion about. The bar is on this screen so that
   * `Undo last move` and `Download JSON` stay one click away from a recorded result,
   * exactly as they stay one click away from the last pick.
   */
  topBar: TopBarProps;
  /** Back to the draft screen, where the board and the export panels are. */
  onBackToDraft: () => void;
  /**
   * A live results-grid cell the host activated, by match id.
   *
   * The dialog it opens is mounted by `app.tsx` as a SIBLING of the read-only gate, on the
   * placement rule the three shipped dialogs already follow: `inert` applies to a whole
   * subtree, so a modal rendered inside the gate would render, trap focus and refuse every
   * click the moment another tab took the lock. The only route to this callback is a
   * control inside the gate, so a read-only tab still cannot record anything.
   */
  onSelectMatch: ResultsGridProps['onSelectMatch'];
}

/** Verbatim from `05-UI-SPEC` §Copywriting → Round robin. */
export const ROUND_ROBIN_HEADING = 'Round robin';

/** The one control off this screen. `CompletedDraft` owns the one onto it. */
export const BACK_TO_DRAFT = 'Back to the draft';

const TOURNAMENT_TITLE = 'Tournament';

export function TournamentScreen({
  state,
  topBar,
  onBackToDraft,
  onSelectMatch,
}: TournamentScreenProps) {
  const stage = selectTournamentStage(state);

  return (
    <>
      <div class="sticky-head">
        <TopBar {...topBar} />
      </div>

      <div class="tournament-screen">
        <div class="tournament-screen__head">
          <h1 class="tournament-screen__title">{TOURNAMENT_TITLE}</h1>

          <button type="button" class="tournament-screen__back" onClick={onBackToDraft}>
            {BACK_TO_DRAFT}
          </button>
        </div>

        {stage === 'roundRobin' && (
          <section class="tournament-screen__stage" aria-labelledby="tournament-round-robin">
            <h2 class="tournament-screen__stage-heading" id="tournament-round-robin">
              {ROUND_ROBIN_HEADING}
            </h2>

            <ResultsGrid state={state} onSelectMatch={onSelectMatch} />

            {/*
              Below the grid, separated by the stage block's own `--space-4` gap rather
              than by a margin either component declares. §Spacing Scale's rule, and the
              reason the shell owns it: a block added here inherits the rhythm without
              knowing what is above it.
            */}
            <StandingsTable state={state} />
          </section>
        )}

        {/*
          THE CROSSTABLE OUTLIVES THE CUT, and that is D-11 rather than a convenience.

          `05-UI-SPEC` §5's fourth primary-button row is `Record and void the bracket` — a
          correction to a round-robin result taken AFTER the cut — so those results have to
          stay correctable once the bracket exists. The grid is the only surface that offers
          them, and a stage that dropped it would make the harshest cascade in the phase
          unreachable while the dialog still carried the label for it.

          05-13 mounts the bracket beside this and 05-14 mounts the recap below it; neither
          replaces it.
        */}
        {stage === 'bracket' && (
          <section class="tournament-screen__stage" aria-labelledby="tournament-round-robin">
            <h2 class="tournament-screen__stage-heading" id="tournament-round-robin">
              {ROUND_ROBIN_HEADING}
            </h2>

            <ResultsGrid state={state} onSelectMatch={onSelectMatch} />
          </section>
        )}
      </div>
    </>
  );
}
