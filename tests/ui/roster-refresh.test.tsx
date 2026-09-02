// @vitest-environment happy-dom

/**
 * The `Roster` group — REFR-01, REFR-02, 05-UI-SPEC §2.
 *
 * ## Every sentence is asserted with `toBe`, never `toContain`
 *
 * The five states differ from each other by a clause, not by a word: `alreadyCurrent` and
 * `updated` both name the regulation, and `failed` and the import rejection both name a
 * file. A substring assertion would pass on four of the five if the component picked the
 * wrong branch. These are contract strings down to the full stop, so the assertion is
 * equality on the region's own text content.
 *
 * ## The adapter is stubbed, not the network
 *
 * The request, its `?refresh=1` marker, its cache bypass and `parseSnapshotStrict` are all
 * 05-04's and have their own tests. What is under test here is the mapping from an outcome
 * to a sentence, and stubbing at the adapter seam is what keeps this file about that.
 *
 * ## The same-file-twice case
 *
 * A file input does not fire `change` when the same path is chosen twice running, so the
 * component clears `input.value` BEFORE handing the file on. That one line is invisible on
 * screen and its absence is invisible until a host fixes a bad roster file, re-picks it and
 * gets silence — which after an error message reads as the app having stopped. It is pinned
 * twice below: by asserting the value is empty after a change, and by walking the whole
 * reject-then-reject-again path.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RefreshOutcome, RosterBundle } from '../../src/adapters/roster-source';
import { save as saveTournament } from '../../src/adapters/persistence';
import { disposeTabLock } from '../../src/adapters/tab-lock';
import { draftStarted, poolBuilt } from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import { App } from '../../src/app';

/**
 * Hoisted so the `vi.mock` factory below can see them — `vi.mock` is lifted above every
 * import, so a plain `const` would still be in its temporal dead zone when the factory
 * runs.
 */
const adapter = vi.hoisted(() => ({
  refreshRoster: vi.fn(),
  readRosterFile: vi.fn(),
  loadRoster: vi.fn(),
  resolveSnapshot: vi.fn(),
}));

vi.mock('../../src/adapters/roster-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/adapters/roster-source')>();
  return {
    ...actual,
    refreshRoster: adapter.refreshRoster,
    readRosterFile: adapter.readRosterFile,
    loadRoster: adapter.loadRoster,
    resolveSnapshot: adapter.resolveSnapshot,
  };
});

import {
  alreadyCurrentSentence,
  CHECK_LABEL,
  CHECKING_SENTENCE,
  currentRosterLine,
  FAILED_SENTENCE,
  IMPORT_LABEL,
  importConflictSentence,
  IMPORT_REJECTED_SENTENCE,
  RosterRefresh,
  updatedSentence,
} from '../../src/ui/components/RosterRefresh';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function bundle(regulation: string, validUntil: string): RosterBundle {
  return {
    snapshot: {
      schemaVersion: 1,
      regulation,
      validFrom: '2026-01-01',
      validUntil,
      upstreamRef: 'test',
      generatedAt: '2026-01-01T00:00:00Z',
      counts: { legalEntries: 1, draftable: 1, megaFormes: 0, baseSpecies: 1 },
      entries: [],
      checksum: `checksum-${regulation}`,
    },
    spriteMeta: { nativeWidth: 96, nativeHeight: 96, byRosterId: {} },
  } as unknown as RosterBundle;
}

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);

  adapter.refreshRoster.mockReset();
  adapter.readRosterFile.mockReset();
  adapter.loadRoster.mockReset();
  adapter.loadRoster.mockResolvedValue(bundle('M-C', '2026-11-18'));
});

afterEach(() => {
  render(null, host);
  host.remove();
});

interface Overrides {
  regulationLabel?: string;
  entryCount?: number;
  validUntil?: string;
  onRefreshed?: (adopted: RosterBundle) => void;
  onImported?: (adopted: RosterBundle) => void;
  focusOnMount?: boolean;
}

function mount(overrides: Overrides = {}): void {
  act(() => {
    render(
      <RosterRefresh
        regulationLabel={overrides.regulationLabel ?? 'M-B'}
        entryCount={overrides.entryCount ?? 235}
        validUntil={overrides.validUntil ?? '2026-09-02'}
        onRefreshed={overrides.onRefreshed}
        onImported={overrides.onImported}
        focusOnMount={overrides.focusOnMount ?? false}
      />,
      host,
    );
  });
}

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    Array.from(host.querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
}

/**
 * The surface-owned region, as a NODE.
 *
 * Its text is asserted on it and never on `host`, so a sentence rendered anywhere else on
 * the surface cannot satisfy an assertion about what the region says.
 */
function resultRegion(): HTMLElement | null {
  return host.querySelector('[role="status"]');
}

function fileInput(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('the group renders no file input');
  return input;
}

/**
 * Choose `file` in the hidden input, exactly as a picker would.
 *
 * `files` is defined as an own getter because a `FileList` cannot be constructed and
 * cannot be assigned; what matters for this component is that `input.files?.[0]` answers,
 * and that the handler still runs its `value` reset against the real element.
 */
async function chooseFile(name: string): Promise<void> {
  const input = fileInput();
  const file = new File(['{}'], name, { type: 'application/json' });

  Object.defineProperty(input, 'files', {
    configurable: true,
    get: () => [file] as unknown as FileList,
  });

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Press `Check for a new roster` and let the adapter promise settle. */
async function check(): Promise<void> {
  await act(async () => {
    buttonNamed(CHECK_LABEL)?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function outcome(value: RefreshOutcome): Promise<RefreshOutcome> {
  return Promise.resolve(value);
}

// ---------------------------------------------------------------------------

describe('the Roster group at rest', () => {
  it('states the heading, the current line and both controls', () => {
    mount({ regulationLabel: 'M-B', entryCount: 235, validUntil: '2026-09-02' });

    expect(host.querySelector('h2')?.textContent).toBe('Roster');
    expect(host.querySelector('.roster-refresh__current')?.textContent).toBe(
      'M-B — 235 Pokémon, valid until 2026-09-02.',
    );
    expect(buttonNamed(CHECK_LABEL)).not.toBeNull();
    expect(buttonNamed(IMPORT_LABEL)).not.toBeNull();
  });

  it('shows no sentence at all in the idle state', () => {
    mount();

    // The absence is the assertion. An empty status region is somewhere a screen reader
    // can land and find nothing, so idle renders no region rather than an empty one.
    expect(resultRegion()).toBeNull();
  });

  it('builds the current line from the arguments it was handed', () => {
    expect(currentRosterLine('M-A', 213, '2026-06-17')).toBe(
      'M-A — 213 Pokémon, valid until 2026-06-17.',
    );
  });
});

describe('the five refresh states', () => {
  it('says it is checking while the request is in flight', async () => {
    // Never settles, so the in-flight state is what is on screen when the assertion runs.
    adapter.refreshRoster.mockReturnValue(new Promise<RefreshOutcome>(() => undefined));
    mount();

    await check();

    expect(resultRegion()?.textContent).toBe(CHECKING_SENTENCE);
    expect(resultRegion()?.textContent).toBe('Checking for a new roster…');
  });

  it('says there is nothing to update when the origin has the same roster', async () => {
    adapter.refreshRoster.mockReturnValue(outcome({ kind: 'alreadyCurrent', label: 'M-B' }));
    mount();

    await check();

    expect(resultRegion()?.textContent).toBe('M-B is the newest roster. Nothing to update.');
    expect(resultRegion()?.textContent).toBe(alreadyCurrentSentence('M-B'));
  });

  it('names the new regulation and what it does and does not change', async () => {
    adapter.refreshRoster.mockReturnValue(
      outcome({ kind: 'updated', label: 'M-C', validUntil: '2026-11-18' }),
    );
    mount();

    await check();

    expect(resultRegion()?.textContent).toBe(
      'Updated to M-C, valid until 2026-11-18. New tournaments use it; tournaments already saved keep the roster they were played on.',
    );
    expect(resultRegion()?.textContent).toBe(updatedSentence('M-C', '2026-11-18'));
  });

  it('names the offline path when the check fails', async () => {
    adapter.refreshRoster.mockReturnValue(outcome({ kind: 'failed' }));
    mount();

    await check();

    // REFR-02 exists for exactly this host, so the failure sentence names it rather than
    // describing the transport.
    expect(resultRegion()?.textContent).toBe(
      'No network. Import a roster JSON file instead, or try again when you are online.',
    );
    expect(resultRegion()?.textContent).toBe(FAILED_SENTENCE);
  });

  it('says what a refused file is and what to choose instead', async () => {
    adapter.readRosterFile.mockResolvedValue({ kind: 'rejected' });
    mount();

    await chooseFile('not-a-roster.json');

    expect(resultRegion()?.textContent).toBe(
      'That file is not a roster snapshot this app can read. Choose a roster JSON exported by this project.',
    );
    expect(resultRegion()?.textContent).toBe(IMPORT_REJECTED_SENTENCE);
  });

  it('says which regulation collided when a file would replace one already held', async () => {
    // WR-07. Not the rejection sentence: the file IS a roster this app can read, and
    // sending the host away to find a different export of a valid file would be wrong.
    // Before this, a colliding file was adopted SILENTLY — re-pointing the recap, the
    // stones and the export text at a snapshot the manifest never published.
    adapter.readRosterFile.mockResolvedValue({ kind: 'conflict', regulation: 'M-B' });

    const onImported = vi.fn();
    mount({ onImported });

    await chooseFile('roster.mb.json');

    expect(resultRegion()?.textContent).toBe(
      'That file is a different M-B roster from the one this app already has. Choose a roster for a regulation this app does not ship.',
    );
    expect(resultRegion()?.textContent).toBe(importConflictSentence('M-B'));

    // Nothing was registered, so the caller is told nothing.
    expect(onImported).not.toHaveBeenCalled();
  });

  it('replaces the sentence on each attempt rather than stacking them', async () => {
    adapter.refreshRoster.mockReturnValue(outcome({ kind: 'failed' }));
    mount();
    await check();

    adapter.refreshRoster.mockReturnValue(outcome({ kind: 'alreadyCurrent', label: 'M-B' }));
    await check();

    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(resultRegion()?.textContent).toBe(alreadyCurrentSentence('M-B'));
  });
});

describe('the file input reset', () => {
  it('clears its value so the same path fires change a second time', async () => {
    adapter.readRosterFile.mockResolvedValue({ kind: 'rejected' });
    mount();

    await chooseFile('not-a-roster.json');

    expect(fileInput().value).toBe('');
  });

  it('shows the rejection again when the same refused file is chosen twice', async () => {
    adapter.readRosterFile.mockResolvedValue({ kind: 'rejected' });
    mount();

    await chooseFile('not-a-roster.json');
    expect(resultRegion()?.textContent).toBe(IMPORT_REJECTED_SENTENCE);

    await chooseFile('not-a-roster.json');
    expect(resultRegion()?.textContent).toBe(IMPORT_REJECTED_SENTENCE);
    expect(adapter.readRosterFile).toHaveBeenCalledTimes(2);
  });
});

describe('what the group reports to its caller', () => {
  it('hands on the adopted bundle after a successful check', async () => {
    const adopted = bundle('M-C', '2026-11-18');
    adapter.refreshRoster.mockReturnValue(
      outcome({ kind: 'updated', label: 'M-C', validUntil: '2026-11-18' }),
    );
    adapter.loadRoster.mockResolvedValue(adopted);

    const onRefreshed = vi.fn();
    mount({ onRefreshed });

    await check();

    expect(onRefreshed).toHaveBeenCalledTimes(1);
    expect(onRefreshed).toHaveBeenCalledWith(adopted);
    // Asked by no argument at all: the adapter has already made the new regulation the
    // default, so this resolves out of the registry rather than off the wire.
    expect(adapter.loadRoster).toHaveBeenCalledWith();
  });

  it('reports nothing to the caller when there was nothing to update', async () => {
    adapter.refreshRoster.mockReturnValue(outcome({ kind: 'alreadyCurrent', label: 'M-B' }));

    const onRefreshed = vi.fn();
    mount({ onRefreshed });

    await check();

    expect(onRefreshed).not.toHaveBeenCalled();
  });

  it('hands on an imported roster and returns the region to idle', async () => {
    const imported = bundle('M-A', '2026-06-17');
    adapter.readRosterFile.mockResolvedValue({ kind: 'adopted', bundle: imported });

    const onImported = vi.fn();
    const onRefreshed = vi.fn();
    mount({ onImported, onRefreshed });

    await chooseFile('roster.ma.json');

    expect(onImported).toHaveBeenCalledTimes(1);
    expect(onImported).toHaveBeenCalledWith(imported);

    // The two callbacks are NOT interchangeable: an imported roster is adopted into the
    // registry and deliberately does not become the default (05-04), so the callback that
    // means "what a new tournament is created against has changed" must stay silent.
    expect(onRefreshed).not.toHaveBeenCalled();

    // The copy table has no sentence for a successful import, because nothing on this
    // screen changed. Silence here is the contract rather than a gap in the mapping.
    expect(resultRegion()).toBeNull();
  });
});

describe('D-26 routing', () => {
  it('takes focus on Check for a new roster when it is routed to', () => {
    mount({ focusOnMount: true });

    expect(document.activeElement).toBe(buttonNamed(CHECK_LABEL));
  });

  it('leaves focus alone when it is not', () => {
    mount({ focusOnMount: false });

    expect(document.activeElement).not.toBe(buttonNamed(CHECK_LABEL));
  });
});

// ---------------------------------------------------------------------------
// D-24 — a document resolves its OWN roster, and the default stays resolved
// ---------------------------------------------------------------------------

/**
 * These run against the REAL adapter, not the stubs above.
 *
 * The claim under test is a property of the registry itself — that resolving one
 * regulation never evicts another — and a stubbed `resolveSnapshot` over a test-owned
 * `Map` would assert nothing except that the test's own map works. So the module is
 * imported for real and the network is stubbed one layer lower, over the committed files
 * in `public/data/`. That also puts the two snapshots this repo actually ships under test:
 * M-A and M-B, with the real manifest between them.
 */
describe('the registry holds a document roster and the default at once', () => {
  it('resolves a regulation by the LABEL a document carries, and evicts nothing', async () => {
    const real = await vi.importActual<typeof import('../../src/adapters/roster-source')>(
      '../../src/adapters/roster-source',
    );

    const served: string[] = [];
    const fetchStub = vi.fn((input: string) => {
      // `fetchJson` prefixes `import.meta.env.BASE_URL`, so the request is
      // `/Pokemon-champions-drafter/data/roster.index.json` and only the filename after the
      // last slash identifies the file on disk.
      const name = input.slice(input.lastIndexOf('/') + 1);
      served.push(name);
      const body = readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8');
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(body)) });
    });

    vi.stubGlobal('fetch', fetchStub);

    try {
      const current = await real.loadRoster();
      expect(current.snapshot.regulation).toBe('M-B');

      // `M-A` and not `ma`. A document only ever carries the LABEL — `ConfigScreen` stamps
      // `snapshot.regulation` onto `config.rosterVersion` — so an id-only manifest lookup
      // would make D-24's central case, a filed night on a prior regulation, unreachable.
      const prior = await real.loadRoster('M-A');
      expect(prior.snapshot.regulation).toBe('M-A');

      // BOTH, at once, and by either name. This is the sentence 05-CONTEXT.md writes under
      // D-24: the app must hold more than one snapshot resolved rather than assuming
      // `loadRoster()`'s single answer.
      expect(real.resolveSnapshot('M-B')).toBe(current);
      expect(real.resolveSnapshot('mb')).toBe(current);
      expect(real.resolveSnapshot('M-A')).toBe(prior);
      expect(real.resolveSnapshot('ma')).toBe(prior);

      // The two are different rosters, so "both resolved" is a real claim rather than one
      // bundle answering to four names.
      expect(prior.snapshot.entries.length).not.toBe(current.snapshot.entries.length);

      // A regulation this build has never seen answers `null` and does NOT fall back to
      // the default. Substituting it would render a finished tournament against a roster
      // that could not have contained its picks.
      expect(real.resolveSnapshot('M-Z')).toBeNull();
      await expect(real.loadRoster('M-Z')).rejects.toThrow();

      // Still resolved after the failure: a refused load leaves the registry alone.
      expect(real.resolveSnapshot('M-B')).toBe(current);
      expect(served).toContain('roster.ma.json');

      // A refresh cycle changes what a NEW tournament is created against and evicts
      // nothing, so a document already resolved against M-A is untouched by it.
      await real.refreshRoster();
      expect(real.resolveSnapshot('M-A')).toBe(prior);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ---------------------------------------------------------------------------
// D-24 in the shell — a document opens against the roster it names
// ---------------------------------------------------------------------------

/**
 * The registry is stubbed here, and the shell is real.
 *
 * The question is no longer "does the registry hold two snapshots" — the test above proves
 * that against the real adapter and the committed files — but "does the SHELL render a
 * document against its own one". So the seam moves up: `resolveSnapshot` and `loadRoster`
 * answer from a map this file owns, and what is under test is which of their answers ends
 * up on screen.
 *
 * The unresolvable case is the one worth the setup. Its failure mode is silent: an M-A
 * night rendered against M-B would show the wrong pool, with every species that rotated out
 * replaced by nothing and no sentence anywhere saying a substitution had happened.
 */
describe('the shell renders a document against the roster it names', () => {
  const DEFAULT_REGULATION = 'M-B';
  const PRIOR_REGULATION = 'M-A';

  function rosterOf(regulation: string, prefix: string, label: string): RosterBundle {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `${prefix}-${index}`,
      name: `${label} ${index}`,
      num: index + 1,
      types: ['Normal'],
      baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
      baseSpeciesId: `${prefix}-${index}`,
      forme: null,
      megaCapable: false,
      megaFormes: [],
      spriteId: `${prefix}-${index}`,
      spriteMissing: true,
    }));

    return {
      snapshot: {
        schemaVersion: 1,
        regulation,
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
        upstreamRef: 'test',
        generatedAt: '2026-01-01T00:00:00Z',
        counts: {
          legalEntries: rows.length,
          draftable: rows.length,
          megaFormes: 0,
          baseSpecies: rows.length,
        },
        entries: rows,
        checksum: `checksum-${prefix}`,
      },
      spriteMeta: { nativeWidth: 96, nativeHeight: 96, byRosterId: {} },
    } as unknown as RosterBundle;
  }

  const DEFAULT_BUNDLE = rosterOf(DEFAULT_REGULATION, 'mb', 'Beta');
  const PRIOR_BUNDLE = rosterOf(PRIOR_REGULATION, 'ma', 'Alpha');

  /** What this build has resolved. `M-Z` is deliberately absent. */
  const registry = new Map<string, RosterBundle>([
    [DEFAULT_REGULATION, DEFAULT_BUNDLE],
    [PRIOR_REGULATION, PRIOR_BUNDLE],
  ]);

  function seedSavedDraft(rosterVersion: string, poolPrefix: string): void {
    const config: TournamentConfig = {
      formatLabel: `Champions ${rosterVersion}`,
      players: [
        { id: 'p1', name: 'Ada' },
        { id: 'p2', name: 'Bo' },
      ],
      rounds: 6,
      rosterVersion,
      rosterChecksum: `checksum-${poolPrefix}`,
      poolSize: 12,
      bans: [],
      banMode: 'hostBanlist',
      megasRequiredPerTeam: 0,
      dualMegaChoices: [],
      depth: 'draftOnly',
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

    const doc: TournamentDoc = {
      schemaVersion: SCHEMA_VERSION,
      id: `roster-fixture-${poolPrefix}`,
      createdAt: 1_770_000_000_000,
      config,
      rng: { seed: 0x5f3a91c2, cursor: 0 },
      log: [
        {
          ...poolBuilt(
            Array.from({ length: 12 }, (_, index) => `${poolPrefix}-${index}`),
            rosterVersion,
            `checksum-${poolPrefix}`,
            11,
            0,
          ),
          seq: 0,
          at: 1_770_000_000_000,
          actorId: 'host',
        },
        {
          ...draftStarted(['p1', 'p2'], 13),
          seq: 1,
          at: 1_770_000_000_001,
          actorId: 'host',
        },
      ],
    };

    expect(saveTournament(doc)).toBe(true);
  }

  async function mountAndResume(): Promise<void> {
    await act(async () => {
      render(<App />, host);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const resume = buttonNamed('Resume saved draft');
    expect(resume).not.toBeNull();

    await act(async () => {
      resume?.click();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    localStorage.clear();

    adapter.loadRoster.mockImplementation((regulationId?: string) => {
      if (regulationId === undefined) return Promise.resolve(DEFAULT_BUNDLE);
      const held = registry.get(regulationId);
      return held === undefined
        ? Promise.reject(new Error(`roster index has no regulation "${regulationId}"`))
        : Promise.resolve(held);
    });

    adapter.resolveSnapshot.mockImplementation(
      (rosterVersion: string) => registry.get(rosterVersion) ?? null,
    );
  });

  afterEach(() => {
    disposeTabLock();
    localStorage.clear();
  });

  it('renders a prior regulation document against that regulation, not the default', async () => {
    seedSavedDraft(PRIOR_REGULATION, 'ma');
    await mountAndResume();

    const shown = host.textContent ?? '';

    // M-A's rows, which is the whole of D-24: a filed night on last regulation stays a
    // night on last regulation after the app's default has moved on.
    expect(shown).toContain('Alpha 0');

    // And emphatically NOT the default's, which is the silent substitution that would
    // rewrite what this tournament was played on.
    expect(shown).not.toContain('Beta 0');
  });

  it('keeps the default resolved while a prior regulation document is open', async () => {
    seedSavedDraft(PRIOR_REGULATION, 'ma');
    await mountAndResume();

    // Both snapshots, held at once — the consequence 05-CONTEXT.md spells out under D-24.
    // The document's is on screen; the default is still the answer for a NEW tournament.
    expect(adapter.resolveSnapshot(DEFAULT_REGULATION)).toBe(DEFAULT_BUNDLE);
    expect(adapter.resolveSnapshot(PRIOR_REGULATION)).toBe(PRIOR_BUNDLE);

    // Resolving the document's roster never asked for the default to be replaced.
    expect(adapter.loadRoster).toHaveBeenCalledWith();
  });

  it('states the problem and names the file import when the roster cannot be resolved', async () => {
    seedSavedDraft('M-Z', 'mz');
    await mountAndResume();

    const shown = host.textContent ?? '';

    expect(shown).toContain(
      'This tournament was played on roster M-Z, which this build does not have.',
    );

    // The recovery is REFR-02's import, named in the words its own control wears, and
    // `Download JSON` stays as the way to keep the record either way.
    expect(shown).toContain('Import roster JSON…');
    expect(shown).toContain('Download JSON');

    // The load-bearing negative: the default roster's rows are NOT substituted in. An
    // empty pool with a sentence is honest; a full pool from the wrong regulation is not.
    expect(shown).not.toContain('Beta 0');
    expect(shown).not.toContain('Alpha 0');
  });
});
