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
import type { RoundSpec } from '../../src/core/actions';
import { compile } from '../../src/core/compile';
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

/**
 * All-open, which is what a migrated schema-2 document folds to and what every test
 * predating the compiler was implicitly rendering.
 */
function openSchedule(rounds: number): RoundSpec[] {
  return compile([], rounds);
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
    schedule?: readonly RoundSpec[];
    teams?: Record<string, (string | null)[]>;
    currentTurn?: Turn | null;
    pickCount?: number;
    showName?: boolean;
    firstPlayerName?: string | null;
    hands?: Record<string, number[]> | null;
  }) {
    const { players, rounds } = overrides;
    render(
      <BoardGrid
        players={players}
        rounds={rounds}
        schedule={overrides.schedule ?? openSchedule(rounds)}
        teams={overrides.teams ?? emptyTeams(players, rounds)}
        currentTurn={overrides.currentTurn ?? null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={overrides.pickCount ?? 0}
        showName={overrides.showName ?? false}
        firstPlayerName={
          overrides.firstPlayerName === undefined ? players[0]?.name ?? null : overrides.firstPlayerName
        }
        hands={overrides.hands ?? null}
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

  // -------------------------------------------------------------------------
  // Typed round headers — CARD-02, D-15
  // -------------------------------------------------------------------------

  it('marks exactly the Mega rounds, and only those', () => {
    renderBoard({
      players: playersOf(4),
      rounds: 6,
      schedule: compile([{ kind: 'mega', count: 2 }], 6),
    });

    const marks = texts('.board__round-mark');
    expect(marks).toHaveLength(6);
    expect(marks).toEqual(['Mega round', 'Mega round', '', '', '', '']);
    expect(marks.filter((text) => text.startsWith('Mega'))).toHaveLength(2);

    // The label line is untouched, so R1..R6 still read as they always did.
    expect(texts('.board__round-label')).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  });

  it('reserves the marker line in every header, marked or not', () => {
    // STRUCTURAL, not dimensional. happy-dom performs no layout, so this cannot measure
    // the reserved 27px — it asserts the thing the CSS hangs that height on: the element
    // exists in all six headers and four of them are empty. Whether the empty variant is
    // the same height as the marked one is a stylesheet property and a human-verify one,
    // following this file's note about what it cannot prove.
    renderBoard({
      players: playersOf(4),
      rounds: 6,
      schedule: compile([{ kind: 'mega', count: 2 }], 6),
    });

    const marks = all('.board__round-mark');
    expect(marks).toHaveLength(6);
    expect(marks.filter((mark) => (mark.textContent ?? '') === '')).toHaveLength(4);

    // The paint is the only difference between the two variants.
    expect(all('.board__round-mark--mega')).toHaveLength(2);
  });

  it('reads Mega round to a screen reader while showing Mega on the board', () => {
    renderBoard({
      players: playersOf(4),
      rounds: 6,
      schedule: compile([{ kind: 'mega', count: 1 }], 6),
    });

    const marked = all('.board__round-mark--mega')[0];
    expect(marked).toBeDefined();
    if (marked === undefined) return;

    expect(marked.textContent).toBe('Mega round');

    // The suffix is present but visually hidden, so the 86px cell shows `Mega` alone.
    const hidden = marked.querySelector('.visually-hidden');
    expect(hidden).not.toBeNull();
    expect(hidden?.textContent).toBe(' round');
  });

  it('shows no marker anywhere for a document with no compiled schedule', () => {
    // A migrated schema-2 board. `selectSchedule` folds its empty schedule to all-open,
    // and the board it produces is the board Phase 2 shipped.
    renderBoard({ players: playersOf(8), rounds: 6, schedule: openSchedule(6) });

    expect(host.textContent ?? '').not.toContain('Mega');
    expect(all('.board__round-mark--mega')).toHaveLength(0);
    expect(all('.board__round-mark')).toHaveLength(6);
    expect(texts('.board__round')).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  });

  it('does not shift the grid when the schedule is reordered', () => {
    // The same six headers and the same six marker lines, in both orders. Only WHICH ones
    // carry text changes — which is the whole point of reserving the line.
    const canonical: RoundSpec[] = compile([{ kind: 'mega', count: 2 }], 6);
    const reordered: RoundSpec[] = [
      { index: 1, kind: 'open' },
      { index: 2, kind: 'mega' },
      { index: 3, kind: 'open' },
      { index: 4, kind: 'mega' },
      { index: 5, kind: 'open' },
      { index: 6, kind: 'open' },
    ];

    renderBoard({ players: playersOf(4), rounds: 6, schedule: canonical });
    expect(all('.board__round-mark')).toHaveLength(6);
    expect(all('.board__cell')).toHaveLength(24);
    expect(texts('.board__round-mark')).toEqual(['Mega round', 'Mega round', '', '', '', '']);

    renderBoard({ players: playersOf(4), rounds: 6, schedule: reordered });
    expect(all('.board__round-mark')).toHaveLength(6);
    expect(all('.board__cell')).toHaveLength(24);
    expect(texts('.board__round-mark')).toEqual(['', 'Mega round', '', 'Mega round', '', '']);
  });

  it('reads a round the schedule has no entry for as open rather than crashing', () => {
    renderBoard({ players: playersOf(4), rounds: 6, schedule: compile([], 2) });

    expect(all('.board__round-mark')).toHaveLength(6);
    expect(all('.board__round-mark--mega')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("BoardGrid's empty state names the person who goes first", () => {
  it('names them, and no longer says the pool is somewhere it is not', () => {
    render(
      <BoardGrid
        players={playersOf(4)}
        rounds={6}
        schedule={openSchedule(6)}
        teams={emptyTeams(playersOf(4), 6)}
        currentTurn={null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={0}
        showName={false}
        firstPlayerName="Ada"
        hands={null}
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
        schedule={openSchedule(6)}
        teams={{}}
        currentTurn={null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={0}
        showName={false}
        firstPlayerName={null}
        hands={null}
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
        schedule={openSchedule(6)}
        teams={emptyTeams(playersOf(4), 6)}
        currentTurn={null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={1}
        showName={false}
        firstPlayerName="Ada"
        hands={null}
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
        schedule={openSchedule(6)}
        teams={emptyTeams(players, 6)}
        currentTurn={turn}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={20}
        showName={false}
        firstPlayerName="Eli"
        hands={null}
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
        schedule={openSchedule(6)}
        teams={emptyTeams(players, 6)}
        currentTurn={null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={48}
        showName={false}
        firstPlayerName={null}
        hands={null}
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
        schedule={openSchedule(6)}
        teams={filledTeams()}
        currentTurn={null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={16}
        showName={showName}
        firstPlayerName={null}
        hands={null}
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

// ---------------------------------------------------------------------------
// Hand strips in the board rows — CARD-07, D-24
// ---------------------------------------------------------------------------

describe('the hand strip on a board row', () => {
  const players = playersOf(3);

  function renderHands(hands: Record<string, number[]> | null, rounds = 6) {
    render(
      <BoardGrid
        players={players}
        rounds={rounds}
        schedule={openSchedule(rounds)}
        teams={emptyTeams(players, rounds)}
        currentTurn={null}
        entryById={ENTRY_BY_ID}
        spriteMeta={SPRITE_META}
        pickCount={0}
        showName={false}
        firstPlayerName="Ada"
        hands={hands}
      />,
      host,
    );
  }

  /** Every player's full hand, so a test can vary one row and leave the rest alone. */
  function fullHands(rounds = 6): Record<string, number[]> {
    const hands: Record<string, number[]> = {};
    for (const player of players) {
      hands[player.id] = Array.from({ length: rounds }, (_, index) => index + 1);
    }
    return hands;
  }

  it('renders one pip per card the tournament deals, in every row', () => {
    renderHands(fullHands());

    expect(all('.hand-strip')).toHaveLength(3);
    expect(all('.hand-strip__pip')).toHaveLength(18);
    expect(texts('.hand-strip__pips')[0]).toBe('123456');
  });

  it('deals four pips at four rounds rather than six of anything', () => {
    renderHands(fullHands(4), 4);

    expect(all('.hand-strip__pip')).toHaveLength(12);
    expect(texts('.hand-strip__pips')[0]).toBe('1234');
  });

  it('strikes AND dims a spent pip, never one alone', () => {
    // Two signals, and neither of them is hue. Dimming alone is this project's disabled
    // convention and would say "unavailable" about a card the player deliberately spent.
    renderHands({ ...fullHands(), p1: [1, 2, 4, 5, 6] });

    const spent = all('.hand-strip__pip--struck');
    expect(spent).toHaveLength(1);
    expect(spent[0]?.textContent).toBe('3');
    expect(spent[0]?.classList.contains('hand-strip__pip--dimmed')).toBe(true);
    expect(all('.hand-strip__pip--dimmed')).toHaveLength(1);
  });

  it('keeps a spent pip in its own position rather than shuffling the rest up', () => {
    renderHands({ ...fullHands(), p1: [1, 2, 4, 5, 6] });
    expect(texts('.hand-strip__pips')[0]).toBe('123456');
  });

  it('hides the pips from assistive technology and speaks one sentence instead', () => {
    renderHands({ ...fullHands(), p1: [2, 5, 6] });

    expect(all('.hand-strip__pips').every((strip) => strip.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
    expect(texts('.hand-strip .visually-hidden')[0]).toBe('Ada holds 2, 5 and 6.');
  });

  it('composes the summary for one, two and no cards', () => {
    renderHands({ ...fullHands(), p1: [4] });
    expect(texts('.hand-strip .visually-hidden')[0]).toBe('Ada holds 4.');

    renderHands({ ...fullHands(), p1: [2, 5] });
    expect(texts('.hand-strip .visually-hidden')[0]).toBe('Ada holds 2 and 5.');

    renderHands({ ...fullHands(), p1: [] });
    expect(texts('.hand-strip .visually-hidden')[0]).toBe('Ada holds no cards.');
  });

  it('names each row’s own player in that row’s sentence', () => {
    renderHands({ p1: [1], p2: [2, 3], p3: [] });

    expect(texts('.hand-strip .visually-hidden')).toEqual([
      'Ada holds 1.',
      'Bo holds 2 and 3.',
      'Cass holds no cards.',
    ]);
  });

  it('renders no strip at all for a migrated schema-2 board', () => {
    // Picks present, no compiled schedule, no card ever played. Six unspent pips would be
    // a confident lie about a draft that ran strict alternation and dealt nothing.
    renderHands(null);

    expect(all('.hand-strip')).toHaveLength(0);
    expect(all('.hand-strip__pip')).toHaveLength(0);
    expect(texts('.board__label')).toEqual(['Ada', 'Bo', 'Cass']);
  });

  it('stacks exactly two children in the label cell, and adds no height of its own', () => {
    // STRUCTURAL, not dimensional — happy-dom performs no layout, following this file's
    // note about what it cannot prove. 03-UI-SPEC §Layout Budget spends 30 + 4 + 30 = 64px
    // against the 64px `.board__cell` already reserves, so the strip is meant to cost zero
    // additional row height. What is checkable here is the shape that claim rests on: two
    // stacked children, and not one element in the whole board declaring a height inline.
    // The physical measurement belongs to the DRFT-14 pass.
    renderHands(fullHands());

    for (const label of all('.board__label')) {
      expect(label.children).toHaveLength(2);
      expect(label.children[0]?.className).toBe('board__label-name');
      expect(label.children[1]?.className).toBe('hand-strip');
    }

    // The grid template is the ONE inline style on this component, and it sets columns.
    const inline = all('[style]');
    expect(inline).toHaveLength(1);
    expect(inline[0]?.className).toBe('board__grid');
    expect(inline[0]?.style.height).toBe('');
    expect(inline[0]?.style.minHeight).toBe('');
  });

  it('keeps the name on its own line, so the row still reads as one player', () => {
    renderHands(fullHands());
    expect(texts('.board__label-name')).toEqual(['Ada', 'Bo', 'Cass']);
  });

  it('puts no control in the strip', () => {
    renderHands(fullHands());
    expect(all('button')).toHaveLength(0);
    expect(all('a')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The swappable board cell — 03-UI-SPEC Amendment 1, SWAP-02, D-27
// ---------------------------------------------------------------------------

/**
 * Real names, because two of the assertions below are on an exact sentence.
 *
 * `entryAt` produces `Mon 0`, which would make `Swap Mon 0 out of round 1` read as a
 * template that leaked. The copy contract is a contract down to the wording, so the fixture
 * has to carry a species name a person would recognise.
 */
const NAMED_ENTRIES: RosterEntry[] = ['Blastoise', 'Garchomp', 'Rotom-Wash'].map(
  (name, index) => ({ ...entryAt(index), id: `named-${index}`, name }),
);

const NAMED_BY_ID: ReadonlyMap<string, RosterEntry> = new Map(
  NAMED_ENTRIES.map((entry) => [entry.id, entry]),
);

const NAMED_SPRITE_META: SpriteMeta = {
  nativeWidth: 96,
  nativeHeight: 96,
  byRosterId: Object.fromEntries(
    NAMED_ENTRIES.map((entry) => [
      entry.id,
      { pokeapiId: entry.num, file: `${entry.num}.png`, slug: entry.id },
    ]),
  ),
};

describe('a board cell is a button under four conditions and no others', () => {
  const PLAYERS = playersOf(3);
  const ROUNDS = 3;

  /** `p1` holds two species; `p2` holds one; `p3` holds none. */
  function partialTeams(): Record<string, (string | null)[]> {
    return {
      p1: ['named-0', 'named-1', null],
      p2: ['named-2', null, null],
      p3: [null, null, null],
    };
  }

  function renderSwapBoard(options: {
    swapPlayerId?: string | null;
    onArmSwap?: ((playerId: string, round: number) => void) | null;
    showName?: boolean;
    omitSwapProps?: boolean;
  }) {
    const swapProps = options.omitSwapProps
      ? {}
      : {
          swapPlayerId: options.swapPlayerId ?? null,
          onArmSwap: options.onArmSwap ?? null,
        };

    render(
      <BoardGrid
        players={PLAYERS}
        rounds={ROUNDS}
        schedule={openSchedule(ROUNDS)}
        teams={partialTeams()}
        currentTurn={null}
        entryById={NAMED_BY_ID}
        spriteMeta={NAMED_SPRITE_META}
        pickCount={3}
        showName={options.showName ?? true}
        firstPlayerName={null}
        hands={null}
        {...swapProps}
      />,
      host,
    );
  }

  it('names the swap it starts, and names the round it starts it from', () => {
    renderSwapBoard({ swapPlayerId: 'p1', onArmSwap: () => {} });

    const buttons = all('.board__grid button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Swap Blastoise out of round 1');
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Swap Garchomp out of round 2');
  });

  it('leaves the sprite decorative, because the button carries the name', () => {
    renderSwapBoard({ swapPlayerId: 'p1', onArmSwap: () => {} });

    for (const sprite of all('.board__cell--swappable .mon-chip__sprite')) {
      expect(sprite.getAttribute('alt')).toBe('');
    }
  });

  it('keeps the sprite decorative in split too, where there is no visible name', () => {
    // The INVERSE of the `nameText` rule, and the reason the two are derived together.
    // Without a swap the sprite has to carry the name in `split`; with one the button
    // already does, and a sprite repeating it would announce the species twice and the
    // purpose never.
    renderSwapBoard({ swapPlayerId: 'p1', onArmSwap: () => {}, showName: false });

    const buttons = all('.board__grid button');
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Swap Blastoise out of round 1');
    expect(all('.board__cell--swappable .mon-chip__sprite')[0]?.getAttribute('alt')).toBe('');
  });

  it('does not make a cell belonging to anybody else a button', () => {
    renderSwapBoard({ swapPlayerId: 'p1', onArmSwap: () => {} });

    // p2 holds a filled cell and is not on the clock, so it stays a readout.
    const cells = all('.board__cell--filled');
    const p2Cell = cells.find((cell) => cell.textContent?.includes('Rotom-Wash'));
    expect(p2Cell).toBeDefined();
    expect(p2Cell?.querySelector('button')).toBeNull();
    expect(p2Cell?.className).not.toContain('board__cell--swappable');
  });

  it('does not make an EMPTY cell a button, even for the player on the clock', () => {
    renderSwapBoard({ swapPlayerId: 'p1', onArmSwap: () => {} });

    for (const cell of all('.board__cell--empty')) {
      expect(cell.querySelector('button')).toBeNull();
      expect(cell.className).not.toContain('board__cell--swappable');
    }
  });

  it('renders zero buttons in the whole board grid when no player may swap', () => {
    // `swapBudget: 0` reaches this component as `swapPlayerId: null`, and the entire
    // feature disappears rather than rendering inert.
    renderSwapBoard({ swapPlayerId: null, onArmSwap: null });

    expect(all('.board__grid button')).toHaveLength(0);
    expect(all('.board__cell--swappable')).toHaveLength(0);
  });

  it('is byte-identical to a board that was never told about swaps at all', () => {
    // The Amendment 1 promise, asserted rather than claimed: a tournament with no swap
    // budget sees no change from Phase 2, down to the markup.
    renderSwapBoard({ omitSwapProps: true });
    const untold = host.innerHTML;

    renderSwapBoard({ swapPlayerId: null, onArmSwap: null });
    expect(host.innerHTML).toBe(untold);
  });

  it('hands the composition root the player id and the 1-based round, and nothing else', () => {
    const armed: { playerId: string; round: number }[] = [];
    renderSwapBoard({
      swapPlayerId: 'p1',
      onArmSwap: (playerId, round) => armed.push({ playerId, round }),
    });

    all('.board__grid button')[1]?.click();

    // Round 2, not slot index 1 — `selectTeams` files a round-`r` pick into slot `r - 1`,
    // and `swap/made` names the ROUND.
    expect(armed).toEqual([{ playerId: 'p1', round: 2 }]);
  });

  it('renders a real button rather than a div wearing a role', () => {
    renderSwapBoard({ swapPlayerId: 'p1', onArmSwap: () => {} });

    const button = all('.board__grid button')[0];
    expect(button?.tagName).toBe('BUTTON');
    // `type="button"` and not the default `submit`, which would post a form if the board
    // ever landed inside one.
    expect(button?.getAttribute('type')).toBe('button');
  });
});
