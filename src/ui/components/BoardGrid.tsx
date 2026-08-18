import type { SpriteMeta } from '../../adapters/roster-source';
import type { RoundSpec } from '../../core/actions';
import type { PlayerConfig } from '../../core/model';
import type { RosterEntry } from '../../core/roster/types';
import type { Turn } from '../../core/selectors';

import { TeamStrip } from './TeamStrip';

import './BoardGrid.css';

/**
 * The full pick history: players as rows, rounds as columns.
 *
 * That orientation is a decision, not a preference, and it is chosen to survive to
 * eight players: rows grow downward for free as the player count rises in Phase 2, a
 * player's team reads as one continuous horizontal line so a board row and a team strip
 * are the same element rather than duplicated state, and it matches the Google Sheets
 * draft board this audience already uses.
 *
 * Nothing here decides a rule. The teams, the turn and the completion state all arrive
 * as selector output; this component only renders them (SHEL-04, and the UI-SPEC's
 * pure-core boundary as a UI rule).
 */

/**
 * The contract names the round headers `R1`…`R6` literally, so they are written
 * literally. The fallback keeps the component honest if a later phase ever runs a
 * different round count rather than silently rendering six columns of nothing.
 */
const ROUND_LABELS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'] as const;

function roundLabel(round: number): string {
  return ROUND_LABELS[round - 1] ?? `R${round}`;
}

/**
 * The word on a Mega round's marker, and the suffix only a screen reader gets.
 *
 * The board shows `Mega` because `Mega` is the widest string an 86px round cell holds
 * (03-UI-SPEC §Layout Budget: ~46px of marker inside 86px, 40px of slack). A screen reader
 * hears `Mega round`, which is the sentence, via a visually-hidden suffix.
 *
 * 03-UI-SPEC §6 rules out inventing ARIA here: these header cells are `<div>`s with no
 * programmatic association to the grid cells they sit above, and a fabricated one would be
 * worse than the text — it would assert a relationship the markup does not have.
 *
 * Held as constants rather than written inline for the reason the empty state's sentence
 * is: JSX collapses whitespace between text lines, and the leading space in the suffix is
 * the whole point of it.
 */
const MEGA_MARKER = 'Mega';
const MEGA_MARKER_SUFFIX = ' round';

/**
 * Whether round `round` (1-based) is a Mega round, per the schedule handed in.
 *
 * The component decides nothing — it renders the kind it is given. A round the schedule
 * has no entry for reads as open, which is the same answer `selectRoundKind` gives and is
 * what a migrated schema-2 document produces for every round.
 */
function isMegaRound(schedule: readonly RoundSpec[], round: number): boolean {
  return schedule[round - 1]?.kind === 'mega';
}

/** Unchanged from Phase 1, and the only half of the empty state that survives a null name. */
const EMPTY_HEADING = 'No picks yet';

/**
 * Two changes to Phase 1's sentence, both required by 02-UI-SPEC's empty-state row.
 *
 * The picker is NAMED rather than numbered. Phase 1 wrote a position because the two
 * players were hardcoded and had no host-authored names to use; 02-04 made every name
 * host-authored, so a position is now a fact the screen has and declines to state.
 *
 * The word that placed the pool under the board is deleted, because this plan puts the
 * pool BESIDE the board. A direction is the kind of copy that survives a layout change
 * silently and is wrong from the moment it does.
 *
 * Held as a composer rather than written inline: JSX collapses whitespace between text
 * lines, and this string is a contract asserted on exact equality (S-5).
 */
function emptyBody(firstPlayerName: string): string {
  return `${firstPlayerName} picks first. Choose any Pokémon in the pool to start Round 1.`;
}

export interface BoardGridProps {
  players: readonly PlayerConfig[];
  rounds: number;
  /**
   * The compiled schedule, straight from `selectSchedule`. Types the round headers, and
   * nothing else on this component reads it — the columns of slots below are typed BY the
   * header rather than each carrying a copy of the answer (D-08).
   */
  schedule: readonly RoundSpec[];
  /** Player id to an ordered slot array, straight from `selectTeams`. */
  teams: Record<string, (string | null)[]>;
  currentTurn: Turn | null;
  entryById: ReadonlyMap<string, RosterEntry>;
  spriteMeta: SpriteMeta;
  pickCount: number;
  /** True in `board-full` only. Passed straight down to every chip. */
  showName: boolean;
  /** From `selectPlayerName(state, turn.playerId)`. Names the empty state's first picker. */
  firstPlayerName: string | null;
  /**
   * Player id to the priority cards they still hold, straight from `selectHand` — or
   * `null` when this tournament deals no cards at all (CARD-07, D-24).
   *
   * `null` rather than an empty record, so a migrated schema-2 draft cannot be confused
   * with a Phase 3 one in which everybody happens to have spent everything. The first
   * renders no strips; the second renders six struck-through pips per row.
   *
   * The composition root decides which of the two a document is. This component renders
   * what it is handed and works nothing out, exactly as it does for `schedule`.
   */
  hands: Record<string, number[]> | null;
}

export function BoardGrid({
  players,
  rounds,
  schedule,
  teams,
  currentTurn,
  entryById,
  spriteMeta,
  pickCount,
  showName,
  firstPlayerName,
  hands,
}: BoardGridProps) {
  /**
   * The round numbers, and — the same list — every priority-card value the tournament
   * deals. A player holds one card per pick round (D-06), so `1..rounds` answers both
   * questions and deriving it twice would be two places for a round count to disagree
   * with itself.
   */
  const roundNumbers = Array.from({ length: rounds }, (_, index) => index + 1);

  return (
    <section class="board" aria-labelledby="board-heading">
      <h2 class="board__title" id="board-heading">
        Draft board
      </h2>

      {pickCount === 0 && (
        <div class="board__empty">
          <h3 class="board__empty-heading">{EMPTY_HEADING}</h3>
          {/*
            No name, no sentence. A composed string with a hole where the picker should be
            reads as a template that leaked, and the heading alone is already true.
          */}
          {firstPlayerName !== null && (
            <p class="board__empty-body">{emptyBody(firstPlayerName)}</p>
          )}
        </div>
      )}

      {/*
        The horizontal scroll below 720px is the one documented exception to the
        no-horizontal-scroll rule, and the same mechanism carries eight players later.
      */}
      <div class="board__scroll">
        {/*
          The column template is the ONE thing set inline, because CSS `repeat()` takes an
          integer at parse time and cannot read a custom property for its count — a round
          count derived from the config has nowhere else to land. The label column's width
          stays in the stylesheet as a custom property, where its justification comment
          lives, so no raw length moves into the component. Same posture TypePill takes for
          its two hue properties (02-03).
        */}
        <div
          class="board__grid"
          style={{
            gridTemplateColumns: `var(--board-label-w) repeat(${rounds}, minmax(0, 1fr))`,
          }}
        >
          <div class="board__corner" />

          {/*
            Two lines per header. The marker line is rendered for EVERY round and carries
            text only on a Mega one, so the reserved height is structural rather than
            conditional — a header that grew a line when the schedule was reordered would
            move every board row under it and pull the two panes out of alignment by a
            full line (the reserved-chrome rule 02-09 established).
          */}
          {roundNumbers.map((round) => {
            const mega = isMegaRound(schedule, round);
            return (
              <div class="board__round" key={round}>
                <span class="board__round-label">{roundLabel(round)}</span>
                <span
                  class={
                    mega ? 'board__round-mark board__round-mark--mega' : 'board__round-mark'
                  }
                >
                  {mega && (
                    <>
                      {MEGA_MARKER}
                      <span class="visually-hidden">{MEGA_MARKER_SUFFIX}</span>
                    </>
                  )}
                </span>
              </div>
            );
          })}

          {players.map((player) => (
            <TeamStrip
              key={player.id}
              player={player}
              slots={teams[player.id] ?? []}
              // Exactly one cell on the whole board is marked as next, and none once
              // the draft is complete — `currentTurn` is null from that point on.
              nextSlotIndex={
                currentTurn !== null && currentTurn.playerId === player.id
                  ? currentTurn.round - 1
                  : null
              }
              entryById={entryById}
              spriteMeta={spriteMeta}
              showName={showName}
              cardValues={roundNumbers}
              // `?? []` is not the same answer as `null`: a tournament that deals cards but
              // has no entry for this player hands over an empty hand, which renders six
              // struck pips. Only a `hands` of null suppresses the strip entirely.
              hand={hands === null ? null : hands[player.id] ?? []}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
