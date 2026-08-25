import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { installBanShield } from '../../adapters/ban-shield';
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
  selectSubmittedPlayerIds,
} from '../../core/selectors';
import { BanBoard } from '../components/BanBoard';
import { BlindEntry } from '../components/BlindEntry';
import { BlindLocked } from '../components/BlindLocked';
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
   * The host's deliberate tap on `Reveal bans` — BAN-04, D-08.
   *
   * No payload. The reveal is a host act over the WHOLE fold rather than over anything this
   * screen picked, so the caller assembles the attributed lists from the document it already
   * holds and stamps the envelope; this screen reports the tap and nothing else. `dispatch`
   * lives in the store and no component may reach it (CLAUDE.md §Architecture).
   *
   * It is a prop rather than an effect because it must NEVER fire on its own. A reveal that
   * followed the last submission automatically would show every player's bans to the last
   * player to enter, while they are still standing at the screen alone.
   */
  onReveal: () => void;
  /**
   * A player's sealed allotment — BAN-04, D-06.
   *
   * The whole allotment in one call, because that is what a submission IS: `canApply`'s
   * `wrongBanCount` refuses anything that is not exactly `bansPerPlayer` long, so a
   * per-species prop would be a prop whose every individual call is refused. The caller
   * stamps the envelope and dispatches; `dispatch` lives in the store and no component may
   * reach it (CLAUDE.md §Architecture — one write path).
   *
   * SHOULD BE A STABLE IDENTITY, and this screen no longer depends on the caller for that —
   * see the latest-value ref below.
   */
  onSubmitBans: (playerId: string, monIds: string[]) => void;
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

/**
 * The board pane before the first ban — 04-UI-SPEC §6, and deliberately the shape Phase 2
 * set with `No picks yet. {firstPlayerName} picks first.`
 *
 * ONE sentence rather than the draft board's heading-plus-body pair. The draft board's
 * second line tells a host how to start (`Choose any Pokémon in the pool…`); here the pool
 * pane beside it is the whole screen and already says so, and a second instruction would be
 * telling the room something it is looking at.
 *
 * A composer rather than an inline template: JSX collapses whitespace between text lines,
 * and this string is a contract asserted on exact equality.
 */
function emptyBoardBody(firstPlayerName: string): string {
  return `No bans yet. ${firstPlayerName} bans first.`;
}

export function BanStageScreen({
  state,
  entries,
  spriteMeta,
  onPlaceBan,
  topBar,
  onReveal,
  onSubmitBans,
  storedPane,
  onPaneChange,
}: BanStageScreenProps) {
  const stage = selectBanStageState(state);

  /**
   * The focus target every exit from the entry surface lands on.
   *
   * It lives HERE rather than inside `BlindLocked` because the entry surface and the locked
   * state are siblings this screen swaps between: a ref owned by the component that unmounts
   * is a ref that is null exactly when focus needs somewhere to go. Declared before the
   * branches, because a hook may not be called conditionally.
   */
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);

  /*
    --- WHO IS CURRENTLY ENTERING, AND WHY THIS IS COMPONENT STATE ---

    `selectBanStageState` NEVER answers `'blindEntry'`, and that is the design rather than a
    gap: entry is a transient state this screen enters on a deliberate tap, and D-18
    requires the in-progress selection to die with the component rather than be derivable
    from anything stored. A `useState` that could "obviously" be lifted into the fold is
    exactly what a later contributor would lift, so this says it in place — lifting it would
    make the half-private state survive a restore, which is the one thing the whole shield
    exists to prevent.

    `null` when nobody is entering, which is the resting condition of the whole stage.
  */
  const [entering, setEntering] = useState<{ playerId: string; playerName: string } | null>(
    null,
  );

  /**
   * What just happened, handed down so the locked state can say it.
   *
   * `BlindLocked` speaks the lock sentence on an INCREASE in `entered` within its own
   * lifetime — and that increase never happens here, because the entry surface swaps the
   * locked state out and back, so the submission lands across a remount. Without these the
   * screen would be correct and completely silent about a submission the room is waiting on.
   *
   * They live in COMPONENT state on purpose, which is what keeps a page resume honest: a
   * reload starts with both `null`, so arriving at a stage with three entries already in it
   * says nothing rather than claiming three submissions just landed.
   *
   * At most one is ever set, because a departure from entry is either a submission or a
   * discard and never both.
   */
  const [discardedPlayerName, setDiscardedPlayerName] = useState<string | null>(null);
  const [lockedPlayerName, setLockedPlayerName] = useState<string | null>(null);

  /*
    The stable-callback read paths.

    `installBanShield`'s doc block requires `onLock` to be a stable identity or the effect
    re-registers on every render, and the transition it calls needs two values that change:
    who is entering, and the caller's submit handler. Reading both through refs is what lets
    `leaveEntry` below close over NOTHING and carry an empty dependency array, so its
    stability is a property of this component rather than a promise every caller has to
    keep. A caller passing an inline arrow cannot make the shield churn.
  */
  const enteringRef = useRef<{ playerId: string; playerName: string } | null>(null);
  const onSubmitBansRef = useRef(onSubmitBans);

  useEffect(() => {
    onSubmitBansRef.current = onSubmitBans;
  });

  /** Armed by every exit from entry, consumed by the focus handoff below. */
  const focusPrimaryRef = useRef(false);

  /**
   * ONE transition for all four exits — locking in, `Hide these bans`, a tab-hide and a
   * restore from the back/forward cache.
   *
   * `null` is a discard and an array is a submission. Writing four handlers would be
   * writing four things that can disagree about what just happened: the notice, the focus
   * move and the unmount would each be free to drift on one path and not the others, and
   * three of the four are paths nobody will ever exercise by hand.
   *
   * `enteringRef` rather than `entering`, so this closes over nothing and stays stable.
   */
  const leaveEntry = useCallback((submission: readonly string[] | null) => {
    const current = enteringRef.current;
    if (current === null) return;

    enteringRef.current = null;
    setEntering(null);
    focusPrimaryRef.current = true;

    if (submission === null) {
      setLockedPlayerName(null);
      setDiscardedPlayerName(current.playerName);
      return;
    }

    setDiscardedPlayerName(null);
    setLockedPlayerName(current.playerName);
    onSubmitBansRef.current(current.playerId, [...submission]);
  }, []);

  /** The shield's callback. Stable, because `leaveEntry` is. */
  const handleShieldLock = useCallback(() => {
    leaveEntry(null);
  }, [leaveEntry]);

  const handleDiscard = useCallback(() => {
    leaveEntry(null);
  }, [leaveEntry]);

  const handleLockIn = useCallback(
    (monIds: string[]) => {
      leaveEntry(monIds);
    },
    [leaveEntry],
  );

  const handleEnter = useCallback((playerId: string, playerName: string) => {
    enteringRef.current = { playerId, playerName };
    setEntering({ playerId, playerName });
    // The notice clears on the transition INTO entry, so the locked state a host returns to
    // is never still explaining a discard from two entries ago.
    setDiscardedPlayerName(null);
    setLockedPlayerName(null);
  }, []);

  /*
    The shield is registered while the entry surface is mounted and torn down with it —
    BAN-06, D-17, D-18. Scoped to that lifetime rather than to the screen's, because a
    permanently registered listener is one that will one day fire against a stale closure,
    and a restore that lands on the locked state should find nothing listening for it.
  */
  useEffect(() => {
    if (entering === null) return undefined;
    return installBanShield(handleShieldLock);
  }, [entering, handleShieldLock]);

  /**
   * Hand focus to the locked state's primary action after every exit from entry.
   *
   * ONE target for all four, because the control that was focused no longer exists in any of
   * them — leaving focus on a detached node or dropping it to `<body>` are the two failures
   * this closes. `useLayoutEffect` with no dependency array, always clearing its own flag,
   * exactly like `app.tsx`'s two handoffs: an armed handoff must never survive into a later,
   * unrelated render.
   */
  useLayoutEffect(() => {
    if (!focusPrimaryRef.current) return;
    focusPrimaryRef.current = false;

    primaryActionRef.current?.focus();
  });

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

    /*
      --- THE BOARD PANE, AND EVERY VALUE ON IT IS SOMEBODY ELSE'S ANSWER ---

      The columns. 1-based, matching `BanPlacement.pass` and the `Pass {n}` headers, and
      derived once so the header text and the cell position cannot come apart.
    */
    const passNumbers = Array.from(
      { length: state.config.bansPerPlayer },
      (_, index) => index + 1,
    );

    /*
      A LOOKUP, exactly like `reasonFor` above, and for the same reason: finding which
      placement sits at a coordinate is not a rule and not a derivation over the log. The
      serpentine already decided who bans when — `selectBanOrder` inside `selectBanTurn` —
      and the placement carries its own `pass`, so this reads the answer rather than
      recomputing it. `04-UI-SPEC` §Pure-core boundary: if this ever starts to look like a
      rule, the selector is missing and belongs in `src/core/`.

      Matched on `id` in both halves. Never on a name, and never by taking a name apart.

      An id the current roster no longer carries resolves to `null`, which renders as an
      empty cell. That is a real loss of fidelity for a document that outlived a regulation
      — the draft board renders the raw id in that case — and it is accepted here because
      `BanBoard`'s props carry resolved entries rather than ids, which is what keeps its
      blind arm incapable of holding a species (S2). Trading a rare display case for the
      secrecy guarantee is the right way round.
    */
    function bannedIn(playerId: string, pass: number): RosterEntry | null {
      const placement = state.banPlacements.find(
        (ban) => ban.playerId === playerId && ban.pass === pass,
      );
      if (placement === undefined) return null;

      return entries.find((entry) => entry.id === placement.monId) ?? null;
    }

    /* One row per player in STARTING order — `state.order`, which is what the serpentine
       itself is built from, so the board's rows and its columns agree by construction. */
    const banRows = state.order.map((playerId) => ({
      playerName: selectPlayerName(state, playerId) ?? playerId,
      cells: passNumbers.map((pass) => bannedIn(playerId, pass)),
    }));

    /*
      `selectBanTurn` names the next cell; this turns its two ids into two positions and the
      component renders them. Both coordinates are 0-based on the board.

      `null` when the order does not contain the player on the clock, which only a
      hand-edited document produces. An unmarked board is the honest answer there — a row
      index of -1 would mark nothing anyway, but silently, and this says so.
    */
    const nextRow = state.order.indexOf(turn.playerId);
    const nextCell = nextRow === -1 ? null : { row: nextRow, column: turn.pass - 1 };

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
            The board, or the sentence that stands in for it before there is one.

            NO SCROLL CONTAINER is added around either. `.pane__scroll` already scrolls the
            pane vertically, and the layout arithmetic says the board fits to eight passes at
            split and twenty-three at `board-full` (04-UI-SPEC §Layout Budget). A horizontal
            scroller here would hide exactly the regression DRFT-14 assertion 16 exists to
            catch, and the expand control is the remedy the contract actually names.

            NO CAP, NO WARNING AND NO GATE on a large `bansPerPlayer`, and that omission is
            deliberate rather than forgotten — 04-UI-SPEC §Deferred records it explicitly so
            nobody adds one reflexively. Layout is not satisfiability: the gate is the one
            authority on what is satisfiable, and a wide board is a preference problem the
            expand control answers. `MAX_BANS_PER_PLAYER` is the only bound, and it exists to
            bound an allocation rather than to hold an opinion about a screen.
          */
          board={
            state.banPlacements.length === 0 ? (
              /*
                `turn.playerId` IS the first banner while no ban has landed — the serpentine's
                first position is the one nobody has spent yet. Read from the selector rather
                than from `order[0]`, so the sentence and the turn banner above it cannot
                name two different people.
              */
              <p class="ban-stage__board-empty">
                {emptyBoardBody(selectPlayerName(state, turn.playerId) ?? turn.playerId)}
              </p>
            ) : (
              <BanBoard
                mode="public"
                rows={banRows}
                passes={state.config.bansPerPlayer}
                nextCell={nextCell}
                // The shipped D-21 rule, resolved by the composition root exactly as the
                // draft board's is: names at full width, sprites alone in split.
                showName={pane === 'board'}
                spriteMeta={spriteMeta}
              />
            )
          }
        />
      </>
    );
  }

  if (stage === 'blindLocked') {
    /*
      --- THE LOCKED STATE, AND EVERY VALUE ON IT IS A LOOKUP OVER SELECTOR OUTPUT ---

      `selectSubmittedPlayerIds` answers who has sealed an allotment, in ids and nothing
      else — the selector's own doc block says a surface cannot leak what it was never
      handed. Turning those ids into a per-row boolean and a display name is the only work
      done here, and neither is a rule. If any of it starts to look like one, the selector
      is missing and belongs in `src/core/` (04-UI-SPEC §Pure-core boundary).

      The order is `state.order` — the STARTING order, which is the order the room reads
      down and the order every other list in this phase uses.
    */
    const submitted = new Set(selectSubmittedPlayerIds(state));

    /*
      The seats carry the `playerId` as well, because the entry transition needs it and the
      row does not — `BlindLocked` is handed the two display fields below and nothing else.
      One list, mapped down, so "who is next" and "which row says `Not yet`" cannot come
      apart the way two independent lookups over the submissions could.
    */
    const seats = state.order.map((playerId) => ({
      playerId,
      playerName: selectPlayerName(state, playerId) ?? playerId,
      entered: submitted.has(playerId),
    }));

    const rows = seats.map((seat) => ({
      playerName: seat.playerName,
      entered: seat.entered,
    }));

    /*
      Whose turn it is, and `null` once nobody's is. Read off the SEATS rather than off the
      submissions, so "who is next" and "which row says `Not yet`" cannot disagree — they
      are the same list. A player who submits out of turn therefore does not become next
      again, which is the honest answer: the host types the bans and the order is a
      running order, not a lock.
    */
    const next = seats.find((seat) => !seat.entered) ?? null;

    /*
      --- THE ENTRY SURFACE IS CONDITIONALLY RENDERED AND NEVER HIDDEN ---

      04-RESEARCH calls this a CORRECTNESS RULE rather than a design choice, with two
      verified reasons, and both are why there is no `hidden` prop and no rule in the
      stylesheet that could take its place:

      1. A hidden component KEEPS ITS STATE. D-18's guarantee is that the in-progress
         selection dies on every exit, and a surface that is merely invisible has thrown
         nothing away — the next host to arrive would find the previous player's half-built
         allotment waiting behind whatever was covering it.
      2. `PoolGrid` schedules its filter announcements on a 300 ms debounce plus a
         zero-delay repeat timer, and BOTH are cancelled only on unmount. A
         hidden-but-mounted grid therefore leaves a pending message that fires AFTER the
         locked state has cleared the live region, which defeats assertion S7 through a
         channel no visual shield covers.

      Unmounting satisfies S9 for free as well: there is no change-over for a fade or a
      cross-dissolve to attach to, and 04-UI-SPEC states that prohibition as a security
      property rather than a taste — an effect of any duration leaves the roster and the
      selection readable for its whole length.
    */
    if (entering !== null) {
      return (
        <BlindEntry
          playerName={entering.playerName}
          required={state.config.bansPerPlayer}
          entries={entries}
          spriteMeta={spriteMeta}
          onLockIn={handleLockIn}
          onDiscard={handleDiscard}
        />
      );
    }

    return (
      <>
        {/*
          `.app-shell` and `TopBar` only — 04-UI-SPEC §3's blind row. NO panes are mounted
          below this line, so `storedPane` is not consulted and `onPaneChange` is not
          called: Amendment 2 requires the host's preference to survive the whole blind ban
          stage untouched, so the draft opens in the state they actually chose.

          `TopBar`'s own disclosure is safe here because `app.tsx` sources its names from
          `selectPublicBanIds`, which at blind before the reveal is the host's banlist only.
          That is Amendment 1, and it is decided there rather than here so this screen
          cannot become a second authority on it.
        */}
        <div class="sticky-head">
          <TopBar {...topBar} />
        </div>

        <BlindLocked
          rows={rows}
          nextPlayerName={next === null ? null : next.playerName}
          entered={submitted.size}
          total={state.order.length}
          /*
            ONE string serving the three discard paths — the panic control, a tab-hide and a
            restore from the back/forward cache. `null` renders no notice at all, which is
            what a host sees on every entry that was not interrupted, and it is what a fresh
            page load sees because this screen's memory of the discard does not survive one.
          */
          discardedPlayerName={discardedPlayerName}
          lockedPlayerName={lockedPlayerName}
          /*
            `next` is non-null on every render that reaches this prop — the button only
            calls `onEnter` while it is showing `Enter {name}'s bans`, which is the
            `complete === false` arm, and `complete` is `nextPlayerName === null`. The guard
            is here rather than as an assertion because the compiler cannot see that
            invariant across the component boundary.
          */
          onEnter={() => {
            if (next === null) return;
            handleEnter(next.playerId, next.playerName);
          }}
          onReveal={onReveal}
          primaryActionRef={primaryActionRef}
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

    The remaining arms render nothing, and each is unreachable TODAY for a stated reason. A
    `null` that outlives its plan is invisible otherwise.

      'blindEntry'   BUILT, and it does not reach here. It is never returned by
                     `selectBanStageState` at all: entry is a transient state this screen
                     enters on a deliberate tap and holds in `entering` above, because D-18
                     requires the in-progress selection to die with the component rather
                     than be derivable from anything stored. The surface is mounted from
                     inside the `'blindLocked'` arm and unmounted on every exit from it.
      'reveal'       04-11. Reachable in snake the moment the last ban lands, and D-23
                     requires a separate `Start draft` tap there rather than the pool
                     appearing on its own.
      'notRunning'   not a ban stage at all. `app.tsx` routes to the draft screen instead,
                     so this arm is the one that should never render rather than the one
                     waiting on a plan.
  */
  return null;
}
