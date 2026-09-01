// @vitest-environment happy-dom

/**
 * The tournament library — PERS-08, D-14, 05-UI-SPEC §12.
 *
 * The load-bearing assertions here are the ones a plausible bug would still pass a looser
 * check on:
 *
 *   The ZERO-ENTRY ABSENCE is asserted by querying for the heading and expecting `null`,
 *   because "renders nothing" and "renders an empty list" look identical to any assertion
 *   that only counts rows.
 *
 *   The THREE STATUS STRINGS are asserted on the whole description rather than on a
 *   substring. Each is chosen by a different selector and a branch that fired for the
 *   wrong reason still contains every word of the right answer.
 *
 *   The PICK COUNT comes from a fold, so the fixture deliberately gives the log entries
 *   that are not picks. A component reading `log.length` would report a number that is
 *   wrong by exactly the size of that preamble and would agree with the fold on nothing.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cutTaken,
  draftStarted,
  matchRecorded,
  pickMade,
  poolBuilt,
  type Action,
  type Intent,
} from '../../src/core/actions';
import {
  SCHEMA_VERSION,
  type TournamentConfig,
  type TournamentDepth,
  type TournamentDoc,
} from '../../src/core/model';
import { announce } from '../../src/ui/components/LiveRegion';
import { TournamentLibrary } from '../../src/ui/components/TournamentLibrary';
import { LandingScreen } from '../../src/ui/screens/LandingScreen';

const LIBRARY_KEY = 'champions-drafter:library';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

function config(players: number, depth: TournamentDepth, formatLabel: string): TournamentConfig {
  return {
    formatLabel,
    players: Array.from({ length: players }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    })),
    rounds: 6,
    rosterVersion: 'mb',
    rosterChecksum: 'abc123',
    poolSize: players * 6,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth,
    rules: [{ kind: 'mega', count: 0 }],
    megaFormeBans: [],
    swapBudget: 0,
    swapRounds: 0,
    bansPerPlayer: 0,
    duplicateBanPolicy: 'bothApply',
    matchMetric: 'pokemonLeft',
    roundRobinFormat: 'bo1',
    bracketFormat: 'bo1',
  };
}

interface DocOptions {
  id: string;
  createdAt: number;
  players?: number;
  picks?: number;
  depth?: TournamentDepth;
  formatLabel?: string;
  /** Take a two-seed cut and record the final, so the bracket names a champion. */
  champion?: boolean;
}

/**
 * A well-SHAPED document. `fold` runs `apply`, which is total and does not validate —
 * legality is `canApply`'s job on the dispatch path — so a fixture only has to be
 * structurally right, which is what keeps these readable.
 *
 * The log opens with `pool/built` and `draft/started`, which is the point: they are two
 * entries that are not picks, so any composer reading `log.length` disagrees with the fold
 * immediately rather than at some edge.
 */
function libraryDoc(options: DocOptions): TournamentDoc {
  const players = options.players ?? 2;
  const picks = options.picks ?? 0;
  const conf = config(players, options.depth ?? 'draftOnly', options.formatLabel ?? 'Champions MB');
  const poolIds = Array.from({ length: players * 6 }, (_, index) => `mon-${index}`);

  const log: Action[] = [
    stamp(poolBuilt(poolIds, 'mb', 'abc123', 11, 0), 0),
    stamp(
      draftStarted(
        conf.players.map((player) => player.id),
        13,
      ),
      1,
    ),
  ];

  for (let index = 0; index < picks; index++) {
    const player = conf.players[index % players];
    if (player === undefined) continue;
    log.push(
      stamp(
        pickMade({
          playerId: player.id,
          monId: `mon-${index}`,
          round: Math.floor(index / players) + 1,
          pickIndex: index,
        }),
        index + 2,
      ),
    );
  }

  if (options.champion === true) {
    // A two-seed cut is one match, `br:1:1`, and that match IS the final — so recording it
    // is the whole of what makes `championId` non-null.
    log.push(stamp(cutTaken(['p1', 'p2']), log.length + 10));
    log.push(stamp(matchRecorded('br:1:1', 'p1', 'p2', 1, 0, 3), log.length + 10));
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id,
    createdAt: options.createdAt,
    config: conf,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };
}

/** Write the library key directly, which is the shape `listLibrary` reads. */
function seedLibrary(docs: readonly { doc: TournamentDoc; filedAt: number }[]): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, entries: docs }));
}

// ---------------------------------------------------------------------------

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  localStorage.clear();

  // `announce` writes a module-level signal that outlives every render, so a message left
  // by an earlier file would still be in the region when this one mounts.
  announce('');
});

afterEach(() => {
  render(null, host);
  host.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});

function mountLibrary(onOpen: (id: string) => void = () => undefined): void {
  act(() => {
    render(<TournamentLibrary onOpen={onOpen} />, host);
  });
}

function headingNamed(name: string): Element | null {
  return (
    Array.from(host.querySelectorAll('h1, h2, h3')).find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
}

function buttonsNamed(name: string): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button')).filter(
    (element) => element.textContent?.trim() === name,
  );
}

function descriptions(): string[] {
  return Array.from(host.querySelectorAll('.tournament-library__description')).map(
    (element) => element.textContent ?? '',
  );
}

// ---------------------------------------------------------------------------

describe('the library with nothing filed', () => {
  it('renders no heading and no list at all', () => {
    mountLibrary();

    // The ABSENCE is the assertion, on `LandingScreen`'s rule: saying "nothing here" would
    // be noise on the screen with the least to say.
    expect(headingNamed('Your tournaments')).toBeNull();
    expect(host.querySelector('.tournament-library')).toBeNull();
    expect(host.innerHTML).toBe('');
  });

  it('leaves the landing screen with exactly its two first-visit actions', () => {
    act(() => {
      render(
        <LandingScreen
          saved={null}
          storageBlocked={false}
          onAcknowledgeStorage={() => undefined}
          onNewTournament={() => undefined}
          onResume={() => undefined}
          onImportFile={() => undefined}
        />,
        host,
      );
    });

    expect(headingNamed('Your tournaments')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(2);
  });
});

describe('the library with entries', () => {
  it('heads the section `Your tournaments` and lists one row per entry', () => {
    seedLibrary([
      { doc: libraryDoc({ id: 'a', createdAt: Date.UTC(2026, 1, 2, 12) }), filedAt: 20 },
      { doc: libraryDoc({ id: 'b', createdAt: Date.UTC(2026, 1, 3, 12) }), filedAt: 10 },
    ]);
    mountLibrary();

    expect(headingNamed('Your tournaments')).not.toBeNull();
    expect(host.querySelectorAll('.tournament-library__row')).toHaveLength(2);
  });

  it('orders rows newest first by createdAt, not by filedAt', () => {
    // `filedAt` is deliberately the OPPOSITE order, which is the state a reopened and
    // re-filed tournament produces. §12 orders the visible list by when the night
    // happened.
    seedLibrary([
      {
        doc: libraryDoc({ id: 'older', createdAt: Date.UTC(2026, 0, 5, 12), formatLabel: 'Older' }),
        filedAt: 999,
      },
      {
        doc: libraryDoc({ id: 'newer', createdAt: Date.UTC(2026, 5, 9, 12), formatLabel: 'Newer' }),
        filedAt: 1,
      },
    ]);
    mountLibrary();

    const labels = Array.from(host.querySelectorAll('.tournament-library__label')).map(
      (element) => element.textContent,
    );
    expect(labels).toEqual(['Newer', 'Older']);
  });

  it('heads each row with the document formatLabel', () => {
    seedLibrary([
      {
        doc: libraryDoc({
          id: 'a',
          createdAt: Date.UTC(2026, 1, 2, 12),
          formatLabel: 'Thursday night MB',
        }),
        filedAt: 5,
      },
    ]);
    mountLibrary();

    expect(headingNamed('Thursday night MB')).not.toBeNull();
  });

  it('offers Open tournament and Download JSON on every row', () => {
    seedLibrary([
      { doc: libraryDoc({ id: 'a', createdAt: Date.UTC(2026, 1, 2, 12) }), filedAt: 5 },
      { doc: libraryDoc({ id: 'b', createdAt: Date.UTC(2026, 1, 3, 12) }), filedAt: 6 },
    ]);
    mountLibrary();

    expect(buttonsNamed('Open tournament')).toHaveLength(2);
    expect(buttonsNamed('Download JSON')).toHaveLength(2);
  });

  it('reports the clicked row id to its caller', () => {
    seedLibrary([
      { doc: libraryDoc({ id: 'only-one', createdAt: Date.UTC(2026, 1, 2, 12) }), filedAt: 5 },
    ]);
    const onOpen = vi.fn();
    mountLibrary(onOpen);

    act(() => {
      buttonsNamed('Open tournament')[0]?.click();
    });

    expect(onOpen).toHaveBeenCalledWith('only-one');
  });

  it('gives every control its own tab stop rather than a roving tabindex', () => {
    seedLibrary([
      { doc: libraryDoc({ id: 'a', createdAt: Date.UTC(2026, 1, 2, 12) }), filedAt: 5 },
      { doc: libraryDoc({ id: 'b', createdAt: Date.UTC(2026, 1, 3, 12) }), filedAt: 6 },
    ]);
    mountLibrary();

    // A roving tabindex parks `-1` on every control but one. Four plain tab stops is the
    // assertion, and it is the observable difference.
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button.getAttribute('tabindex')).toBeNull();
    }
  });

  it('renders the row heading and the description at their contract sizes', () => {
    seedLibrary([
      { doc: libraryDoc({ id: 'a', createdAt: Date.UTC(2026, 1, 2, 12) }), filedAt: 5 },
    ]);
    mountLibrary();

    // The classes are the contract; the sizes they carry are asserted in the stylesheet
    // rather than by reading a computed style happy-dom does not resolve from a token.
    expect(host.querySelector('.tournament-library__label')).not.toBeNull();
    expect(host.querySelector('.tournament-library__description')).not.toBeNull();
  });
});

describe('the row description', () => {
  it('reads {date} — {m} players, in progress, {picks} of {total} picks', () => {
    seedLibrary([
      {
        doc: libraryDoc({
          id: 'a',
          createdAt: new Date(2026, 1, 2, 12).getTime(),
          players: 4,
          picks: 5,
        }),
        filedAt: 5,
      },
    ]);
    mountLibrary();

    // 4 players × 6 rounds is 24 picks total; 5 are recorded. The log holds SEVEN entries,
    // so a `log.length` reading would say 7 and this exact string is what excludes it.
    expect(descriptions()).toEqual(['2026-02-02 — 4 players, in progress, 5 of 24 picks']);
  });

  it('formats the date absolutely and never relatively', () => {
    seedLibrary([
      {
        doc: libraryDoc({ id: 'a', createdAt: new Date(2026, 10, 7, 9).getTime() }),
        filedAt: 5,
      },
    ]);
    mountLibrary();

    expect(descriptions()[0]?.startsWith('2026-11-07 — ')).toBe(true);
    expect(host.textContent).not.toContain('ago');
  });

  it('agrees with the singular on a one-player document', () => {
    seedLibrary([
      {
        doc: libraryDoc({
          id: 'a',
          createdAt: new Date(2026, 1, 2, 12).getTime(),
          players: 1,
          picks: 1,
        }),
        filedAt: 5,
      },
    ]);
    mountLibrary();

    // `1 player` and `6 picks` in one sentence: the two nouns agree with two different
    // numbers, which is what a shared plural helper would get wrong while still producing
    // every word.
    expect(descriptions()).toEqual(['2026-02-02 — 1 player, in progress, 1 of 6 picks']);
  });

  it('names the champion once the final is recorded', () => {
    seedLibrary([
      {
        doc: libraryDoc({
          id: 'a',
          createdAt: new Date(2026, 1, 2, 12).getTime(),
          players: 2,
          picks: 12,
          depth: 'draftAndBrackets',
          champion: true,
        }),
        filedAt: 5,
      },
    ]);
    mountLibrary();

    expect(descriptions()).toEqual(['2026-02-02 — 2 players, Player 1 won']);
  });

  it('reads `draft complete, no bracket` for a finished draftOnly document', () => {
    seedLibrary([
      {
        doc: libraryDoc({
          id: 'a',
          createdAt: new Date(2026, 1, 2, 12).getTime(),
          players: 2,
          picks: 12,
          depth: 'draftOnly',
        }),
        filedAt: 5,
      },
    ]);
    mountLibrary();

    expect(descriptions()).toEqual(['2026-02-02 — 2 players, draft complete, no bracket']);
  });

  it('stays `in progress` for an unfinished draftOnly document', () => {
    seedLibrary([
      {
        doc: libraryDoc({
          id: 'a',
          createdAt: new Date(2026, 1, 2, 12).getTime(),
          players: 2,
          picks: 11,
          depth: 'draftOnly',
        }),
        filedAt: 5,
      },
    ]);
    mountLibrary();

    // One pick short. `draft complete, no bracket` here would mean the branch fired on
    // depth alone rather than on the fold.
    expect(descriptions()).toEqual(['2026-02-02 — 2 players, in progress, 11 of 12 picks']);
  });
});

describe('downloading a filed tournament', () => {
  it('uses the same filename the live download would produce', async () => {
    const doc = libraryDoc({ id: 'abcdef01-2345', createdAt: new Date(2026, 1, 2, 12).getTime() });
    seedLibrary([{ doc, filedAt: 5 }]);

    // The one place the module under test reaches the browser. Asserting on the anchor's
    // `download` is what makes this a filename test rather than a "did it call something"
    // test.
    const clicked: string[] = [];
    const created = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = created(tag);
      if (tag === 'a') {
        (element as HTMLAnchorElement).click = () => {
          clicked.push((element as HTMLAnchorElement).download);
        };
      }
      return element;
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stub');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    mountLibrary();

    act(() => {
      buttonsNamed('Download JSON')[0]?.click();
    });

    const { tournamentFilename } = await import('../../src/adapters/file-io');
    expect(clicked).toEqual([tournamentFilename(doc)]);
  });
});
