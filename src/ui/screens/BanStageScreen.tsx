import type { SpriteMeta } from '../../adapters/roster-source';
import type { PaneState } from '../../adapters/view-prefs';
import type { DraftState } from '../../core/model';
import type { RosterEntry } from '../../core/roster/types';
import {
  selectBanStageState,
  selectBanTurn,
  selectPlayerName,
  selectPublicBanIds,
  selectStillToBanThisPass,
} from '../../core/selectors';
import { PoolGrid } from '../components/PoolGrid';
import { SplitPanes } from '../components/SplitPanes';
import { TopBar, type TopBarProps } from '../components/TopBar';
import { TurnBanner } from '../components/TurnBanner';

import './BanStageScreen.css';

/**
 * The ban stage — BAN-03, BAN-04, D-02, D-11.
 *
 * **This component branches on `selectBanStageState` and computes nothing.** That one
 * sentence is the whole contract. Whose turn it is, which pass, the serpentine order, who
 * has entered, which species are publicly banned, the collision set and the post-reveal
 * feasibility verdict are all selectors in `src/core/`. If a surface here seems to need the
 * UI to decide a rule, the selector is missing — add the selector in `src/core/` rather than
 * a memoised derivation in this file. A mechanical check reads that literally: this file
 * contains no memo hook and no array fold, and a plan-level grep asserts it stays that way.
 *
 * ## Why this is a fourth `Screen` and not a mode inside the draft screen
 *
 * Pitfall 4. After D-11's reorder `draft/started` fires BEFORE the ban stage, so `order` and
 * `schedule` are both populated while `poolIds` is still empty — and `selectPhase` answers
 * `'cards'` for exactly that shape. A draft-screen mode would therefore have to shield
 * `selectPhase`, `selectCardTurn`, the card panel, the board and the two hand strips
 * individually: five places that can each be got wrong, against one union member. The
 * comparison is recorded in `app.tsx`'s `Screen` doc block too, so nobody reverses it.
 *
 * ## The stage renders the whole roster, not a pool
 *
 * There is no pool yet and there must not be: D-23 makes the reveal what decides what the
 * draw may contain, so a pool drawn before the bans would be a pool drawn before the
 * constraints on it. The ban-mode `PoolGrid` already renders all 235 entries — that is what
 * the config screen's banlist grid does — so this mounts the same component over `entries`.
 */
export interface BanStageScreenProps {
  state: DraftState;
  entries: readonly RosterEntry[];
  spriteMeta: SpriteMeta;
  /**
   * A ban to record. The caller stamps the envelope and dispatches; this screen reads the
   * `playerId` and `pass` from `selectBanTurn` and hands them over rather than deciding
   * either. `dispatch` lives in the store and no component may reach it (CLAUDE.md
   * §Architecture — one write path).
   */
  onPlaceBan: (playerId: string, monId: string, pass: number) => void;
  /**
   * `TopBar`'s six props as one bag.
   *
   * Export, import, undo and abandon are app-level concerns that predate this screen and
   * that it must not grow an opinion about. Threading them individually would put six
   * fields on this contract that 04-06 through 04-11 would all have to carry through; one
   * bag keeps the screen's own contract the four fields above it.
   */
  topBar: TopBarProps;
  /**
   * The host's STORED pane preference, uncoerced. See below for why the coercion happens
   * here rather than in `app.tsx`.
   */
  storedPane: PaneState;
  onPaneChange: (pane: PaneState) => void;
}

/**
 * `04-UI-SPEC` Amendment 2, as two constants rather than two derivations.
 *
 * The snake ban stage offers `split` and `board` and NOT `pool`: the pool pane holds the
 * only control on the screen, so expanding the board away from it would leave a host with
 * nothing to click. Neither value is computed because neither varies — unlike the draft
 * screen, where availability tracks the phase, the ban stage has exactly one phase.
 */
const POOL_EXPANDABLE = false;
const BOARD_EXPANDABLE = true;

/**
 * Why the pool pane cannot be expanded here, in the shape `SplitPanes` renders inert
 * reasons. The constant EXCLUDES the `— ` separator, which the component supplies as an
 * `aria-hidden` span (WR-03).
 */
const PANE_REASON = 'The ban roster is the only control on this screen';

export function BanStageScreen({
  state,
  entries,
  spriteMeta,
  onPlaceBan,
  topBar,
  storedPane,
  onPaneChange,
}: BanStageScreenProps) {
  const stage = selectBanStageState(state);

  if (stage === 'snake') {
    const turn = selectBanTurn(state);

    // `selectBanStageState` returns `'snake'` only while a ban is on the clock, so this is
    // unreachable. It is a branch rather than a non-null assertion because the compiler
    // cannot see that invariant, and an assertion would turn a future change in the
    // selector into a crash on a shared screen instead of a blank pane.
    if (turn === null) return null;

    /*
      A stored `pool` is silently coerced to `split`, exactly as the draft screen coerces an
      unavailable preference rather than refusing to render. It happens HERE rather than in
      `app.tsx` because `app.tsx`'s coercion reads the DRAFT's availability, which tracks
      `selectPhase` — and `selectPhase` answers `'cards'` at the ban stage (Pitfall 4 again).
      Amendment 2 is this screen's rule, so this screen is where it is applied.

      A bare ternary rather than a memoised value: it is a view preference, not a tournament
      rule, and caching a comparison of two strings would cost more than it saves.
    */
    const pane: PaneState = storedPane === 'pool' ? 'split' : storedPane;

    return (
      <>
        <div class="sticky-head">
          <TopBar {...topBar} />

          <TurnBanner
            // The ban stage's own three, read from selectors and composed by the banner.
            banPass={turn.pass}
            banPasses={state.config.bansPerPlayer}
            stillToBan={selectStillToBanThisPass(state).map(
              (playerId) => selectPlayerName(state, playerId) ?? '',
            )}
            playerName={selectPlayerName(state, turn.playerId)}
            // Everything below is the draft's, and the banner ignores every one of them
            // while `banPass` is non-null. They are passed honestly rather than faked: the
            // round is genuinely unstarted, the draft is genuinely incomplete, and no card
            // or swap is in play. `phase` is deliberately NOT `selectPhase(state)` — that
            // answers `'cards'` here (Pitfall 4), and passing it would put a card-play
            // sentence one refactor away from the screen.
            round={null}
            rounds={state.config.rounds}
            complete={false}
            picks={0}
            teams={state.config.players.length}
            filtersCleared={false}
            phase="picking"
            pickOrder={[]}
            tiePossible={false}
            swapRound={null}
            swapRounds={state.config.swapRounds}
            swapOrderSource="startingOrder"
            lastMove={null}
          />
        </div>

        <SplitPanes
          pane={pane}
          onPaneChange={onPaneChange}
          poolExpandable={POOL_EXPANDABLE}
          boardExpandable={BOARD_EXPANDABLE}
          phaseReason={PANE_REASON}
          pool={
            <PoolGrid
              // The FULL roster. There is no pool to render — see the doc block.
              entries={entries}
              spriteMeta={spriteMeta}
              // `selectPublicBanIds` rather than `config.bans`: at snake every ban already
              // placed is public the instant it lands (BAN-03, Amendment 1), and the host's
              // own banlist is in there too. `selectAllBanIds` is the one that must never
              // reach a surface.
              bannedIds={new Set(selectPublicBanIds(state))}
              // Its own prefix, so the grid's cell ids cannot collide with any other grid's
              // — the config screen already mounts two at once for this reason.
              idPrefix="ban-stage"
              onPick={(entry) => {
                onPlaceBan(turn.playerId, entry.id, turn.pass);
              }}
            />
          }
          /*
            Empty until 04-08, which owns `BanBoard` and the snake board pane. Rendering
            already-banned cells inert with a stated reason is 04-06's. Until both land, a
            click on a species that is already banned is refused by `canApply`'s
            `banAlreadyPlaced` backstop — a real refusal rather than a crash, and a rough
            edge that is sequenced rather than missed.
          */
          board={null}
        />
      </>
    );
  }

  /*
    Every other arm renders nothing, and each is unreachable TODAY for a stated reason. A
    `null` that outlives its plan is invisible otherwise.

      'blindLocked'  04-09. Unreachable because `Blind` is still a disabled option in
                     `BAN_MODE_OPTIONS`, so no host can start a blind tournament — though an
                     imported document can sit here, which is why the arm exists at all.
      'blindEntry'   04-10. Never returned by `selectBanStageState` at all: entry is a
                     transient state a component enters on a deliberate tap, and D-18
                     requires the in-progress selection to die with the component rather
                     than be derivable from anything stored.
      'reveal'       04-11. Reachable in snake the moment the last ban lands, and D-23
                     requires a separate `Start draft` tap there rather than the pool
                     appearing on its own.
      'notRunning'   not a ban stage at all. `app.tsx` routes to the draft screen instead,
                     so this arm is the one that should never render rather than the one
                     waiting on a plan.
  */
  return null;
}
