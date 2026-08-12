import { useEffect } from 'preact/hooks';

import { announce } from './LiveRegion';

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

export function TurnBanner({
  round,
  rounds,
  playerName,
  complete,
  picks,
  teams,
  filtersCleared,
}: TurnBannerProps) {
  const spoken =
    complete === true
      ? draftCompleteCopy(picks, teams)
      : round === null || playerName === null
        ? null
        : `Round ${round} of ${rounds} — ${playerName} picks${filtersCleared ? CLEARED_SUFFIX : ''}`;

  // Keyed on `[spoken]` and unchanged, which is the point: appending the suffix CHANGES
  // `spoken`, so it is already the trigger. It also means the suffix cannot be announced
  // without the turn it belongs to — the ordering guarantee this whole mechanism exists
  // for, and the reason the filter bar composes one string here instead of firing a
  // second `announce` of its own.
  useEffect(() => {
    if (spoken !== null) announce(spoken);
  }, [spoken]);

  if (spoken === null) return null;

  /*
    The rendered banner deliberately carries NO suffix. The copywriting contract lists it
    under Live-region announcements and gives no Draft-screen row for it, so a visible
    line saying the filters went away would be copy this project has not written — and it
    would state something the host can already see, on the one element that must stay
    scannable from across a room.
  */
  return (
    <p class="turn-banner">
      {complete ? (
        draftCompleteCopy(picks, teams)
      ) : (
        <>
          Round {round} of {rounds} —{' '}
          <span class="turn-banner__player">{playerName}</span> picks
        </>
      )}
    </p>
  );
}
