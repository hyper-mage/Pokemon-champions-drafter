// @vitest-environment happy-dom

/**
 * The staleness banner — REFR-03, D-25, D-26, 05-UI-SPEC §3.
 *
 * ## The boundary case is the reason this file exists
 *
 * `validUntil` is the FIRST day a snapshot is stale, not the last day it is current — the
 * manifest gives M-A `validUntil 2026-06-17` and M-B `validFrom 2026-06-17`, the same day,
 * and it cannot be live for both. So the comparison is `>=`. An off-by-one there is
 * invisible for ten weeks at a time and then wrong exactly on the day it matters. The case
 * below uses M-B's real committed `2026-09-02` rather than an invented date, which ties
 * this surface to the file actually on disk.
 *
 * ## Routing, not a second control
 *
 * D-26's whole content is that the landing banner sends the host to the one refresh control
 * rather than growing a copy of it. That is asserted by composing the REAL `LandingScreen`
 * and the REAL `ConfigScreen` in a harness and following the click: a component test that
 * only checked a callback fired would pass just as happily against a second refresh button
 * bolted onto the landing screen, which is the exact outcome D-26 was written to prevent.
 * The same test pins that `refreshRoster` was never called — the banner routes, it does not
 * refresh in place.
 *
 * ## Two mount sites, asserted structurally
 *
 * "It never renders on the draft, ban or tournament screens" is a claim about the whole
 * app, and there is no render that can prove a negative about screens this file does not
 * mount. It is asserted against the sources instead: exactly two files render this
 * component, and `app.tsx` — which holds the draft screen inline — is not one of them.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hoisted so the `vi.mock` factory below can see it — `vi.mock` is lifted above every
 * import, so a plain `const` would still be in its temporal dead zone when the factory runs.
 */
const adapter = vi.hoisted(() => ({
  refreshRoster: vi.fn(),
  readRosterFile: vi.fn(),
}));

/**
 * The clock, stubbed at the adapter seam rather than by faking timers.
 *
 * The two screens call `todayIso()` themselves — that is the whole point of stamping the
 * day at the edge — so a test of the mounted banner has to control the edge. Left as a
 * PARTIAL mock so `now()` survives: `ConfigScreen` reaches the store, which stamps every
 * action with it, and a store that could not read the clock would fail for reasons that
 * have nothing to do with this file.
 */
const clock = vi.hoisted(() => ({ today: '2026-09-02' }));

vi.mock('../../src/adapters/clock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/adapters/clock')>();
  return { ...actual, todayIso: () => clock.today };
});

vi.mock('../../src/adapters/roster-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/adapters/roster-source')>();
  return {
    ...actual,
    refreshRoster: adapter.refreshRoster,
    readRosterFile: adapter.readRosterFile,
  };
});

import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import { CHECK_LABEL } from '../../src/ui/components/RosterRefresh';
import {
  configSentence,
  landingSentence,
  StalenessBanner,
  UPDATE_LABEL,
} from '../../src/ui/components/StalenessBanner';
import { ConfigScreen } from '../../src/ui/screens/ConfigScreen';
import { LandingScreen } from '../../src/ui/screens/LandingScreen';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** M-B's real committed window, so the boundary case is the one that actually ships. */
const REGULATION = 'M-B';
const VALID_UNTIL = '2026-09-02';

const ENTRIES = Array.from({ length: 8 }, (_, index) => ({
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
})) as unknown as readonly RosterEntry[];

const SNAPSHOT = {
  schemaVersion: 1,
  regulation: REGULATION,
  validFrom: '2026-06-17',
  validUntil: VALID_UNTIL,
  upstreamRef: 'test',
  generatedAt: '2026-06-17T00:00:00Z',
  counts: {
    legalEntries: ENTRIES.length,
    draftable: ENTRIES.length,
    megaFormes: 0,
    baseSpecies: ENTRIES.length,
  },
  entries: ENTRIES,
  checksum: 'checksum-mb',
} as unknown as RosterSnapshot;

const SPRITE_META: SpriteMeta = {
  nativeWidth: 96,
  nativeHeight: 96,
  byRosterId: {},
} as unknown as SpriteMeta;

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);

  adapter.refreshRoster.mockReset();
  adapter.readRosterFile.mockReset();

  // M-B's committed expiry, so the mounted-screen cases run the boundary that ships.
  clock.today = VALID_UNTIL;
});

afterEach(() => {
  render(null, host);
  host.remove();
});

interface Overrides {
  variant?: 'config' | 'landing';
  regulationLabel?: string;
  validUntil?: string;
  today?: string;
  onUpdateRoster?: () => void;
}

function mount(overrides: Overrides = {}): void {
  act(() => {
    render(
      <StalenessBanner
        variant={overrides.variant ?? 'config'}
        regulationLabel={overrides.regulationLabel ?? REGULATION}
        validUntil={overrides.validUntil ?? VALID_UNTIL}
        today={overrides.today ?? VALID_UNTIL}
        onUpdateRoster={overrides.onUpdateRoster}
      />,
      host,
    );
  });
}

function bannerText(): string | null {
  return host.querySelector('.staleness-banner__text')?.textContent ?? null;
}

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    Array.from(host.querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
}

/**
 * Read a repo-relative source file.
 *
 * Resolved from `process.cwd()` — which Vitest sets to the project root — and NOT from
 * `new URL(path, import.meta.url)`. Under `happy-dom` the global `URL` is the DOM's, not
 * Node's, so `readFileSync` does not recognise the object it produces and silently reads a
 * path ending in `undefined`. The failure is confusing enough to be worth the note.
 */
function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

// ---------------------------------------------------------------------------
// When it appears at all
// ---------------------------------------------------------------------------

describe('the staleness banner appears only once the snapshot has expired', () => {
  it('renders nothing while the snapshot is still current', () => {
    mount({ today: '2026-08-26' });

    expect(host.querySelector('.staleness-banner')).toBeNull();
    expect(host.textContent).toBe('');
  });

  it('renders ON the validUntil day, because the interval is half-open', () => {
    // M-B's committed window ends 2026-09-02 and M-A's ended the day M-B's began. A `>`
    // here would leave the host un-warned on the one day the answer changes.
    mount({ today: VALID_UNTIL });

    expect(host.querySelector('.staleness-banner')).not.toBeNull();
  });

  it('still renders once the day has passed', () => {
    mount({ today: '2026-09-09' });

    expect(host.querySelector('.staleness-banner')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The two sentences
// ---------------------------------------------------------------------------

describe('the two variants say the two things the copy table says', () => {
  it('states the problem and names the control below it on the config screen', () => {
    mount({ variant: 'config' });

    expect(bannerText()).toBe(
      'M-B expired on 2026-09-02. Check for a new roster below before you start a night on it.',
    );
    expect(bannerText()).toBe(configSentence(REGULATION, VALID_UNTIL));
  });

  it('offers no button on the config screen, because the control is already there', () => {
    mount({ variant: 'config', onUpdateRoster: vi.fn() });

    // Passed a handler and STILL renders no button: the variant decides, not the props.
    // A second refresh route on this screen is the duplication D-26 forbids.
    expect(host.querySelectorAll('button')).toHaveLength(0);
  });

  it('states the problem and names its next action on the landing screen', () => {
    mount({ variant: 'landing', onUpdateRoster: vi.fn() });

    expect(bannerText()).toBe(
      'M-B expired on 2026-09-02. Update the roster before you start a night on it.',
    );
    expect(bannerText()).toBe(landingSentence(REGULATION, VALID_UNTIL));
  });

  it('offers exactly one action on the landing screen', () => {
    mount({ variant: 'landing', onUpdateRoster: vi.fn() });

    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(buttonNamed(UPDATE_LABEL)).not.toBeNull();
  });

  it('carries the sentence in a surface-owned status region', () => {
    mount({ variant: 'config' });

    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      configSentence(REGULATION, VALID_UNTIL),
    );
  });
});

// ---------------------------------------------------------------------------
// D-26 — routing, not a second control
// ---------------------------------------------------------------------------

/**
 * The landing screen, and then the config screen when it asks to be routed there. This is
 * `app.tsx`'s `Screen` union in miniature: the focus request rides on the route rather than
 * living beside it, which is what stops it leaking into the next `New tournament`.
 */
function RouteHarness() {
  const [onConfig, setOnConfig] = useState(false);

  if (onConfig) {
    return (
      <ConfigScreen
        snapshot={SNAPSHOT}
        entries={ENTRIES}
        spriteMeta={SPRITE_META}
        onStarted={() => undefined}
        focusRosterRefresh
      />
    );
  }

  return (
    <LandingScreen
      saved={null}
      storageBlocked={false}
      onAcknowledgeStorage={() => undefined}
      onNewTournament={() => undefined}
      onResume={() => undefined}
      onImportFile={() => undefined}
      roster={{ regulationLabel: REGULATION, validUntil: VALID_UNTIL }}
      onUpdateRoster={() => setOnConfig(true)}
    />
  );
}

describe('Update the roster routes to the one refresh control', () => {
  it('lands on the config screen with focus on Check for a new roster', () => {
    act(() => {
      render(<RouteHarness />, host);
    });

    const update = buttonNamed(UPDATE_LABEL);
    expect(update).not.toBeNull();

    act(() => {
      update?.click();
    });

    const check = buttonNamed(CHECK_LABEL);
    expect(check).not.toBeNull();
    expect(document.activeElement).toBe(check);
  });

  it('does not refresh in place', () => {
    act(() => {
      render(<RouteHarness />, host);
    });

    act(() => {
      buttonNamed(UPDATE_LABEL)?.click();
    });

    // The banner's action navigates. The fetch belongs to the button it navigated to, and
    // pressing `Update the roster` must not have started one.
    expect(adapter.refreshRoster).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D-25 — it warns and never blocks
// ---------------------------------------------------------------------------

describe('the banner never blocks', () => {
  it('leaves New tournament pressable while it is on screen', () => {
    act(() => {
      render(
        <LandingScreen
          saved={null}
          storageBlocked={false}
          onAcknowledgeStorage={() => undefined}
          onNewTournament={() => undefined}
          onResume={() => undefined}
          onImportFile={() => undefined}
          roster={{ regulationLabel: REGULATION, validUntil: VALID_UNTIL }}
          onUpdateRoster={() => undefined}
        />,
        host,
      );
    });

    expect(host.querySelector('.staleness-banner')).not.toBeNull();

    const newTournament = buttonNamed('New tournament');
    expect(newTournament).not.toBeNull();
    expect(newTournament?.disabled).toBe(false);
    // Not inert-by-aria either. D-25 rejected blocking because it would also block a host
    // with no network, which breaks the offline premise.
    expect(newTournament?.getAttribute('aria-disabled')).toBeNull();
  });

  it('suppresses itself entirely when the storage canary has failed', () => {
    // The one warning that outranks it. A screen offering a roster errand beside a warning
    // that nothing will be kept is offering the host a way to skip the important one.
    act(() => {
      render(
        <LandingScreen
          saved={null}
          storageBlocked
          onAcknowledgeStorage={() => undefined}
          onNewTournament={() => undefined}
          onResume={() => undefined}
          onImportFile={() => undefined}
          roster={{ regulationLabel: REGULATION, validUntil: VALID_UNTIL }}
          onUpdateRoster={() => undefined}
        />,
        host,
      );
    });

    expect(host.querySelector('.staleness-banner')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Exactly two mount sites, and no danger colour
// ---------------------------------------------------------------------------

describe('the banner is mounted on exactly the two screens where a night gets started', () => {
  it('is rendered by the landing and config screens', () => {
    expect(source('src/ui/screens/LandingScreen.tsx')).toContain('<StalenessBanner');
    expect(source('src/ui/screens/ConfigScreen.tsx')).toContain('<StalenessBanner');
  });

  it.each([
    'src/ui/screens/BanStageScreen.tsx',
    'src/ui/screens/CompletedDraft.tsx',
    // The draft screen lives inline in the shell, so this file standing clear is what
    // proves the draft and card screens never carry it either.
    'src/app.tsx',
  ])('is not rendered by %s', (path) => {
    expect(source(path)).not.toContain('StalenessBanner');
  });
});

describe('the stylesheet stays inside the token table', () => {
  const css = source('src/ui/components/StalenessBanner.css');

  it('takes the raised surface and no danger token', () => {
    expect(css).toContain('var(--color-surface-raised)');
    expect(css).not.toContain('--color-danger');
  });

  it('declares no raw hex colour', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it('is not sticky, and the header says so', () => {
    expect(css).not.toMatch(/position:\s*sticky/);
    expect(css).toContain('must not become sticky');
  });
});
