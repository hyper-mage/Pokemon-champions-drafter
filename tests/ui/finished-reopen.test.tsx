// @vitest-environment happy-dom

/**
 * The finished tournament, and the way back out of it — TOUR-06, D-17, `05-UI-SPEC` §10.
 *
 * Four claims here are the ones no visual review catches.
 *
 *   NOTHING IS HIDDEN WHILE LOCKED. §10's rule is inert-with-a-stated-reason and never
 *   removal, because a control that vanished would make a host think the app had lost a
 *   feature. The only way to see that hold is to COUNT the cells and cards on both sides of
 *   the final being recorded and find the same numbers.
 *
 *   THE SHED IS TOTAL. WR-04 and §Interaction's "inert ARIA is always shed" row apply to
 *   every cell and every card AT ONCE, which makes this the largest single shed in the
 *   phase and the one most likely to be half-done. So the assertion queries all of them and
 *   demands `getAttribute('aria-disabled') === null` on each — absent, never `"false"`,
 *   because some assistive technology announces `aria-disabled="false"` as disabled.
 *
 *   LOCKED IS A FOLD. Dropping the reopen from the log and folding again puts the
 *   tournament back to finished with nothing anywhere to reset — which is what "undo
 *   re-folds rather than reverses" means, and the reason the notice needs no state.
 *
 *   FOCUS DOES NOT DROP TO `<body>`. `FinishedNotice` is replaced by NOTHING, so the button
 *   the host just pressed is gone by the next render. §Interaction names the destination:
 *   the results grid's first live cell, the surface the reopen exists to make usable.
 *
 * `announce` is a module-level signal that outlives any render, so it is reset in
 * `beforeEach`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const entries = Array.from({ length: 20 }, (_, index) => ({
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
  }));

  return {
    bundle: {
      snapshot: {
        schemaVersion: 1,
        regulation: 'mb',
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
        upstreamRef: 'test',
        generatedAt: '2026-01-01T00:00:00Z',
        counts: {
          legalEntries: entries.length,
          draftable: entries.length,
          megaFormes: 0,
          baseSpecies: entries.length,
        },
        entries,
        checksum: 'test-checksum',
      },
      spriteMeta: {
        nativeWidth: 96,
        nativeHeight: 96,
        byRosterId: Object.fromEntries(
          entries.map((row) => [
            row.id,
            { pokeapiId: row.num, file: `${row.num}.png`, slug: row.id },
          ]),
        ),
      },
    },
  };
});

vi.mock('../../src/adapters/roster-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/adapters/roster-source')>();
  return { ...actual, loadRoster: () => Promise.resolve(fixture.bundle) };
});

import { App } from '../../src/app';
import { save as saveTournament } from '../../src/adapters/persistence';
import { disposeTabLock } from '../../src/adapters/tab-lock';
import {
  cutTaken,
  draftStarted,
  matchRecorded,
  pickMade,
  poolBuilt,
  reopened,
  scheduleCompiled,
  TOURNAMENT_REOPENED,
  type Action,
  type Intent,
} from '../../src/core/actions';
import { fold } from '../../src/core/reduce';
import {
  SCHEMA_VERSION,
  type DraftState,
  type TournamentConfig,
  type TournamentDoc,
} from '../../src/core/model';
import { selectBracket, selectTournamentLocked } from '../../src/core/tournament';
import { getDoc } from '../../src/store';
import { announce } from '../../src/ui/components/LiveRegion';
import {
  FinishedNotice,
  FINISHED_SENTENCE,
  REOPEN_LABEL,
} from '../../src/ui/components/FinishedNotice';
import {
  FINISHED_CELL_REASON,
  RESULTS_FIRST_CELL_ID,
} from '../../src/ui/components/ResultsGrid';
import { REOPEN_CONFIRM } from '../../src/ui/confirm-copy';
import { OPEN_TOURNAMENT } from '../../src/ui/screens/CompletedDraft';
import { TournamentScreen } from '../../src/ui/screens/TournamentScreen';

// ---------------------------------------------------------------------------
// Fixtures — a four-player night as a LOG, taken as far as `stage` says
// ---------------------------------------------------------------------------

const NAMES = ['Ada', 'Bo', 'Cy', 'Dee'];
const CREATED_AT = 1_770_000_000_000;

function playersOf(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: NAMES[index] ?? `Player ${index + 1}`,
  }));
}

function configWith(): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: playersOf(4),
    rounds: 2,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 12,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftAndBrackets',
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

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: CREATED_AT + seq, actorId: 'host' };
}

/**
 * The log, up to and optionally including the final.
 *
 * A LOG rather than a hand-built fold, because the whole claim under test is that locked is
 * something `fold` derives. A fixture that set a `locked` field would be asserting against
 * itself.
 *
 * The bracket's pairings come from `selectBracket` rather than from a seed order this file
 * works out for itself: nothing but the selector decides who meets whom, and a test that
 * re-derived it would pass against its own arithmetic rather than against the app's.
 */
function logFor(stage: 'openBracket' | 'finished'): Action[] {
  const config = configWith();
  const players = config.players;

  const log: Action[] = [
    stamp(
      poolBuilt(
        Array.from({ length: 12 }, (_, index) => `mon-${index}`),
        config.rosterVersion,
        config.rosterChecksum,
        7,
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
        players.map((player) => player.id),
        13,
      ),
      2,
    ),
  ];

  let seq = 3;
  let pickIndex = 0;
  for (let round = 1; round <= 2; round++) {
    for (const player of players) {
      log.push(
        stamp(pickMade({ playerId: player.id, monId: `mon-${pickIndex}`, round, pickIndex }), seq),
      );
      seq += 1;
      pickIndex += 1;
    }
  }

  // The lower seed index wins throughout, so the standings order is `p1 … p4` and the
  // seeding with it.
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      log.push(stamp(matchRecorded(`rr:${i}:${j}`, `p${i + 1}`, `p${j + 1}`, 1, 0, 0), seq));
      seq += 1;
    }
  }

  log.push(stamp(cutTaken(players.map((player) => player.id)), seq));
  seq += 1;

  const seeded = fold(docOf(log));
  const rounds = selectBracket(seeded)?.rounds ?? [];

  for (const match of rounds[0] ?? []) {
    if (match.upperId === null || match.lowerId === null) continue;
    log.push(stamp(matchRecorded(match.matchId, match.upperId, match.lowerId, 1, 0, 0), seq));
    seq += 1;
  }

  if (stage === 'openBracket') return log;

  // The final, read off the bracket the semi-finals have now resolved.
  const played = fold(docOf(log));
  const final = selectBracket(played)?.final;
  if (final === undefined || final.upperId === null || final.lowerId === null) {
    throw new Error('the final has no participants');
  }

  log.push(stamp(matchRecorded(final.matchId, final.upperId, final.lowerId, 1, 0, 0), seq));

  return log;
}

function docOf(log: readonly Action[]): TournamentDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'finished-reopen',
    createdAt: CREATED_AT,
    config: configWith(),
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: [...log],
  };
}

/** The state a host is looking at: the bracket stage, finished or not. */
function stateFor(stage: 'openBracket' | 'finished'): DraftState {
  return fold(docOf(logFor(stage)));
}

// ---------------------------------------------------------------------------

const TOP_BAR = {
  onDownload: () => undefined,
  onImportFile: () => undefined,
  importError: null,
  onRequestUndo: () => undefined,
  onRequestAbandon: () => undefined,
  bannedNames: [] as readonly string[],
};

let host: HTMLDivElement;
let reopenRequests: number;

beforeEach(() => {
  localStorage.clear();
  announce('');
  host = document.createElement('div');
  document.body.append(host);
  reopenRequests = 0;
});

afterEach(() => {
  render(null, host);
  host.remove();
  disposeTabLock();
  localStorage.clear();
});

function drawScreen(state: DraftState): void {
  act(() => {
    render(
      <TournamentScreen
        state={state}
        topBar={TOP_BAR}
        onBackToDraft={() => undefined}
        onSelectMatch={() => undefined}
        onRequestReopen={() => {
          reopenRequests += 1;
        }}
        // No recap surface in these cases — 05-14 gives the recap its own file. It matters
        // here specifically: `Reopen this tournament` is asserted below as the ONLY control
        // on a finished bracket, and the recap action is the second one 05-14 adds beside it.
        recap={null}
      />,
      host,
    );
  });
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === name,
  );
}

function notice(): HTMLElement | null {
  return host.querySelector('.finished-notice');
}

function cells(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('.results-grid__cell')];
}

/** Only the cards that are CONTROLS. A bye is a `<div>` and was never interactive. */
function cards(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('button.match-card')];
}

function accessibleName(control: HTMLElement): string {
  return (control.querySelector('.visually-hidden')?.textContent ?? '').trim();
}

// ---------------------------------------------------------------------------

describe('the notice', () => {
  it('renders only once the final is recorded', () => {
    drawScreen(stateFor('openBracket'));
    expect(notice()).toBeNull();

    drawScreen(stateFor('finished'));
    expect(notice()).not.toBeNull();
  });

  it('states the sentence and offers the reopen', () => {
    drawScreen(stateFor('finished'));

    expect(notice()?.textContent).toContain(FINISHED_SENTENCE);
    expect(FINISHED_SENTENCE).toBe('This tournament is finished. Results are read-only.');
    expect(buttonNamed(REOPEN_LABEL)).toBeDefined();
  });

  it('carries the sentence in a status region rather than an alert', () => {
    drawScreen(stateFor('finished'));

    const status = notice()?.querySelector('[role="status"]');
    expect((status?.textContent ?? '').trim()).toBe(FINISHED_SENTENCE);
    expect(notice()?.querySelector('[role="alert"]')).toBeNull();
  });

  it('reports the intent and dispatches nothing itself', () => {
    drawScreen(stateFor('finished'));

    act(() => {
      buttonNamed(REOPEN_LABEL)?.click();
    });

    expect(reopenRequests).toBe(1);
  });

  it('renders nothing at all when the tournament is open', () => {
    act(() => {
      render(
        <FinishedNotice state={stateFor('openBracket')} onRequestReopen={() => undefined} />,
        host,
      );
    });

    expect(host.innerHTML).toBe('');
  });

  it('is not danger-coloured and declares no raw colour', () => {
    /*
      Resolved from `process.cwd()`, which Vitest sets to the project root, and NOT from
      `new URL(path, import.meta.url)`: under happy-dom the global `URL` is the DOM's rather
      than Node's, so `readFileSync` does not recognise the object it produces.
      `staleness-banner.test.tsx` records the same trap and its confusing failure.
    */
    const sheet = readFileSync(
      resolve(process.cwd(), 'src/ui/components/FinishedNotice.css'),
      'utf8',
    );

    // §Color: a locked tournament is not danger-coloured. Nothing is wrong; the night
    // finished. Read from the source because vitest applies no stylesheet.
    const declarations = sheet.replace(/\/\*[\s\S]*?\*\//g, '');

    expect(declarations).not.toContain('--color-danger');
    expect(declarations).toContain('--color-surface-raised');
    expect(declarations).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});

describe('while locked, everything is inert and nothing is hidden', () => {
  it('keeps every result control in the DOM', () => {
    drawScreen(stateFor('openBracket'));
    const openCells = cells().length;
    const openCards = cards().length;

    drawScreen(stateFor('finished'));

    // The COUNTS are the assertion. §10 forbids hiding a control, so a locked tournament
    // must offer exactly as many as an open one.
    expect(openCells).toBeGreaterThan(0);
    expect(openCards).toBeGreaterThan(0);
    expect(cells()).toHaveLength(openCells);
    expect(cards()).toHaveLength(openCards);
  });

  it('marks every cell and every card inert, with the reason in its name', () => {
    drawScreen(stateFor('finished'));

    const controls = [...cells(), ...cards()];
    expect(controls.length).toBeGreaterThan(0);

    for (const control of controls) {
      expect(control.getAttribute('aria-disabled')).toBe('true');
      expect(accessibleName(control)).toContain(FINISHED_CELL_REASON);
    }
  });

  it('never uses the native disabled attribute, so the reason stays reachable', () => {
    drawScreen(stateFor('finished'));

    for (const control of [...cells(), ...cards()]) {
      expect(control.disabled).toBe(false);
      expect(control.hasAttribute('disabled')).toBe(false);
    }
  });

  it('states the reason visibly too, not only in accessible names', () => {
    drawScreen(stateFor('finished'));

    const visible = host.querySelector('.results-grid__finished');
    expect((visible?.textContent ?? '').trim()).toBe(FINISHED_SENTENCE);
  });
});

describe('the shed', () => {
  it('removes aria-disabled from every cell and card when the reopen folds', () => {
    const finished = stateFor('finished');
    const log = logFor('finished');
    const lastSeq = log[log.length - 1]?.seq ?? 0;

    const open = fold(docOf([...log, stamp(reopened(), lastSeq + 1)]));

    expect(selectTournamentLocked(finished)).toBe(true);
    expect(selectTournamentLocked(open)).toBe(false);

    drawScreen(open);

    const controls = [...cells(), ...cards()];
    expect(controls.length).toBeGreaterThan(0);

    // ABSENT, never `"false"` — WR-04. Every one of them, not a sample.
    for (const control of controls) {
      expect(control.getAttribute('aria-disabled')).toBeNull();
    }

    expect(notice()).toBeNull();
    expect(host.querySelector('.results-grid__finished')).toBeNull();
  });

  it('puts the locked state back when the reopen is dropped from the log — locked is a fold', () => {
    const log = logFor('finished');
    const lastSeq = log[log.length - 1]?.seq ?? 0;
    const withReopen = [...log, stamp(reopened(), lastSeq + 1)];

    // Undo is "drop an action and fold again". Nothing is reversed and nothing is reset.
    const undone = fold(docOf(withReopen.filter((action) => action.type !== TOURNAMENT_REOPENED)));

    expect(selectTournamentLocked(fold(docOf(withReopen)))).toBe(false);
    expect(selectTournamentLocked(undone)).toBe(true);

    drawScreen(undone);
    expect(notice()).not.toBeNull();
  });

  it('locks again when a new final is recorded after a reopen', () => {
    const log = logFor('finished');
    const lastSeq = log[log.length - 1]?.seq ?? 0;

    const open = fold(docOf([...log, stamp(reopened(), lastSeq + 1)]));
    const final = selectBracket(open)?.final;
    if (final === undefined || final.upperId === null || final.lowerId === null) {
      throw new Error('the final has no participants');
    }

    // The loser of the recorded final wins the re-record, which is the correction a host
    // reopens for. It is NEWER than `lastReopenSeq`, so the fold locks again.
    const relocked = fold(
      docOf([
        ...log,
        stamp(reopened(), lastSeq + 1),
        stamp(
          matchRecorded(final.matchId, final.lowerId, final.upperId, 1, 0, 0),
          lastSeq + 2,
        ),
      ]),
    );

    expect(selectTournamentLocked(relocked)).toBe(true);

    drawScreen(relocked);
    expect(notice()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Through the real app: the confirm, the one action, and where focus lands
// ---------------------------------------------------------------------------

async function openFinishedTournament(): Promise<void> {
  expect(saveTournament(docOf(logFor('finished')))).toBe(true);

  await act(async () => {
    render(<App />, host);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });

  await act(async () => {
    buttonNamed('Resume saved draft')?.click();
    await Promise.resolve();
  });

  await act(async () => {
    buttonNamed(OPEN_TOURNAMENT)?.click();
    await Promise.resolve();
  });
}

describe('through the app', () => {
  it('raises the default-toned confirm with the contract copy', async () => {
    await openFinishedTournament();
    expect(notice()).not.toBeNull();

    await act(async () => {
      buttonNamed(REOPEN_LABEL)?.click();
      await Promise.resolve();
    });

    const dialog = host.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain(REOPEN_CONFIRM.heading);
    expect(dialog?.textContent).toContain(REOPEN_CONFIRM.body);
    expect(buttonNamed(REOPEN_CONFIRM.confirmLabel)).toBeDefined();
    expect(buttonNamed(REOPEN_CONFIRM.safeLabel)).toBeDefined();

    // The friction is intended, so the body has to name it rather than imply it.
    expect(REOPEN_CONFIRM.body).toContain('voids the cut and the bracket');
    expect(REOPEN_CONFIRM.tone).toBe('default');
  });

  it('is a sibling of the read-only gate, never a child of it', async () => {
    await openFinishedTournament();

    await act(async () => {
      buttonNamed(REOPEN_LABEL)?.click();
      await Promise.resolve();
    });

    // `inert` applies to a whole subtree: a dialog inside the gate would go inert with the
    // screen the instant another tab took the lock, trapping focus in a panel that refuses
    // its own dismiss.
    const dialog = host.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.closest('[inert]')).toBeNull();
  });

  it('leaves the tournament finished when the safe button is taken', async () => {
    await openFinishedTournament();
    const before = getDoc()?.log.length ?? 0;

    await act(async () => {
      buttonNamed(REOPEN_LABEL)?.click();
      await Promise.resolve();
    });
    await act(async () => {
      buttonNamed(REOPEN_CONFIRM.safeLabel)?.click();
      await Promise.resolve();
    });

    expect(getDoc()?.log).toHaveLength(before);
    expect(notice()).not.toBeNull();
  });

  it('appends exactly one tournament/reopened and clears the notice', async () => {
    await openFinishedTournament();
    const before = getDoc()?.log.length ?? 0;

    await act(async () => {
      buttonNamed(REOPEN_LABEL)?.click();
      await Promise.resolve();
    });
    await act(async () => {
      buttonNamed(REOPEN_CONFIRM.confirmLabel)?.click();
      await Promise.resolve();
    });

    const log = getDoc()?.log ?? [];
    expect(log).toHaveLength(before + 1);
    expect(log[log.length - 1]?.type).toBe(TOURNAMENT_REOPENED);

    expect(notice()).toBeNull();
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('moves focus to the results grid first live cell', async () => {
    await openFinishedTournament();

    await act(async () => {
      buttonNamed(REOPEN_LABEL)?.click();
      await Promise.resolve();
    });
    await act(async () => {
      buttonNamed(REOPEN_CONFIRM.confirmLabel)?.click();
      await Promise.resolve();
    });

    const target = document.getElementById(RESULTS_FIRST_CELL_ID);
    expect(target).not.toBeNull();

    // The control the host pressed does not survive its own success, so focus would drop
    // to `<body>` without the handoff.
    expect(document.activeElement).toBe(target);
    expect(target).toBe(cells()[0]);
  });

  it('sheds the inert ARIA across every control once reopened', async () => {
    await openFinishedTournament();

    for (const control of [...cells(), ...cards()]) {
      expect(control.getAttribute('aria-disabled')).toBe('true');
    }

    await act(async () => {
      buttonNamed(REOPEN_LABEL)?.click();
      await Promise.resolve();
    });
    await act(async () => {
      buttonNamed(REOPEN_CONFIRM.confirmLabel)?.click();
      await Promise.resolve();
    });

    const controls = [...cells(), ...cards()];
    expect(controls.length).toBeGreaterThan(0);

    for (const control of controls) {
      expect(control.getAttribute('aria-disabled')).toBeNull();
    }
  });
});
