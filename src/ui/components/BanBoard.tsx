import { Fragment } from 'preact';

import type { SpriteMeta } from '../../adapters/roster-source';
import type { RosterEntry } from '../../core/roster/types';

import { MonChip } from './MonChip';

import './BanBoard.css';

/**
 * The ban round, as players down and passes across — BAN-03, and the progress board the
 * blind locked state mounts.
 *
 * ## THE PROPS ARE THE LEAK DEFENCE, NOT A CONVENIENCE
 *
 * `04-UI-SPEC` assertion S2 requires the arm that renders during the secret half of the
 * ritual to receive **no species ids at all**, and this union is how that stops being a
 * review item and becomes a type error: the `'blind'` arm carries `{ playerName, entered }`
 * and nothing else, so **a component that never receives a name cannot render one.**
 *
 * DO NOT "simplify" the two arms into one props type with optional fields. It would compile,
 * it would look tidier, nothing on screen would change — and it would silently delete the
 * only structural guarantee the blind stage has. The union is the same move `03-UI-SPEC`
 * made when it refused to let a component own a rule: make the wrong outcome
 * unrepresentable rather than reviewable. `tests/ui/ban-board.test.tsx` holds two
 * `@ts-expect-error` directives against it, so a widening breaks the build on the file that
 * explains why.
 *
 * Both arms are built here, in one plan, for exactly that reason. Declaring the blind arm
 * beside the screen that mounts it would put the two halves of one guarantee in two files.
 *
 * ## It decides nothing
 *
 * Rows, the cell contents and the cell to be filled next are all selector output, mapped
 * into props by the composition root. `selectBanOrder` fixes the serpentine, `selectBanTurn`
 * names the next cell, and this component renders the answers. If a mapping into these props
 * ever starts to look like a rule, the selector is missing — `04-UI-SPEC` §Pure-core
 * boundary.
 */

/**
 * The column header, and `Pass` rather than `Round` deliberately.
 *
 * `Round` is taken twice over — by the draft's own rounds and by the draft board's `R{n}`
 * header — and two meanings for one word on a shared screen is how a room ends up arguing
 * about which one it is (`04-UI-SPEC` §6). In a true serpentine each player bans exactly
 * once per pass, so a pass IS a column.
 *
 * A composer rather than an inline template, for the reason every copy constant in this
 * codebase is one: it is asserted on exact equality, and a second call site composing it
 * slightly differently is how a contract stops being one.
 */
function passLabel(pass: number): string {
  return `Pass ${pass}`;
}

/** The two words the room reads across a table. `04-UI-SPEC` §4. */
const ENTERED = 'Entered';
const NOT_YET = 'Not yet';

/**
 * One row's whole accessible sentence — `04-UI-SPEC` §Interaction, `BanBoard` semantics.
 *
 * The negative case is INVERTED against the visible copy on purpose: `Not yet` is two words
 * with no verb, which scans across a room and reads as nothing in a screen reader, so the
 * sentence says `not yet entered` instead. `Entered` is single-sourced from the constant
 * above so the two halves cannot drift.
 *
 * The separator lives INSIDE the sentence rather than beside it. WR-03's rule is that a
 * separator inside one element's own accessible text is part of that one string, and this
 * is the only string the row has.
 */
function blindRowSentence(playerName: string, entered: boolean): string {
  return `${playerName} — ${entered ? ENTERED : 'not yet entered'}`;
}

export type BanBoardProps =
  | {
      mode: 'public';
      /**
       * One row per player, in starting order. `cells[p]` is what that player banned in
       * pass `p + 1`, or `null` where the pass is still to come.
       *
       * Resolved entries rather than ids, so this component never touches the roster and
       * never has to decide what an unresolvable id means.
       */
      rows: readonly { playerName: string; cells: readonly (RosterEntry | null)[] }[];
      passes: number;
      /**
       * Row and column of the cell to be filled next, both 0-based, or `null` when the
       * stage is done. Exactly one cell on the whole board is marked, and none once every
       * ban is placed — `selectBanTurn` answers `null` from that point on.
       */
      nextCell: { row: number; column: number } | null;
      /**
       * True at `board-full` only. Passed straight down to every chip, exactly as the draft
       * board passes it, so D-21's rule has one implementation rather than two.
       */
      showName: boolean;
      spriteMeta: SpriteMeta;
    }
  | {
      mode: 'blind';
      /**
       * One row per player, in starting order. `entered` is whether their submission has
       * landed — NOT what it contained, which this arm has no field to carry and therefore
       * no way to leak.
       */
      rows: readonly { playerName: string; entered: boolean }[];
    };

export function BanBoard(props: BanBoardProps) {
  /*
    Neither arm puts anything in the tab order and neither hands anything to a pointer.

    `03-UI-SPEC` Amendment 1 makes a board cell a control under four conditions, all four of
    which are about swaps, and none of them holds during a ban. So no cell is a button, no
    cell takes a handler, and no cell is a focus target.

    The hook the pool grid uses for roving focus is deliberately NOT wired here, and that is
    stated so it is not added out of habit: it exists for a large uniform interactive set,
    and this is at most eight static rows in either arm (`04-UI-SPEC` §Interaction).

    No `grid`, `row` or `gridcell` semantics are invented either. The shipped draft board
    emits plain elements in a CSS grid, and a second differently-shaped board asserting a
    relationship the markup does not have would be a second accessibility model for one
    visual pattern.
  */

  if (props.mode === 'blind') {
    return (
      <div class="ban-board__blind">
        {props.rows.map((row, index) => (
          /*
            The index is the key because the row's position IS its identity here — rows are
            the starting order, and a host may legitimately name two players the same thing.
          */
          <div class="ban-board__blind-row" key={index}>
            {/*
              Both visible halves are hidden from assistive technology and the sentence
              below carries the whole row. Announcing the name here as well would say it
              twice — the same inversion `MonChip` makes between its visible name and its
              sprite's alternative text.
            */}
            <span class="ban-board__blind-name" aria-hidden="true" title={row.playerName}>
              {row.playerName}
            </span>
            <span class="ban-board__blind-status" aria-hidden="true">
              <span
                class={
                  row.entered
                    ? 'ban-board__marker ban-board__marker--entered'
                    : 'ban-board__marker ban-board__marker--waiting'
                }
              />
              {row.entered ? ENTERED : NOT_YET}
            </span>
            <span class="visually-hidden">{blindRowSentence(row.playerName, row.entered)}</span>
          </div>
        ))}
      </div>
    );
  }

  const { rows, passes, nextCell, showName, spriteMeta } = props;

  /** 1-based, and both the header text and the column position come from this one list. */
  const passNumbers = Array.from({ length: passes }, (_, index) => index + 1);

  return (
    /*
      The column template is the ONE thing set inline, and for the reason the draft board
      sets its own inline: CSS `repeat()` takes an integer at parse time and cannot read a
      custom property for its count, so a pass count derived from the config has nowhere else
      to land. The label column's width stays a token — `--board-label-w`, declared once in
      `BoardGrid.css` — so no raw length moves into this component and the two boards beside
      each other cannot drift apart.
    */
    <div
      class="ban-board__grid"
      style={{
        gridTemplateColumns: `var(--board-label-w) repeat(${passes}, minmax(0, 1fr))`,
      }}
    >
      {/* Sits above the label column, opposite the pass headers. Deliberately empty. */}
      <div class="board__corner" />

      {passNumbers.map((pass) => (
        <div class="ban-board__pass" key={pass}>
          {passLabel(pass)}
        </div>
      ))}

      {rows.map((row, rowIndex) => (
        <Fragment key={rowIndex}>
          <div class="ban-board__label">
            {/*
              `title` recovers the full name when the column ellipsises it, which is what
              `MonChip` does for the same reason and the only way a truncated host-authored
              name is readable at all.
            */}
            <span class="ban-board__label-name" title={row.playerName}>
              {row.playerName}
            </span>
          </div>

          {passNumbers.map((pass) => {
            const column = pass - 1;
            const entry = row.cells[column] ?? null;
            const isNext =
              nextCell !== null && nextCell.row === rowIndex && nextCell.column === column;

            /*
              The cell classes are the DRAFT BOARD's, reused rather than restated. The dashed
              hairline on an empty cell and the accent border plus soft tint on the next one
              are shipped mechanisms with their justifications written beside them, and a
              second copy here would be a second thing that can disagree about what an empty
              slot looks like.
            */
            const className = [
              'board__cell',
              entry === null ? 'board__cell--empty' : 'board__cell--filled',
              isNext ? 'board__cell--next' : '',
            ]
              .filter((token) => token !== '')
              .join(' ');

            return (
              <div class={className} key={pass}>
                {entry !== null && (
                  <MonChip entry={entry} spriteMeta={spriteMeta} showName={showName} />
                )}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
