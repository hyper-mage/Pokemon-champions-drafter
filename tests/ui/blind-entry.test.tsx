// @vitest-environment happy-dom

/**
 * The blind entry surface — BAN-04, BAN-05, D-04, D-16, `04-UI-SPEC` §5.
 *
 * The surface a player's bans are actually typed on, and the one moment in the whole phase
 * when a species name is deliberately on screen. Everything here is about how completely
 * that moment is bounded: what is on the surface, what is not, and what it can reach.
 *
 * ## Assertion S1 is checked by a grep, not by a case in this file
 *
 * The module must not import the live region, so a species name has no route to a channel
 * that outlives the render that wrote it. That is a static property of the source and the
 * plan greps for it; a runtime test could only ever show that one particular sequence of
 * clicks stayed quiet. The reset in `beforeEach` below is still required — this file mounts
 * `PoolGrid`, which speaks its own filter counts, and those name no species.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { BlindEntry } from '../../src/ui/components/BlindEntry';
import { announce } from '../../src/ui/components/LiveRegion';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = SNAPSHOT.entries;

/** The committed roster's size, which the count line reports. */
const ROSTER_SIZE = 235;

const SPRITE_META: SpriteMeta = {
  nativeWidth: 96,
  nativeHeight: 96,
  byRosterId: {},
};

function entryAt(index: number): RosterEntry {
  const entry = ENTRIES[index];
  if (entry === undefined) throw new Error(`the committed roster has no entry ${index}`);
  return entry;
}

let host: HTMLDivElement;

beforeEach(() => {
  // `announce` writes a module-level signal that outlives any render.
  announce('');
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

interface MountOptions {
  playerName?: string;
  required?: number;
  onLockIn?: (monIds: string[]) => void;
  onDiscard?: () => void;
}

function mountEntry({
  playerName = 'Sam',
  required = 2,
  onLockIn = () => undefined,
  onDiscard = () => undefined,
}: MountOptions = {}): void {
  act(() => {
    render(
      <BlindEntry
        playerName={playerName}
        required={required}
        entries={ENTRIES}
        spriteMeta={SPRITE_META}
        onLockIn={onLockIn}
        onDiscard={onDiscard}
      />,
      host,
    );
  });
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function text(selector: string): string | null {
  return host.querySelector(selector)?.textContent?.trim() ?? null;
}

function heading(): HTMLHeadingElement {
  const element = host.querySelector<HTMLHeadingElement>('h1.blind-entry__headline');
  if (element === null) throw new Error('the entry surface rendered no headline');
  return element;
}

function lockButton(): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('.blind-entry__lock');
  if (button === null) throw new Error('the entry surface rendered no lock control');
  return button;
}

function hideButton(): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('.blind-entry__hide');
  if (button === null) throw new Error('the entry surface rendered no hide control');
  return button;
}

function typeaheadInput(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('#blind-entry-ban-input');
  if (input === null) throw new Error('the entry surface rendered no ban field');
  return input;
}

function chipNames(): string[] {
  return [...host.querySelectorAll<HTMLElement>('.ban-chip')].map(
    (chip) => chip.getAttribute('aria-label') ?? '',
  );
}

/** Choose a species through the grid, which is the path that does not need a query typed. */
function pickFromGrid(entry: RosterEntry): void {
  const cell = [...host.querySelectorAll<HTMLButtonElement>('button.mon-card')].find((button) =>
    (button.getAttribute('aria-label') ?? '').startsWith(entry.name),
  );
  if (cell === undefined) throw new Error(`no pool cell for ${entry.name}`);
  act(() => {
    cell.click();
  });
}

function chooseCount(count: number): RosterEntry[] {
  const chosen = Array.from({ length: count }, (_, index) => entryAt(index));
  chosen.forEach(pickFromGrid);
  return chosen;
}

// ---------------------------------------------------------------------------
// The surface is the whole working area
// ---------------------------------------------------------------------------

describe('BlindEntry, as the entire screen', () => {
  /**
   * BAN-05 read literally. `04-UI-SPEC` §5's first line is "Full-screen. No top bar, no turn
   * banner, no panes", which is what makes this an interstitial rather than an input mask
   * over a visible screen — the distinction the requirement is actually about.
   */
  it('renders no chrome of any kind', () => {
    mountEntry();

    expect(host.querySelector('.top-bar')).toBeNull();
    expect(host.querySelector('.turn-banner')).toBeNull();
    expect(host.querySelector('.panes')).toBeNull();
    expect(host.querySelector('.pane__scroll')).toBeNull();
  });

  it('names the player in a focusable headline', () => {
    mountEntry({ playerName: 'Sam' });

    expect(heading().textContent).toBe("Sam's bans");
    expect(heading().getAttribute('tabindex')).toBe('-1');
  });

  /**
   * `04-UI-SPEC` §Interaction. Focus lands on the HEADING and not on the field, because the
   * one fact that must never be got wrong is WHICH PLAYER is being entered — an auto-focused
   * input announces the field and leaves the name unread. The field is the next tab stop.
   */
  it('moves focus to the headline on mount, not to the typeahead', () => {
    mountEntry();

    expect(document.activeElement).toBe(heading());
    expect(document.activeElement).not.toBe(typeaheadInput());
  });

  it('counts the pending selection against the allotment', () => {
    mountEntry({ required: 2 });

    expect(text('.blind-entry__progress')).toBe('0 of 2 chosen');

    chooseCount(1);

    expect(text('.blind-entry__progress')).toBe('1 of 2 chosen');
  });

  it('labels the ban field for a host reading names off a screen', () => {
    mountEntry();

    const label = host.querySelector<HTMLLabelElement>('label[for="blind-entry-ban-input"]');
    expect(label?.textContent).toBe('Ban a Pokémon by name');
    expect(label?.className).toBe('visually-hidden');
    expect(typeaheadInput().getAttribute('placeholder')).toBe('Name');
  });
});

// ---------------------------------------------------------------------------
// The selection, and the two surfaces that show it
// ---------------------------------------------------------------------------

describe('the pending selection', () => {
  it('renders no chip list at all while nothing is chosen', () => {
    mountEntry();

    expect(host.querySelector('.ban-chip-list')).toBeNull();
    expect(chipNames()).toEqual([]);
  });

  /**
   * The chip is the remove control, and its accessible name says whose list it leaves.
   * `{playerName}'s bans` is a POSSESSIVE, so the article the shipped composer used to
   * hard-code had to move into the phrase — `from the Sam's bans` is not English.
   */
  it('names each chip for the player whose allotment it belongs to', () => {
    mountEntry({ playerName: 'Sam', required: 2 });

    const chosen = chooseCount(2);

    expect(chipNames()).toEqual([
      `Remove ${chosen[0]?.name} from Sam's bans`,
      `Remove ${chosen[1]?.name} from Sam's bans`,
    ]);
  });

  it('removes a species when its chip is pressed', () => {
    mountEntry({ required: 2 });

    chooseCount(2);
    expect(text('.blind-entry__progress')).toBe('2 of 2 chosen');

    act(() => {
      host.querySelector<HTMLButtonElement>('.ban-chip')?.click();
    });

    expect(text('.blind-entry__progress')).toBe('1 of 2 chosen');
  });

  /**
   * D-16: species only, one flat list, the ban-mode grid exactly as it ships — including
   * its capped scroll region and its own count line. `idPrefix` is what keeps this grid's
   * cell ids and radio-group names off any other grid's, which is a duplicate-id bug and a
   * merged-radio-group bug the moment two mount together.
   */
  it('mounts the ban-mode grid over the whole roster under its own id prefix', () => {
    mountEntry();

    expect(host.querySelector('.pool--ban')).not.toBeNull();
    expect(host.querySelectorAll('button.mon-card')).toHaveLength(ROSTER_SIZE);
    expect(host.querySelector('#blind-entry-density-standard')).not.toBeNull();
    expect(host.querySelector('#pool-density-standard')).toBeNull();
  });

  it('reports the count against the whole roster', () => {
    mountEntry({ required: 2 });

    expect(text('.pool__count')).toBe(`0 of ${ROSTER_SIZE} banned`);

    chooseCount(1);

    expect(text('.pool__count')).toBe(`1 of ${ROSTER_SIZE} banned`);
  });

  it('presses the chosen cells and nothing else', () => {
    mountEntry({ required: 2 });

    const chosen = chooseCount(1);

    const pressed = [...host.querySelectorAll<HTMLButtonElement>('button.mon-card')]
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => (button.getAttribute('aria-label') ?? '').split(',')[0]);

    expect(pressed).toEqual([chosen[0]?.name]);
  });
});

// ---------------------------------------------------------------------------
// The footer — the two controls and the reason
// ---------------------------------------------------------------------------

describe('the entry footer', () => {
  it('names the lock control for the player', () => {
    mountEntry({ playerName: 'Sam' });

    expect(lockButton().textContent).toBe("Lock in Sam's bans");
    expect(hideButton().textContent).toBe('Hide these bans');
  });

  /**
   * WR-04. `aria-disabled` alone and never native `disabled`, because a natively disabled
   * control is not focusable and the reason attached to it would be unreachable by
   * keyboard. Both attributes are SHED at the allotment rather than set to a negative
   * string — those are not the same thing to assistive technology.
   */
  it('marks the lock control blocked until the allotment is complete, then sheds both attributes', () => {
    mountEntry({ required: 2 });

    expect(lockButton().getAttribute('aria-disabled')).toBe('true');
    const describedBy = lockButton().getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(host.querySelector(`#${describedBy ?? ''}`)).not.toBeNull();

    chooseCount(2);

    expect(lockButton().hasAttribute('aria-disabled')).toBe(false);
    expect(lockButton().hasAttribute('aria-describedby')).toBe(false);
  });

  it('never uses a native disabled attribute on either control', () => {
    mountEntry({ required: 2 });

    expect(lockButton().hasAttribute('disabled')).toBe(false);
    expect(hideButton().hasAttribute('disabled')).toBe(false);

    chooseCount(2);

    expect(lockButton().hasAttribute('disabled')).toBe(false);
    expect(hideButton().hasAttribute('disabled')).toBe(false);
  });

  /**
   * S-5's singular/plural rule, and `Choose 1 more.` is reachable on the last selection of
   * every single entry — it is the common case, not an edge one.
   */
  it('says how many more, in the singular at one', () => {
    mountEntry({ required: 3 });

    const reason = host.querySelector('.blind-entry__reason');
    expect(reason?.getAttribute('role')).toBe('status');
    expect(reason?.textContent).toBe('Choose 3 more.');

    chooseCount(1);
    expect(text('.blind-entry__reason')).toBe('Choose 2 more.');

    pickFromGrid(entryAt(1));
    expect(text('.blind-entry__reason')).toBe('Choose 1 more.');
  });

  it('refuses to lock in while the allotment is short, and records nothing', () => {
    let locked: string[][] = [];
    mountEntry({ required: 2, onLockIn: (monIds) => locked.push(monIds) });

    chooseCount(1);

    act(() => {
      lockButton().click();
    });

    expect(locked).toEqual([]);
  });

  /**
   * NO CONFIRM AND NO REVIEW STEP — `04-UI-SPEC` §5. Locking is the same category of act as
   * making a pick (D-08), the selection is already fully visible as chips on this same
   * screen, and the host pays every extra tap once per player while the room waits.
   */
  it('locks in exactly the allotment on one tap, with no dialog', () => {
    const locked: string[][] = [];
    mountEntry({ playerName: 'Sam', required: 2, onLockIn: (monIds) => locked.push(monIds) });

    const chosen = chooseCount(2);

    act(() => {
      lockButton().click();
    });

    expect(locked).toEqual([[chosen[0]?.id, chosen[1]?.id]]);
    expect(host.querySelector('.dialog')).toBeNull();
  });

  /**
   * The panic control. Always live — it is live at zero chosen, which is when a host who
   * has only just opened the surface needs it — and it does not confirm, because a confirm
   * on a panic control is a second second of exposure.
   */
  it('hides on one tap at any point, with no dialog and nothing recorded', () => {
    let discards = 0;
    const locked: string[][] = [];
    mountEntry({
      required: 2,
      onDiscard: () => (discards += 1),
      onLockIn: (monIds) => locked.push(monIds),
    });

    act(() => {
      hideButton().click();
    });

    expect(discards).toBe(1);
    expect(locked).toEqual([]);
    expect(host.querySelector('.dialog')).toBeNull();
  });

  it('hides mid-selection just as readily', () => {
    let discards = 0;
    mountEntry({ required: 2, onDiscard: () => (discards += 1) });

    chooseCount(1);

    act(() => {
      hideButton().click();
    });

    expect(discards).toBe(1);
  });
});
