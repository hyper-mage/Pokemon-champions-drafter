// @vitest-environment happy-dom

/**
 * The fifth screen — 05-10 task 1, `05-UI-SPEC` §Layout Budget and §Interaction.
 *
 * Two of the claims below are worth more than the rest, and both are about something NOT
 * happening — which is exactly the kind of thing a later refactor restores by reflex:
 *
 *   A `draftOnly` night never sees a bracket surface. The gate is
 *   `selectTournamentStage(state) !== 'notRunning'` inside `CompletedDraft`, one selector
 *   call rather than a depth comparison, and the test drives a real completed `draftOnly`
 *   document rather than asserting the selector twice.
 *
 *   Completing the last pick does not move the host. `screenForState` is deliberately not
 *   taught to return `tournament`, and a document whose draft is already finished still
 *   routes to the draft screen with its export panels intact. Asserted through `resume`,
 *   because that is one of the four call sites that actually asks the router the question.
 *
 * The shell class matters here for a reason that is arithmetic rather than aesthetic: the
 * 8-player crosstable needs 204px columns and `.app-shell`'s cap yields 114px, so a
 * tournament screen wearing the wrong shell is a table that cannot be read.
 */

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
import {
  CLAIM_WINDOW_MS,
  claimOwnership,
  createTabLock,
  disposeTabLock,
  type LockChannel,
  type LockMessage,
} from '../../src/adapters/tab-lock';
import {
  draftStarted,
  pickMade,
  poolBuilt,
  scheduleCompiled,
  type Action,
  type Intent,
} from '../../src/core/actions';
import {
  initialState,
  SCHEMA_VERSION,
  type DraftState,
  type TournamentConfig,
  type TournamentDepth,
  type TournamentDoc,
} from '../../src/core/model';
import { COPY_LABEL } from '../../src/ui/components/ExportPanel';
import { announce } from '../../src/ui/components/LiveRegion';
import { OPEN_TOURNAMENT } from '../../src/ui/screens/CompletedDraft';
import {
  BACK_TO_DRAFT,
  ROUND_ROBIN_HEADING,
  TournamentScreen,
} from '../../src/ui/screens/TournamentScreen';

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

function configWith(depth: TournamentDepth): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: PLAYERS,
    rounds: ROUNDS,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 12,
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

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

/**
 * A document whose draft is ALREADY finished — every player holds their full team.
 *
 * Written as a log rather than as a folded state because the routing assertions below go
 * through `resume`, which folds the document itself. A hand-built `DraftState` would prove
 * the screen renders and prove nothing about which screen the router chose.
 */
function completedDoc(depth: TournamentDepth): TournamentDoc {
  const log: Action[] = [
    stamp(
      poolBuilt(
        Array.from({ length: 12 }, (_, index) => `mon-${index}`),
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
  let pickIndex = 0;

  for (let round = 1; round <= ROUNDS; round++) {
    for (const player of PLAYERS) {
      log.push(
        stamp(
          pickMade({
            playerId: player.id,
            monId: `mon-${pickIndex}`,
            round,
            pickIndex,
          }),
          seq,
        ),
      );
      seq += 1;
      pickIndex += 1;
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: `tournament-screen-${depth}`,
    createdAt: 1_770_000_000_000,
    config: configWith(depth),
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };
}

/** The folded shape the component-level cases render directly. */
function completedState(depth: TournamentDepth): DraftState {
  const config = configWith(depth);
  let pickIndex = 0;

  return {
    ...initialState(config),
    order: PLAYERS.map((player) => player.id),
    schedule: [
      { index: 1, kind: 'open' },
      { index: 2, kind: 'open' },
    ],
    picks: PLAYERS.flatMap((player) =>
      Array.from({ length: ROUNDS }, (_, round) => ({
        playerId: player.id,
        monId: `mon-${pickIndex}`,
        round: round + 1,
        pickIndex: pickIndex++,
        seq: pickIndex + 2,
      })),
    ),
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
  localStorage.clear();
  announce('');
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  disposeTabLock();
  localStorage.clear();
});

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === name,
  );
}

function shell(): HTMLElement | null {
  return host.querySelector('.draft-shell, .app-shell, .entry-shell');
}

async function mountApp(): Promise<void> {
  await act(async () => {
    render(<App />, host);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/** Seed storage, mount, and click through the landing screen to the finished draft. */
async function openCompletedDraft(depth: TournamentDepth): Promise<void> {
  expect(saveTournament(completedDoc(depth))).toBe(true);
  await mountApp();

  const resume = buttonNamed('Resume saved draft');
  expect(resume).toBeDefined();

  await act(async () => {
    resume?.click();
    await Promise.resolve();
  });
}

function makeBus() {
  const ports: { handler: ((message: LockMessage) => void) | null; open: boolean }[] = [];
  return {
    connect(): LockChannel {
      const port = { handler: null as ((message: LockMessage) => void) | null, open: true };
      ports.push(port);
      return {
        postMessage(message: LockMessage): void {
          if (!port.open) return;
          for (const other of ports) {
            if (other === port || !other.open) continue;
            other.handler?.(message);
          }
        },
        listen(handler: (message: LockMessage) => void): void {
          port.handler = handler;
        },
        close(): void {
          port.open = false;
          port.handler = null;
        },
      };
    },
  };
}

/** Put another tab in charge before this one mounts, so this one renders as secondary. */
function rivalTabTakesTheLock(): ReturnType<typeof createTabLock> {
  const bus = makeBus();

  vi.useFakeTimers();
  const rival = createTabLock({ tabId: 'rival', channel: bus.connect() });
  rival.claim();
  vi.advanceTimersByTime(CLAIM_WINDOW_MS);
  claimOwnership({ channel: bus.connect() });
  vi.advanceTimersByTime(CLAIM_WINDOW_MS);
  vi.useRealTimers();

  return rival;
}

// ---------------------------------------------------------------------------

describe('the route on to the tournament', () => {
  it('leaves a finished draft on the draft screen, with the export panels still there', async () => {
    await openCompletedDraft('draftAndBrackets');

    // The router's answer, not a rendering detail: `screenForState` is asked on resume and
    // must still say `draft` for a document whose last pick has landed.
    expect(host.querySelector('.app-shell__title')?.textContent).toBe('Champions Draft');
    expect(buttonNamed(COPY_LABEL)).toBeDefined();
    expect(buttonNamed(BACK_TO_DRAFT)).toBeUndefined();
  });

  it('offers the entry control on a finished draft that has a tournament', async () => {
    await openCompletedDraft('draftAndBrackets');

    expect(buttonNamed(OPEN_TOURNAMENT)).toBeDefined();
  });

  it('offers no entry control at all on a completed draftOnly night', async () => {
    await openCompletedDraft('draftOnly');

    // The export panels are the proof the draft really did complete — without them this
    // would pass on a screen that never rendered.
    expect(buttonNamed(COPY_LABEL)).toBeDefined();
    expect(buttonNamed(OPEN_TOURNAMENT)).toBeUndefined();
  });

  it('goes to the tournament on the host act, and comes back on theirs', async () => {
    await openCompletedDraft('draftAndBrackets');

    await act(async () => {
      buttonNamed(OPEN_TOURNAMENT)?.click();
      await Promise.resolve();
    });

    expect(host.textContent).toContain(ROUND_ROBIN_HEADING);
    expect(shell()?.className).toBe('draft-shell');

    await act(async () => {
      buttonNamed(BACK_TO_DRAFT)?.click();
      await Promise.resolve();
    });

    expect(buttonNamed(OPEN_TOURNAMENT)).toBeDefined();
    expect(host.textContent).not.toContain(ROUND_ROBIN_HEADING);
  });

  it('keeps the top bar on the tournament screen, so undo and download stay reachable', async () => {
    await openCompletedDraft('draftAndBrackets');

    await act(async () => {
      buttonNamed(OPEN_TOURNAMENT)?.click();
      await Promise.resolve();
    });

    expect(buttonNamed('Undo last move')).toBeDefined();
    expect(buttonNamed('Download JSON')).toBeDefined();
  });

  it('puts the entry control inside the read-only gate, so a secondary tab cannot take it', async () => {
    expect(saveTournament(completedDoc('draftAndBrackets'))).toBe(true);
    const rival = rivalTabTakesTheLock();

    await mountApp();
    const resume = buttonNamed('Resume saved draft');
    await act(async () => {
      resume?.click();
      await Promise.resolve();
    });

    const gate = shell();
    expect(gate?.hasAttribute('inert')).toBe(true);

    // CONTAINMENT, which is the half `inert` cannot demonstrate in happy-dom: the control
    // is a descendant of the element carrying the attribute, so whatever a browser does
    // with `inert` it does to this button too.
    const entry = buttonNamed(OPEN_TOURNAMENT);
    expect(entry).toBeDefined();
    expect(gate?.contains(entry ?? null)).toBe(true);

    rival.dispose();
  });
});

describe('the stage shell', () => {
  function draw(depth: TournamentDepth): void {
    act(() => {
      render(
        <TournamentScreen
          state={completedState(depth)}
          topBar={TOP_BAR}
          onBackToDraft={() => undefined}
          onSelectMatch={() => undefined}
          onRequestReopen={() => undefined}
        />,
        host,
      );
    });
  }

  it('renders one h1 and the way back', () => {
    draw('draftAndBrackets');

    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(buttonNamed(BACK_TO_DRAFT)).toBeDefined();
  });

  it('branches on the stage: a round robin with no cut shows the round-robin block', () => {
    draw('draftAndBrackets');

    expect(host.textContent).toContain(ROUND_ROBIN_HEADING);
  });

  it('shows no stage block at all when the stage is not running', () => {
    draw('draftOnly');

    expect(host.textContent).not.toContain(ROUND_ROBIN_HEADING);
    expect(host.querySelector('.tournament-screen__stage')).toBeNull();
  });
});
