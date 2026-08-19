import type { SpriteMeta } from '../../adapters/roster-source';
import type { RosterEntry } from '../../core/roster/types';
import { handleSpriteError, spriteSrc } from '../sprite-src';

import './MonChip.css';

/**
 * A drafted species, as it appears in a board cell.
 *
 * ## A cell is a button under four conditions, and under no others (03-UI-SPEC Amendment 1)
 *
 * This supersedes the rule this file used to state — that board cells are not interactive
 * "in this phase or any planned one". D-27 makes a filled cell the way a swap is STARTED, so
 * the contract is now:
 *
 *   1. the tournament's `swapBudget` is greater than 0,
 *   2. the cell belongs to the player on the clock,
 *   3. that player has at least one swap remaining,
 *   4. the cell is filled.
 *
 * The reasoning behind the original rule is preserved rather than overturned. It was a
 * misclick argument, and it was about a NO-CONFIRM surface: forty-eight tiny retract buttons
 * that each destroyed a pick on one click. This is not that surface. At eight players the
 * interactive set is at most `rounds − 1` cells out of 48, never 48, and a swap CONFIRMS
 * while a pick does not. Undo remains a single top-bar button and no cell retracts anything.
 *
 * At `swapBudget: 0` the board is byte-identically non-interactive: `swap` is null for every
 * cell, so every chip renders the same `<span>`, the same classes and the same accessible
 * name it did in Phase 2. Nothing is a control, nothing activates, and nothing enters the
 * tab order.
 *
 * Two attributes ARE new on every filled cell — an `id` and `tabindex="-1"` — and they are
 * stated here rather than glossed. Neither is interactivity: a `-1` tabindex is not a tab
 * stop, announces nothing, and shows no ring under `:focus-visible`. They exist so focus can
 * be HANDED to a cell after a swap confirm, which is a thing done to the cell rather than
 * something the cell does.
 *
 * The sprite renders at --sprite-sm, an exact 2:1 integer downscale of the measured
 * 96px source, so it stays crisp. The width/height attributes carry the intrinsic size
 * rather than the rendered one — that is what they are for, and it is what lets the
 * browser reserve the right box before the art arrives while CSS does the sizing.
 */

/**
 * The swappable cell's accessible name — 03-UI-SPEC §Copywriting Contract.
 *
 * A composer rather than an inline template, for the reason every copy constant in this
 * codebase is one: it is asserted on exact equality, and a second call site composing it
 * slightly differently is how a contract stops being one.
 */
export function swapCellName(speciesName: string, round: number): string {
  return `Swap ${speciesName} out of round ${round}`;
}

/** What a cell needs in order to be a swap-target button. Absent means it is not one. */
export interface MonChipSwap {
  /** 1-based, and rendered — `round 1`, never `round 0`. */
  round: number;
  onSwap: () => void;
}

export interface MonChipProps {
  entry: RosterEntry;
  spriteMeta: SpriteMeta;
  /**
   * False in `split` (D-21). The component derives `nameText` from this once and uses that
   * single value for both the visible name and the sprite's alternative text, so the two
   * cannot desynchronise. Never expose the alternative text as a second prop.
   */
  showName: boolean;
  /**
   * The swap this cell would start, or `null` when it starts none — Amendment 1.
   *
   * ONE prop carrying the round AND the handler, on `PoolGrid.roundRestriction`'s precedent:
   * "a button with no handler" and "a handler with no round to name" are both unrepresentable,
   * and the round is not decoration — it is half of the accessible name.
   *
   * OPTIONAL, defaulting to `null`, because every existing caller renders a cell that is not
   * swappable and a required prop would make the Phase 2 board's non-interactivity something
   * each of them had to opt back into.
   *
   * The four conditions are NOT evaluated here. Whether a player is on the clock and whether
   * they have budget left are `selectCurrentTurn`'s and `selectSwapsRemaining`'s answers; a
   * component may not own a game rule. This renders the mode it is handed.
   */
  swap?: MonChipSwap | null;
  /**
   * A stable handle for the ONE thing that has to find this chip from outside: focus, after
   * a swap confirm closes — 03-UI-SPEC §Interaction, "Focus after a swap confirms".
   *
   * `Dialog` restores focus to whatever opened it, which for a swap is a pool cell that the
   * swap has just removed from the pool, so focus would land on `<body>`. The composition
   * root overrides the target to the board cell now holding the incoming species, and this
   * is how it addresses it.
   *
   * When present, the non-button chip becomes programmatically focusable — see the render.
   * Nothing else reads it; it is not a styling hook and not a test hook.
   */
  id?: string;
}

export function MonChip({ entry, spriteMeta, showName, swap = null, id }: MonChipProps) {
  // TWO derivations, and they have to be read together — the second is the INVERSE of the
  // first, and separating them is how the board loses its accessible names.
  //
  // `nameText` is the original rule and it is unchanged: one value decides both the visible
  // name and whether the sprite's alternative text has to carry it, because D-21 removes the
  // visible name in `split` and an empty `alt` there would leave the cell announcing nothing.
  // 02-UI-SPEC calls that "the single most breakable contract in this phase".
  //
  // `swapName` is the same shape one rung up: one value decides both whether this is a button
  // and what that button is called, so a caller cannot produce a button with no name or a name
  // with no button. And when it exists it OVERRIDES the sprite's job — the accessible name is
  // on the button, so the sprite is decorative in BOTH pane states rather than only in
  // `board-full`. Written as independent props, a `split` swappable cell would announce its
  // species twice and its purpose never.
  const nameText = showName ? entry.name : null;
  const swapName = swap === null ? null : swapCellName(entry.name, swap.round);

  const children = (
    <>
      <img
        class="mon-chip__sprite"
        src={spriteSrc(entry, spriteMeta)}
        alt={swapName === null && nameText === null ? entry.name : ''}
        width={spriteMeta.nativeWidth}
        height={spriteMeta.nativeHeight}
        onError={handleSpriteError}
      />
      {/*
        `title` stays on the span and is not moved onto the sprite. When the span is absent
        the sprite's alternative text IS the whole accessible name, and a title would have
        nothing to hang on but the thing already announcing it.
      */}
      {nameText !== null && (
        <span class="mon-chip__name" title={entry.name}>
          {nameText}
        </span>
      )}
    </>
  );

  if (swap === null || swapName === null) {
    return (
      <span
        class="mon-chip"
        id={id}
        // -1, so the chip is a FOCUS TARGET without becoming a tab stop. It is still not
        // interactive: nothing is announced as a control, nothing activates on Enter, and
        // the `:focus-visible` ring means a mouse click shows nothing.
        //
        // It is here because the swap that spends a player's LAST budget lands focus on a
        // cell that stopped being a button in the same render — the common case at
        // `swapBudget: 1`. Without this, that one swap drops focus to `<body>`, which is
        // the exact failure the override exists to prevent.
        //
        // Gated on `id` rather than unconditional, so the attribute and the reason for it
        // travel together: a chip nothing can address has nothing to hand focus to it, and
        // the two can never fall out of step because one expression decides both.
        tabIndex={id === undefined ? undefined : -1}
      >
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      id={id}
      class="mon-chip mon-chip--swappable"
      // The visible name, where there is one, is a SUBSTRING of this — so the button
      // satisfies label-in-name rather than renaming itself out from under anyone reading
      // the board aloud.
      aria-label={swapName}
      onClick={swap.onSwap}
    >
      {children}
    </button>
  );
}
