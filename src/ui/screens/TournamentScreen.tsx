import { useLayoutEffect, useRef, useState } from 'preact/hooks';

import { cutTaken, tiebreakOrdered } from '../../core/actions';
import type { DraftState } from '../../core/model';
import { selectBracket, selectTournamentStage } from '../../core/tournament';
import { dispatch } from '../../store';
import { BracketGrid } from '../components/BracketGrid';
import { BRACKET_HEADING_ID, CutControl } from '../components/CutControl';
import { FinishedNotice } from '../components/FinishedNotice';
import {
  BACK_TO_BRACKET,
  RECAP_ACTION_ID,
  RecapList,
  VIEW_RECAP,
  type RecapAccess,
} from '../components/RecapList';
import { ResultsGrid, type ResultsGridProps } from '../components/ResultsGrid';
import { StandingsTable } from '../components/StandingsTable';
import { TiebreakOrderer } from '../components/TiebreakOrderer';
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
 *
 * ## Why the two round-robin write paths are wired HERE and not in `app.tsx`
 *
 * `onSelectMatch` goes up to `app.tsx` for one stated structural reason and one only:
 * `inert` applies to a whole subtree, so the record dialog has to be a SIBLING of the
 * read-only gate rather than a descendant of it. Nothing about the tiebreak override or
 * the cut needs to escape that gate — both are plain controls that should be unreachable
 * in a read-only tab, which is exactly what rendering them inside it achieves.
 *
 * So the two intents those controls report are turned into actions here, on
 * `ConfigScreen`'s precedent for a screen that calls into `src/store.ts` directly. The
 * alternative — threading two more callbacks through `app.tsx` — would put this screen's
 * internal wiring in the shell without buying anything, and `dispatch` remains the one
 * write path either way. The components themselves still own no dispatch.
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
  /**
   * The host pressed `Reopen this tournament` — D-17.
   *
   * Up to `app.tsx` for `onSelectMatch`'s structural reason exactly, and it is the second
   * and last of them: the confirm this raises is a MODAL, `inert` applies to a whole
   * subtree, and a dialog rendered inside the read-only gate would trap focus in a panel
   * that refuses its own dismiss the instant another tab took the lock. The two intents
   * 05-11 wired locally — the tiebreak override and the cut — stay local precisely because
   * neither opens one.
   *
   * A read-only tab still cannot reopen anything: the only route to this callback is the
   * notice's button, and the notice is inside the gate.
   */
  onRequestReopen: () => void;
  /**
   * What the recap needs, or `null` when this caller cannot offer one — PERS-09.
   *
   * ONE prop carrying all three, on `MonChip.swap`'s and `PoolGrid.roundRestriction`'s
   * stated precedent: "a control with no data" and "data with no control" are both
   * unrepresentable, so `View the draft recap` renders exactly when there is a recap behind
   * it. The three travel together because none of them is optional to the surface — the
   * record supplies the log, the roster supplies the species names, and the sprite metadata
   * supplies the two lines that carry a picture.
   *
   * REQUIRED rather than optional-with-a-default, unlike `MonChip.swap`, and the difference
   * is the caller count: this screen has exactly one production caller, and an optional prop
   * would let that caller forget it with no compile error and PERS-09 unreachable.
   */
  recap: RecapAccess | null;
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
  onRequestReopen,
  recap,
}: TournamentScreenProps) {
  const stage = selectTournamentStage(state);

  /**
   * Whether the recap has taken the main region — §11.
   *
   * COMPONENT STATE, and deliberately not an action. Which surface a host is reading is not
   * something that happened at the table: it belongs to nobody but this tab, it must not
   * travel in an exported file, and `Undo last move` must not walk it back. `screen` in
   * `app.tsx` holds the same kind of fact for the same reason.
   */
  const [showRecap, setShowRecap] = useState(false);

  /**
   * Hand focus to the bracket's heading once the cut has been taken.
   *
   * Armed by `Take the cut` and fired here rather than in the click handler, because the
   * heading does not exist yet at the moment of the click — the stage is still the round
   * robin until the dispatched action has been folded and this screen has re-rendered.
   * `CutControl` cannot own this: it unmounts on its own success, and an effect scheduled
   * by a component that is being removed does not run.
   *
   * `useLayoutEffect` with no dependency array, always clearing its own flag, exactly like
   * the two handoffs in `app.tsx` — an armed handoff must never survive into a later,
   * unrelated render.
   *
   * §Interaction: `Take the cut` no longer exists once the cut is taken, so focus cannot
   * stay where it was and must not drop to `<body>`.
   *
   * The flag is armed by the host's act rather than by the dispatch's verdict, and that is
   * self-correcting rather than careless: if `canApply` had refused the cut, the stage would
   * not have flipped, the bracket heading would not be in the document, and `?.focus()`
   * would do nothing — leaving focus exactly where the refusal left it. A `null` here is a
   * bug in the gate above, not a case this handoff has to second-guess.
   */
  const pendingBracketFocus = useRef(false);

  useLayoutEffect(() => {
    if (!pendingBracketFocus.current) return;
    pendingBracketFocus.current = false;

    document.getElementById(BRACKET_HEADING_ID)?.focus();
  });

  /**
   * Hand focus back to `View the draft recap` when the recap closes — §Interaction.
   *
   * The same armed-ref-then-layout-effect shape as the handoff above, and for the same
   * structural reason one rung along: the control does not exist at the moment of the click
   * that closes the recap, because the recap is what replaced it. A ref would be `null`; the
   * id is what lets the destination be addressed after the render that puts it back.
   *
   * §Interaction names it as "the control that was activated, which exists again", which is
   * exactly the case a ref cannot serve and an armed flag can.
   */
  const pendingRecapActionFocus = useRef(false);

  useLayoutEffect(() => {
    if (!pendingRecapActionFocus.current) return;
    pendingRecapActionFocus.current = false;

    /*
      WITH A FALLBACK, because the arming target can have gone while the recap was open.

      `View the draft recap` renders only when `finalRecorded`, and the top bar — including
      `Undo last move` and the document-level Ctrl+Z handler — stays mounted above the
      recap, deliberately, so that a host who spots a wrong result there can still unwind
      it. Undoing the final while the recap is on screen makes `finalRecorded` false, and
      then `Back to the bracket` armed this handoff at an element that no longer exists and
      focus fell to `<body>` — the exact failure `RECAP_ACTION_ID`'s own doc block exists to
      prevent (WR-10).

      The bracket heading is the surface the recap replaced, which is where the host now is.
    */
    const target =
      document.getElementById(RECAP_ACTION_ID) ?? document.getElementById(BRACKET_HEADING_ID);

    target?.focus();
  });

  /*
    THE RECAP REPLACES THE MAIN REGION AND NOTHING ELSE — §11, inheriting
    `CompletedDraft`'s posture verbatim.

    The top bar stays, so `Undo last move` and `Download JSON` are still one click away; and
    the head stays, so the screen keeps its title and the way back to the draft board. What
    goes is the stage blocks, which is the region the recap is an account of.

    A host who realises here that the last result was wrong must still be able to unwind it,
    and undo lives in the bar above. A recap that took the whole screen would make the
    correction it describes unreachable from the surface describing it.
  */
  const recapShowing = showRecap && recap !== null;

  /*
    The bracket's accent action, once the final is recorded — §Color reservation 2, which
    names this control by name and gives the bracket stage no other accent.

    `championId` is the gate rather than `selectTournamentLocked`, and the difference is a
    reopen: locked goes false the moment a host reopens the night, and the night still
    happened. `championId` is non-null from the recording of the final onwards, which is
    what the reservation actually says.
  */
  const bracket = selectBracket(state);
  const finalRecorded = bracket !== null && bracket.championId !== null;

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

        {recapShowing && recap !== null && (
          <RecapList
            doc={recap.doc}
            state={state}
            entryById={recap.entryById}
            spriteMeta={recap.spriteMeta}
            backLabel={BACK_TO_BRACKET}
            onBack={() => {
              setShowRecap(false);
              pendingRecapActionFocus.current = true;
            }}
          />
        )}

        {!recapShowing && stage === 'roundRobin' && (
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

            {/*
              Immediately below the standings, per §Color — the block it orders is the one
              the table has just shown reading `Tied — order these yourself` on every row,
              and a control that ordered players the host had to scroll away from would be
              asking about a table they can no longer see.

              It renders itself away once no block is unresolved, so there is no branch
              here: `selectStandings` is the one authority on whether there is anything to
              order, and asking it twice would be two answers to one question.
            */}
            <TiebreakOrderer
              state={state}
              onConfirm={(playerIds) => {
                dispatch(tiebreakOrdered(playerIds));
              }}
            />

            {/*
              Below the standings and the override, in the order the host works through
              them: read the table, settle anything the tool could not, then decide how much
              of it advances.

              The sequence is enforced by the gate rather than only implied by the layout,
              and the gate's actual rule is narrower than "the override is on screen": a cut
              is inert while any unresolved row sits INSIDE it (WR-02). A block below the
              chosen cut leaves the cut live, correctly — the bracket never seeds it. So the
              layout order matters for the case the gate deliberately allows.
            */}
            <CutControl
              state={state}
              onTakeCut={(seeds) => {
                dispatch(cutTaken(seeds));
                pendingBracketFocus.current = true;
              }}
            />
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
        {!recapShowing && stage === 'bracket' && (
          <>
            {/*
              ABOVE EVERYTHING ELSE ON THIS STAGE, and above rather than beside because it
              is the sentence that explains why both surfaces below it have stopped
              responding — the crosstable's cells and the bracket's cards go inert
              together, so a notice attached to only one of them would leave the other
              unexplained.

              It renders itself away when the tournament is not locked, so there is no
              branch here: `selectTournamentLocked` is the one authority on whether the
              night has finished, and asking it twice would be two answers to one question.
              That is `TiebreakOrderer`'s rule, applied to a fold instead of a tie.

              D-18 is what keeps this an ADDITION rather than a replacement. Recording the
              final adds this bar and names the champion on the card the room is already
              looking at; the bracket does not move, no summary screen takes its place, and
              the top bar never goes — so undo and the JSON download stay exactly where the
              host last saw them, which is the whole point on the one surface people reach
              for when something has gone wrong.
            */}
            <FinishedNotice state={state} onRequestReopen={onRequestReopen} />

            <section class="tournament-screen__stage" aria-labelledby="tournament-round-robin">
              <h2 class="tournament-screen__stage-heading" id="tournament-round-robin">
                {ROUND_ROBIN_HEADING}
              </h2>

              <ResultsGrid state={state} onSelectMatch={onSelectMatch} />
            </section>

            {/*
              BELOW the crosstable rather than in place of it, and below rather than above
              it so that taking the cut adds a region instead of moving one.

              D-18's posture one stage earlier: nothing the host was looking at is swapped
              out from under them. The round robin stays exactly where it was on the screen
              they were reading a moment ago, the bracket appears underneath, and focus is
              handed to its heading — which is the only reason the appearance is noticed at
              all.
            */}
            <BracketGrid state={state} onSelectMatch={onSelectMatch} />

            {/*
              THE STAGE'S ONE ACCENT ACTION, and only once the final is recorded — §Color
              reservation 2 names it there in those words. 05-13 left `Reopen this
              tournament` deliberately un-accented so this slot would still be free when it
              was built, which is why the notice above takes the plain bordered treatment.

              Below the bracket rather than above it, because it is what a host reaches for
              AFTER the last card resolves — and putting it above would have it appear
              between the finished sentence and the thing that sentence is about.
            */}
            {finalRecorded && recap !== null && (
              <button
                type="button"
                id={RECAP_ACTION_ID}
                class="tournament-screen__recap"
                onClick={() => setShowRecap(true)}
              >
                {VIEW_RECAP}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
