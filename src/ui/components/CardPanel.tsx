import { useLayoutEffect, useRef } from 'preact/hooks';

import { CardFace } from './CardFace';

import './CardPanel.css';

/**
 * The card-play step — the hand on the clock, what is already down, and who is still to
 * come (CARD-01, CARD-03, CARD-05).
 *
 * ## Where it lives, and what it does not touch
 *
 * It replaces the POOL pane's content and nothing else, exactly as `CompletedDraft` does.
 * The board pane stays where it was, so the schedule headers, every player's hand strip and
 * the pick history are all on screen while cards are played — which is what a room reading
 * one screen needs. The pool pane is the current-activity pane; this is the current activity.
 *
 * ## This component decides nothing
 *
 * The hand, the play rotation and the resolved order are RULES, so they arrive as props from
 * `selectHand`, `selectCardPlayOrder` and `selectCardsPlayedThisRound` and are never worked
 * out here. Nothing in this file imports the store, and it does not know which phase the
 * screen is in — `selectPhase` decides that and `app.tsx` branches on it (D-17). If this
 * file ever seems to need to know whether a card is legal, the selector is missing.
 *
 * ## The played row IS the tiebreak rule
 *
 * `played` arrives in PLAY order, and play order is the tiebreak (D-22), so the row shows the
 * rule rather than describing it. That is what CARD-05 asks for, and it is why this component
 * must not sort: a second ordering here would be a second opinion about a question
 * `resolvePickOrder` has already answered from `seq`.
 *
 * ## Playing a card does not confirm
 *
 * Phase 1's no-confirm posture holds (D-08) and undo is what makes it safe (D-20). A confirm
 * step per card would cost six clicks a round and make the draft slower without making it
 * safer.
 */

const PANEL_HEADING = 'Priority cards';

/**
 * Every string the panel renders, composed rather than written inline in JSX.
 *
 * JSX collapses whitespace between text lines, and each of these is asserted on exact
 * equality — the separator in `Still to play` is a middot with a space on each side, and
 * two of those three characters would not survive being typed into markup.
 */
function handGroupLabel(playerName: string): string {
  return `${playerName}'s cards`;
}

function emptyPlayedCopy(playerName: string): string {
  return `No cards are down yet. ${playerName} plays first this round.`;
}

function stillToPlayCopy(names: readonly string[]): string {
  return `Still to play: ${names.join(' · ')}`;
}

/** One card already on the table, with the player who put it there. */
export interface PlayedCard {
  /** Identity — the key, and never the name (CLAUDE.md §Identity). */
  playerId: string;
  /** Rendering only. */
  playerName: string;
  value: number;
}

export interface CardPanelProps {
  /** The player on the card-play clock. Rendering only. */
  playerName: string;
  /** That player's remaining values, ascending — `selectHand`'s answer, not recomputed. */
  hand: readonly number[];
  /**
   * What is already down this round, in PLAY order — `selectCardPlayOrder` and
   * `selectCardsPlayedThisRound` composed upstream. Never re-sorted here.
   */
  played: readonly PlayedCard[];
  /** The names still to play after the one on the clock, in rotation order. */
  stillToPlay: readonly string[];
  onPlay: (value: number) => void;
}

export function CardPanel({ playerName, hand, played, stillToPlay, onPlay }: CardPanelProps) {
  const handGroupRef = useRef<HTMLDivElement | null>(null);

  /**
   * The card the host actually activated — and only when the keyboard was genuinely on it.
   *
   * Recorded in the click handler, consumed and cleared by the effect below. The
   * `activeElement` test is `SplitPanes`' and is here for the same reason: a pointer user
   * who clicked without focusing would otherwise have focus yanked somewhere they never
   * put it.
   */
  const activatedCardRef = useRef<HTMLButtonElement | null>(null);

  /**
   * Hand focus to the first card of the NEW hand — and only when the card the host
   * activated has left the document.
   *
   * A played card leaves the hand and the panel re-renders for the next player, so the
   * button that was pressed is gone and focus falls to `<body>`. That is the correct
   * markup rather than a bug to route around, so the fix is to pass focus on.
   *
   * `isConnected` rather than keying the effect on `played.length`: the effect then states
   * its own precondition instead of encoding a map from prop changes to outcomes that a
   * later change would silently invalidate. It also means a play dispatched by anything
   * other than a click here — an import, an undo — moves no focus at all.
   *
   * No dependency array on purpose: it runs after every render and always clears its own
   * state, so a recorded card can never survive into a later, unrelated render.
   */
  useLayoutEffect(() => {
    const activated = activatedCardRef.current;
    activatedCardRef.current = null;

    if (activated === null) return;
    if (activated.isConnected) return;

    handGroupRef.current?.querySelector('button')?.focus();
  });

  /**
   * `document.activeElement` rather than the click event's target, which is what keeps
   * `CardFaceProps.onPlay` a plain `(value) => void` — the signature 03-09 and 03-10 consume.
   *
   * It also asks the question that actually matters. The handoff exists for a host whose
   * focus is about to be destroyed, so "was the keyboard on this control" is the
   * precondition, and `activeElement` answers it directly. A pointer user who clicked
   * without focusing records nothing and keeps their focus where they left it.
   */
  function handlePlay(value: number): void {
    const active = document.activeElement;
    activatedCardRef.current = active instanceof HTMLButtonElement ? active : null;

    onPlay(value);
  }

  return (
    <section class="card-panel">
      <h2 class="card-panel__heading">{PANEL_HEADING}</h2>

      <div
        class="card-panel__hand"
        role="group"
        aria-label={handGroupLabel(playerName)}
        ref={handGroupRef}
      >
        {hand.map((value) => (
          <CardFace key={value} value={value} state="playable" onPlay={handlePlay} />
        ))}
      </div>

      {played.length === 0 ? (
        <p class="card-panel__empty">{emptyPlayedCopy(playerName)}</p>
      ) : (
        <ul class="card-panel__played">
          {played.map((card) => (
            <li key={card.playerId} class="card-panel__played-item">
              <CardFace value={card.value} state="played" />
              <span class="card-panel__played-name">{card.playerName}</span>
            </li>
          ))}
        </ul>
      )}

      {stillToPlay.length > 0 && (
        <p class="card-panel__still">{stillToPlayCopy(stillToPlay)}</p>
      )}
    </section>
  );
}
