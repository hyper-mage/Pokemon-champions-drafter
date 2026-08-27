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

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RefreshOutcome, RosterBundle } from '../../src/adapters/roster-source';

/**
 * Hoisted so the `vi.mock` factory below can see them — `vi.mock` is lifted above every
 * import, so a plain `const` would still be in its temporal dead zone when the factory
 * runs.
 */
const adapter = vi.hoisted(() => ({
  refreshRoster: vi.fn(),
  readRosterFile: vi.fn(),
  loadRoster: vi.fn(),
}));

vi.mock('../../src/adapters/roster-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/adapters/roster-source')>();
  return {
    ...actual,
    refreshRoster: adapter.refreshRoster,
    readRosterFile: adapter.readRosterFile,
    loadRoster: adapter.loadRoster,
  };
});

import {
  alreadyCurrentSentence,
  CHECK_LABEL,
  CHECKING_SENTENCE,
  currentRosterLine,
  FAILED_SENTENCE,
  IMPORT_LABEL,
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
    adapter.readRosterFile.mockResolvedValue(null);
    mount();

    await chooseFile('not-a-roster.json');

    expect(resultRegion()?.textContent).toBe(
      'That file is not a roster snapshot this app can read. Choose a roster JSON exported by this project.',
    );
    expect(resultRegion()?.textContent).toBe(IMPORT_REJECTED_SENTENCE);
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
    adapter.readRosterFile.mockResolvedValue(null);
    mount();

    await chooseFile('not-a-roster.json');

    expect(fileInput().value).toBe('');
  });

  it('shows the rejection again when the same refused file is chosen twice', async () => {
    adapter.readRosterFile.mockResolvedValue(null);
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
    adapter.readRosterFile.mockResolvedValue(imported);

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
