// @vitest-environment happy-dom

/**
 * The two-pane draft shell — ROADMAP criterion 5, and the one requirement in this phase
 * that is about the room rather than about the arithmetic.
 *
 * What is asserted here: that the pool and the board are in the document AT THE SAME TIME
 * with no tab, no toggle and no accordion; that either side expands and the choice
 * survives a reload; that a hand-edited `pool` preference cannot hide the board while a
 * draft is live; that a picked species leaves the pool DOM on the render that records it
 * and cannot be picked twice; and that a document whose configuration cannot fill every
 * team says so without blocking the draft.
 *
 * What this file CANNOT prove, stated rather than implied, following
 * `read-only-shell.test.tsx`'s precedent. happy-dom performs no layout: it computes no
 * widths, resolves no grid tracks and evaluates no media query. So the 60/40 ratio, the
 * 86px round cell it produces, whether eight board rows fit the split pane without an
 * internal scrollbar, and whether any chip name ellipsises at 1920px are all invisible
 * here. Those are 02-UI-SPEC assertions 6 and 7 and they belong to this plan's
 * human-verify checkpoint, which is where they stay.
 *
 * Two more joined that list under plan 02-09, and they are named here rather than covered
 * by tests that would only appear to cover them:
 *
 *   - `.pane__chrome`'s reserved `min-height` is what keeps the two panes' content
 *     starting on the same line when one chrome holds no control. No layout means no way
 *     to assert alignment. Plan 02-10 owns that check.
 *   - The em dash separating the inert expand control from its reason was generated content
 *     when that was written. Plan 02-12 moved it into an `aria-hidden` span (WR-03), and the
 *     part that stays unobservable is the same either way: happy-dom computes no accessible
 *     name and no accessible description, so what the assertions below pin is the MECHANISM
 *     that keeps the separator out of the description, never the description itself.
 *
 * A third joined under plan 02-11, and it is about focus rather than layout: nothing here
 * can observe how a real browser moves focus on POINTER activation. happy-dom's
 * `element.click()` does not focus its target, and Safari genuinely does not focus a button
 * when it is clicked. So the focus assertions below pin the KEYBOARD path — they focus the
 * control explicitly first, which is what `focusAndClick` is for and why it proves the
 * focus took before it clicks. Plan 02-13 owns the real-browser confirmation of both
 * directions.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Hoisted so the `vi.mock` factory below can see it — `vi.mock` lifts above every import. */
const fixture = vi.hoisted(() => {
  const entries = Array.from({ length: 40 }, (_, index) => ({
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

vi.mock('../../src/adapters/roster-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/adapters/roster-source')>();
  return { ...actual, loadRoster: () => Promise.resolve(fixture.bundle) };
});

import { App } from '../../src/app';
import { save as saveTournament } from '../../src/adapters/persistence';
import { claimOwnership, CLAIM_WINDOW_MS, disposeTabLock } from '../../src/adapters/tab-lock';
import {
  cardsPlayed,
  draftStarted,
  orderResolved,
  pickMade,
  poolBuilt,
  scheduleCompiled,
  type Action,
  type Intent,
  type RoundSpec,
} from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import { selectPhase, selectPickCount } from '../../src/core/selectors';
import { dispatch, getState } from '../../src/store';
import { announce } from '../../src/ui/components/LiveRegion';

// ---------------------------------------------------------------------------

const VIEW_KEY = 'champions-drafter:view';

let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  // `announce` writes a module-level signal that outlives every render.
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

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

function configOf(poolSize: number): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: [
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
    ],
    rounds: 6,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftOnly',
    rules: [{ kind: 'mega', count: 0 }],
    megaFormeBans: [],
    swapBudget: 0,
    swapRounds: 0,
  };
}

/**
 * A saved tournament the landing screen will offer to resume.
 *
 * `poolSize` is a parameter because one test needs a document whose pool cannot fill
 * every team — the only route to that state is a hand-edited or hostile file, which is
 * exactly what this notice exists for.
 */
function seedSavedDraft(options: { poolSize?: number; picks?: number } = {}): void {
  const poolSize = options.poolSize ?? 24;
  const pickCount = options.picks ?? 0;

  const log: Action[] = [
    stamp(
      poolBuilt(
        Array.from({ length: poolSize }, (_, index) => `mon-${index}`),
        'mb',
        'test-checksum',
        poolSize - 1,
        0,
      ),
      0,
    ),
    stamp(draftStarted(['p1', 'p2'], 13), 1),
  ];

  for (let index = 0; index < pickCount; index += 1) {
    log.push(
      stamp(
        pickMade({
          playerId: index % 2 === 0 ? 'p1' : 'p2',
          monId: `mon-${index}`,
          round: Math.floor(index / 2) + 1,
          pickIndex: index,
        }),
        2 + index,
      ),
    );
  }

  const doc: TournamentDoc = {
    schemaVersion: SCHEMA_VERSION,
    id: 'draft-panes-fixture',
    createdAt: 1_770_000_000_000,
    config: configOf(poolSize),
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };

  expect(saveTournament(doc)).toBe(true);
}

/** Claim the tab lock so the shell holding the screens is never inert. */
function claimLock(): void {
  vi.useFakeTimers();
  claimOwnership();
  vi.advanceTimersByTime(CLAIM_WINDOW_MS);
  vi.useRealTimers();
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

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === name,
  );
}

async function click(element: HTMLElement | undefined): Promise<void> {
  expect(element).toBeDefined();
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

/**
 * Put the keyboard on a control, PROVE it landed there, and only then activate it.
 *
 * The middle step is not ceremony. happy-dom's `focus()` no-ops silently on anything it
 * does not treat as focusable, and without the pre-assertion every focus test below would
 * be comparing `document.body` to `document.body` and passing for the wrong reason.
 */
async function focusAndClick(element: HTMLElement | undefined): Promise<void> {
  expect(element).toBeDefined();
  element?.focus();
  expect(document.activeElement).toBe(element);
  await click(element);
}

/** Land on the draft screen through the resume route — the shortest of the three. */
async function reachDraft(options: { poolSize?: number; picks?: number } = {}): Promise<void> {
  seedSavedDraft(options);
  claimLock();
  await mountApp();
  await click(buttonNamed('Resume saved draft'));
}

function panesRoot(): HTMLElement | null {
  return host.querySelector('.draft-panes');
}

function liveRegionText(): string {
  return host.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? '';
}

// ---------------------------------------------------------------------------

describe('the pool and the board are on screen together', () => {
  it('renders both roots at once, with no tab and nothing hidden', async () => {
    await reachDraft();

    expect(host.querySelector('.pool')).not.toBeNull();
    expect(host.querySelector('.board')).not.toBeNull();

    // Criterion 5 is "at every moment". Any of these three would put one behind the other.
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(host.querySelectorAll('[role="tabpanel"]')).toHaveLength(0);
    expect(host.querySelectorAll('.draft-panes [hidden]')).toHaveLength(0);
  });

  it('puts the draft screen in the full-bleed shell rather than the capped one', async () => {
    await reachDraft();

    expect(host.querySelector('.draft-shell')).not.toBeNull();
    expect(host.querySelector('.app-shell')).toBeNull();
  });

  /*
   * These three replaced a single test whose second assertion was
   * `expect(buttonNamed('Expand the pool')).toBeUndefined()`. A reviewer who sees a
   * `toBeUndefined()` deleted is entitled to suspect the pin was loosened to fit the code,
   * so: it was not.
   *
   * The old assertion proved the pool could not be expanded mid-draft BY OMISSION — the
   * button was not in the document, so no host could press it. The replacement proves the
   * same invariant BY EXERCISE: the button IS in the document, the host CAN press it, and
   * the pane does not change when they do. That is strictly stronger. Absence was only
   * ever a proxy for unreachability, and it was a proxy that could not distinguish
   * "refused" from "not built" — which is exactly the confusion the host hit in UAT test
   * 9, where an empty chrome slot was reported as a broken render.
   */
  it('renders the pool expand inert, with its reason, while a draft is running', async () => {
    await reachDraft();

    // The board's control is not inert while PICKING, and this change does not touch it.
    // Amendment 3 makes it inert during card play, which has its own block below; this
    // fixture is a migrated schema-2 document and deals no cards at all.
    const boardExpand = buttonNamed('Expand the draft board');
    expect(boardExpand).toBeDefined();
    expect(boardExpand?.hasAttribute('aria-disabled')).toBe(false);

    const poolExpand = buttonNamed('Expand the pool');
    expect(poolExpand).toBeDefined();
    expect(poolExpand?.getAttribute('aria-disabled')).toBe('true');

    // Focusable on purpose. A native `disabled` would take the button out of the tab
    // order and put the explanation beside it out of reach of the keyboard — and the
    // explanation is the entire reason for rendering the control at all.
    expect(poolExpand?.hasAttribute('disabled')).toBe(false);

    // Resolve the id off the attribute rather than hard-coding a selector, so the
    // ASSOCIATION is what is under test and not merely the presence of some span.
    const reasonId = poolExpand?.getAttribute('aria-describedby') ?? '';
    expect(reasonId).not.toBe('');

    const reason = host.querySelector(`#${reasonId}`);
    expect(reason).not.toBeNull();

    // Exact equality on the WHOLE visible line, separator included — never `includes`, this
    // is a contract string and CLAUDE.md's convention covers every one of them.
    //
    // WR-03: the em dash used to be `content: '— '` in `SplitPanes.css`, so half of what a
    // host reads lived in a stylesheet nothing asserted on. Changing it to a hyphen, an en
    // dash or nothing at all altered shipped copy with this suite staying green.
    expect(reason?.textContent?.trim()).toBe('— Available once the draft is complete');

    // And the mechanism that keeps the separator out of the accessible description: it is a
    // hidden span INSIDE the reason, not generated content and not a bare text node. Pinned
    // for the same WR-03 reason — the shape is what makes the assertion above possible.
    const separator = reason?.querySelector('[aria-hidden="true"]');
    expect(separator).not.toBeNull();
    expect(separator?.textContent).toBe('— ');
  });

  it('refuses the pool expand mid-draft, so the board cannot be hidden', async () => {
    await reachDraft();

    const poolExpand = buttonNamed('Expand the pool');
    await focusAndClick(poolExpand);

    expect(panesRoot()?.getAttribute('data-pane')).toBe('split');

    // A refusal moves nothing, and that includes focus. The host is still on the control
    // they pressed, free to tab onward from where they were rather than from `<body>`.
    expect(document.activeElement).toBe(poolExpand);

    // "Not that message" rather than emptiness: reaching the draft makes `TurnBanner`
    // announce whose turn it is, which the coercion test below already establishes.
    expect(liveRegionText()).not.toBe('Pool expanded to full width.');

    // The assertion that proves the refusal happened BEFORE `onPaneChange`, not after —
    // a click that reached the parent would have been written through to storage.
    const stored = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as { pane?: string };
    expect(stored.pane).not.toBe('pool');

    // Criterion 5, asserted directly on the surface the constraint is actually about.
    expect(host.querySelector('.board')).not.toBeNull();
  });

  it('makes the pool expand real once the draft is complete', async () => {
    // 2 players x 6 rounds — the same count the completed-state test below uses.
    await reachDraft({ picks: 12 });

    const poolExpand = buttonNamed('Expand the pool');
    expect(poolExpand).toBeDefined();
    expect(poolExpand?.hasAttribute('aria-disabled')).toBe(false);

    // Gone, not merely hidden. A reason with nothing to explain is noise.
    expect(host.querySelector('.pane__reason')).toBeNull();

    await click(poolExpand);

    expect(panesRoot()?.getAttribute('data-pane')).toBe('pool');
  });
});

describe('expanding a pane', () => {
  it('expands the board, announces it, and writes the choice through', async () => {
    await reachDraft();

    await click(buttonNamed('Expand the draft board'));

    expect(panesRoot()?.getAttribute('data-pane')).toBe('board');
    expect(liveRegionText()).toBe('Draft board expanded to full width.');

    const stored = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as { pane?: string };
    expect(stored.pane).toBe('board');
  });

  it('names every chip once the board is expanded, and none before', async () => {
    await reachDraft({ picks: 4 });

    expect(host.querySelectorAll('.mon-chip')).toHaveLength(4);
    expect(host.querySelectorAll('.mon-chip__name')).toHaveLength(0);

    await click(buttonNamed('Expand the draft board'));

    expect(host.querySelectorAll('.mon-chip')).toHaveLength(4);
    expect(host.querySelectorAll('.mon-chip__name')).toHaveLength(4);
  });

  it('collapses the pool to a strip that offers the way back', async () => {
    await reachDraft();

    /*
     * WR-04. Held across the collapse so the assertions below can say CLEARED rather than
     * merely absent — on a node that never carried them, "no `aria-disabled`" proves
     * nothing, and 02-11's whole change is that this one node serves as both controls.
     */
    const poolControl = buttonNamed('Expand the pool');
    expect(poolControl?.getAttribute('aria-disabled')).toBe('true');
    expect(poolControl?.hasAttribute('aria-describedby')).toBe(true);

    await click(buttonNamed('Expand the draft board'));

    const strip = host.querySelector('.pane--collapsed');
    expect(strip).not.toBeNull();
    expect(strip?.getAttribute('data-side')).toBe('pool');

    // One control in the chrome, and it is the way back. The pool's own contents are
    // still mounted underneath — see the filter test below — so the assertion is scoped
    // to the chrome rather than to the whole strip.
    const chrome = strip?.querySelector('.pane__chrome');
    expect(chrome?.querySelectorAll('button')).toHaveLength(1);

    /*
     * IN-02. The button count alone cannot see a `<span>` leaking in, and after 02-11
     * merged the two chrome branches into one subtree the `!collapsed` guard on
     * `showReason` is the only thing keeping a ~38-character reason out of a strip one
     * target wide, whose button is `writing-mode: vertical-rl`.
     */
    expect(chrome?.childElementCount).toBe(1);
    expect(strip?.querySelector('.pane__reason')).toBeNull();

    const restore = buttonNamed('Show the pool');
    expect(restore).toBeDefined();

    /*
     * The same DOM node as the inert expand above — stated as an assertion, because every
     * line after it depends on it.
     *
     * The characteristic failure of node reuse is an attribute that gets SET and never
     * cleared. Here that is a recovery control that works while announcing itself disabled,
     * and an `aria-describedby` still pointing at the id of a reason span that no longer
     * exists — a dangling reference, which is the worse half. The child-count assertions
     * above cannot see either, and the pane-change assertion below would stay green through
     * both, so this would ship green without these two lines.
     */
    expect(restore).toBe(poolControl);
    expect(restore?.hasAttribute('aria-disabled')).toBe(false);
    expect(restore?.hasAttribute('aria-describedby')).toBe(false);

    await click(restore);

    expect(panesRoot()?.getAttribute('data-pane')).toBe('split');
    expect(liveRegionText()).toBe('Pool and draft board shown side by side.');
  });

  /*
   * CR-01 and WR-08 — the two halves of one regression, one test each.
   *
   * The test directly above asserted `data-pane` and the live-region message after this
   * exact click and never once looked at `document.activeElement`, which is precisely why
   * CR-01 shipped: `.pane--collapsed .pane__button` is `writing-mode: vertical-rl`, so a
   * button Preact destroyed and recreated looks identical on screen. Only a keyboard, a
   * switch or a screen reader can tell, and none of them was asserted.
   */
  it('keeps focus on the restore control across the collapse-to-split change', async () => {
    await reachDraft();
    await click(buttonNamed('Expand the draft board'));

    const restore = buttonNamed('Show the pool');
    expect(restore).toBeDefined();

    await focusAndClick(restore);

    expect(document.activeElement).toBe(restore);
    expect(document.activeElement).not.toBe(document.body);

    // Node IDENTITY, not label equality. This is the assertion that proves Preact reused
    // the element — a fix that merely moved focus back onto a freshly created button
    // would satisfy the line above and fail this one.
    expect(buttonNamed('Expand the pool')).toBe(restore);
  });

  it("moves focus to the collapsed pane's restore control when a pane expands", async () => {
    await reachDraft();

    /*
     * WR-03. Captured BEFORE the change, because identity is what this test was missing
     * and afterwards there is nothing left to compare against.
     *
     * The sibling test above pins reuse for `board → split`. This direction had no pin,
     * and the focus effect is precisely what would hide its absence: if Preact remounted
     * the pool's button here, the FRESHLY MOUNTED node would be the one `collapsedControlRef`
     * caught, the effect would focus that, and both assertions at the bottom would pass
     * while CR-01 — a destroyed-and-recreated recovery control — had been reintroduced.
     */
    const poolControl = buttonNamed('Expand the pool');
    expect(poolControl).toBeDefined();

    // WR-08: an expanded pane carries no control of its own, so the button the host just
    // pressed is genuinely gone. The fix is not to keep it — it is to hand focus to its
    // successor, which is the restore on the strip opposite.
    await focusAndClick(buttonNamed('Expand the draft board'));

    const restore = buttonNamed('Show the pool');
    expect(restore).toBeDefined();

    // The same DOM node, relabelled — not a new button wearing the expected name.
    expect(restore).toBe(poolControl);

    expect(document.activeElement).toBe(restore);
    expect(document.activeElement).not.toBe(document.body);
  });

  /**
   * WR-01 — the regression 02-11's own handoff introduced.
   *
   * The handoff moves focus to the control opposite, and that control is activated by the
   * same key that caused the move. A held Enter auto-repeats `keydown` and a `<button>`
   * activates on every repeat, so one hold walked split → board → split → pool → split for
   * as long as it was held, writing the view preference and rewriting the live region on
   * each step.
   *
   * WHAT THIS PINS, AND WHAT IT DELIBERATELY DOES NOT — the header's rule, applied to the
   * test that most invites breaking it. happy-dom does not activate a button from an Enter
   * `keydown`: probed directly, a dispatched `keydown` produces zero `click` events. So the
   * obvious test — press Enter three times, assert the pane did not move — passes just as
   * green against a component with NO guard at all, because nothing ever activated. That is
   * the assertion this file's header calls worse than none.
   *
   * What is observable here is the DECISION: a repeat is cancelled, a first press is not,
   * and Space is untouched. That `preventDefault()` on `keydown` suppresses the activation
   * is browser behaviour, and it belongs with the pointer-path focus note above — a real
   * browser owns it.
   */
  it('refuses a repeated Enter, so a held key cannot walk the panes', async () => {
    // The completed draft, where all three pane states are reachable and the cycle is
    // therefore unbounded. Mid-draft it self-terminates after two steps only because the
    // pool expand happens to be inert, which is luck rather than a guard.
    await reachDraft({ picks: 12 });

    const expand = buttonNamed('Expand the draft board');
    expect(expand).toBeDefined();

    function press(key: string, repeat: boolean): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true });
      expand?.dispatchEvent(event);
      return event;
    }

    // The press itself still has to work. Refusing this would make the button unusable
    // from the keyboard, which is a worse bug than the one being fixed.
    expect(press('Enter', false).defaultPrevented).toBe(false);

    // Every repeat after it is that same press, still held down.
    expect(press('Enter', true).defaultPrevented).toBe(true);

    // Space activates on keyup, so its repeats activate nothing and there is nothing to
    // refuse — cancelling here would take the press with them.
    expect(press(' ', true).defaultPrevented).toBe(false);
  });

  /**
   * "What an expand button changes is the RATIO, never the membership" — the component's
   * own doc block, and until this test the component did the opposite.
   *
   * The host's search text and type filters live in `PoolGrid`'s state, so a collapse that
   * unmounted the pool discarded them and a restore remounted at `NO_FILTERS`. There was
   * no announcement either: the `Filters cleared.` suffix is composed on the PICK path,
   * which is the only place D-35 says filters clear. The symptom is a host narrowing the
   * pool to one type, glancing at the board, and finding the field empty on the way back.
   */
  it('keeps the pool mounted while it is collapsed, so the host keeps their filters', async () => {
    await reachDraft();

    const search = host.querySelector<HTMLInputElement>('#pool-search');
    expect(search).not.toBeNull();

    await act(async () => {
      if (search !== null) {
        search.value = 'Mon 1';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await Promise.resolve();
    });

    const filteredCount = host.querySelectorAll('.mon-card').length;
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(40);

    await click(buttonNamed('Expand the draft board'));
    await click(buttonNamed('Show the pool'));

    // The same field, still holding the same text, still narrowing the same grid.
    expect(host.querySelector<HTMLInputElement>('#pool-search')?.value).toBe('Mon 1');
    expect(host.querySelectorAll('.mon-card')).toHaveLength(filteredCount);
  });

  it('restores the stored pane on the first render, not after a correction', async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ density: 'standard', pane: 'board' }));

    await reachDraft();

    // Read in a state initializer, so the very first paint is already the host's pane.
    // An effect would render `split` and then jump.
    expect(panesRoot()?.getAttribute('data-pane')).toBe('board');

    // The no-focus-stealing pin, and it belongs here because this is the only test whose
    // pane state is set by something other than a control activation. The focus handoff
    // 02-11 added must fire for a host who pressed a button and for nobody else — a
    // stored preference restoring on mount moves focus nowhere.
    expect(document.activeElement).toBe(document.body);
  });
});

describe('a stored pane that would hide the board', () => {
  it('is forced to split mid-draft, silently', async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ density: 'standard', pane: 'pool' }));

    await reachDraft();

    expect(panesRoot()?.getAttribute('data-pane')).toBe('split');

    /*
      Nothing to dismiss and nothing announced BY THE COERCION. The host set a preference
      that is simply unavailable right now; they did not make a mistake and there is
      nothing for them to do.

      Asserted as "no pane message", not as "the region is empty": reaching the draft at
      all makes `TurnBanner` announce whose turn it is, which is correct and is not this
      plan's to suppress. Emptiness would be an assertion about the turn announcement
      wearing this test's name.
    */
    expect(liveRegionText()).toBe('Round 1 of 6 — Ada picks');
    for (const message of [
      'Pool expanded to full width.',
      'Draft board expanded to full width.',
      'Pool and draft board shown side by side.',
    ]) {
      expect(liveRegionText()).not.toBe(message);
    }
  });

  it('is honoured once the draft is over, when all three states become available', async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ density: 'standard', pane: 'pool' }));

    await reachDraft({ picks: 12 });

    expect(panesRoot()?.getAttribute('data-pane')).toBe('pool');
    // And the pool side's own expand control exists again.
    expect(buttonNamed('Show the draft board')).toBeDefined();
  });
});

describe('a picked species leaves the pool (DRFT-07)', () => {
  it('is gone from the pool DOM on the same render that fills the board cell', async () => {
    await reachDraft();

    const before = host.querySelectorAll('.mon-card').length;
    expect(before).toBeGreaterThan(0);

    const target = Array.from(host.querySelectorAll<HTMLElement>('.mon-card')).find((card) =>
      (card.getAttribute('aria-label') ?? '').includes('Mon 0'),
    );

    await click(target);

    // Absent, not disabled and not dimmed.
    const names = Array.from(host.querySelectorAll('.pool .mon-card')).map(
      (card) => card.getAttribute('aria-label') ?? '',
    );
    expect(names.some((name) => name.includes('Mon 0'))).toBe(false);
    expect(host.querySelectorAll('.mon-card')).toHaveLength(before - 1);

    // And it is on the board.
    expect(host.querySelectorAll('.board .mon-chip')).toHaveLength(1);
  });

  it('refuses a second pick of the same species and leaves the board unchanged', async () => {
    await reachDraft({ picks: 1 });

    const state = getState();
    expect(state).not.toBeNull();
    const picksBefore = selectPickCount(state!);

    const result = dispatch(
      pickMade({ playerId: 'p2', monId: 'mon-0', round: 1, pickIndex: 1 }),
    );

    expect(result.ok).toBe(false);
    expect(selectPickCount(getState()!)).toBe(picksBefore);
  });
});

describe('the adopted-document feasibility notice', () => {
  it('says so when the pool cannot fill every team, and the draft still runs', async () => {
    // 2 players x 6 rounds needs 12; this document carries 5. Unreachable through the
    // config screen — only a hand-edited or hostile file gets here.
    await reachDraft({ poolSize: 5 });

    const notice = host.querySelector('[role="status"].draft-notice');
    expect(notice).not.toBeNull();
    expect(notice?.textContent ?? '').toContain(
      "This tournament's configuration no longer adds up: Pool is too small.",
    );

    // Not blocking: the pool is still pickable and the board is still there.
    expect(host.querySelector('.pool')).not.toBeNull();
    expect(host.querySelector('.board')).not.toBeNull();
    expect(host.querySelectorAll('.mon-card').length).toBeGreaterThan(0);
  });

  it('renders nothing for a document whose configuration adds up', async () => {
    await reachDraft();

    expect(host.querySelector('.draft-notice')).toBeNull();
  });
});

/**
 * A saved tournament whose pool names species this roster no longer carries — WR-06.
 *
 * Not a hostile file and not a hand edit. CLAUDE.md records that Champions regulations
 * rotate roughly every 2.5 months, and `bans.ts` calls a document outliving a species "the
 * ordinary case rather than an attack". `dropped-0` is picked, so both surfaces that
 * resolve an id through the roster are exercised: the pool, which loses a cell, and the
 * board, which used to render an empty box styled as a filled one.
 */
function seedDriftedDraft(dropped: number): void {
  const kept = 24 - dropped;
  const poolIds = [
    ...Array.from({ length: dropped }, (_, index) => `dropped-${index}`),
    ...Array.from({ length: kept }, (_, index) => `mon-${index}`),
  ];

  const doc: TournamentDoc = {
    schemaVersion: SCHEMA_VERSION,
    id: 'draft-panes-drift-fixture',
    createdAt: 1_770_000_000_000,
    config: configOf(24),
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log: [
      stamp(poolBuilt(poolIds, 'mb', 'test-checksum', 23, 0), 0),
      stamp(draftStarted(['p1', 'p2'], 13), 1),
      // Picked before the regulation rotated, which is the only way this slot exists.
      stamp(pickMade({ playerId: 'p1', monId: 'dropped-0', round: 1, pickIndex: 0 }), 2),
    ],
  };

  expect(saveTournament(doc)).toBe(true);
}

async function reachDriftedDraft(dropped: number): Promise<void> {
  seedDriftedDraft(dropped);
  claimLock();
  await mountApp();
  await click(buttonNamed('Resume saved draft'));
}

function noticeTexts(): string[] {
  return Array.from(host.querySelectorAll('[role="status"].draft-notice')).map(
    (notice) => notice.textContent ?? '',
  );
}

describe('a roster that has moved on from the document', () => {
  it('says how many pool entries this roster no longer carries', async () => {
    await reachDriftedDraft(2);

    // Nothing else on screen can reveal the shortfall: `availableEntries` drops the
    // missing ids and the pool's `{n} available` count follows the render, so the grid
    // agrees with itself about a number that is quietly two short.
    expect(noticeTexts()).toContain(
      "2 Pokémon in this tournament's pool are not in the current roster. They are missing" +
        ' from the pool, and a board slot holding one shows its id instead. Use Download JSON' +
        ' to keep the record.',
    );
  });

  it('says it in the singular at one', async () => {
    await reachDriftedDraft(1);

    expect(noticeTexts()).toContain(
      "1 Pokémon in this tournament's pool is not in the current roster. It is missing from" +
        ' the pool, and a board slot holding it shows its id instead. Use Download JSON to' +
        ' keep the record.',
    );
  });

  it('shows the id in a filled board slot rather than an empty box', async () => {
    await reachDriftedDraft(2);

    const filled = Array.from(host.querySelectorAll('.board__cell--filled'));
    expect(filled).toHaveLength(1);

    // Styled as filled and rendering nothing was visually indistinguishable from an
    // unfilled slot, on the surface whose whole job is recording who has what.
    expect(filled[0]?.textContent).toBe('dropped-0');
    expect(filled[0]?.querySelector('.mon-chip')).toBeNull();
  });

  it('stays silent for a document every id of which the roster still carries', async () => {
    await reachDraft({ picks: 2 });

    expect(noticeTexts()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Amendment 3 — pane-state availability during card play
//
// `board-full` becomes unavailable for a reason `pool-full` never had: the pool pane holds
// the only control that can play a card, and a state that hides the only available action
// is not a preference. Both come back the moment the round resolves.
// ---------------------------------------------------------------------------

const CARD_PHASE_REASON = "Available once the round's cards are played";

const OPEN_SCHEDULE: RoundSpec[] = Array.from({ length: 6 }, (_, position) => ({
  index: position + 1,
  kind: 'open' as const,
}));

/**
 * A v3 document: the compiled schedule is what makes it a draft that deals cards.
 *
 * `resolveFirstRound` carries it past the bidding into picking, which is the state the
 * "inert ARIA is shed" half of WR-04 needs — the same document, one round further on.
 */
function seedCardPhaseDraft(options: { resolveFirstRound?: boolean } = {}): void {
  const poolSize = 24;
  const log: Action[] = [
    stamp(
      poolBuilt(
        Array.from({ length: poolSize }, (_, index) => `mon-${index}`),
        'mb',
        'test-checksum',
        poolSize - 1,
        0,
      ),
      0,
    ),
    stamp(scheduleCompiled(OPEN_SCHEDULE), 1),
    stamp(draftStarted(['p1', 'p2'], 13), 2),
  ];

  if (options.resolveFirstRound === true) {
    log.push(stamp(cardsPlayed({ playerId: 'p1', value: 1, round: 1 }), 3));
    log.push(stamp(cardsPlayed({ playerId: 'p2', value: 2, round: 1 }), 4));
    log.push(stamp(orderResolved(1, ['p1', 'p2']), 5));
  }

  const doc: TournamentDoc = {
    schemaVersion: SCHEMA_VERSION,
    id: 'card-phase-fixture',
    createdAt: 1_770_000_000_000,
    config: configOf(poolSize),
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };

  expect(saveTournament(doc)).toBe(true);
}

async function reachCardPhase(options: { resolveFirstRound?: boolean } = {}): Promise<void> {
  seedCardPhaseDraft(options);
  claimLock();
  await mountApp();
  await click(buttonNamed('Resume saved draft'));
}

describe('pane availability while a round is being bid', () => {
  it('renders the board expand inert, with the card-phase reason', async () => {
    await reachCardPhase();

    const boardExpand = buttonNamed('Expand the draft board');
    expect(boardExpand).toBeDefined();
    expect(boardExpand?.getAttribute('aria-disabled')).toBe('true');

    // Focusable on purpose, as everywhere in this app: a native `disabled` would put the
    // explanation beside it out of reach of the keyboard.
    expect(boardExpand?.hasAttribute('disabled')).toBe(false);

    const reasonId = boardExpand?.getAttribute('aria-describedby') ?? '';
    expect(reasonId).not.toBe('');

    // Exact equality on the whole visible line, separator included.
    expect(host.querySelector(`#${reasonId}`)?.textContent?.trim()).toBe(
      `— ${CARD_PHASE_REASON}`,
    );
  });

  it('gives the pool expand the nearer reason too, not the completion one', async () => {
    await reachCardPhase();

    const poolExpand = buttonNamed('Expand the pool');
    expect(poolExpand?.getAttribute('aria-disabled')).toBe('true');

    const reasonId = poolExpand?.getAttribute('aria-describedby') ?? '';
    expect(host.querySelector(`#${reasonId}`)?.textContent?.trim()).toBe(
      `— ${CARD_PHASE_REASON}`,
    );

    // "Once the draft is complete" names a wait the host is not currently in.
    expect(host.textContent).not.toContain('Available once the draft is complete');
  });

  it('sheds the inert ARIA the moment the round resolves — WR-04', async () => {
    await reachCardPhase({ resolveFirstRound: true });

    const boardExpand = buttonNamed('Expand the draft board');
    expect(boardExpand).toBeDefined();
    expect(boardExpand?.hasAttribute('aria-disabled')).toBe(false);
    expect(boardExpand?.hasAttribute('aria-describedby')).toBe(false);
    expect(host.textContent).not.toContain(CARD_PHASE_REASON);
  });

  it('coerces a stored board-full to split, silently', async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ density: 'standard', pane: 'board' }));
    await reachCardPhase();

    expect(panesRoot()?.getAttribute('data-pane')).toBe('split');

    // Silently: the host chose a legitimate state and the app is declining it for one
    // round, which is a smaller event than a message about it would be.
    expect(liveRegionText()).not.toContain('expanded to full width');
  });

  it('honours a stored board-full again once picking begins', async () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ density: 'standard', pane: 'board' }));
    await reachCardPhase({ resolveFirstRound: true });

    expect(panesRoot()?.getAttribute('data-pane')).toBe('board');
  });
});

// ---------------------------------------------------------------------------
// The round resolves itself — D-17, D-19
// ---------------------------------------------------------------------------

function cardButtons(): HTMLButtonElement[] {
  const hand = host.querySelector<HTMLElement>('.card-panel__hand');
  return Array.from(hand?.querySelectorAll('button') ?? []);
}

function phaseNow(): string {
  const state = getState();
  if (state === null) throw new Error('no draft state');
  return selectPhase(state);
}

describe('playing the last card of a round', () => {
  it('resolves the order with no further interaction, and swaps the pane back to the pool', async () => {
    await reachCardPhase();

    // The pool pane holds the card panel, and the board is untouched beside it — which is
    // the whole of why the panel goes here rather than over the whole draft region.
    expect(host.querySelector('.card-panel')).not.toBeNull();
    expect(host.querySelector('.pool__header')).toBeNull();
    expect(host.querySelector('.board')).not.toBeNull();
    expect(phaseNow()).toBe('cards');

    // Ada plays, then Bo. Two clicks, and nothing else.
    await click(cardButtons()[0]);
    expect(phaseNow()).toBe('cards');

    await click(cardButtons()[0]);

    // No "start picking" control was rendered, and none was pressed. An explicit click
    // would cost one per round and put the screen's mode partly in the UI.
    expect(buttonNamed('Start picking')).toBeUndefined();
    expect(phaseNow()).toBe('picking');

    // The panel is gone and the pool is back in its place. The board never moved.
    expect(host.querySelector('.card-panel')).toBeNull();
    expect(host.querySelector('.pool__header')).not.toBeNull();
    expect(host.querySelector('.board')).not.toBeNull();
  });

  it('records the order in the log rather than leaving it to be recomputed', async () => {
    await reachCardPhase();

    await click(cardButtons()[0]);
    await click(cardButtons()[0]);

    const state = getState();
    expect(state?.resolvedOrders).toHaveLength(1);
    expect(state?.resolvedOrders[0]?.round).toBe(1);
    expect(state?.cardsPlayed).toHaveLength(2);
  });

  it('puts the resolved order in the sticky head and leaves it there', async () => {
    await reachCardPhase();

    await click(cardButtons()[0]);
    await click(cardButtons()[0]);

    // Both players played their lowest card, so the tie resolves on `seq` — Ada played
    // first, so Ada picks first.
    expect(host.querySelector('.turn-banner__phase')?.textContent).toBe('Pick order: 1 Ada · 2 Bo');
  });

  it('hands focus to the pool grid, because the control the host pressed is gone', async () => {
    await reachCardPhase();

    await click(cardButtons()[0]);

    // The LAST card, activated from the keyboard — which is the precondition the handoff
    // reads before it moves anything.
    const last = cardButtons()[0];
    await focusAndClick(last);

    expect(last?.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement | null)?.classList.contains('mon-card')).toBe(
      true,
    );
  });

  it('leaves focus in the hand while the round is still being bid', async () => {
    await reachCardPhase();

    await focusAndClick(cardButtons()[0]);

    /*
      Focus is on a live card in the hand group, and NOT on the pool — the panel is still
      mounted and the next thing to do is another card.

      Which mechanism put it there is deliberately not asserted. Ada spent her 1 and Bo
      still holds his, so the vnode keyed `1` survives the re-render and Preact reuses the
      very node that was pressed; the handoff has nothing to do because focus never left a
      correct control. Asserting `isConnected === false` here would be asserting an
      implementation detail of Preact's keyed diff, and it would fail for a hand where the
      two players' cards happen to line up — which is most of them.
    */
    expect(document.activeElement).not.toBe(document.body);
    expect(cardButtons()).toContain(document.activeElement);
    expect(host.querySelector('.card-panel')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DRFT-04 — the whole draft, through the UI
// ---------------------------------------------------------------------------

function poolCells(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('.pool__grid .mon-card'));
}

describe('a six-round draft played start to finish', () => {
  it('runs cards, resolution and picks for every round, to six picks a player', async () => {
    await reachCardPhase();

    const config = getState()?.config;
    const players = config?.players.length ?? 0;
    const rounds = config?.rounds ?? 0;
    expect(players).toBe(2);
    expect(rounds).toBe(6);

    for (let round = 1; round <= rounds; round++) {
      // Bid: one click per player, and the last one resolves the round itself.
      expect(phaseNow(), `round ${round} opens on cards`).toBe('cards');
      for (let bid = 0; bid < players; bid++) await click(cardButtons()[0]);

      expect(phaseNow(), `round ${round} resolved`).toBe('picking');

      // Pick: one click per player, off the top of whatever the pool still offers.
      for (let pick = 0; pick < players; pick++) await click(poolCells()[0]);
    }

    const final = getState();
    expect(final).not.toBeNull();
    if (final === null) return;

    // Every player holds exactly `config.rounds` picks — D-06's "never the literal 6".
    expect(selectPickCount(final)).toBe(players * rounds);
    for (const player of final.config.players) {
      expect(
        final.picks.filter((pick) => pick.playerId === player.id),
        player.name,
      ).toHaveLength(rounds);
    }

    // Every round has a recorded order, and every card in every hand is spent.
    expect(final.resolvedOrders).toHaveLength(rounds);
    expect(final.cardsPlayed).toHaveLength(players * rounds);

    // And the draft is over rather than standing in a seventh round.
    expect(phaseNow()).toBe('complete');
    expect(host.textContent).toContain('Draft complete — 12 picks, 2 teams');
  });
});
