// @vitest-environment happy-dom

/**
 * `inert` on the draft region — PERS-03 / D-12, UI-SPEC section 4(b).
 *
 * The banner explains; `inert` is what actually stops a read-only tab being clicked. It
 * is one attribute, which makes it exactly the kind of thing that gets quietly dropped
 * in a refactor and noticed by nobody, because a read-only tab LOOKS identical either
 * way — the UI-SPEC forbids dimming the pool. Nothing about the page's appearance would
 * change if this attribute vanished; only its behaviour would.
 *
 * So it is asserted here against the real `App`, on a real DOM, rather than by grepping
 * the JSX for the word.
 *
 * What this file cannot prove: that `inert` genuinely blocks focus and pointer events.
 * happy-dom parses the attribute but does not implement its focus semantics, and no
 * amount of unit testing substitutes for a browser here. That is step 3 of the plan's
 * human-verify checkpoint, and it stays there deliberately. What IS proved here is the
 * half that silently rots: that the attribute is present exactly when the tab is a
 * secondary, and absent the rest of the time.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hoisted so the `vi.mock` factory below can see it.
 *
 * `vi.mock` is lifted above every import, so a fixture declared as a plain `const` would
 * still be in its temporal dead zone when the factory runs.
 */
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
          entries.map((row) => [row.id, { pokeapiId: row.num, file: `${row.num}.png`, slug: row.id }]),
        ),
      },
    },
  };
});

// The shell fetches the roster over the network on mount. Mocked at the adapter, which
// is the seam that exists for exactly this. Twenty species outlast a twelve-pick draft.
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
  requestTakeover,
  type LockChannel,
  type LockMessage,
} from '../../src/adapters/tab-lock';
import { draftStarted, poolBuilt, type Action, type Intent } from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';

// ---------------------------------------------------------------------------

interface Port {
  handler: ((message: LockMessage) => void) | null;
  open: boolean;
}

function makeBus() {
  const ports: Port[] = [];
  return {
    connect(): LockChannel {
      const port: Port = { handler: null, open: true };
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

let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  disposeTabLock();
  localStorage.clear();
});

/** Mount the shell and let the roster promise and every effect settle. */
async function mountApp(): Promise<void> {
  await act(async () => {
    render(<App />, host);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function draftRegion(): HTMLElement | null {
  return host.querySelector('.draft-region');
}

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

/**
 * Put a tournament in browser storage, so the landing screen offers `Resume saved draft`.
 *
 * Since D-01 the app creates nothing on load — it opens on the landing screen — so a test
 * about the DRAFT screen now has to say how it got there. Resume is the shortest of the
 * three routes and the only one that does not go through the config screen, which keeps
 * this file about `inert` rather than about the form.
 *
 * Called before `claimOwnership`, deliberately: `persistence.save` refuses a tab that does
 * not hold the lock, and this write is the fixture rather than part of what is under test.
 */
function seedSavedDraft(): void {
  const config: TournamentConfig = {
    formatLabel: 'Champions MB',
    players: [
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
    ],
    rounds: 6,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 12,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftOnly',
  };

  const doc: TournamentDoc = {
    schemaVersion: SCHEMA_VERSION,
    id: 'read-only-shell-fixture',
    createdAt: 1_770_000_000_000,
    config,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: [
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
      stamp(draftStarted(['p1', 'p2'], 13), 1),
    ],
  };

  expect(saveTournament(doc)).toBe(true);
}

/** Click through the landing screen to the draft. */
async function resumeSavedDraft(): Promise<void> {
  const resume = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === 'Resume saved draft',
  );
  expect(resume).toBeDefined();

  await act(async () => {
    resume?.click();
    await Promise.resolve();
  });
}

describe('the draft region in a read-only tab', () => {
  it('is inert while another tab is drafting, and stops being inert on takeover', async () => {
    seedSavedDraft();
    const bus = makeBus();

    // Another tab already holds the lock. Engaging this tab's lock BEFORE mounting is
    // what makes `App`'s own `claimOwnership` a no-op, which is how the fake channel
    // gets injected into a component that quite rightly does not take one as a prop.
    vi.useFakeTimers();
    const rival = createTabLock({ tabId: 'rival', channel: bus.connect() });
    rival.claim();
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);
    claimOwnership({ channel: bus.connect() });
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);
    vi.useRealTimers();

    await mountApp();
    await resumeSavedDraft();

    const region = draftRegion();
    expect(region).not.toBeNull();

    // Present, and that is the whole assertion: `inert=""` is how a bare boolean
    // attribute serialises, so presence is the signal rather than any particular value.
    expect(region?.hasAttribute('inert')).toBe(true);

    // The banner explains why, in the contracted words.
    expect(host.textContent).toContain(
      'Another tab is drafting this tournament. This tab is read-only.',
    );

    // Now the host takes over.
    await act(async () => {
      requestTakeover();
      await Promise.resolve();
    });

    expect(draftRegion()?.hasAttribute('inert')).toBe(false);
    expect(rival.state().readOnly).toBe(true);

    rival.dispose();
  });

  it('is never inert in a tab that is the only one open', async () => {
    seedSavedDraft();
    const bus = makeBus();
    vi.useFakeTimers();
    claimOwnership({ channel: bus.connect() });
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);
    vi.useRealTimers();

    await mountApp();
    await resumeSavedDraft();

    // The ordinary case, and the one a regression would hit hardest: a lone tab that
    // cannot be drafted in is a broken app, not a cautious one.
    expect(draftRegion()).not.toBeNull();
    expect(draftRegion()?.hasAttribute('inert')).toBe(false);
    expect(host.textContent).not.toContain('read-only');
  });
});
