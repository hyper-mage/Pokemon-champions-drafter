import type { SpriteMeta } from '../../adapters/roster-source';
import type { PlayerConfig } from '../../core/model';
import type { RosterEntry } from '../../core/roster/types';

import { HandStrip } from './HandStrip';
import { MonChip } from './MonChip';

/**
 * One player's six slots, as a board row.
 *
 * This component and the board row are the same element on purpose (UI-SPEC D-06 note).
 * A separate "your team" panel would be a second rendering of the same data, which is
 * the shape that drifts: the panel and the board disagree, and the host trusts whichever
 * one is wrong. Typed-slot team panels arrive with the Phase 3 rules compiler, when the
 * slots genuinely carry information the board row does not.
 *
 * It returns a fragment rather than a wrapper element so its cells are direct children
 * of the board's grid and land in the parent's columns. There is no `display: contents`
 * anywhere as a result, which sidesteps that property's accessibility-tree caveats
 * entirely.
 */

export interface TeamStripProps {
  player: PlayerConfig;
  /** One entry per round; null where the slot is not yet filled. */
  slots: readonly (string | null)[];
  /** The slot about to be filled, or null when it is not this player's turn. */
  nextSlotIndex: number | null;
  entryById: ReadonlyMap<string, RosterEntry>;
  spriteMeta: SpriteMeta;
  /** Passed through from the pane state. Nothing here branches on it. */
  showName: boolean;
  /**
   * Every priority-card value this tournament deals, ascending — `1..config.rounds`.
   *
   * The same list as the round numbers, and that identity is D-06's rule rather than a
   * coincidence worth deduplicating away: a player holds exactly one card per pick round.
   */
  cardValues: readonly number[];
  /**
   * What this player still holds, from `selectHand`, or `null` when the tournament deals
   * no cards at all.
   *
   * `null` is a migrated schema-2 draft — picks present, no card ever played, no compiled
   * schedule — and it renders NO strip rather than an unspent one. Six untouched pips would
   * be a lie about a draft that ran strict alternation and never dealt a card.
   */
  hand: readonly number[] | null;
}

export function TeamStrip({
  player,
  slots,
  nextSlotIndex,
  entryById,
  spriteMeta,
  showName,
  cardValues,
  hand,
}: TeamStripProps) {
  return (
    <>
      {/*
        Two stacked lines, not one centred one. The name keeps the whole 176px column on its
        own line — more width than it had when it shared a single-line cell — and the strip
        sits beneath it inside the 64px the row already reserved (03-UI-SPEC §Layout Budget).
      */}
      <div class="board__label">
        <span class="board__label-name">{player.name}</span>
        {hand !== null && (
          <HandStrip playerName={player.name} values={cardValues} hand={hand} />
        )}
      </div>

      {slots.map((monId, index) => {
        const entry = monId === null ? undefined : entryById.get(monId);
        const isNext = nextSlotIndex === index;

        const className = [
          'board__cell',
          monId === null ? 'board__cell--empty' : 'board__cell--filled',
          isNext ? 'board__cell--next' : '',
        ]
          .filter((token) => token !== '')
          .join(' ');

        return (
          <div class={className} key={`${player.id}-${index}`}>
            {entry !== undefined ? (
              <MonChip entry={entry} spriteMeta={spriteMeta} showName={showName} />
            ) : (
              /*
                A FILLED SLOT WHOSE SPECIES THIS ROSTER NO LONGER CARRIES.

                Champions regulations rotate roughly every 2.5 months and `bans.ts` states
                that a saved tournament outliving a species is "the ordinary case rather
                than an attack", so this is reachable without anything going wrong. Before
                this branch the cell took `board__cell--filled` and rendered nothing —
                indistinguishable from an unfilled slot except that it was styled as
                filled, which is the worst of both readings.

                The id is the fallback for the same reason `resolveSpeciesName` in
                `app.tsx` falls back to it: core holds ids, the roster holds names, and an
                id the host can read out is worth more than an empty box. Rendered
                unconditionally rather than behind `showName`, because in `split` the chip's
                sprite carries the name and here there is no sprite to carry anything.
              */
              monId !== null && (
                <span class="board__cell-missing" title={monId}>
                  {monId}
                </span>
              )
            )}
          </div>
        );
      })}
    </>
  );
}
