import type { DraftState, MatchResult } from '../../core/model';
import {
  liveResultFor,
  selectBracket,
  selectTournamentLocked,
  type BracketMatch,
} from '../../core/tournament';
import { BRACKET_HEADING_ID } from './CutControl';
import { MatchCard, type MatchSource } from './MatchCard';
import { metricLabel, type ResultsGridProps } from './ResultsGrid';

import './BracketGrid.css';

/**
 * The bracket — TOUR-03, `05-UI-SPEC` §9. One column per round, left to right.
 *
 * ## It renders `selectBracket` and derives nothing
 *
 * Participants, advancement, byes, the champion and the round labels are all on the object
 * 05-06 returns, and nothing about the bracket is stored anywhere. Recording a result and
 * seeing the winner appear in the next round is not this component moving a name across —
 * it is the next render asking the same question of a longer log and getting a different
 * answer. That is what makes D-10's void cascade sufficient: there is no second copy to
 * patch, so there is no second copy to forget to patch.
 *
 * ## THE ROUND LABEL COMES OFF THE MATCH, and a literal here would be a bug at one size
 *
 * `roundLabelFor` decides a label by HOW MANY MATCHES ARE IN THE ROUND, never by the round
 * index, because at eight seeds round one is the quarter-final and at sixteen it is the
 * round of sixteen. A label computed here from a column position would agree with the
 * selector at every bracket size but one, which is the worst kind of second authority: it
 * passes every test written against the size the author had in mind.
 *
 * ## Connectors are borders on pseudo-elements, and never a drawn layer
 *
 * §Design System's argument, which is the project's rejection of a bracket-rendering
 * library applied one level down. A drawn connector layer would have to measure where the
 * grid put each card and measure again on every resize, zoom and font-size change — a
 * second authority on card position, free to disagree with the first. A pseudo-element is
 * positioned by the same layout that positioned the card it hangs off, so it cannot.
 *
 * The gate forbidding markup injection covers the other route into the same failure.
 *
 * ## No roving tab-stop model here, and that is a decision rather than an omission
 *
 * `ResultsGrid` shares one tab stop across twenty-eight cells because twenty-eight
 * identical cells in a uniform block is what that pattern is for. A bracket at the sizes
 * this project targets is at most fifteen cards, unevenly distributed across three or four
 * columns, several of which are not focusable at all — a bye is not a control and a card
 * waiting on its feeders is inert. Sharing one stop across that set would hide the live
 * cards behind arrow keys nobody has been told about. Every playable card is a plain tab
 * stop.
 *
 * ## One record path
 *
 * A playable card reports the same payload a results-grid cell reports, and the caller
 * opens the same dialog. A bracket-specific record surface would be a second thing to keep
 * in step with D-10's relabelling, and the two would disagree the first time either moved.
 * The format it reports is the BRACKET's — D-08's per-stage split arriving where it
 * belongs, because a quick best-of-one round robin routinely feeds a best-of-three bracket.
 *
 * ## The heading is a focus target, and 05-11 is already aiming at it
 *
 * `Take the cut` does not survive its own success, so after the cut there is no control to
 * leave focus on and it would drop to the document body. `CutControl` exports the id and
 * `TournamentScreen` performs the handoff; this file mounts the element the two of them
 * name. The constant is imported rather than retyped for the reason it exists: a heading
 * whose id drifted from the one being looked up fails silently.
 */

/** Verbatim from `05-UI-SPEC` §Copywriting → Bracket. */
export const BRACKET_HEADING = 'Bracket';

export interface BracketGridProps {
  state: DraftState;
  /**
   * A playable card the host activated — the SAME prop the crosstable reports through,
   * read off its declaration rather than restated. See the doc block's record-path note.
   */
  onSelectMatch: ResultsGridProps['onSelectMatch'];
}

/**
 * The feeder a card's unknown slot is waiting on, named.
 *
 * `selectBracket` states the pairing this mirrors: `br:r:s` is fed by `br:(r-1):(2s-1)` in
 * its upper slot and `br:(r-1):2s` in its lower. It is restated here for ONE purpose — the
 * words in an empty slot — and never to decide who is in a match. If the two ever
 * disagreed, the visible symptom is a card that names the wrong feeder while showing the
 * right players, which is a wrong label rather than a wrong bracket.
 *
 * The alternative was parsing `br:r:s`, and ids are not parsed in this codebase.
 */
function sourceAt(round: readonly BracketMatch[], index: number): MatchSource | null {
  const feeder = round[index];
  if (feeder === undefined) return null;

  return { roundLabel: feeder.roundLabel, slot: index + 1 };
}

export function BracketGrid({ state, onSelectMatch }: BracketGridProps) {
  const bracket = selectBracket(state);

  // `null` before the cut and below two seeds. The screen only mounts this at the bracket
  // stage, so the branch is a type obligation rather than a case a host reaches.
  if (bracket === null) return null;

  const locked = selectTournamentLocked(state);

  // Tier 2 records no number, so there is no unit to name. `metricLabel` is the crosstable's
  // export rather than a second spelling of the same two words.
  const metricName =
    state.config.depth === 'draftBracketsAndLog' ? metricLabel(state.config.matchMetric) : null;

  function nameOf(playerId: string): string {
    return state.config.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  /** Core's answer, and `ResultsGrid.resultFor` states why it is asked there (IN-04). */
  function resultFor(matchId: string): MatchResult | null {
    return liveResultFor(state.matchResults, matchId);
  }

  return (
    <section class="bracket-region" aria-labelledby={BRACKET_HEADING_ID}>
      {/*
        `tabIndex={-1}` so the cut's handoff can put focus here, and NOT in the tab order:
        a heading that took a tab stop of its own would add one to every pass through the
        screen for the sake of one moment.
      */}
      <h2 class="bracket-region__heading" id={BRACKET_HEADING_ID} tabIndex={-1}>
        {BRACKET_HEADING}
      </h2>

      <div class="bracket">
        {bracket.rounds.map((round, roundIndex) => {
          const previous = roundIndex === 0 ? null : (bracket.rounds[roundIndex - 1] ?? null);

          return (
            <div class="bracket__column" key={round[0]?.matchId ?? String(roundIndex)}>
              <h3 class="bracket__round-header">{round[0]?.roundLabel ?? ''}</h3>

              <div class="bracket__round">
                {round.map((match, slotIndex) => (
                  <MatchCard
                    key={match.matchId}
                    match={match}
                    nameOf={nameOf}
                    upperSource={previous === null ? null : sourceAt(previous, slotIndex * 2)}
                    lowerSource={previous === null ? null : sourceAt(previous, slotIndex * 2 + 1)}
                    result={resultFor(match.matchId)}
                    // Identity, which `Bracket` promises: `final` IS the last round's only
                    // card rather than a copy of it.
                    isFinal={match === bracket.final}
                    format={state.config.bracketFormat}
                    metricName={metricName}
                    locked={locked}
                    onSelect={onSelectMatch}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
