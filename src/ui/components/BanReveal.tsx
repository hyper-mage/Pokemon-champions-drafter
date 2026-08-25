import { useEffect, useRef } from 'preact/hooks';

import type { SpriteMeta } from '../../adapters/roster-source';
import type { FeasibilityProblem } from '../../core/feasibility';
import type { RosterEntry } from '../../core/roster/types';
import { MonChip } from './MonChip';

import './BanReveal.css';

/**
 * The reveal — BAN-04, BAN-07, RULE-08, D-13, D-19, D-22, D-23.
 *
 * The moment the phase exists for. Every ban is on one screen at once, attributed to the
 * player who spent it, with the duplicates named out loud — and then a second, deliberate
 * tap draws the pool.
 *
 * ## ONE component serves blind and snake
 *
 * It takes `{ playerName, entries }[]` and does not know, or ask, whether the fold produced
 * that from a single `bans/revealed` action or from a run of individual snake placements.
 * Two components would be two places the attribution sentence could drift, over one visual
 * pattern that the room reads the same way in both modes.
 *
 * That is also why the heading is **count-first and mode-independent**. Naming the reveal
 * itself in the heading would be wrong at snake, where the bans were seen as they happened
 * and nothing is being disclosed here; and a per-mode heading would be two strings free to
 * drift apart. The count is the number the room actually wants, and `bannedCount` carries it
 * from the one correct source.
 *
 * ## BAN-07 is PARTIALLY satisfied here, and deliberately
 *
 * Only the `bothApply` branch is implemented: both bans are recorded and attributed, the
 * species is banned once, and a sentence says who collided and what it cost. The re-ban
 * branch is descoped by owner-approved decision D-19, and the config screen ships its
 * `reBan` member disabled rather than absent — so a later milestone enables an option
 * instead of adding a control plus a schema bump. The phase verifier must not score the
 * re-ban clause green off this file.
 *
 * ## Nothing here is a rule
 *
 * The collision set, the public banlist, the union count and the feasibility verdict are all
 * selectors and pure functions the caller has already asked. This composes copy over their
 * answers and renders it (`04-UI-SPEC` §Pure-core boundary).
 */

/**
 * The one comma-and-`and` composer on this surface, shared by the row summaries and the
 * collision lines.
 *
 * `banCountPhrase`'s established shape, one grammar up: two composers over one grammar is two
 * places to get a plural wrong, and the reveal is read aloud to a room. **No Oxford comma** —
 * `04-UI-SPEC` §7 spells all three forms out, and the three-item case is the one a careless
 * `join(', ')` gets wrong in a way nobody notices until it is on a projector.
 *
 * The empty case returns an empty string rather than throwing. A player with no bans is a
 * shape only a hand-edited document produces, and a blank clause is a better answer on a
 * shared screen than a crash mid-ritual.
 */
function nameList(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0] ?? '';

  const last = names[names.length - 1] ?? '';
  const rest = names.slice(0, -1);

  return `${rest.join(', ')} and ${last}`;
}

/** The heading — `04-UI-SPEC` §7, count first. */
function headline(bannedCount: number): string {
  return `${bannedCount} Pokémon banned`;
}

/**
 * Verbatim from the approved copy table.
 *
 * A constant rather than inline prose because JSX collapses whitespace between text lines,
 * and this string is asserted on exact equality.
 */
const SUB_HEAD = "Every player's bans are below. They apply to everyone.";

/** The one sentence per row that the reveal exists to deliver — D-13. */
function rowSentence(playerName: string, entries: readonly RosterEntry[]): string {
  return `${playerName} banned ${nameList(entries.map((entry) => entry.name))}.`;
}

/**
 * A duplicate, named rather than absorbed — BAN-07's `bothApply` branch, D-19.
 *
 * Two players and three-or-more take different sentences because the arithmetic differs:
 * at two there is exactly one wasted ban and English has a word for which one, and at three
 * or more the count has to be stated. `others` is at least 2 whenever this arm runs, so the
 * plural is correct by construction rather than by a fourth branch.
 */
function collisionSentence(speciesName: string, playerNames: readonly string[]): string {
  const list = nameList(playerNames);

  if (playerNames.length === 2) {
    return `${list} both banned ${speciesName}. It is banned once; the second ban is spent.`;
  }

  const others = playerNames.length - 1;
  return `${list} all banned ${speciesName}. It is banned once; the other ${others} bans are spent.`;
}

/** The passing verdict — `04-UI-SPEC` §7, RULE-08. */
const POOL_CAN_BE_DRAWN = 'The pool can be drawn.';

/** The stage's one accent-filled action, and the tap that draws the pool (D-23). */
const START_DRAFT = 'Start draft';

/**
 * The blocked reason's id, so `Start draft` can point at it.
 *
 * A module constant rather than a generated id: exactly one reveal is ever on screen, and a
 * stable value is what lets a test assert the pairing rather than the mechanism.
 */
const FEASIBILITY_ID = 'ban-reveal-feasibility';

export interface BanRevealProps {
  /**
   * One row per player, in starting order. Serves BOTH modes — snake produces this from a
   * run of `bans/placed`, blind from one `bans/revealed`.
   */
  rows: { playerName: string; entries: RosterEntry[] }[];
  collisions: { speciesName: string; playerNames: string[] }[];
  /**
   * `bannedEntries(entries, selectAllBanIds(state)).length` — never an array length taken
   * off `rows`.
   *
   * Flattening the rows and counting what comes out overreports by exactly the number of
   * collisions, which makes the headline wrong on precisely the tournaments this surface
   * exists to explain. The expression is deliberately not written out here, because a
   * comment quoting a forbidden shape is the first copy of it free to drift.
   */
  bannedCount: number;
  /**
   * The first BLOCKING problem, or `null`.
   *
   * Blocking only. `poolExactlyMinimum` and `swapRoundsOnExactPool` are config-time warnings
   * and have no remedy on a screen where D-22 has removed every exit but abandonment, so
   * rendering one would state a problem with no next action.
   */
  blocking: FeasibilityProblem | null;
  spriteMeta: SpriteMeta;
  onStartDraft: () => void;
}

export function BanReveal({
  rows,
  collisions,
  bannedCount,
  blocking,
  spriteMeta,
  onStartDraft,
}: BanRevealProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  /*
    FOCUS GOES TO THE HEADING, NOT TO `Start draft` — `04-UI-SPEC` §Interaction.

    D-23 separates the reveal from the draw so the room reads the reveal before the screen
    changes under them. Landing focus on the control that changes it would put the draft one
    keystroke away from a screen nobody has read, which is the whole thing the split buys.

    Mount only. Re-running it would drag focus back to the heading while the host is reading
    down the rows.
  */
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const blocked = blocking !== null;

  return (
    <section class="ban-reveal">
      <h1 class="ban-reveal__headline" ref={headingRef} tabIndex={-1}>
        {headline(bannedCount)}
      </h1>

      <p class="ban-reveal__sub-head">{SUB_HEAD}</p>

      <div class="ban-reveal__rows">
        {rows.map((row, index) => (
          /*
            Keyed by POSITION, not by name. A host may legitimately name two players the
            same thing, and the rows are a positional list of seats either way — the same
            reading the progress board's rows take.
          */
          <div class="ban-reveal__row" key={index}>
            {/*
              The visible halves are hidden from assistive technology and the whole sentence
              is carried once beside them — the shape the progress board and the hand strip
              both use. Without it the row reads as a name followed by a bare run of species,
              which is a list rather than the statement the reveal is making.
            */}
            <span class="ban-reveal__player" aria-hidden="true" title={row.playerName}>
              {row.playerName}
            </span>

            <span class="ban-reveal__chips" aria-hidden="true">
              {row.entries.map((banned) => (
                <MonChip
                  key={banned.id}
                  entry={banned}
                  spriteMeta={spriteMeta}
                  // Named chips: the species name is the thing the room reads from three
                  // metres (DRFT-14 assertion 15). `MonChip`'s alternative-text inversion
                  // applies as shipped, and the row above is hidden from assistive
                  // technology regardless, so nothing is announced twice.
                  showName
                />
              ))}
            </span>

            <span class="visually-hidden">{rowSentence(row.playerName, row.entries)}</span>
          </div>
        ))}
      </div>

      {/*
        NO ELEMENT AT ALL WHEN THERE ARE NONE — `04-UI-SPEC` §7, and it is a rejection rather
        than an omission. A line reporting that nothing collided answers a question nobody
        asked; and in snake, where two players cannot ban the same species by construction
        (D-20), it would be permanent noise on every reveal the mode can produce. Recorded
        here so it is not added later as a kindness.
      */}
      {collisions.length > 0 && (
        <div class="ban-reveal__collisions">
          {collisions.map((collision, index) => (
            <p class="ban-reveal__collision" key={index}>
              {collisionSentence(collision.speciesName, collision.playerNames)}
            </p>
          ))}
        </div>
      )}

      {/*
        The feasibility line's two verdicts. The blocked one is a `role="status"` region the
        button points at, so a host who tabs to a control that will not act hears why; the
        passing one is muted prose and needs no such wiring.
      */}
      <p
        class={
          blocked
            ? 'ban-reveal__feasibility ban-reveal__feasibility--blocked'
            : 'ban-reveal__feasibility'
        }
        id={FEASIBILITY_ID}
        {...(blocked ? { role: 'status' } : {})}
      >
        {blocking === null ? POOL_CAN_BE_DRAWN : blocking.message}
      </p>

      {/*
        `aria-disabled`, never the native attribute — a natively disabled control is not
        focusable, so its reason would be unreachable by keyboard on the one screen where the
        reason is the only thing left to say.

        Both attributes ride an object spread so they are genuinely ABSENT on the passing
        verdict rather than set to a negative string (WR-04), which is the shape `MonCard`'s
        inert props already take.
      */}
      <button
        type="button"
        class="ban-reveal__action"
        {...(blocked ? { 'aria-disabled': 'true', 'aria-describedby': FEASIBILITY_ID } : {})}
        onClick={() => {
          // The guard is here as well as in the caller's own gate, because `aria-disabled`
          // leaves the control clickable by design. A blocked verdict dispatches nothing.
          if (blocked) return;
          onStartDraft();
        }}
      >
        {START_DRAFT}
      </button>
    </section>
  );
}
