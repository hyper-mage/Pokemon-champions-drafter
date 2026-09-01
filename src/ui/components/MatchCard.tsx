import type { MatchResult, StageFormat } from '../../core/model';
import type { BracketMatch } from '../../core/tournament';
import { FINISHED_CELL_REASON, type ResultsGridProps } from './ResultsGrid';

import './MatchCard.css';

/**
 * One cell of the bracket — TOUR-03, `05-UI-SPEC` §9's five-row card-state table.
 *
 * ## NO ACCENT, IN ANY STATE, AND THE EXECUTOR MUST NOT REACH FOR ONE
 *
 * §Color reservation 1 forbids the accent on a playable match, an advancing seed, a
 * leading player and the champion — all four of which live in this file — and it states
 * the reason: every one of them is a STATE, and this project marks state with lightness,
 * boundary and words. The prohibition is written here rather than only in the contract
 * because a whole round of this bracket is playable at once, which is exactly the moment
 * somebody reaches for a highlight to say which card to press. There is no next match.
 *
 * ## It derives nothing
 *
 * Participants, advancement, the champion and the round label all arrive on the
 * {@link BracketMatch} `selectBracket` produced. This file decides which of five shapes to
 * draw and nothing else. If a card here seems to need to work out who is in it, the
 * bracket selector is the place that answer belongs.
 *
 * ## A BYE IS A RESOLVED CARD, never an empty slot
 *
 * §9's paragraph and its reason: an empty second slot would take the not-yet-played
 * treatment and read as a match somebody forgot to record. So the seeded player sits in
 * the first slot and the word carrying the signal sits in the second, and the card is not
 * a button and carries no inert ARIA — there is nothing to refuse, because there was never
 * a game. `BoardGrid.css`'s Mega round marker is the precedent: the fill is decorative and
 * the WORD does the work.
 *
 * ## Every state reserves the same chrome
 *
 * `BoardGrid.css:99-113`'s reserved-chrome rule, applied one component along: two slot rows
 * and a result row are present on every card in every state, empty rather than absent, so a
 * card that resolves does not change height and move every card under it in its column. A
 * bracket is read from across a room; a column that reflows when a result lands is a column
 * nobody can point at.
 *
 * The recorded FINAL is the one deliberate exception, and it is safe for a stated reason:
 * it is alone in the last column, so nothing renders under it to be moved. §9 spends
 * `--text-display` there on purpose — it is the single fact the room turned to look at.
 *
 * ## Inert, never disabled
 *
 * `FeasibilityBar`'s rule: `aria-disabled` without the native attribute, absent rather than
 * `"false"`, with an early return in the click handler doing the actual refusing. A
 * natively disabled button is not focusable, so the reason in its accessible name would be
 * unreachable by keyboard — and the reason is the entire point of refusing the click. Two
 * of the phase's inert consumers are here: a card whose participants are not known yet, and
 * every card at all once the tournament is finished.
 *
 * ## Where the accessible names come from
 *
 * §Copywriting → Bracket supplies the words on screen — the bye slot, the pending slot, the
 * waiting reason, the champion label — but it lists no accessible-name row, which
 * §Copywriting → Round robin does. So the composed names below reuse the round robin's
 * shapes verbatim (`versus`, `not played yet`, `beat`, the em-dash suffix) rather than
 * inventing a second vocabulary for the same three facts. The visible content is
 * `aria-hidden` and one hidden span carries the whole sentence, which is `ResultsGrid`'s
 * structure and its reason: the two can then never be confused for one another.
 */

/** Verbatim from `05-UI-SPEC` §Copywriting → Bracket. */
const BYE = 'Bye';
const CHAMPION_LABEL = 'Champion';

/** Where an unknown participant will come from — the FEEDER match, named. */
export interface MatchSource {
  /** The feeder's own `roundLabel`, off its `BracketMatch`. Never computed. */
  roundLabel: string;
  /** The feeder's 1-based slot within its round. */
  slot: number;
}

function pendingSlotText(source: MatchSource): string {
  return `Winner of ${source.roundLabel} ${source.slot}`;
}

function waitingReason(source: MatchSource): string {
  return `This match is waiting on ${source.roundLabel} ${source.slot}.`;
}

/** `2–1`, with an en dash — `ResultsGrid`'s rule, and the contract writes the dash. */
function gamesText(result: MatchResult): string {
  return `${result.winnerGames}–${result.loserGames}`;
}

/** The payload a record surface hands up. ONE declaration, read off the grid's own prop. */
type SelectedMatch = Parameters<ResultsGridProps['onSelectMatch']>[0];

interface Slot {
  text: string;
  /** `--text-body` rather than `--text-heading`: this is not a player's name. */
  pending: boolean;
}

function slotFor(
  playerId: string | null,
  source: MatchSource | null,
  nameOf: (playerId: string) => string,
): Slot {
  if (playerId !== null) return { text: nameOf(playerId), pending: false };
  if (source !== null) return { text: pendingSlotText(source), pending: true };

  // Unreachable: a first-round slot is either a real seed or a phantom, and a phantom makes
  // the card a bye. Kept total rather than thrown, because a card that threw would take the
  // whole bracket off the screen over one label.
  return { text: '', pending: true };
}

export interface MatchCardProps {
  match: BracketMatch;
  /** Display name for a player id — resolved by the caller, never by a lookup here. */
  nameOf: (playerId: string) => string;
  /** The feeders. `null` in round one, where a participant is never unknown. */
  upperSource: MatchSource | null;
  lowerSource: MatchSource | null;
  /** The standing result for this match id, or `null`. */
  result: MatchResult | null;
  /** The last card in the last round. Takes the champion treatment once recorded (D-18). */
  isFinal: boolean;
  /** The BRACKET's format (D-08's per-stage split), not the round robin's. */
  format: StageFormat;
  /** The metric's label at tier 3, or `null` at tier 2 where no number is recorded. */
  metricName: string | null;
  /** `selectTournamentLocked`. Every card goes inert with a stated reason (D-17). */
  locked: boolean;
  onSelect: (selected: SelectedMatch) => void;
}

export function MatchCard({
  match,
  nameOf,
  upperSource,
  lowerSource,
  result,
  isFinal,
  format,
  metricName,
  locked,
  onSelect,
}: MatchCardProps) {
  const showGames = format === 'bo3';

  // A bye carries its player on `upperId` — `BracketMatch`'s stated invariant, because the
  // recursion pairs seed `s` with `B+1-s` and `s` is always the smaller of the two.
  const byePlayerId = match.upperId ?? match.lowerId;

  if (match.isBye && byePlayerId !== null) {
    const name = nameOf(byePlayerId);

    return (
      // A DIV. Not a button, and carrying no inert ARIA: there is no game here to refuse,
      // and a control announcing itself as unavailable would say something untrue about a
      // seed that has already advanced.
      <div class="match-card match-card--bye">
        <span class="match-card__body" aria-hidden="true">
          <span class="match-card__slot">{name}</span>
          <span class="match-card__slot">{BYE}</span>
          <span class="match-card__result" />
        </span>

        <span class="visually-hidden">{`${name} — ${BYE}`}</span>
      </div>
    );
  }

  const upper = slotFor(match.upperId, upperSource, nameOf);
  const lower = slotFor(match.lowerId, lowerSource, nameOf);

  const unknown = match.upperId === null || match.lowerId === null;

  const waiting: string[] = [];
  if (match.upperId === null && upperSource !== null) waiting.push(waitingReason(upperSource));
  if (match.lowerId === null && lowerSource !== null) waiting.push(waitingReason(lowerSource));

  const inert = unknown || locked;
  const championName = isFinal && result !== null ? nameOf(result.winnerId) : null;

  /*
    The visible result line. Games and metric joined by the separator at a best-of-three
    tier-3 night; the metric alone at best-of-one tier 3; NOTHING at best-of-one tier 2,
    where there is no number to show and §9's own treatment — the fill and the winner's
    boundary — is what says the card is settled. The row is rendered either way, empty, per
    the reserved-chrome rule in the doc block.
  */
  const resultParts: string[] = [];
  if (result !== null && showGames) resultParts.push(gamesText(result));
  if (result !== null && metricName !== null) resultParts.push(String(result.metric));

  function accessibleName(): string {
    const finished = locked ? ` — ${FINISHED_CELL_REASON}` : '';

    if (result === null) {
      const pairing = `${upper.text} versus ${lower.text}`;
      if (waiting.length > 0) return `${pairing} — ${waiting.join(' ')}${finished}`;
      return `${pairing} — not played yet${finished}`;
    }

    const winnerName = nameOf(result.winnerId);
    const loserName = nameOf(result.loserId);
    const games = showGames ? ` ${gamesText(result)}` : '';
    const metric = metricName === null ? '' : `, ${result.metric} ${metricName}`;
    const sentence = `${winnerName} beat ${loserName}${games}${metric}`;

    if (championName !== null) return `${CHAMPION_LABEL} ${championName}. ${sentence}${finished}`;
    return `${sentence}${finished}`;
  }

  const className = [
    'match-card',
    result === null ? 'match-card--open' : 'match-card--recorded',
    championName === null ? null : 'match-card--champion',
    inert ? 'match-card--inert' : null,
  ]
    .filter((part) => part !== null)
    .join(' ');

  function slotClass(playerId: string | null, slot: Slot): string {
    const won = result !== null && playerId !== null && result.winnerId === playerId;

    return [
      'match-card__slot',
      slot.pending ? 'match-card__slot--pending' : null,
      won ? 'match-card__slot--won' : null,
    ]
      .filter((part) => part !== null)
      .join(' ');
  }

  return (
    <button
      type="button"
      class={className}
      // `undefined`, never `'false'` — WR-04. Shed the moment the feeders resolve or the
      // host reopens the tournament.
      aria-disabled={inert ? 'true' : undefined}
      onClick={() => {
        // The early return IS the refusal. Without it the ARIA would claim the card was
        // inert while a click still opened the record dialog on it.
        if (inert) return;
        if (match.upperId === null || match.lowerId === null) return;

        onSelect({
          matchId: match.matchId,
          aId: match.upperId,
          aName: upper.text,
          bId: match.lowerId,
          bName: lower.text,
          format,
        });
      }}
    >
      <span class="match-card__body" aria-hidden="true">
        <span class={slotClass(match.upperId, upper)}>{upper.text}</span>
        <span class={slotClass(match.lowerId, lower)}>{lower.text}</span>

        <span
          class={
            resultParts.length === 0
              ? 'match-card__result match-card__result--empty'
              : 'match-card__result'
          }
        >
          {resultParts.join(' · ')}
        </span>

        {championName !== null && (
          <span class="match-card__champion">
            <span class="match-card__champion-label">{CHAMPION_LABEL}</span>
            <span class="match-card__champion-name">{championName}</span>
          </span>
        )}
      </span>

      <span class="visually-hidden">{accessibleName()}</span>
    </button>
  );
}
