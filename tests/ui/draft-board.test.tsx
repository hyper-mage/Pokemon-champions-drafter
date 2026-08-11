// @vitest-environment happy-dom

/**
 * The board at N players, and the accessible name that disappears when nobody is looking.
 *
 * Two contracts live here and only one of them is visible on screen.
 *
 * The visible one is DRFT-11: the board renders whatever player count and round count the
 * config asked for, rather than the six columns and two rows Phase 1 hardcoded.
 *
 * The invisible one is the reason this file exists. `MonChip` shows a sprite and a name in
 * `board-full` and a sprite alone in `split` (D-21). In the first state the sprite is
 * decorative and its alternative text is empty, because the visible name supplies the
 * accessible name. In the second there IS no visible name, so the same empty alternative
 * text would leave the cell with no accessible name at all — a board that reads as forty-
 * eight blank images to a screen reader, with nothing on screen to show for it.
 * 02-UI-SPEC calls that "the single most breakable contract in this phase" and 02-RESEARCH
 * files it as Pitfall 5. It is asserted here in both directions, against a real DOM.
 *
 * What this file cannot prove, following `read-only-shell.test.tsx`'s precedent: happy-dom
 * performs no layout. Whether eight rows fit the split board pane without an internal
 * scrollbar, and whether any name ellipsises at 1920px, are 02-UI-SPEC assertions 6 and 7
 * and belong to this plan's human-verify checkpoint. Nothing here measures a pixel.
 */

import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SpriteMeta } from '../../src/adapters/roster-source';
import type { PlayerConfig } from '../../src/core/model';
import type { RosterEntry } from '../../src/core/roster/types';
import type { Turn } from '../../src/core/selectors';
import { BoardGrid } from '../../src/ui/components/BoardGrid';
import { announce } from '../../src/ui/components/LiveRegion';
import { MonChip } from '../../src/ui/components/MonChip';

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

const ENTRIES: RosterEntry[] = Array.from({ length: 60 }, (_, index) => entryAt(index));

const ENTRY_BY_ID: ReadonlyMap<string, RosterEntry> = new Map(
  ENTRIES.map((entry) => [entry.id, entry]),
);

const SPRITE_META: SpriteMeta = {
  nativeWidth: 96,
  nativeHeight: 96,
  byRosterId: Object.fromEntries(
    ENTRIES.map((entry) => [entry.id, { pokeapiId: entry.num, file: `${entry.num}.png`, slug: entry.id }]),
  ),
};

/** Eight host-authored names, none of them `Player N`. */
const EIGHT_NAMES = ['Ada', 'Bo', 'Cass', 'Dev', 'Eli', 'Fern', 'Gus', 'Hari'] as const;

function playersOf(count: number): PlayerConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: EIGHT_NAMES[index] ?? `Extra ${index + 1}`,
  }));
}

/** Empty slot arrays for every player, `rounds` long. */
function emptyTeams(players: readonly PlayerConfig[], rounds: number): Record<string, (string | null)[]> {
  const teams: Record<string, (string | null)[]> = {};
  for (const player of players) {
    teams[player.id] = Array.from({ length: rounds }, () => null);
  }
  return teams;
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

describe('a board sprite carries an accessible name in both pane states', () => {
  it('names the sprite itself when the chip shows no name (split)', () => {
    render(<MonChip entry={entryAt(0)} spriteMeta={SPRITE_META} showName={false} />, host);

    expect(all('.mon-chip__name')).toHaveLength(0);

    const sprite = host.querySelector('img');
    expect(sprite).not.toBeNull();
    // The sprite is the ONLY thing in the cell, so it has to say what it is.
    expect(sprite?.getAttribute('alt')).toBe('Mon 0');
  });

  it('hands the name to the visible text when the chip shows one (board-full)', () => {
    render(<MonChip entry={entryAt(0)} spriteMeta={SPRITE_META} showName={true} />, host);

    expect(texts('.mon-chip__name')).toEqual(['Mon 0']);

    const sprite = host.querySelector('img');
    // Empty on purpose: the name beside it is the accessible name, and repeating it here
    // would announce the species twice.
    expect(sprite?.getAttribute('alt')).toBe('');
  });

  it('leaves an accessible name in the cell in both branches, never neither', () => {
    for (const showName of [false, true]) {
      render(<MonChip entry={entryAt(3)} spriteMeta={SPRITE_META} showName={showName} />, host);

      const spriteName = host.querySelector('img')?.getAttribute('alt') ?? '';
      const visibleName = host.querySelector('.mon-chip__name')?.textContent?.trim() ?? '';

      // Exactly one of the two carries it, and the union is never empty. This is the
      // assertion a caller with two independent props could break.
      expect(`${spriteName}${visibleName}`).toBe('Mon 3');

      render(null, host);
    }
  });

  it('keeps the intrinsic sprite size on the attributes in both branches', () => {
    for (const showName of [false, true]) {
      render(<MonChip entry={entryAt(1)} spriteMeta={SPRITE_META} showName={showName} />, host);

      const sprite = host.querySelector('img');
      expect(sprite?.getAttribute('width')).toBe('96');
      expect(sprite?.getAttribute('height')).toBe('96');

      render(null, host);
    }
  });

  it('is not interactive at either pane state', () => {
    render(<MonChip entry={entryAt(2)} spriteMeta={SPRITE_META} showName={true} />, host);
    expect(all('button')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('BoardGrid at N players and a derived round count', () => {
  function renderBoard(overrides: {
    players: readonly PlayerConfig[];
    rounds: number;
    teams?: Record<string, (string | null)[]>;
    currentTurn?: Turn | null;
    pickCount?: number;
    showName?: boolean;
    firstPlayerName?: string | null;
  }) {
    const { players, rounds } = overrides;
    render(
      <BoardGrid
        players={players}
        rounds={rounds}
        teams={overrides.teams ?? emptyTeams(players, rounds)}
        currentTurn={overrides.currentTurn ?? null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={overrides.pickCount ?? 0}
        showName={overrides.showName ?? false}
        firstPlayerName={
          overrides.firstPlayerName === undefined ? players[0]?.name ?? null : overrides.firstPlayerName
        }
      />,
      host,
    );
  }

  it('renders six round headers at six rounds', () => {
    renderBoard({ players: playersOf(4), rounds: 6 });
    expect(texts('.board__round')).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  });

  it('renders four at four, rather than six columns of nothing', () => {
    renderBoard({ players: playersOf(4), rounds: 4 });
    expect(texts('.board__round')).toEqual(['R1', 'R2', 'R3', 'R4']);
  });

  it('renders eight at eight, and labels the two beyond the literal list', () => {
    renderBoard({ players: playersOf(4), rounds: 8 });

    const labels = texts('.board__round');
    expect(labels).toHaveLength(8);
    // R7 and R8 come from the fallback, not from ROUND_LABELS.
    expect(labels.slice(-2)).toEqual(['R7', 'R8']);
  });

  it('sets the column template from the round count, so the grid is not stuck at six', () => {
    renderBoard({ players: playersOf(4), rounds: 8 });

    const grid = host.querySelector<HTMLElement>('.board__grid');
    expect(grid?.style.gridTemplateColumns).toBe(
      'var(--board-label-w) repeat(8, minmax(0, 1fr))',
    );
  });

  it('renders one row label per configured player, in the configured order', () => {
    renderBoard({ players: playersOf(8), rounds: 6 });

    expect(texts('.board__label')).toEqual([...EIGHT_NAMES]);
  });

  it('renders a cell for every player and round', () => {
    renderBoard({ players: playersOf(8), rounds: 6 });
    expect(all('.board__cell')).toHaveLength(48);
  });
});

// ---------------------------------------------------------------------------

describe("BoardGrid's empty state names the person who goes first", () => {
  it('names them, and no longer says the pool is somewhere it is not', () => {
    render(
      <BoardGrid
        players={playersOf(4)}
        rounds={6}
        teams={emptyTeams(playersOf(4), 6)}
        currentTurn={null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={0}
        showName={false}
        firstPlayerName="Ada"
      />,
      host,
    );

    expect(texts('.board__empty-heading')).toEqual(['No picks yet']);
    expect(texts('.board__empty-body')).toEqual([
      'Ada picks first. Choose any Pokémon in the pool to start Round 1.',
    ]);
  });

  it('drops the sentence entirely rather than rendering one with a hole in it', () => {
    render(
      <BoardGrid
        players={[]}
        rounds={6}
        teams={{}}
        currentTurn={null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={0}
        showName={false}
        firstPlayerName={null}
      />,
      host,
    );

    expect(texts('.board__empty-heading')).toEqual(['No picks yet']);
    expect(all('.board__empty-body')).toHaveLength(0);
  });

  it('shows no empty state once a pick exists', () => {
    render(
      <BoardGrid
        players={playersOf(4)}
        rounds={6}
        teams={emptyTeams(playersOf(4), 6)}
        currentTurn={null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={1}
        showName={false}
        firstPlayerName="Ada"
      />,
      host,
    );

    expect(all('.board__empty')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("the board's turn signal", () => {
  const players = playersOf(8);

  it('marks exactly one cell on the whole board', () => {
    const turn: Turn = { round: 3, playerId: 'p5', pickIndex: 20 };

    render(
      <BoardGrid
        players={players}
        rounds={6}
        teams={emptyTeams(players, 6)}
        currentTurn={turn}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={20}
        showName={false}
        firstPlayerName="Eli"
      />,
      host,
    );

    const marked = all('.board__cell--next');
    expect(marked).toHaveLength(1);

    // And it is the right one: row 5, round 3.
    const cells = all('.board__cell');
    const only = marked[0];
    expect(only).toBeDefined();
    expect(cells.indexOf(only as HTMLElement)).toBe(4 * 6 + 2);
  });

  it('marks none once the draft is complete', () => {
    render(
      <BoardGrid
        players={players}
        rounds={6}
        teams={emptyTeams(players, 6)}
        currentTurn={null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={48}
        showName={false}
        firstPlayerName={null}
      />,
      host,
    );

    expect(all('.board__cell--next')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('showName reaches every chip on the board', () => {
  const players = playersOf(8);

  /** Two picks per row, so every row holds a chip. */
  function filledTeams(): Record<string, (string | null)[]> {
    const teams: Record<string, (string | null)[]> = {};
    players.forEach((player, row) => {
      teams[player.id] = [
        `mon-${row * 2}`,
        `mon-${row * 2 + 1}`,
        null,
        null,
        null,
        null,
      ];
    });
    return teams;
  }

  function renderWith(showName: boolean) {
    render(
      <BoardGrid
        players={players}
        rounds={6}
        teams={filledTeams()}
        currentTurn={null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={16}
        showName={showName}
        firstPlayerName={null}
      />,
      host,
    );
  }

  it('renders no chip name anywhere in split', () => {
    renderWith(false);

    expect(all('.mon-chip')).toHaveLength(16);
    expect(all('.mon-chip__name')).toHaveLength(0);
    // Every one of the sixteen sprites still says what it is.
    const alts = all('.mon-chip__sprite').map((sprite) => sprite.getAttribute('alt') ?? '');
    expect(alts.filter((alt) => alt === '')).toHaveLength(0);
  });

  it('renders every chip name in board-full', () => {
    renderWith(true);

    expect(all('.mon-chip')).toHaveLength(16);
    expect(all('.mon-chip__name')).toHaveLength(16);
    expect(texts('.mon-chip__name')[0]).toBe('Mon 0');
  });

  it('puts no control in any board cell, at either state', () => {
    renderWith(true);
    expect(all('button')).toHaveLength(0);
    expect(all('a')).toHaveLength(0);
  });
});
