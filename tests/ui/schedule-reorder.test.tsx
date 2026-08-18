// @vitest-environment happy-dom

/**
 * `SchedulePreview` — the rows, the reorder buttons, and the reasons they are inert.
 *
 * Three things here are worth a test rather than a review.
 *
 * The first is the five accessible-name cases. They are the only place the DESTINATION of
 * a move is stated, and 03-UI-SPEC leans on that: the announce-vs-focus question is
 * unresolved, so the newly focused button's own name is what a screen-reader user is
 * guaranteed to get. A name that dropped its destination would look identical on screen.
 *
 * The second is that `aria-disabled` is ABSENT — not `'false'` — once a move becomes
 * possible. That is WR-04, and `'false'` renders, reads and behaves exactly like the
 * correct value everywhere except in an assistive technology that believes it.
 *
 * The third is the focus handoff. Focus left on the pressed button makes a second press
 * reverse the first, which makes walking a Mega round down the schedule impossible by
 * keyboard — and nothing about the screen looks different when it regresses.
 *
 * Zero mocks: the component is pure props in, callbacks out.
 */

import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoundKind, RoundSpec } from '../../src/core/actions';
import { compile } from '../../src/core/compile';
import { announce } from '../../src/ui/components/LiveRegion';
import {
  SchedulePreview,
  type MoveDirection,
} from '../../src/ui/components/SchedulePreview';

const ROUNDS = 6;

/** A schedule from its kinds, indices contiguous from 1 — the shape `compile` emits. */
function scheduleOf(kinds: readonly RoundKind[]): RoundSpec[] {
  return kinds.map((kind, position) => ({ index: position + 1, kind }));
}

/** What `compile` actually produces for a requirement, rather than a hand-written echo. */
function compiled(megasPerTeam: number): RoundSpec[] {
  return compile([{ kind: 'mega', count: megasPerTeam }], ROUNDS);
}

/**
 * The parent's half of the contract, duplicated here deliberately.
 *
 * `ConfigScreen` owns the real one; this is the minimum a caller must do for the focus
 * handoff to have anywhere to land. A move swaps KINDS between fixed round numbers, so the
 * indices are rewritten from position rather than carried along with the kind.
 */
function swapKinds(
  schedule: readonly RoundSpec[],
  position: number,
  direction: MoveDirection,
): RoundSpec[] {
  const target = position + (direction === 'up' ? -1 : 1);
  const moved = schedule[position];
  const displaced = schedule[target];
  if (moved === undefined || displaced === undefined) return [...schedule];

  return schedule.map((spec, index) => ({
    index: index + 1,
    kind: index === position ? displaced.kind : index === target ? moved.kind : spec.kind,
  }));
}

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);

  // `announce` is a module-level signal that outlives any render. This component does not
  // write to it — the announcement is the parent's, per 03-UI-SPEC §2 — but the reset is
  // the file-level convention and costs nothing.
  announce('');
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function mount(schedule: readonly RoundSpec[], onMove: SpyMove = () => undefined): void {
  act(() => {
    render(<SchedulePreview schedule={schedule} onMove={onMove} />, host);
  });
}

type SpyMove = (index: number, direction: MoveDirection) => void;

/** A parent that actually performs the swap, for the assertions about what happens after. */
function Harness({ initial }: { initial: readonly RoundSpec[] }) {
  const [schedule, setSchedule] = useState<readonly RoundSpec[]>(initial);

  return (
    <SchedulePreview
      schedule={schedule}
      onMove={(position, direction) =>
        setSchedule((current) => swapKinds(current, position, direction))
      }
    />
  );
}

function mountHarness(initial: readonly RoundSpec[]): void {
  act(() => {
    render(<Harness initial={initial} />, host);
  });
}

function rowTexts(): string[] {
  return Array.from(host.querySelectorAll('li')).map(
    (row) => row.firstElementChild?.textContent?.trim() ?? '',
  );
}

function allButtons(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button'));
}

/** Every button carrying a visible label, in document order. */
function labelled(label: string): HTMLButtonElement[] {
  return allButtons().filter((button) => button.textContent?.trim() === label);
}

/** The `direction` button of row `round` (1-based), by position in document order. */
function moveButton(round: number, direction: MoveDirection): HTMLButtonElement {
  const found = labelled(direction === 'up' ? 'Move up' : 'Move down')[round - 1];
  if (found === undefined) throw new Error(`no ${direction} button on round ${round}`);
  return found;
}

function nameOf(button: HTMLButtonElement): string {
  return button.getAttribute('aria-label') ?? '';
}

function click(button: HTMLButtonElement): void {
  act(() => {
    button.click();
  });
}

describe('the schedule rows', () => {
  it('reads Round 1 — Mega down to Round 6 — Open for a requirement of 2', () => {
    mount(compiled(2));

    expect(rowTexts()).toEqual([
      'Round 1 — Mega',
      'Round 2 — Mega',
      'Round 3 — Open',
      'Round 4 — Open',
      'Round 5 — Open',
      'Round 6 — Open',
    ]);
  });

  it('renders the rows as list items of one ordered list', () => {
    mount(compiled(2));

    expect(host.querySelectorAll('ol')).toHaveLength(1);
    expect(host.querySelectorAll('ol > li')).toHaveLength(ROUNDS);
  });

  it('renders two buttons per row', () => {
    mount(compiled(2));

    expect(labelled('Move up')).toHaveLength(ROUNDS);
    expect(labelled('Move down')).toHaveLength(ROUNDS);
  });

  it('renders as many rows as the schedule has, never six', () => {
    mount(scheduleOf(['mega', 'open', 'open']));

    expect(rowTexts()).toEqual(['Round 1 — Mega', 'Round 2 — Open', 'Round 3 — Open']);
  });
});

describe('the accessible names', () => {
  it('names the destination round when the move would change the schedule', () => {
    mount(compiled(2));

    // Round 2 is the last Mega round; round 3 is open, so both of these move something.
    expect(nameOf(moveButton(3, 'up'))).toBe('Move up to round 2');
    expect(nameOf(moveButton(2, 'down'))).toBe('Move down to round 3');
  });

  it('says round 1 is already first, and contains its visible label', () => {
    mount(compiled(2));

    const button = moveButton(1, 'up');
    expect(nameOf(button)).toBe('Move up — round 1 is already first');
    expect(nameOf(button)).toContain('Move up');
  });

  it('says the last round is already last, naming the schedule length', () => {
    mount(compiled(2));

    expect(nameOf(moveButton(ROUNDS, 'down'))).toBe(
      'Move down — round 6 is already last',
    );
  });

  it('names the neighbour kind when the neighbour already holds it', () => {
    mount(compiled(2));

    // Round 2 up would put a Mega round where a Mega round already is.
    expect(nameOf(moveButton(2, 'up'))).toBe(
      'Move up — round 1 is already a Mega round',
    );
    // Round 3 down would put an open round where an open round already is.
    expect(nameOf(moveButton(3, 'down'))).toBe(
      'Move down — round 4 is already an open round',
    );
  });

  it('gives every button a name containing its visible label — SC 2.5.3', () => {
    mount(compiled(2));

    for (const button of allButtons()) {
      const visible = button.textContent?.trim() ?? '';
      expect(visible).not.toBe('');
      expect(nameOf(button)).toContain(visible);
    }
  });
});

describe('an inert move', () => {
  it('carries aria-disabled="true" and stays focusable', () => {
    mount(compiled(2));

    const button = moveButton(1, 'up');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);

    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('emits no onMove when clicked', () => {
    const onMove = vi.fn();
    mount(compiled(2), onMove);

    click(moveButton(1, 'up'));
    click(moveButton(ROUNDS, 'down'));
    click(moveButton(2, 'up'));

    expect(onMove).not.toHaveBeenCalled();
  });

  it('emits the position and direction when the move would change something', () => {
    const onMove = vi.fn();
    mount(compiled(2), onMove);

    click(moveButton(2, 'down'));

    // The ARRAY POSITION, 0-based — round 2 is position 1.
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(1, 'down');
  });

  it('sheds aria-disabled entirely once the move becomes possible — WR-04', () => {
    mount(scheduleOf(['mega', 'mega', 'open', 'open', 'open', 'open']));
    expect(moveButton(1, 'down').getAttribute('aria-disabled')).toBe('true');

    // Round 2 is now open, so round 1's Mega round has somewhere to go.
    mount(scheduleOf(['mega', 'open', 'mega', 'open', 'open', 'open']));

    // `null`, not `'false'`. An `aria-disabled="false"` would pass every other assertion
    // in this file and still be read as a disabled control by anything that believes it.
    expect(moveButton(1, 'down').getAttribute('aria-disabled')).toBe(null);
  });

  it('states the rule once beneath the list rather than per row', () => {
    mount(compiled(2));

    const rule = 'A move that would not change the schedule is unavailable.';
    expect(host.textContent).toContain(rule);
    expect(host.textContent?.split(rule)).toHaveLength(2);
  });
});

describe('when there is nothing to reorder', () => {
  it('renders no reorder controls at all for an all-open schedule', () => {
    mount(compiled(0));

    expect(rowTexts()).toHaveLength(ROUNDS);
    expect(labelled('Move up')).toHaveLength(0);
    expect(labelled('Move down')).toHaveLength(0);
    expect(allButtons()).toHaveLength(0);
  });

  it('says so, choosing the sentence from the schedule', () => {
    mount(compiled(0));
    expect(host.textContent).toContain('Every round is open, so there is nothing to reorder.');

    mount(compiled(ROUNDS));
    expect(host.textContent).toContain(
      'Every round is a Mega round, so there is nothing to reorder.',
    );
    expect(allButtons()).toHaveLength(0);
  });

  it('does not state the reorder rule when no button can be inert', () => {
    mount(compiled(0));

    expect(host.textContent).not.toContain(
      'A move that would not change the schedule is unavailable.',
    );
  });

  it('renders nothing for an empty schedule', () => {
    mount([]);

    expect(host.textContent).toBe('');
  });
});

describe('after a successful move', () => {
  it('puts focus on the same-named button of the destination row', () => {
    mountHarness(compiled(2));

    click(moveButton(2, 'down'));

    expect(rowTexts()[2]).toBe('Round 3 — Mega');
    expect(document.activeElement).toBe(moveButton(3, 'down'));
    expect(nameOf(moveButton(3, 'down'))).toBe('Move down to round 4');
  });

  it('lets a Mega round walk to the bottom without the pointer', () => {
    mountHarness(scheduleOf(['mega', 'open', 'open', 'open', 'open', 'open']));

    // Five presses, each on whatever now holds focus — which is the whole point of the
    // handoff. Pressing the SAME button five times would move nothing after the first.
    for (let press = 0; press < ROUNDS - 1; press += 1) {
      const focused = document.activeElement;
      click(
        focused instanceof HTMLButtonElement && focused.textContent?.trim() === 'Move down'
          ? focused
          : moveButton(1, 'down'),
      );
    }

    expect(rowTexts()).toEqual([
      'Round 1 — Open',
      'Round 2 — Open',
      'Round 3 — Open',
      'Round 4 — Open',
      'Round 5 — Open',
      'Round 6 — Mega',
    ]);
    expect(nameOf(moveButton(ROUNDS, 'down'))).toBe('Move down — round 6 is already last');
  });

  it('keeps the round numbers ascending — the kinds move, the rows do not', () => {
    mountHarness(compiled(2));

    click(moveButton(2, 'down'));
    click(moveButton(3, 'down'));

    expect(rowTexts().map((text) => text.split(' ')[1])).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
  });
});
