// @vitest-environment happy-dom

/**
 * `BanBoard` — one component, two rituals, and a props type that is the leak defence.
 *
 * The public arm is BAN-03's attributed surface: who banned what, in which pass, on the
 * shared screen. The blind arm is the progress board the locked state mounts, and it is
 * built here rather than beside that screen for one reason — `04-UI-SPEC` assertion S2
 * requires it to receive **no species ids at all**, and the only way to make that a type
 * error instead of a review item is for both arms to be members of one discriminated union
 * declared in one place.
 *
 * ## The load-bearing test in this file compiles rather than runs
 *
 * `@ts-expect-error` is an assertion `vitest` cannot see: it passes here because `esbuild`
 * strips types, and it is checked by `tsc --noEmit`, which `npm run build` runs first. That
 * is deliberate and it is the whole point. A future contributor "simplifying" the two arms
 * into one props type with optional fields would not break a rendering assertion — nothing
 * on screen would change — so the guarantee is asserted where it actually lives. When the
 * union widens, the directive stops suppressing anything and becomes an unused-directive
 * error, and the build fails on the file that documents why.
 *
 * What this file cannot prove, following `draft-board.test.tsx`'s precedent: happy-dom
 * performs no layout. Whether eight passes fit the split board pane without an internal
 * horizontal scrollbar is DRFT-14 assertion 16 and belongs to a human-verify checkpoint.
 * Nothing here measures a pixel.
 */

import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SpriteMeta } from '../../src/adapters/roster-source';
import type { RosterEntry } from '../../src/core/roster/types';
import { BanBoard, type BanBoardProps } from '../../src/ui/components/BanBoard';
import { announce } from '../../src/ui/components/LiveRegion';

// ---------------------------------------------------------------------------
// Fixtures. `spriteMissing: true` on every row so nothing here depends on a file on
// disk — the chip resolves to the committed placeholder and the test stays about names.

function entryAt(index: number): RosterEntry {
  return {
    id: `mon-${index}`,
    name: `Mon ${index}`,
    num: index + 1,
    types: ['Normal'],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    baseSpeciesId: `mon-${index}`,
    forme: null,
    megaCapable: false,
    megaFormes: [],
    spriteId: `mon-${index}`,
    spriteMissing: true,
  };
}

const SPRITE_META: SpriteMeta = {
  nativeWidth: 96,
  nativeHeight: 96,
  byRosterId: {},
};

/** Four host-authored names, none of them `Player N`. */
const NAMES = ['Ada', 'Bo', 'Cy', 'Sam'] as const;

/**
 * Four rows of `passes` cells, filled from a sparse `${row}:${column}` map.
 *
 * Both coordinates are 0-based, matching `nextCell` — the board's rows and columns are
 * positions rather than ids, so a fixture that numbered them differently from the prop
 * would be testing the fixture.
 */
function rowsWith(
  passes: number,
  filled: Readonly<Record<string, RosterEntry>> = {},
): { playerName: string; cells: (RosterEntry | null)[] }[] {
  return NAMES.map((playerName, row) => ({
    playerName,
    cells: Array.from({ length: passes }, (_, column) => filled[`${row}:${column}`] ?? null),
  }));
}

let host: HTMLDivElement;

beforeEach(() => {
  // `announce` writes a module-level signal that outlives every render.
  announce('');
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function all(selector: string): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>(selector));
}

function texts(selector: string): string[] {
  return all(selector).map((element) => element.textContent?.trim() ?? '');
}

// ---------------------------------------------------------------------------

describe('the public arm reads as the ban round so far', () => {
  it('heads every column with its pass, and never with a round', () => {
    render(
      <BanBoard
        mode="public"
        rows={rowsWith(3)}
        passes={3}
        nextCell={null}
        showName={false}
        spriteMeta={SPRITE_META}
      />,
      host,
    );

    expect(texts('.ban-board__pass')).toEqual(['Pass 1', 'Pass 2', 'Pass 3']);
    // `Round` is taken by the draft's own rounds and by the board's `R{n}` header, and two
    // meanings for one word on a shared screen is how a room ends up arguing about which
    // round it is (04-UI-SPEC §6). Asserted over the whole output, not just the headers.
    expect(host.textContent).not.toContain('Round');
    expect(host.textContent).not.toContain('round');
  });

  it('renders one row per player, in the order it was handed', () => {
    render(
      <BanBoard
        mode="public"
        rows={rowsWith(2)}
        passes={2}
        nextCell={null}
        showName={false}
        spriteMeta={SPRITE_META}
      />,
      host,
    );

    expect(texts('.ban-board__label-name')).toEqual([...NAMES]);
    // Four players times two passes.
    expect(all('.board__cell')).toHaveLength(8);
  });

  it('sets the column template from the pass count, over the shared label token', () => {
    render(
      <BanBoard
        mode="public"
        rows={rowsWith(8)}
        passes={8}
        nextCell={null}
        showName={false}
        spriteMeta={SPRITE_META}
      />,
      host,
    );

    const grid = host.querySelector<HTMLElement>('.ban-board__grid');
    // The label width arrives as the token the draft board declares, never as a second
    // literal that can drift from the board sitting beside it.
    expect(grid?.style.gridTemplateColumns).toBe(
      'var(--board-label-w) repeat(8, minmax(0, 1fr))',
    );
  });

  it('fills a banned cell and leaves the rest dashed', () => {
    render(
      <BanBoard
        mode="public"
        rows={rowsWith(2, { '0:0': entryAt(4) })}
        passes={2}
        nextCell={null}
        showName={false}
        spriteMeta={SPRITE_META}
      />,
      host,
    );

    expect(all('.board__cell--filled')).toHaveLength(1);
    // Seven of eight are still to come, and the dashed hairline is the shipped non-colour
    // signal for that — unchanged from the draft board.
    expect(all('.board__cell--empty')).toHaveLength(7);
  });

  it('hides the species name in split and shows it at board-full', () => {
    render(
      <BanBoard
        mode="public"
        rows={rowsWith(1, { '0:0': entryAt(4) })}
        passes={1}
        nextCell={null}
        showName={false}
        spriteMeta={SPRITE_META}
      />,
      host,
    );

    expect(all('.mon-chip__name')).toHaveLength(0);
    // No visible name, so the sprite has to carry the accessible one — the chip's shipped
    // inversion rule, inherited rather than reimplemented.
    expect(host.querySelector('img')?.getAttribute('alt')).toBe('Mon 4');

    render(
      <BanBoard
        mode="public"
        rows={rowsWith(1, { '0:0': entryAt(4) })}
        passes={1}
        nextCell={null}
        showName={true}
        spriteMeta={SPRITE_META}
      />,
      host,
    );

    expect(texts('.mon-chip__name')).toEqual(['Mon 4']);
    expect(host.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('marks exactly one cell as next, and the right one', () => {
    render(
      <BanBoard
        mode="public"
        rows={rowsWith(3)}
        passes={3}
        nextCell={{ row: 1, column: 2 }}
        showName={false}
        spriteMeta={SPRITE_META}
      />,
      host,
    );

    const marked = all('.board__cell--next');
    expect(marked).toHaveLength(1);
    // Row 1 is Bo, column 2 is Pass 3 — the sixth cell of a three-wide board.
    expect(all('.board__cell').indexOf(marked[0] as HTMLElement)).toBe(5);
  });

  it('marks no cell once every ban is placed', () => {
    render(
      <BanBoard
        mode="public"
        rows={rowsWith(3)}
        passes={3}
        nextCell={null}
        showName={false}
        spriteMeta={SPRITE_META}
      />,
      host,
    );

    expect(all('.board__cell--next')).toHaveLength(0);
  });
});

describe('the blind arm is structurally incapable of showing a species', () => {
  const PROGRESS: BanBoardProps = {
    mode: 'blind',
    rows: [
      { playerName: 'Ada', entered: true },
      { playerName: 'Bo', entered: false },
    ],
  };

  it('renders one row per player, with the word and nothing else', () => {
    render(<BanBoard {...PROGRESS} />, host);

    expect(texts('.ban-board__blind-name')).toEqual(['Ada', 'Bo']);
    expect(texts('.ban-board__blind-status')).toEqual(['Entered', 'Not yet']);
    // No sprite, because there is no entry to draw one from.
    expect(all('img')).toHaveLength(0);
  });

  it('gives each row one accessible sentence, and inverts the negative one', () => {
    render(<BanBoard {...PROGRESS} />, host);

    // `Not yet` is what the room reads across a table; `not yet entered` is the sentence,
    // because two words with no verb are not one.
    expect(texts('.ban-board__blind-row .visually-hidden')).toEqual([
      'Ada — Entered',
      'Bo — not yet entered',
    ]);
  });

  it('hides the visible halves from the sentence, so no name is announced twice', () => {
    render(<BanBoard {...PROGRESS} />, host);

    for (const element of all('.ban-board__blind-name, .ban-board__blind-status')) {
      expect(element.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('refuses a species id on a blind row at compile time (S2)', () => {
    render(
      <BanBoard
        mode="blind"
        rows={[
          // @ts-expect-error — S2, and this directive IS the assertion. A blind row carries
          // `{ playerName, entered }` and nothing else; widening it re-opens the leak the
          // union closes, and a widened row makes this suppression unused, which is itself
          // a type error. Deleting the guarantee therefore breaks this file rather than
          // passing silently.
          { playerName: 'Ada', entered: true, cells: [] },
        ]}
      />,
      host,
    );

    expect(texts('.ban-board__blind-name')).toEqual(['Ada']);
  });

  it('refuses sprite metadata on the blind arm at compile time (S2)', () => {
    const leaky: BanBoardProps = {
      mode: 'blind',
      rows: [{ playerName: 'Ada', entered: false }],
      // @ts-expect-error — the second half of the same guarantee. A component that cannot
      // address a sprite cannot draw one, so the arm has no route to a species even by way
      // of an image file name.
      spriteMeta: SPRITE_META,
    };

    render(<BanBoard {...leaky} />, host);

    expect(all('img')).toHaveLength(0);
  });
});

describe('neither arm invents a control or an accessibility model', () => {
  const ARMS: BanBoardProps[] = [
    {
      mode: 'public',
      rows: rowsWith(2, { '0:0': entryAt(1), '1:1': entryAt(2) }),
      passes: 2,
      nextCell: { row: 2, column: 0 },
      showName: true,
      spriteMeta: SPRITE_META,
    },
    {
      mode: 'blind',
      rows: NAMES.map((playerName, index) => ({ playerName, entered: index < 2 })),
    },
  ];

  it('puts nothing in the tab order and nothing under a pointer', () => {
    for (const props of ARMS) {
      render(<BanBoard {...props} />, host);

      // 03-UI-SPEC Amendment 1 makes a board cell a control under four conditions, all four
      // of which are about swaps. None holds here, in either arm.
      expect(all('button')).toHaveLength(0);
      expect(all('a')).toHaveLength(0);
      expect(all('[tabindex]')).toHaveLength(0);
    }
  });

  it('leaves the grid roles to the platform, exactly as the draft board does', () => {
    for (const props of ARMS) {
      render(<BanBoard {...props} />, host);

      const invented = all('[role]').map((element) => element.getAttribute('role'));
      // A second, differently-shaped board would be a second accessibility model for one
      // visual pattern. The shipped board invents none of these and neither does this one.
      expect(invented).not.toContain('grid');
      expect(invented).not.toContain('row');
      expect(invented).not.toContain('gridcell');
    }
  });
});
