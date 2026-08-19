import { Fragment } from 'preact';
import { useEffect } from 'preact/hooks';

import type { DraftPhase } from '../../core/selectors';
import { announce } from './LiveRegion';

/** `selectSwapOrderSource`'s return, named so the prop and the selector cannot drift. */
type SwapOrderSource = 'lastRound' | 'startingOrder';

import './TurnBanner.css';

/**
 * Who is on the clock — the one piece of information a shared screen must never lose.
 *
 * The copy is verbatim from the UI-SPEC's copywriting table. Phase 1 wrote the round total
 * and the pick and team counts as literals and recorded why: the contract stated those
 * exact sentences, and nothing in that phase could produce a different one. Both halves of
 * that reasoning expire here — 02-UI-SPEC writes the rows as
 * `Round {r} of {rounds} — {playerName} picks` and
 * `Draft complete — {picks} picks, {teams} teams`, and a host now names four to eight
 * players — so all three numbers arrive as props.
 *
 * The banner is also mirrored into the polite live region, so the turn is announced and
 * not only shown. That mirroring is the reason the plain-text form is built first and the
 * markup second, rather than the announcement being reconstructed from the DOM.
 *
 * The draft screen has no accent-filled button anywhere, deliberately. Picking is the
 * action and the pool cells are the target; the accent here marks the on-the-clock player
 * and nothing else.
 */

function draftCompleteCopy(picks: number, teams: number): string {
  return `Draft complete — ${picks} picks, ${teams} teams`;
}

export interface TurnBannerProps {
  /** 1-based round, or null when no draft is in progress. */
  round: number | null;
  /** Rounds in the tournament — `config.rounds`, never a literal. */
  rounds: number;
  playerName: string | null;
  complete: boolean;
  /** Picks recorded so far. Read on completion. */
  picks: number;
  /** Teams in the tournament — one per player. Read on completion. */
  teams: number;
  /**
   * `selectPhase`'s answer. This component BRANCHES on it and never computes it (D-17).
   *
   * Only consulted while the draft is running: `complete` short-circuits ahead of it, which
   * is what keeps `Draft complete — {picks} picks, {teams} teams` on the one code path it
   * has always had.
   */
  phase: DraftPhase;
  /**
   * The resolved pick order as NAMES, in order — the phase line during picking (CARD-08).
   *
   * On screen for the whole of picking rather than in a panel that disappears, which is the
   * whole of what CARD-08 asks for: the order has to still be readable at the fourth pick,
   * not only at the first.
   */
  pickOrder: readonly string[];
  /**
   * Can two players play the same value at all — `players > rounds` (CARD-05, D-22).
   *
   * Derived by the caller from config, because that is where config is read. With
   * `players <= rounds` the no-repeat rule makes a tie impossible and CARD-05 scopes its
   * requirement to the case where it is not, so stating the tiebreak there would be a rule
   * that cannot fire taking up room on the one line a room reads from across it.
   */
  tiePossible: boolean;
  /**
   * The dedicated swap round in progress, or `null` when none is —
   * `selectCurrentSwapRound`'s answer.
   *
   * Read only while `phase` is `'swapRounds'`. Null there would mean the phase and the
   * clock disagree, which cannot happen: `selectPhase` returns `'swapRounds'` for exactly
   * the states in which a swap round is running.
   */
  swapRound: number | null;
  /** `config.swapRounds`, never a literal. Read on the swap-round line. */
  swapRounds: number;
  /** `selectSwapOrderSource`'s answer. This component branches on it; it never derives it. */
  swapOrderSource: SwapOrderSource;
  /**
   * A move that has just been recorded, announced AHEAD of the new turn — never rendered.
   *
   * One composed string rather than a second `announce`, for the reason `CLEARED_SUFFIX`
   * below is composed rather than announced separately: the live region is a single signal,
   * so two writes in one tick leave only the last. A card play and the turn change it causes
   * are committed in the same tick, so announcing them separately would silently drop one.
   */
  lastMove: string | null;
  /**
   * Did the pick that caused this turn change also clear active pool filters (D-35)?
   *
   * Extends the ANNOUNCEMENT and nothing else. The banner rendered on screen is untouched
   * in both cases — see the branch below for why.
   */
  filtersCleared: boolean;
}

/**
 * The suffix, and the reason it is conditional.
 *
 * Clearing the filters is silent visually — the pool repopulating is the sighted feedback
 * — so a screen-reader user needs to be told the set changed. Appending it
 * unconditionally would make the common announcement longer on every single turn for no
 * reason, which is why 02-UI-SPEC gives it its own row rather than folding it into the
 * turn string.
 */
const CLEARED_SUFFIX = '. Filters cleared.';

/**
 * The phase line during card play, and the clause that is not always true.
 *
 * The tie clause is appended to the SAME composed string rather than rendered as a second
 * sentence element, which is exactly the construction `CLEARED_SUFFIX` uses above: one
 * string means the visible line and any spoken form of it cannot come apart, and it means
 * the conditional half is a suffix on a value rather than a branch in markup.
 */
const LOWEST_FIRST = 'The lowest card picks first.';
const TIE_CLAUSE = ' Ties go to whoever played the value first.';

function cardPhaseCopy(tiePossible: boolean): string {
  return tiePossible ? `${LOWEST_FIRST}${TIE_CLAUSE}` : LOWEST_FIRST;
}

/**
 * The swap-round phase line, and why WHICH sentence renders is not this component's call.
 *
 * SWAP-04 asks for the swap order to be explicit. D-28 derives it by reversing the last
 * pick round's resolved order, and a document that has no such order — migrated from schema
 * 2, or imported — falls back to reversing the starting order instead. Both are
 * deterministic; what would not be explicit is a screen that said the same sentence over
 * two different sources.
 *
 * So the variant is chosen by `selectSwapOrderSource`, in the core, and arrives here as a
 * prop. Deriving it here from "is `rounds` resolved" would be a second authority on the
 * same question, free to name a source the order did not actually come from.
 */
function swapPhaseCopy(source: SwapOrderSource, rounds: number): string {
  return source === 'startingOrder'
    ? 'Swap order reverses the starting order.'
    : `Swap order reverses round ${rounds}.`;
}

function swapTurnCopy(swapRound: number, swapRounds: number, playerName: string): string {
  return `Swap round ${swapRound} of ${swapRounds} — ${playerName} swaps or passes`;
}

const PICK_ORDER_PREFIX = 'Pick order: ';
const PICK_ORDER_SEPARATOR = ' · ';

/**
 * `1 Ada · 2 Bo · 3 Cy` as position/name pairs.
 *
 * Segments rather than one finished string because 03-UI-SPEC §Colour puts positions in
 * `--color-text-muted` and names in `--color-text` — and because the order strip is
 * deliberately NOT accent-marked even though it names the player about to pick. The
 * on-the-clock signal is the banner's own accent and the board's `board__cell--next`
 * border; a third element in that reservation would dilute the one signal that must never
 * be missed.
 *
 * There is still only ONE construction: the rendered line's text content is these segments
 * joined, so a test asserting the whole sentence and the markup cannot disagree.
 */
function pickOrderSegments(names: readonly string[]): { position: number; name: string }[] {
  return names.map((name, index) => ({ position: index + 1, name }));
}

function turnCopy(phase: DraftPhase, round: number, rounds: number, playerName: string): string {
  return phase === 'cards'
    ? `Round ${round} of ${rounds} — ${playerName} plays a card`
    : `Round ${round} of ${rounds} — ${playerName} picks`;
}

export function TurnBanner({
  round,
  rounds,
  playerName,
  complete,
  picks,
  teams,
  filtersCleared,
  phase,
  pickOrder,
  tiePossible,
  swapRound,
  swapRounds,
  swapOrderSource,
  lastMove,
}: TurnBannerProps) {
  /*
    The turn line, in plain text and before any markup — the order this component has
    always built things in, because the live region is fed from the value rather than
    reconstructed from the DOM.

    `filtersCleared` is a picking-phase fact and stays scoped to that branch: a card play
    clears no pool filters, so appending it during the card phase would announce something
    that did not happen.
  */
  /*
    The swap-round line is worked out FIRST and separately, because it is the one headline
    that is not about a pick round: it counts swap rounds, not rounds, so it takes neither
    `round` nor `rounds` and cannot be folded into `turnCopy`'s ternary without one of them
    reaching a sentence it does not belong in.

    Null when the phase is anything else, so the expression below reads as "the swap line,
    or the ordinary one".
  */
  const swapLine =
    phase === 'swapRounds' && swapRound !== null && playerName !== null
      ? swapTurnCopy(swapRound, swapRounds, playerName)
      : null;

  const turnLine =
    complete === true
      ? draftCompleteCopy(picks, teams)
      : swapLine !== null
        ? swapLine
        : round === null || playerName === null
          ? null
          : phase === 'cards'
            ? turnCopy(phase, round, rounds, playerName)
            : `${turnCopy(phase, round, rounds, playerName)}${filtersCleared ? CLEARED_SUFFIX : ''}`;

  /*
    The move first, then the state it produced: `Ada plays 4. Round 1 of 6 — Bo plays a
    card`. One string, for the reason `lastMove`'s own doc block gives — `announce` writes a
    single signal, and the play and the turn change it causes are committed in the same tick.
  */
  const spoken =
    turnLine === null ? lastMove : lastMove === null ? turnLine : `${lastMove} ${turnLine}`;

  // Keyed on `[spoken]` and unchanged, which is the point: appending the suffix CHANGES
  // `spoken`, so it is already the trigger. It also means the suffix cannot be announced
  // without the turn it belongs to — the ordering guarantee this whole mechanism exists
  // for, and the reason the filter bar composes one string here instead of firing a
  // second `announce` of its own.
  useEffect(() => {
    if (spoken !== null) announce(spoken);
  }, [spoken]);

  // `turnLine`, not `spoken`. A `lastMove` with no turn to attach to is still worth
  // announcing — an undo back past the first card is exactly that — but there is no banner
  // to draw for it.
  if (turnLine === null) return null;

  /*
    The rendered banner deliberately carries NO suffix. The copywriting contract lists it
    under Live-region announcements and gives no Draft-screen row for it, so a visible
    line saying the filters went away would be copy this project has not written — and it
    would state something the host can already see, on the one element that must stay
    scannable from across a room.

    The phase line is a SIBLING of the banner rather than a clause inside it. The two say
    unrelated things — who is acting, and what rule the room is acting under — and the
    banner has to stay one scannable line at `--text-display`.
  */
  return (
    <>
      <p class="turn-banner">
        {complete ? (
          draftCompleteCopy(picks, teams)
        ) : swapLine !== null ? (
          <>
            Swap round {swapRound} of {swapRounds} —{' '}
            <span class="turn-banner__player">{playerName}</span> swaps or passes
          </>
        ) : phase === 'cards' ? (
          <>
            Round {round} of {rounds} —{' '}
            <span class="turn-banner__player">{playerName}</span> plays a card
          </>
        ) : (
          <>
            Round {round} of {rounds} —{' '}
            <span class="turn-banner__player">{playerName}</span> picks
          </>
        )}
      </p>

      {!complete && phase === 'cards' && (
        <p class="turn-banner__phase">{cardPhaseCopy(tiePossible)}</p>
      )}

      {/*
        Gated on `swapLine` rather than on the phase alone, so the phase line and the
        headline above it cannot appear without each other. A sentence naming the swap
        order, sitting under a banner still announcing a pick, would be the one failure
        this line exists to prevent.
      */}
      {!complete && swapLine !== null && (
        <p class="turn-banner__phase">{swapPhaseCopy(swapOrderSource, rounds)}</p>
      )}

      {!complete && phase === 'picking' && pickOrder.length > 0 && (
        <p class="turn-banner__phase">
          {PICK_ORDER_PREFIX}
          {pickOrderSegments(pickOrder).map((segment, index) => (
            <Fragment key={segment.name}>
              {index > 0 && PICK_ORDER_SEPARATOR}
              <span class="turn-banner__position">{segment.position}</span>{' '}
              {segment.name}
            </Fragment>
          ))}
        </p>
      )}
    </>
  );
}
