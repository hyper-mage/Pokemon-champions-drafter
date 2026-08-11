import type { SpriteMeta } from '../../adapters/roster-source';
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
}

export function BoardGrid({
  players,
  rounds,
  teams,
  currentTurn,
  entryById,
  spriteMeta,
  pickCount,
  showName,
  firstPlayerName,
}: BoardGridProps) {
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

          {roundNumbers.map((round) => (
            <div class="board__round" key={round}>
              {roundLabel(round)}
            </div>
          ))}

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
            />
          ))}
        </div>
      </div>
    </section>
  );
}
