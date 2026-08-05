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

export interface BoardGridProps {
  players: readonly PlayerConfig[];
  rounds: number;
  /** Player id to an ordered slot array, straight from `selectTeams`. */
  teams: Record<string, (string | null)[]>;
  currentTurn: Turn | null;
  entryById: ReadonlyMap<string, RosterEntry>;
  spriteMeta: SpriteMeta;
  pickCount: number;
}

export function BoardGrid({
  players,
  rounds,
  teams,
  currentTurn,
  entryById,
  spriteMeta,
  pickCount,
}: BoardGridProps) {
  const roundNumbers = Array.from({ length: rounds }, (_, index) => index + 1);

  return (
    <section class="board" aria-labelledby="board-heading">
      <h2 class="board__title" id="board-heading">
        Draft board
      </h2>

      {pickCount === 0 && (
        <div class="board__empty">
          <h3 class="board__empty-heading">No picks yet</h3>
          <p class="board__empty-body">
            Player 1 picks first. Choose any Pokémon in the pool below to start Round 1.
          </p>
        </div>
      )}

      {/*
        The horizontal scroll below 720px is the one documented exception to the
        no-horizontal-scroll rule, and the same mechanism carries eight players later.
      */}
      <div class="board__scroll">
        <div class="board__grid">
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
            />
          ))}
        </div>
      </div>
    </section>
  );
}
