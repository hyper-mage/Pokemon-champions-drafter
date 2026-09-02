// @vitest-environment happy-dom

/**
 * The recap surface — PERS-09, `05-UI-SPEC` §11.
 *
 * The claims worth more than the rest are the ones about something NOT happening, because
 * those are what a later refactor restores by reflex:
 *
 *   No line is struck through, in any state. Strike-through already means *gone or
 *   unavailable* in this project, and a corrected result is neither — so the marks are
 *   words. Asserted by querying for the elements that would draw the line as well as for
 *   the inline property, because the stylesheet is not loaded in this environment and an
 *   element assertion is the half that can actually fail here.
 *
 *   The top bar stays. §11 says the recap replaces the main region and NOTHING ELSE, and
 *   the reason is `Undo last move`: a host who realises on the recap that the last result
 *   was wrong must be able to unwind it from the surface that told them.
 *
 *   There is no second way out of the recap. No copy control, no text export, no print —
 *   `05-CONTEXT.md` §Deferred records that this was raised and not pursued.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SpriteMeta } from '../../src/adapters/roster-source';
import {
  cardsPlayed,
  cutTaken,
  draftStarted,
  matchRecorded,
  pickMade,
  poolBuilt,
  scheduleCompiled,
  swapMade,
  type Action,
  type Intent,
} from '../../src/core/actions';
import {
  SCHEMA_VERSION,
  type TournamentConfig,
  type TournamentDepth,
  type TournamentDoc,
} from '../../src/core/model';
import { fold } from '../../src/core/reduce';
import type { RosterEntry } from '../../src/core/roster/types';
import {
  BACK_TO_BRACKET,
  BACK_TO_DRAFT_FROM_RECAP,
  RECAP_HEADING,
  VIEW_RECAP,
  type RecapAccess,
} from '../../src/ui/components/RecapList';
import { BRACKET_HEADING_ID } from '../../src/ui/components/CutControl';
import { CompletedDraft } from '../../src/ui/screens/CompletedDraft';
import { TournamentScreen } from '../../src/ui/screens/TournamentScreen';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLAYERS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
  { id: 'p4', name: 'Dee' },
];

const ROUNDS = 2;
const CREATED_AT = 1_770_000_000_000;

const ROSTER_ENTRIES: RosterEntry[] = Array.from({ length: 12 }, (_, index) => ({
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
  spriteMissing: false,
}));

const ENTRY_BY_ID: ReadonlyMap<string, RosterEntry> = new Map(
  ROSTER_ENTRIES.map((entry) => [entry.id, entry]),
);

const SPRITE_META: SpriteMeta = {
  nativeWidth: 96,
  nativeHeight: 96,
  byRosterId: Object.fromEntries(
    ROSTER_ENTRIES.map((entry) => [
      entry.id,
      { pokeapiId: entry.num, file: `${entry.num}.png`, slug: entry.id },
    ]),
  ),
};

function configWith(depth: TournamentDepth, bans: string[]): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: PLAYERS,
    rounds: ROUNDS,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 12,
    bans,
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth,
    rules: [{ kind: 'mega', count: 0 }],
    megaFormeBans: [],
    swapBudget: 1,
    swapRounds: 0,
    bansPerPlayer: 0,
    duplicateBanPolicy: 'bothApply',
    matchMetric: 'pokemonLeft',
    roundRobinFormat: 'bo1',
    bracketFormat: 'bo1',
  };
}

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: CREATED_AT + seq, actorId: 'host' };
}

/**
 * A whole night, written as a LOG rather than as a folded state.
 *
 * The point of this file is a surface that reads the log, so a hand-built `DraftState`
 * would prove the component renders and prove nothing about what it is rendering. The
 * bracket carries a correction on purpose: `br:1:1` is recorded the wrong way round and
 * then put right, which is the pair of marks §11 exists to specify.
 */
function fullNight(depth: TournamentDepth, bans: string[]): TournamentDoc {
  const log: Action[] = [
    stamp(
      poolBuilt(
        ROSTER_ENTRIES.map((entry) => entry.id),
        'mb',
        'test-checksum',
        11,
        0,
      ),
      0,
    ),
    stamp(
      scheduleCompiled([
        { index: 1, kind: 'open' },
        { index: 2, kind: 'open' },
      ]),
      1,
    ),
    stamp(
      draftStarted(
        PLAYERS.map((player) => player.id),
        13,
      ),
      2,
    ),
  ];

  let seq = 3;
  const next = (intent: Intent): void => {
    log.push(stamp(intent, seq));
    seq += 1;
  };

  for (const player of PLAYERS) next(cardsPlayed({ playerId: player.id, value: 1, round: 1 }));

  let pickIndex = 0;
  for (let round = 1; round <= ROUNDS; round++) {
    for (const player of PLAYERS) {
      next(pickMade({ playerId: player.id, monId: `mon-${pickIndex}`, round, pickIndex }));
      pickIndex += 1;
    }
  }

  // A mid-draft spend, so the `Swaps` section exists. `swapRound: 0` is the mid-draft form.
  next(
    swapMade({
      playerId: 'p1',
      round: 1,
      outMonId: 'mon-0',
      inMonId: 'mon-8',
      swapRound: 0,
    }),
  );

  // Six pairings, recorded so the standings order is p1, p2, p3, p4 with no tie.
  next(matchRecorded('rr:0:1', 'p1', 'p2', 1, 0, 4));
  next(matchRecorded('rr:0:2', 'p1', 'p3', 1, 0, 4));
  next(matchRecorded('rr:0:3', 'p1', 'p4', 1, 0, 5));
  next(matchRecorded('rr:1:2', 'p2', 'p3', 1, 0, 3));
  next(matchRecorded('rr:1:3', 'p2', 'p4', 1, 0, 3));
  next(matchRecorded('rr:2:3', 'p3', 'p4', 1, 0, 2));

  next(cutTaken(['p1', 'p2', 'p3', 'p4']));

  // THE CORRECTION. Recorded the wrong way round, then put right.
  next(matchRecorded('br:1:1', 'p4', 'p1', 1, 0, 1));
  next(matchRecorded('br:1:1', 'p1', 'p4', 1, 0, 6));
  next(matchRecorded('br:1:2', 'p2', 'p3', 1, 0, 2));
  next(matchRecorded('br:2:1', 'p1', 'p2', 1, 0, 5));

  return {
    schemaVersion: SCHEMA_VERSION,
    id: `recap-${depth}`,
    createdAt: CREATED_AT,
    config: configWith(depth, bans),
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };
}

/** A `draftOnly` night: the draft finishes and no tournament surface ever exists. */
function draftOnlyNight(): TournamentDoc {
  const full = fullNight('draftOnly', []);
  return {
    ...full,
    // Everything from the cut onwards belongs to a depth this night does not have.
    log: full.log.filter((action) => !action.type.startsWith('tournament/')),
  };
}

const TOP_BAR = {
  onDownload: () => undefined,
  onImportFile: () => undefined,
  importError: null,
  onRequestUndo: () => undefined,
  onRequestAbandon: () => undefined,
  bannedNames: [] as readonly string[],
};

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function accessFor(doc: TournamentDoc): RecapAccess {
  return { doc, entryById: ENTRY_BY_ID, spriteMeta: SPRITE_META };
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === name,
  );
}

function textOf(selector: string): string[] {
  return Array.from(host.querySelectorAll(selector)).map((node) =>
    (node.textContent ?? '').trim(),
  );
}

function drawTournament(doc: TournamentDoc): void {
  act(() => {
    render(
      <TournamentScreen
        state={fold(doc)}
        topBar={TOP_BAR}
        onBackToDraft={() => undefined}
        onSelectMatch={() => undefined}
        onRequestReopen={() => undefined}
        recap={accessFor(doc)}
      />,
      host,
    );
  });
}

/** Open the recap from the bracket, which is the only route to it at this depth. */
function openRecap(doc: TournamentDoc): void {
  drawTournament(doc);
  act(() => {
    buttonNamed(VIEW_RECAP)?.click();
  });
}

// ---------------------------------------------------------------------------
// Reaching it
// ---------------------------------------------------------------------------

describe('reaching the recap', () => {
  it('offers View the draft recap on the bracket once the final is recorded', () => {
    drawTournament(fullNight('draftBracketsAndLog', ['mon-10']));

    expect(buttonNamed(VIEW_RECAP)).toBeDefined();
  });

  it('does not offer it while the final is still unrecorded', () => {
    const doc = fullNight('draftBracketsAndLog', ['mon-10']);
    const withoutFinal: TournamentDoc = {
      ...doc,
      log: doc.log.filter((action) => !('matchId' in action && action.matchId === 'br:2:1')),
    };

    drawTournament(withoutFinal);

    expect(buttonNamed(VIEW_RECAP)).toBeUndefined();
  });

  it('replaces the main region and nothing else — the top bar stays', () => {
    const doc = fullNight('draftBracketsAndLog', ['mon-10']);

    drawTournament(doc);
    expect(host.querySelector('.sticky-head')).not.toBeNull();

    act(() => {
      buttonNamed(VIEW_RECAP)?.click();
    });

    expect(host.querySelector('.recap-list')).not.toBeNull();
    // The bracket and the crosstable are gone; the bar the undo lives in is not.
    expect(host.querySelector('.bracket-grid')).toBeNull();
    expect(host.querySelector('.results-grid')).toBeNull();
    expect(host.querySelector('.sticky-head')).not.toBeNull();
  });

  it('a draftOnly completed draft can reach the recap', () => {
    const doc = draftOnlyNight();

    act(() => {
      render(
        <CompletedDraft
          players={PLAYERS}
          state={fold(doc)}
          entries={ROSTER_ENTRIES}
          entryById={ENTRY_BY_ID}
          checkpointReached
          checkpointDismissed={false}
          onDownload={() => undefined}
          onDismissCheckpoint={() => undefined}
          onOpenTournament={() => undefined}
          recap={accessFor(doc)}
        />,
        host,
      );
    });

    const open = buttonNamed(VIEW_RECAP);
    expect(open).toBeDefined();

    act(() => {
      open?.click();
    });

    expect(textOf('.recap-list__heading')).toEqual([RECAP_HEADING]);
    expect(buttonNamed(BACK_TO_DRAFT_FROM_RECAP)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// The six sections
// ---------------------------------------------------------------------------

describe('the recap sections', () => {
  it('renders all six headings in log order for a full night', () => {
    openRecap(fullNight('draftBracketsAndLog', ['mon-10']));

    expect(textOf('.recap-list__section-heading')).toEqual([
      'Bans',
      'Priority cards',
      'Round 1',
      'Round 2',
      'Swaps',
      'Round robin',
      'Bracket',
    ]);
  });

  it('renders no heading for a section with no entries', () => {
    // No host banlist, so there is nothing to head. Not an empty block and not a sentence
    // saying nobody banned anything.
    openRecap(fullNight('draftBracketsAndLog', []));

    expect(textOf('.recap-list__section-heading')).not.toContain('Bans');
  });
});

// ---------------------------------------------------------------------------
// The lines
// ---------------------------------------------------------------------------

describe('the recap lines', () => {
  function lines(): string[] {
    return textOf('.recap-list__line');
  }

  it('composes each kind from the copy table', () => {
    openRecap(fullNight('draftBracketsAndLog', ['mon-10']));
    const rendered = lines();

    expect(rendered).toContain('The host banned Mon 10.');
    expect(rendered).toContain('Ada played 1.');
    expect(rendered).toContain('Ada picked Mon 0.');
    expect(rendered).toContain('Ada swapped Mon 0 for Mon 8.');
    expect(rendered).toContain('The cut was taken at 4.');
    expect(rendered).toContain('Ada beat Bo 1–0. · 4 Pokémon left');
  });

  it('drops the metric below tier 3', () => {
    openRecap(fullNight('draftAndBrackets', ['mon-10']));

    expect(lines()).toContain('Ada beat Bo 1–0.');
    expect(lines().some((line) => line.includes('Pokémon left'))).toBe(false);
  });

  it('falls back to the id when the roster no longer holds a species', () => {
    const doc = fullNight('draftBracketsAndLog', ['mon-rotated-away']);

    act(() => {
      render(
        <TournamentScreen
          state={fold(doc)}
          topBar={TOP_BAR}
          onBackToDraft={() => undefined}
          onSelectMatch={() => undefined}
          onRequestReopen={() => undefined}
          recap={accessFor(doc)}
        />,
        host,
      );
    });
    act(() => {
      buttonNamed(VIEW_RECAP)?.click();
    });

    expect(lines()).toContain('The host banned mon-rotated-away.');
  });

  it('carries a sprite on ban and pick lines and on no others', () => {
    openRecap(fullNight('draftBracketsAndLog', ['mon-10']));

    const entries = Array.from(host.querySelectorAll('.recap-list__entry'));
    const withSprite = entries.filter((node) => node.querySelector('img') !== null);
    const lineOf = (node: Element): string =>
      (node.querySelector('.recap-list__line')?.textContent ?? '').trim();

    expect(withSprite.length).toBeGreaterThan(0);
    for (const node of withSprite) {
      expect(lineOf(node)).toMatch(/ (banned|picked) /);
    }
    for (const node of entries) {
      if (withSprite.includes(node)) continue;
      expect(lineOf(node)).not.toMatch(/ (banned|picked) /);
    }
  });
});

// ---------------------------------------------------------------------------
// Corrections — D-22
// ---------------------------------------------------------------------------

describe('corrections', () => {
  it('marks the superseded result and its replacement with words', () => {
    openRecap(fullNight('draftBracketsAndLog', ['mon-10']));

    const marks = textOf('.recap-list__mark');

    expect(marks).toEqual(['Corrected later', 'Corrects an earlier result']);
  });

  it('leaves the superseded result in chronological position', () => {
    openRecap(fullNight('draftBracketsAndLog', ['mon-10']));

    const bracketLines = Array.from(host.querySelectorAll('.recap-list__section'))
      .filter(
        (node) =>
          (node.querySelector('.recap-list__section-heading')?.textContent ?? '').trim() ===
          'Bracket',
      )
      .flatMap((node) =>
        Array.from(node.querySelectorAll('.recap-list__line')).map((line) =>
          (line.textContent ?? '').trim(),
        ),
      );

    // Four lines for three bracket matches — the correction did not replace its original.
    expect(bracketLines).toHaveLength(4);
    expect(bracketLines[0]).toContain('Dee beat Ada');
    expect(bracketLines[1]).toContain('Ada beat Dee');
  });

  it('strikes nothing through, in any state', () => {
    openRecap(fullNight('draftBracketsAndLog', ['mon-10']));

    const recap = host.querySelector('.recap-list');
    expect(recap).not.toBeNull();

    expect(recap?.querySelectorAll('s, del, strike').length).toBe(0);

    for (const node of Array.from(recap?.querySelectorAll('*') ?? [])) {
      const style = node.getAttribute('style') ?? '';
      expect(style.includes('line-through')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Interaction — §Interaction
// ---------------------------------------------------------------------------

describe('entering and leaving the recap', () => {
  it('lands focus on the heading on entry and returns it to the action on exit', () => {
    const doc = fullNight('draftBracketsAndLog', ['mon-10']);

    drawTournament(doc);
    const open = buttonNamed(VIEW_RECAP);
    expect(open).toBeDefined();

    act(() => {
      open?.click();
    });

    const heading = host.querySelector('.recap-list__heading');
    expect(document.activeElement).toBe(heading);

    act(() => {
      buttonNamed(BACK_TO_BRACKET)?.click();
    });

    // The control that was activated, which exists again — not the same node object.
    expect(document.activeElement).toBe(buttonNamed(VIEW_RECAP));
  });

  it('falls back to the bracket heading when the final was undone while it was open', () => {
    /*
      WR-10. `View the draft recap` renders only when the final is recorded, and the top
      bar — including `Undo last move` and the document-level Ctrl+Z handler — stays
      mounted above the recap, deliberately, so a host who spots a wrong result there can
      still unwind it. Undo the final while the recap is open and the arming target is
      gone by the time `Back to the bracket` fires the handoff, at which point focus fell
      to `<body>` — the exact failure `RECAP_ACTION_ID`'s own doc block exists to prevent.
    */
    const doc = fullNight('draftBracketsAndLog', ['mon-10']);
    openRecap(doc);

    // Undo removes the log entry; the final `br:2:1` is the last one this fixture adds.
    const undone = { ...doc, log: doc.log.slice(0, -1) };
    drawTournament(undone);

    // The recap is still on screen — the top bar is what changed, not the region.
    expect(buttonNamed(BACK_TO_BRACKET)).toBeDefined();

    act(() => {
      buttonNamed(BACK_TO_BRACKET)?.click();
    });

    expect(buttonNamed(VIEW_RECAP)).toBeUndefined();

    const heading = host.querySelector(`#${BRACKET_HEADING_ID}`);
    expect(heading).not.toBeNull();
    expect(document.activeElement).toBe(heading);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('offers exactly one control inside the recap, and it is the way out', () => {
    openRecap(fullNight('draftBracketsAndLog', ['mon-10']));

    const controls = Array.from(host.querySelectorAll('.recap-list button'));

    expect(controls).toHaveLength(1);
    expect((controls[0]?.textContent ?? '').trim()).toBe(BACK_TO_BRACKET);
  });
});
