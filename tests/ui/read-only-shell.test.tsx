// @vitest-environment happy-dom

/**
 * The read-only gate — PERS-03 / D-12 / T-02-15, UI-SPEC section 4(b).
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
 * ## The gate has two halves, and both rot silently
 *
 * `inert` sits on the shell element holding every SCREEN — landing, config and draft
 * alike. What it must never cover is the live region, the read-only banner, or the
 * dialogs, all of which are siblings of it. So this file asserts CONTAINMENT in both
 * directions:
 *
 *   Too narrow is a data-loss bug. A gate around the draft alone leaves a secondary tab
 *   free to walk the landing screen to `New tournament` and build a competing
 *   tournament that one autosave after promotion writes over the owner's draft.
 *
 *   Too wide is a lockout. `inert` strips its subtree from the accessibility tree, so a
 *   banner inside the gate silences its own announcement and a takeover button inside it
 *   can never be pressed — which `tab-lock.ts`'s header calls worse than the race the
 *   lock exists to prevent.
 *
 * What this file cannot prove: that `inert` genuinely blocks focus and pointer events.
 * happy-dom parses the attribute but does not implement its focus semantics, and no
 * amount of unit testing substitutes for a browser here. That is step 3 of the plan's
 * human-verify checkpoint, and it stays there deliberately. What IS proved here is the
 * half that silently rots: that the attribute is present exactly when the tab is a
 * secondary, that it is absent the rest of the time, and that it covers exactly the
 * right subtree.
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
import { announce } from '../../src/ui/components/LiveRegion';
import { READ_ONLY_SENTENCE, TAKEOVER_LABEL } from '../../src/ui/components/ReadOnlyBanner';
import {
  CLAIM_WINDOW_MS,
  claimOwnership,
  createTabLock,
  disposeTabLock,
  requestTakeover,
  type LockChannel,
  type LockMessage,
} from '../../src/adapters/tab-lock';
import {
  draftStarted,
  poolBuilt,
  scheduleCompiled,
  type Action,
  type Intent,
} from '../../src/core/actions';
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

  // `announce` writes to a module-level signal that outlives any render, so a sentence
  // left behind by the previous test would satisfy the live-region assertion below
  // without the banner ever having spoken.
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

/**
 * The element that carries the gate.
 *
 * Queried by the class the shell actually renders rather than by `[inert]`, so a test can
 * assert the attribute is ABSENT as well as present — `[inert]` would return null in both
 * the healthy no-gate case and the case where the shell stopped rendering at all.
 *
 * Three classes because the shell wears one of them by screen: `.app-shell` on landing and
 * config, `.draft-shell` on the draft and the snake ban stage, `.entry-shell` while the
 * blind entry surface is up (`04-UI-SPEC` section 3). `.app-shell__title` is a different
 * class and does not match any of them.
 *
 * All three are listed here rather than only the two the gate wore before Phase 4, because
 * this helper's job is to find the GATE — a selector that missed the third would make every
 * `inert` assertion below silently skip the one screen the phase added.
 */
function shell(): HTMLElement | null {
  return host.querySelector('.draft-shell, .app-shell, .entry-shell');
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === name,
  );
}

/** The single polite region, as a NODE — its text is asserted on it, never on `host`. */
function liveRegion(): HTMLElement | null {
  return host.querySelector('[role="status"][aria-live="polite"]');
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
    rules: [{ kind: 'mega', count: 0 }],
    megaFormeBans: [],
    swapBudget: 0,
    swapRounds: 0,
    bansPerPlayer: 0,
    duplicateBanPolicy: 'bothApply',
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
  const resume = buttonNamed('Resume saved draft');
  expect(resume).toBeDefined();

  await act(async () => {
    resume?.click();
    await Promise.resolve();
  });
}

/**
 * Put another tab in charge, then mount this one as the secondary.
 *
 * Engaging this tab's lock BEFORE mounting is what makes `App`'s own `claimOwnership` a
 * no-op, which is how the fake channel gets injected into a component that quite rightly
 * does not take one as a prop.
 */
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

describe('the gate in a read-only tab', () => {
  it('is inert while another tab is drafting, and stops being inert on takeover', async () => {
    seedSavedDraft();
    const rival = rivalTabTakesTheLock();

    await mountApp();
    await resumeSavedDraft();

    const gate = shell();
    expect(gate).not.toBeNull();

    // Present, and that is the whole assertion: `inert=""` is how a bare boolean
    // attribute serialises, so presence is the signal rather than any particular value.
    expect(gate?.hasAttribute('inert')).toBe(true);

    // One gate, not two. A second `inert` somewhere in the tree would mean the shell gate
    // and a leftover inner one had both been kept, and the inner one going stale would
    // then be invisible.
    expect(host.querySelectorAll('[inert]')).toHaveLength(1);

    // The banner explains why, in the contracted words.
    expect(host.textContent).toContain(READ_ONLY_SENTENCE);

    // Now the host takes over.
    await act(async () => {
      requestTakeover();
      await Promise.resolve();
    });

    expect(shell()?.hasAttribute('inert')).toBe(false);
    expect(host.querySelectorAll('[inert]')).toHaveLength(0);
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
    expect(shell()).not.toBeNull();
    expect(shell()?.hasAttribute('inert')).toBe(false);
    expect(host.textContent).not.toContain('read-only');
  });

  it('covers the landing screen, so a secondary tab cannot start a rival tournament', async () => {
    seedSavedDraft();
    const rival = rivalTabTakesTheLock();

    // Deliberately no resume: this tab stays on the landing screen, which is where the
    // T-02-15 sequence starts. Step 4 of 02-SECURITY.md is the host clicking
    // `New tournament` here, filling the config form, and clicking `Start draft` —
    // `handleStart` has no ownership check, `dispatch` is deliberately un-gated, and one
    // autosave after promotion writes that rival tournament over the owner's draft.
    await mountApp();

    const gate = shell();
    expect(gate).not.toBeNull();
    expect(gate?.hasAttribute('inert')).toBe(true);

    // CONTAINMENT, not a click. happy-dom parses `inert` but implements neither its focus
    // nor its pointer semantics, so it would fire the handler quite happily and a click
    // assertion here would prove the opposite of what it claimed. Whether the attribute
    // truly blocks the press is the browser checkpoint's job; whether the button is under
    // the attribute at all is this test's, and that is the half that rots in a refactor.
    const newTournament = buttonNamed('New tournament');
    expect(newTournament).toBeDefined();
    expect(gate?.contains(newTournament ?? null)).toBe(true);

    // The other half of the same assertion, and the reason it lives in this test rather
    // than a separate one: a gate that swallowed the whole tree would satisfy the line
    // above and lock the host out of the only route back. That was the retracted answer,
    // and it would wear a passing test.
    const takeover = buttonNamed(TAKEOVER_LABEL);
    expect(takeover).toBeDefined();
    expect(gate?.contains(takeover ?? null)).toBe(false);

    rival.dispose();
  });

  it('leaves the polite live region outside itself, still carrying the sentence', async () => {
    seedSavedDraft();
    const rival = rivalTabTakesTheLock();

    await mountApp();

    const gate = shell();
    const region = liveRegion();
    expect(region).not.toBeNull();

    // `inert` removes a subtree from the accessibility tree as well as from the input
    // path, so a live region inside the gate is a live region that says nothing in
    // precisely the tab that most needs to be told why it does not respond.
    expect(gate?.contains(region)).toBe(false);

    // On the region NODE, never on `host.textContent`: the banner renders the same
    // sentence as visible copy, so a host-level assertion passes with the region silent.
    expect(region?.textContent?.trim()).toBe(READ_ONLY_SENTENCE);

    rival.dispose();
  });
});

// ---------------------------------------------------------------------------
// The ban stage, which is the fourth screen the gate has to cover — T-04-20
// ---------------------------------------------------------------------------

/**
 * A tournament parked at its ban stage: a schedule, an order and NO pool.
 *
 * The mode is a parameter because the shell answer differs by it — snake keeps
 * `.draft-shell`, blind does not — and one fixture with one varying field is what keeps the
 * two cases comparable. Everything else about the document is identical.
 *
 * The shape `createBanStage` writes, seeded directly rather than driven through the config
 * form, so this file stays about the gate. `fold` runs no `canApply`, so a document may be
 * assembled here without walking the dispatch path.
 */
function seedSavedBanStage(banMode: 'snake' | 'blind' = 'snake'): void {
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
    banMode,
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftOnly',
    rules: [{ kind: 'mega', count: 0 }],
    megaFormeBans: [],
    swapBudget: 0,
    swapRounds: 0,
    bansPerPlayer: 2,
    duplicateBanPolicy: 'bothApply',
  };

  const doc: TournamentDoc = {
    schemaVersion: SCHEMA_VERSION,
    id: 'read-only-ban-stage-fixture',
    createdAt: 1_770_000_000_000,
    config,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: [
      stamp(
        scheduleCompiled(
          Array.from({ length: 6 }, (_, index) => ({
            index: index + 1,
            kind: 'open' as const,
          })),
        ),
        0,
      ),
      stamp(draftStarted(['p1', 'p2'], 13), 1),
    ],
  };

  expect(saveTournament(doc)).toBe(true);
}

describe('the gate over the ban stage', () => {
  /**
   * T-04-20, and the reason it is a test rather than a review item: a `BanStageScreen`
   * rendered as a SIBLING of the gate rather than a child of it looks identical on screen
   * and reopens the rival-tournament hole the landing and config screens were moved inside
   * the gate to close.
   */
  it('renders the ban stage INSIDE the inert region in a read-only tab', async () => {
    seedSavedBanStage();
    const rival = rivalTabTakesTheLock();

    await mountApp();
    await resumeSavedDraft();

    const gate = shell();
    expect(gate).not.toBeNull();
    expect(gate?.hasAttribute('inert')).toBe(true);

    // One gate, not two — the same assertion the draft case makes, and for the same reason.
    expect(host.querySelectorAll('[inert]')).toHaveLength(1);

    // CONTAINMENT rather than a click: happy-dom parses `inert` but implements neither its
    // focus nor its pointer semantics. Whether the banner is under the attribute at all is
    // what rots in a refactor, and it is what this asserts.
    const banner = host.querySelector('.turn-banner');
    expect(banner).not.toBeNull();
    expect(gate?.contains(banner)).toBe(true);

    rival.dispose();
  });

  /**
   * `04-UI-SPEC` Amendment 2: snake keeps `.draft-shell` because it IS the two-pane working
   * screen — pool on the left, ban board on the right, exactly the draft the room is about
   * to run. Blind's locked and reveal screens take `.app-shell`, and 04-09 asserts that.
   */
  it('wears the draft shell at a snake ban stage', async () => {
    seedSavedBanStage();
    const bus = makeBus();
    vi.useFakeTimers();
    claimOwnership({ channel: bus.connect() });
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);
    vi.useRealTimers();

    await mountApp();
    await resumeSavedDraft();

    expect(host.querySelector('.draft-shell')).not.toBeNull();
    expect(host.querySelector('.app-shell')).toBeNull();
    expect(host.querySelector('.turn-banner')?.textContent).toBe('Pass 1 of 2 — Ada bans');
  });
});

// ---------------------------------------------------------------------------
// The blind entry surface's own shell — 04-UI-SPEC section 3, third row (WR-01)
// ---------------------------------------------------------------------------

/**
 * WHICH SHELL THE ENTRY SUB-STATE WEARS, AND THAT IT IS STILL THE GATE.
 *
 * `04-UI-SPEC` section 3's shell table has four rows, and until this file had these two cases
 * only three of them were asserted anywhere: snake's `.draft-shell` above, and blind's locked
 * and reveal `.app-shell` in `top-bar-bans.test.tsx` (04-09). The fourth — "own full-screen
 * surface" for the entry sub-state — had no test, and it shipped wrong: the shell expression
 * in `app.tsx` keyed on the MODE rather than the stage, so the entry arm fell through to
 * `.app-shell` and the phase's most important screen rendered inside a 1200px centred column
 * with page padding around it. That is WR-01, and it is the kind of fact no screenshot at one
 * viewport width catches — which is why it is pinned here rather than left to a human pass.
 *
 * The two cases below are deliberately a pair and neither is sufficient alone:
 *
 *   The first says the surface escapes `.app-shell`. On its own, the cheapest way to satisfy
 *   it is to render `BlindEntry` as a SIBLING of the gate — which is what the verification
 *   report's own suggested fix would have done, and it would hand a read-only tab a live,
 *   interactive ban screen.
 *
 *   The second says it is still under the gate. On its own it is satisfied by the shipped
 *   bug, which never left `.app-shell` at all.
 *
 * Neither case touches the locked or reveal states, so 04-09's assertions about those stay
 * the only authority on them.
 */
describe('the shell over the blind entry surface', () => {
  /** Put this tab in charge, mount, resume, and open the first player's entry surface. */
  async function enterFirstPlayersBans(): Promise<void> {
    await mountApp();
    await resumeSavedDraft();

    // The locked state first — this is what the entry surface has to REPLACE, and asserting
    // it here is what makes the class change below a change rather than a coincidence.
    expect(host.querySelector('.app-shell')).not.toBeNull();

    const enter = buttonNamed("Enter Ada's bans");
    expect(enter).toBeDefined();

    await act(async () => {
      enter?.click();
      await Promise.resolve();
    });
  }

  it('wears its own full-screen shell while a player is entering bans', async () => {
    seedSavedBanStage('blind');
    const bus = makeBus();
    vi.useFakeTimers();
    claimOwnership({ channel: bus.connect() });
    vi.advanceTimersByTime(CLAIM_WINDOW_MS);
    vi.useRealTimers();

    await enterFirstPlayersBans();

    // The surface is up.
    const surface = host.querySelector('.blind-entry');
    expect(surface).not.toBeNull();

    // On its own shell, and on NEITHER of the other two. The absence assertions are the
    // load-bearing half: `.app-shell` present alongside `.entry-shell` would mean the cap
    // and the page padding are both still in the ancestry.
    const gate = shell();
    expect(gate?.className).toBe('entry-shell');
    expect(host.querySelector('.app-shell')).toBeNull();
    expect(host.querySelector('.draft-shell')).toBeNull();
    expect(gate?.contains(surface)).toBe(true);

    // And it goes back. `Hide these bans` is the panic control and the shortest of the five
    // exits; the locked state's shell returning is what proves the class is not a one-way
    // latch left set for the rest of the tournament.
    const hide = buttonNamed('Hide these bans');
    expect(hide).toBeDefined();

    await act(async () => {
      hide?.click();
      await Promise.resolve();
    });

    expect(host.querySelector('.entry-shell')).toBeNull();
    expect(host.querySelector('.app-shell')).not.toBeNull();
  });

  /**
   * T-04-20 again, one sub-state further in. The entry surface is the most interactive
   * screen the phase has — a typeahead, a 235-cell grid and a lock-in — so a version of it
   * rendered beside the gate rather than under it is the rival-tournament hole reopened with
   * a secrecy problem stapled to it.
   *
   * The click is honoured here even though the tab is read-only, and that is not a flaw in
   * the test: happy-dom parses `inert` but implements neither its focus nor its pointer
   * semantics, so the press reaches the handler. That is exactly what makes this case able to
   * reach the surface at all, and CONTAINMENT rather than the click is what it asserts.
   */
  it('keeps the entry surface inside the inert region in a read-only tab', async () => {
    seedSavedBanStage('blind');
    const rival = rivalTabTakesTheLock();

    await enterFirstPlayersBans();

    const gate = shell();
    expect(gate).not.toBeNull();
    expect(gate?.hasAttribute('inert')).toBe(true);

    // One gate, not two — the same assertion the draft and snake cases make.
    expect(host.querySelectorAll('[inert]')).toHaveLength(1);

    const surface = host.querySelector('.blind-entry');
    expect(surface).not.toBeNull();
    expect(gate?.contains(surface)).toBe(true);

    // The lock-in control specifically, because it is the one that writes to the document.
    const lockIn = buttonNamed("Lock in Ada's bans");
    expect(lockIn).toBeDefined();
    expect(gate?.contains(lockIn ?? null)).toBe(true);

    // The banner stays OUTSIDE, which is the other half of the gate's contract: a takeover
    // button under `inert` is a lockout, and this is the screen a host would be stuck on.
    const takeover = buttonNamed(TAKEOVER_LABEL);
    expect(takeover).toBeDefined();
    expect(gate?.contains(takeover ?? null)).toBe(false);

    rival.dispose();
  });
});
