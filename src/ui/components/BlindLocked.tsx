import type { Ref } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { BanBoard } from './BanBoard';
import { announce } from './LiveRegion';

import './BlindLocked.css';

/**
 * The blind stage's resting state — BAN-05, D-05, D-08, D-18.
 *
 * **This is the phase's most important screen and it is deliberately the plainest.** A room
 * glancing at it must be able to tell from three metres that there is nothing on it
 * (`04-UI-SPEC` §4). Whose turn it is, how many have entered, who they are, and one button.
 * That is the whole surface, and every addition to it has to answer why the room may see it.
 *
 * ## Locked is a destination, not an error state
 *
 * `04-UI-SPEC` §How the shield and D-05 fit together: the ban stage has two states, and the
 * screen never *sits* in Entry. Every exit from Entry — the deliberate one, the tab-hide,
 * the restore from history — lands here, and here is designed as somewhere to be rather than
 * as somewhere a host has fallen back to. That is what makes D-05's "a host who steps away
 * cannot leave a leak on screen" true with zero discipline required from the room.
 *
 * ## It is handed no species, by construction
 *
 * The progress board is {@link BanBoard} in its blind arm, whose props carry a player name
 * and a boolean and nothing else — assertion S2, enforced by that component's discriminated
 * union rather than by review. A hand-rolled list here would render the same pixels and
 * throw the guarantee away, so it is not an implementation detail: mounting the blind arm IS
 * the mitigation. Nothing in this file's scope has a field that could hold a species.
 */

/** The headline, and the sentence that replaces it when nobody is next. */
function headlineFor(nextPlayerName: string | null): string {
  return nextPlayerName === null ? 'All bans are in' : `${nextPlayerName} is next`;
}

/**
 * The count the whole room reads, and the only number on the screen.
 *
 * A composer rather than an inline template, for the reason every copy constant in this
 * codebase is one: it is asserted on exact equality, and a second call site composing it
 * slightly differently is how a contract stops being one.
 */
function progressLine(entered: number, total: number): string {
  return `${entered} of ${total} entered`;
}

/**
 * ONE string for four paths — the `Hide these bans` control, a tab hidden, a restore from
 * the back/forward cache, and the browser Back button (D-17, D-18).
 *
 * All four produce the same outcome: nothing was recorded and the player enters again.
 * Writing four sentences would be writing four things that can disagree about what just
 * happened, and the room cannot tell which of the four fired anyway. It names no species,
 * so it is safe on this screen by construction rather than by review.
 */
function discardNotice(playerName: string): string {
  return `${playerName}'s entry was discarded. Nothing was recorded.`;
}

const PLAYERS_HEADING = 'Players';

function enterLabel(playerName: string): string {
  return `Enter ${playerName}'s bans`;
}

const REVEAL_LABEL = 'Reveal bans';

/**
 * The line under the reveal, and it appears only when the reveal does.
 *
 * The plural possessive is fixed rather than composed: this count is the player count, a
 * tournament has at least two players, and a singular/plural helper here would be a branch
 * no document can reach. Every other interpolated count in this phase gets one.
 */
function revealHelper(total: number): string {
  return `Gather everyone before you tap. All ${total} players' bans appear at once.`;
}

/** The two permitted announcements this screen owns — `04-UI-SPEC` §The Live-Region Contract. */
function lockedAnnouncement(playerName: string, entered: number, total: number): string {
  return `${playerName}'s bans are locked in. ${entered} of ${total} entered.`;
}

function completeAnnouncement(total: number): string {
  return `All bans are in. ${total} of ${total} entered. Ready to reveal.`;
}

export interface BlindLockedProps {
  /**
   * One row per player, in starting order. NO species ids — this feeds `BanBoard`'s blind
   * arm, which has no field that could carry one.
   */
  rows: readonly { playerName: string; entered: boolean }[];
  /** Whose bans are entered next, or `null` when every player has submitted. */
  nextPlayerName: string | null;
  entered: number;
  total: number;
  /** Set after a discard; cleared on the next transition into entry. `null` renders no notice. */
  discardedPlayerName: string | null;
  /**
   * The player whose allotment just landed, when THIS MOUNT is the result of one — `null`
   * otherwise, including on every fresh page load.
   *
   * It exists because the entry surface swaps this component out and back, so a submission
   * lands across a REMOUNT and the increase this component watches for never happens. The
   * screen above knows exactly what the departure from entry was, so it says so rather than
   * leaving the room with no spoken confirmation that a submission registered.
   *
   * **This is not "announce on mount", which is the change that would make a resume lie.**
   * The distinction is that this is the SCREEN'S MEMORY OF A TRANSITION, and that memory is
   * component state one level up: a reload starts with `null`, so arriving at a stage with
   * three entries already in it stays silent. Never derive it from the fold.
   *
   * At most one of this and {@link discardedPlayerName} is ever set — a departure from entry
   * is either a submission or a discard, and never both.
   */
  lockedPlayerName: string | null;
  onEnter: () => void;
  onReveal: () => void;
  /** The focus target every exit from the entry surface lands on — 04-10 wires it. */
  primaryActionRef: Ref<HTMLButtonElement>;
}

export function BlindLocked({
  rows,
  nextPlayerName,
  entered,
  total,
  discardedPlayerName,
  lockedPlayerName,
  onEnter,
  onReveal,
  primaryActionRef,
}: BlindLockedProps) {
  /*
    ONE authority on whether the ritual is over, and it is `nextPlayerName` rather than a
    comparison of the two counts.

    The two say the same thing — the interface defines `null` as "every player has
    submitted" — and deriving the headline from one and the button from the other would be
    two authorities free to disagree on the one render where it matters. This one also
    narrows: inside the `false` branch the compiler knows the name is a string, so the
    button's label cannot be built from a `null`.
  */
  const complete = nextPlayerName === null;

  /*
    --- ASSERTION S7, AND THE REASON THE CLEAR LOOKS REDUNDANT ---

    Every transition INTO this state empties the live region. Mount is that transition: the
    entry surface is a component this screen's owner swaps in and out, so arriving here is
    arriving here whether the host locked in, hid the screen, or came back through history.

    Every string this stage is permitted to speak already names no species, so this clear
    removes nothing that was a leak today. THAT IS THE POINT AND IT IS NOT REDUNDANT: it
    makes the leak structurally impossible instead of dependent on every future string being
    reviewed. A later reader who deletes it will not break a test on the day they delete it;
    they will break one the day somebody adds a sixth announcement.

    Mount only. An undo while this screen is up lowers `entered`, and `store.ts` announces
    `{playerName}'s bans were removed. {n} of {m} entered.` for it — a clear on that render
    would swallow the one sentence telling the room what just happened.

    --- AND WHAT THE ARRIVAL ITSELF SAYS ---

    The entry surface swaps this component out and back, so a submission and a discard both
    land across a REMOUNT: the increase this component watches for below never fires on
    either, and without this the screen would be correct and silent about the one thing the
    room is waiting to hear. The screen above hands down which it was, so this speaks the
    transition it actually arrived on.

    It is still MOUNT-SCOPED, and the three branches are still one write, so S7 holds
    exactly as before — every arrival replaces whatever the previous surface left in the
    region rather than adding to it. What keeps a resume honest is that both props are the
    screen's own component state one level up, so a page load starts with both `null` and
    lands on the `announce('')` branch.
  */
  useEffect(() => {
    if (discardedPlayerName !== null) {
      announce(discardNotice(discardedPlayerName));
      return;
    }

    if (lockedPlayerName !== null) {
      announce(
        entered >= total
          ? completeAnnouncement(total)
          : lockedAnnouncement(lockedPlayerName, entered, total),
      );
      return;
    }

    announce('');
    // Mount only, deliberately — see above. The props are read as they were on arrival,
    // which is the only render on which they describe something that just happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    What the room hears when a submission lands.

    `null` until the first render has been seen, so a resume announces nothing: arriving at
    a stage with three entries already in it is not three submissions happening. Only an
    INCREASE speaks, which is also what leaves the undo sentence above alone.
  */
  const previousEnteredRef = useRef<number | null>(null);
  const previousRowsRef = useRef<readonly boolean[]>([]);

  useEffect(() => {
    const previousEntered = previousEnteredRef.current;
    const previousRows = previousRowsRef.current;

    previousEnteredRef.current = entered;
    previousRowsRef.current = rows.map((row) => row.entered);

    if (previousEntered === null || entered <= previousEntered) return;

    if (entered >= total) {
      announce(completeAnnouncement(total));
      return;
    }

    /*
      Which row flipped, BY POSITION. A host may legitimately name two players the same
      thing, so the row's index is its identity here — the same reasoning `BanBoard` keys
      its blind rows on, one rung up. An unfound row announces nothing rather than a name
      this screen would have had to invent.
    */
    const flipped = rows.find((row, index) => row.entered && previousRows[index] !== true);
    if (flipped === undefined) return;

    announce(lockedAnnouncement(flipped.playerName, entered, total));
  }, [rows, entered, total]);

  return (
    <section class="blind-locked">
      <h1 class="blind-locked__headline">{headlineFor(nextPlayerName)}</h1>

      <p class="blind-locked__progress">{progressLine(entered, total)}</p>

      {discardedPlayerName !== null && (
        <p class="blind-locked__discard">{discardNotice(discardedPlayerName)}</p>
      )}

      <h2 class="blind-locked__sub-heading">{PLAYERS_HEADING}</h2>

      {/*
        The blind arm, and never the public one. The union protects this arm by giving it
        no field that can carry a species; it does NOT stop a caller mounting the public arm
        during the blind stage, which is a legitimate configuration for snake and would be a
        total disclosure here. This call site is the only one on the blind path.

        The rows carry their own accessible sentences, so nothing wraps them and nothing
        repeats a player's name expecting it to be read out once.
      */}
      <BanBoard mode="blind" rows={rows} />

      {/*
        THE REVEAL IS A HOST ACT AND NEVER AN EFFECT — D-08.

        The rejected alternative, recorded so it is not "fixed" later: revealing
        automatically when the last submission lands. It would show every player's bans to
        the last player to enter, while they are still standing at the screen on their own,
        which is the exact small unfairness the whole ritual exists to avoid. The last
        submission lands here on a screen showing nothing and one button, and the room
        gathers before anybody taps it.
      */}
      <button
        type="button"
        class="blind-locked__action"
        ref={primaryActionRef}
        onClick={complete ? onReveal : onEnter}
      >
        {complete ? REVEAL_LABEL : enterLabel(nextPlayerName)}
      </button>

      {complete && <p class="blind-locked__reveal-helper">{revealHelper(total)}</p>}
    </section>
  );
}
