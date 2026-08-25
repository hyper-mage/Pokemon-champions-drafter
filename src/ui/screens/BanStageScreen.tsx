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
import { PoolGrid, type BanInertState } from '../components/PoolGrid';
import { SplitPanes } from '../components/SplitPanes';
import { TopBar, type TopBarProps } from '../components/TopBar';
import { TurnBanner } from '../components/TurnBanner';
import { TypeaheadField } from '../components/TypeaheadField';

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

/**
 * The one visible line naming the struck-through signal — 04-UI-SPEC §6, verbatim.
 *
 * A SHAPE and not a colour, which is what makes it checkable by everyone in the room
 * (04-UI-SPEC §Colour is never the only signal). Per-cell visible reasons were considered
 * and rejected: this stage renders the whole roster, so one line beside each closed cell
 * would bury the count and the rule together. The per-cell answer lives in the accessible
 * name, which is where somebody who needs it will already be looking.
 */
const BAN_RULE_LINE = 'A struck-through Pokémon is already banned and cannot be banned again.';

/**
 * The two reasons a cell can be closed, as `PoolGrid` and `TypeaheadField` take them.
 *
 * Each EXCLUDES the `— ` separator. Both surfaces compose the whole accessible name
 * themselves, and WR-03's rule is that a separator inside one control's own name is part of
 * that one string — so the component that owns the control owns the join, and this file
 * would be a second place the dash could drift.
 *
 * TWO forms rather than one, because telling them apart is the point: a species the host
 * removed before anyone sat down is a different fact from one a player spent their turn on,
 * and a room that cannot tell them apart cannot tell how many bans are left.
 */
const HOST_BAN_REASON = 'banned by the host';

function playerBanReason(playerName: string): string {
  return `already banned by ${playerName}`;
}

/**
 * The by-name half of the ban surface — 04-UI-SPEC §6, "plus the `TypeaheadField`".
 *
 * Byte-identical to the config screen's ban field, and DELIBERATELY not imported from it.
 * `ConfigScreen` holds these as module constants of its own; a screen reaching into another
 * screen for a string would couple two surfaces that are free to diverge, and the copy
 * contract lists this label under two separate sections for exactly that reason. Both are
 * asserted in full by their own suites, so a drift is a test failure rather than a review.
 *
 * The id carries this screen's own prefix, like the grid's. Two combobox fields on one page
 * sharing a prefix would address each other's options — `TypeaheadField`'s own prop says so.
 */
const BAN_FIELD_LABEL = 'Ban a Pokémon by name';
const BAN_FIELD_PLACEHOLDER = 'Name';
const BAN_FIELD_ID = 'ban-stage-ban';

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

    /*
      ONE call, feeding BOTH surfaces, and the ids come from it and from nothing else.

      `selectCardOffer`'s doc block states the posture the whole phase is built on, and this
      is its clearest instance: "The constraint belongs upstream of the click, not in a
      rejection after it — a card the offer excludes renders inert with a reason, so the
      deadlock CARD-04 otherwise creates is never entered rather than refused on entry.
      `canApply`'s `cardNotPlayable` arm exists behind this as a backstop; if it ever fires
      for a real host, the offer and the rule have disagreed and that is a bug." Read
      `banAlreadyPlaced` for `cardNotPlayable` and it is this screen's contract unchanged.

      A component that assembled the public banlist itself would be a second authority on
      what the room may see, free to disagree at exactly the moment secrecy matters — which
      in blind mode is the difference between a sealed ban and a leaked one (T-04-25). The
      grid and the field are handed the same value rather than each asking, so the two
      cannot answer differently about which species are gone.
    */
    const closedIds = new Set(selectPublicBanIds(state));

    /*
      The reasons are COPY, and copy belongs to the screen: this is the only layer that
      knows a player's display name, and `src/core/` may not hold a rendered string.

      A LOOKUP, not a fold. This file computes nothing — every rule on it is a selector's
      answer — and finding which placement carries an id is neither a rule nor a derivation
      over the log; it is the shape `selectPlayerName` itself uses to turn an id into a
      name. It runs only for cells that are actually closed, because both surfaces call it
      only for ids already in the set above.

      The host's banlist is tested FIRST. A species can be on it and placed by a player only
      in a hand-edited document, and the host's ban is the one that was in force before the
      stage opened, so it is the honest answer there.
    */
    function reasonFor(monId: string): string {
      if (state.config.bans.includes(monId)) return HOST_BAN_REASON;

      const placement = state.banPlacements.find((ban) => ban.monId === monId);

      // Unreachable: the set above is exactly the union of the host's banlist and the
      // placements, so an id that reached here and matched neither does not exist. The host
      // form is the fallback because it is the one that claims nothing about any player.
      if (placement === undefined) return HOST_BAN_REASON;

      // A hand-edited document can carry a placement by a player the config does not list.
      // The raw id reads as "somebody who is not in this tournament", which is true; an
      // empty name would read as a rendering bug and tell the room nothing.
      return playerBanReason(selectPlayerName(state, placement.playerId) ?? placement.playerId);
    }

    const banInert: BanInertState = {
      ids: closedIds,
      reasonFor,
      ruleLine: BAN_RULE_LINE,
    };

    /*
      The same two values, in the shape the field takes. Built from `closedIds` and
      `reasonFor` rather than from a second call, which is what makes "the typeahead matches
      the grid" a property of the code instead of a thing to keep checking.

      RESULTS ARE NEVER FILTERED. A closed species stays in the list and says why — the
      field's own prop documents the failure mode, which is that a name the host typed and
      cannot find reads as a broken search rather than as an answer.
    */
    function optionState(entry: RosterEntry): { inert: true; reason: string } | null {
      return closedIds.has(entry.id) ? { inert: true, reason: reasonFor(entry.id) } : null;
    }

    /*
      One handler for both surfaces, so the grid and the field cannot record different
      things. ONE CLICK BANS AND THE TURN PASSES — no lock button and no confirm, exactly
      like a pick (04-UI-SPEC §6). D-08's no-confirm posture holds because the ban is on
      screen the instant it lands, and D-03's mandatory full undo is what makes reversing it
      cheap; a dialog here would put a modal between a player and every one of their turns.

      `turn` is narrowed to non-null by the guard at the top of this branch, and this closure
      is only ever called from inside it.
    */
    const place = (monId: string): void => {
      onPlaceBan(turn.playerId, monId, turn.pass);
    };

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
            <div class="ban-stage__pool">
              {/*
                The by-name half, ABOVE the grid, in the order the config screen already
                sets: a host who knows the name types it, a host who is browsing scrolls.
                Both surfaces are handed the same `closedIds` and the same `reasonFor`, so
                the answer a player gets from the field is the answer the grid is showing.
              */}
              <TypeaheadField
                id={BAN_FIELD_ID}
                label={BAN_FIELD_LABEL}
                placeholder={BAN_FIELD_PLACEHOLDER}
                candidates={entries}
                optionState={optionState}
                onSelect={(entry) => {
                  place(entry.id);
                }}
              />

              <PoolGrid
                // The FULL roster. There is no pool to render — see the doc block.
                entries={entries}
                spriteMeta={spriteMeta}
                // `selectPublicBanIds` rather than `config.bans`: at snake every ban already
                // placed is public the instant it lands (BAN-03, Amendment 1), and the host's
                // own banlist is in there too. `selectAllBanIds` is the one that must never
                // reach a surface.
                //
                // The SAME set the cells are closed from, deliberately. `bannedIds` is a
                // pressed state and `banInert` is a refusal; they coincide here because every
                // public ban at snake is also already spent, and `MonCard`'s own prop block
                // records that they do NOT coincide on 04-10's blind entry surface.
                bannedIds={closedIds}
                banInert={banInert}
                // Its own prefix, so the grid's cell ids cannot collide with any other grid's
                // — the config screen already mounts two at once for this reason.
                idPrefix="ban-stage"
                onPick={(entry) => {
                  place(entry.id);
                }}
              />
            </div>
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
    --- AMENDMENT 2's BLIND ROW, WHICH IS A THING THIS FILE DOES NOT DO ---

    Below this line the stage mounts NO panes, and the host's stored pane preference is
    therefore neither read nor written. `storedPane` is not consulted and `onPaneChange` is
    not called on any path that reaches here.

    That is a requirement rather than an accident, and it is written down because "we do not
    touch it" is invisible in code — a later reader sees only an unused prop and has every
    reason to wire it up. The preference must survive the whole blind ban stage untouched so
    the draft opens in the state the host actually chose; a value written here would outlive
    the stage and silently change a screen the host has not seen yet. 04-09 and 04-11 build
    the two blind screens and inherit this rule with them.

    The snake row is the coercion above, and it is the opposite shape: the preference IS read
    there, `pool` is silently forced to `split`, and nothing is written back — so the host
    gets their own choice again the moment a screen can offer it.

    ---

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
