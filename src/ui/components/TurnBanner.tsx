import { useEffect } from 'preact/hooks';

import { announce } from './LiveRegion';

import './TurnBanner.css';

/**
 * Who is on the clock — the one piece of information a shared screen must never lose.
 *
 * The copy is verbatim from the UI-SPEC's "Every string in Phase 1" table. The round
 * total and the pick and team counts are literal here rather than derived from config:
 * the contract states the sentences, and Phase 2 replaces the whole line when player
 * count becomes configurable. Deriving them now would produce a string the contract
 * does not contain, for a flexibility nothing yet uses.
 *
 * The banner is also mirrored into the polite live region, so the turn is announced and
 * not only shown. That mirroring is the reason the plain-text form is built first and
 * the markup second, rather than the announcement being reconstructed from the DOM.
 *
 * The draft screen has no accent-filled button anywhere, deliberately. Picking is the
 * action and the pool cells are the target; the accent here marks the on-the-clock
 * player and nothing else.
 */

const DRAFT_COMPLETE_COPY = 'Draft complete — 12 picks, 2 teams';

export interface TurnBannerProps {
  /** 1-based round, or null when no draft is in progress. */
  round: number | null;
  playerName: string | null;
  complete: boolean;
}

export function TurnBanner({ round, playerName, complete }: TurnBannerProps) {
  const spoken =
    complete === true
      ? DRAFT_COMPLETE_COPY
      : round === null || playerName === null
        ? null
        : `Round ${round} of 6 — ${playerName} picks`;

  useEffect(() => {
    if (spoken !== null) announce(spoken);
  }, [spoken]);

  if (spoken === null) return null;

  return (
    <p class="turn-banner">
      {complete ? (
        DRAFT_COMPLETE_COPY
      ) : (
        <>
          Round {round} of 6 — <span class="turn-banner__player">{playerName}</span> picks
        </>
      )}
    </p>
  );
}
