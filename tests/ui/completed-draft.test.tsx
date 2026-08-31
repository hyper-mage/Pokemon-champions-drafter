// @vitest-environment happy-dom

/**
 * The completed-draft screen — EXPO-06 / PERS-06, UI-SPEC sections 4(c) and 5.
 *
 * Two claims here are worth more than the rest and both are asserted against a real DOM
 * because neither is visible to inspection:
 *
 *   The blank line survives. EXPO-03's record separator is what makes a paste import as
 *   six Pokemon rather than one, and it is destroyed by `white-space: pre-line`, by a
 *   `.trim()`, or by any helpful whitespace normalisation between `toShowdownPaste` and
 *   the screen. The test reads the rendered text content and counts.
 *
 *   The clipboard failing is not a dead end. D-09's whole point is that the text is
 *   reachable without the button, so the failure path is driven for real with a rejecting
 *   clipboard and the text is asserted to still be there, still selectable.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoundKind } from '../../src/core/actions';
import {
  initialState,
  type DraftPick,
  type DraftState,
  type PlayerConfig,
  type TournamentConfig,
} from '../../src/core/model';
import type { MegaForme, RosterEntry } from '../../src/core/roster/types';
import {
  CHECKPOINT_CTA,
  CHECKPOINT_DISMISS,
  CHECKPOINT_HEADING,
  CheckpointPrompt,
} from '../../src/ui/components/CheckpointPrompt';
import { COPY_FAILED, COPY_LABEL, COPY_SUCCEEDED, EXPORT_HELPER } from '../../src/ui/components/ExportPanel';
import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';
import { CompletedDraft } from '../../src/ui/screens/CompletedDraft';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function megaForme(id: string, name: string, stone: string): MegaForme {
  return {
    id,
    name,
    forme: 'Mega',
    requiredItem: stone,
    spriteId: null,
    types: ['Normal'],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  };
}

function entry(id: string, name: string, megaFormes: MegaForme[] = []): RosterEntry {
  return {
    id,
    name,
    num: 1,
    types: ['Normal'],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    baseSpeciesId: id,
    forme: null,
    megaCapable: megaFormes.length > 0,
    megaFormes,
    spriteId: id,
    spriteMissing: false,
  };
}

// Deliberately awkward names: a hyphenated base species, an internal full stop, and a
// U+2019 apostrophe. Each has broken a naive exporter somewhere.
//
// Venusaur and Garchomp can Mega, which is what makes the D-04 assertions below possible:
// the same two species export bare from an open slot and with a stone from a Mega one, so
// the slot is provably what decides it.
const ROSTER = new Map<string, RosterEntry>([
  ['venusaur', entry('venusaur', 'Venusaur', [megaForme('venusaurmega', 'Venusaur-Mega', 'Venusaurite')])],
  ['garchomp', entry('garchomp', 'Garchomp', [megaForme('garchompmega', 'Garchomp-Mega', 'Garchompite')])],
  ['kommoo', entry('kommoo', 'Kommo-o')],
  ['mrrime', entry('mrrime', 'Mr. Rime')],
  ['farfetchd', entry('farfetchd', 'Farfetch’d')],
  ['rotomwash', entry('rotomwash', 'Rotom-Wash')],
]);

const ROSTER_ENTRIES: readonly RosterEntry[] = [...ROSTER.values()];

const PLAYERS: PlayerConfig[] = [
  { id: 'p1', name: 'Ash' },
  { id: 'p2', name: 'Misty' },
];

const TEAMS: Record<string, (string | null)[]> = {
  p1: ['venusaur', 'kommoo', 'farfetchd'],
  p2: ['garchomp', 'mrrime', 'rotomwash'],
};

const CONFIG: TournamentConfig = {
  formatLabel: 'Champions Test',
  players: PLAYERS,
  rounds: 3,
  rosterVersion: 'mb',
  rosterChecksum: 'test-checksum',
  poolSize: 6,
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

/** A schema-2 document's schedule: none at all, which `selectSchedule` folds to all-open. */
const MIGRATED: readonly RoundKind[] = [];
const ALL_OPEN: readonly RoundKind[] = ['open', 'open', 'open'];
const MEGA_FIRST: readonly RoundKind[] = ['mega', 'open', 'open'];

/**
 * The folded state the screen reads, built from a team map for legibility.
 *
 * The screen takes the FOLD rather than a `teams` record since 03-06, because the stone a
 * Mega slot exports with is read off the schedule and the picks together. Written this way
 * round, every test below still names its teams in the shape a reader can check by eye.
 */
function stateWith(
  kinds: readonly RoundKind[],
  teams: Record<string, (string | null)[]> = TEAMS,
  config: TournamentConfig = CONFIG,
): DraftState {
  const picks: DraftPick[] = [];

  for (const [playerId, slots] of Object.entries(teams)) {
    slots.forEach((monId, slotIndex) => {
      if (monId === null) return;
      picks.push({
        playerId,
        monId,
        round: slotIndex + 1,
        pickIndex: picks.length,
        seq: picks.length + 2,
      });
    });
  }

  return {
    ...initialState(config),
    picks,
    schedule: kinds.map((kind, position) => ({ index: position + 1, kind })),
  };
}

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  announce('');
});

afterEach(() => {
  render(null, host);
  host.remove();
  vi.unstubAllGlobals();
});

function drawCompleted(overrides: Partial<Parameters<typeof CompletedDraft>[0]> = {}): void {
  act(() => {
    render(
      <CompletedDraft
        players={PLAYERS}
        state={stateWith(MIGRATED)}
        entries={ROSTER_ENTRIES}
        entryById={ROSTER}
        checkpointReached
        checkpointDismissed={false}
        onDownload={() => undefined}
        onDismissCheckpoint={() => undefined}
        onOpenTournament={() => undefined}
        {...overrides}
      />,
      host,
    );
  });
}

function panels(): HTMLElement[] {
  return Array.from(host.querySelectorAll('.export-panel'));
}

function pasteBlocks(): HTMLPreElement[] {
  return Array.from(host.querySelectorAll('pre'));
}

function buttonLabelled(label: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === label,
  );
}

/** Install a clipboard whose write resolves or rejects, and report what it was given. */
function stubClipboard(outcome: 'resolve' | 'reject') {
  // The `text` parameter is declared even though the body ignores it: without it the mock
  // infers a zero-length argument tuple and `mock.calls[0][0]` — the assertion that the
  // RIGHT team's paste was written — stops typechecking.
  const writeText = vi.fn((_text: string) =>
    outcome === 'resolve' ? Promise.resolve() : Promise.reject(new Error('blocked')),
  );
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  return writeText;
}

// ---------------------------------------------------------------------------

describe('the checkpoint prompt', () => {
  it('uses the contracted strings exactly', () => {
    expect(CHECKPOINT_HEADING).toBe('Draft complete — save a copy?');
    expect(CHECKPOINT_CTA).toBe('Download tournament JSON');
    expect(CHECKPOINT_DISMISS).toBe('Not now');
  });

  it('never downloads without a click', () => {
    const onDownload = vi.fn();

    act(() => {
      render(
        <CheckpointPrompt
          heading={CHECKPOINT_HEADING}
          reached
          dismissed={false}
          onDownload={onDownload}
          onDismiss={() => undefined}
        />,
        host,
      );
    });

    // Mounting is not consent. D-11 forbids the silent auto-download outright, and this
    // component cannot perform one — it has no access to the document at all.
    expect(onDownload).not.toHaveBeenCalled();

    act(() => {
      buttonLabelled(CHECKPOINT_CTA)?.click();
    });
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('is absent before the milestone and after dismissal', () => {
    drawCompleted({ checkpointReached: false });
    expect(host.textContent).not.toContain(CHECKPOINT_HEADING);

    drawCompleted({ checkpointReached: true, checkpointDismissed: true });
    expect(host.textContent).not.toContain(CHECKPOINT_HEADING);

    drawCompleted({ checkpointReached: true, checkpointDismissed: false });
    expect(host.textContent).toContain(CHECKPOINT_HEADING);
  });

  it('is dismissible, and dismissing is not downloading', () => {
    const onDownload = vi.fn();
    const onDismissCheckpoint = vi.fn();
    drawCompleted({ onDownload, onDismissCheckpoint });

    act(() => {
      buttonLabelled(CHECKPOINT_DISMISS)?.click();
    });

    expect(onDismissCheckpoint).toHaveBeenCalledTimes(1);
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('is not modal — the export panels are reachable behind it', () => {
    drawCompleted();

    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(host.querySelector('[aria-modal="true"]')).toBeNull();
    expect(panels()).toHaveLength(PLAYERS.length);
  });
});

// ---------------------------------------------------------------------------

describe('the export panels', () => {
  it('renders one panel per player, never a combined block', () => {
    drawCompleted();

    expect(panels()).toHaveLength(2);
    expect(pasteBlocks()).toHaveLength(2);
    expect(host.textContent).toContain('Ash');
    expect(host.textContent).toContain('Misty');
  });

  it('keeps every team in its OWN block', () => {
    drawCompleted();
    const [ash, misty] = pasteBlocks();

    // A combined block would put Garchomp in the first pre. The blank line separating
    // records inside one team is the same character sequence that would separate two
    // teams, so a merged block could not be split apart again reliably.
    expect(ash?.textContent).toContain('Venusaur');
    expect(ash?.textContent).not.toContain('Garchomp');
    expect(misty?.textContent).toContain('Garchomp');
    expect(misty?.textContent).not.toContain('Venusaur');
  });

  it('separates every species with a BLANK line — EXPO-03', () => {
    drawCompleted();
    const text = pasteBlocks()[0]?.textContent ?? '';

    // The exact form. Showdown reads `A\n\nB` as two Pokemon and `A\nB` as one, silently
    // discarding the rest, so this is the single most consequential string in the phase.
    expect(text).toBe('Venusaur\n\nKommo-o\n\nFarfetch’d\n');
    expect(text.split('\n\n')).toHaveLength(3);

    // And the naive form is genuinely absent, not merely unlikely.
    expect(text).not.toBe('Venusaur\nKommo-o\nFarfetch’d\n');
  });

  it('preserves hyphens, full stops and U+2019 verbatim', () => {
    drawCompleted();
    const text = pasteBlocks().map((pre) => pre.textContent).join('');

    expect(text).toContain('Kommo-o');
    expect(text).toContain('Mr. Rime');
    expect(text).toContain('Farfetch’d');
    // Not an ASCII apostrophe. A normalising round trip would swap it and still look fine.
    expect(text).not.toContain("Farfetch'd");
  });

  it('drops unfilled slots rather than emitting blank records', () => {
    drawCompleted({
      state: stateWith(MIGRATED, { p1: ['venusaur', null, 'kommoo'], p2: [null, null, null] }),
    });
    const [ash, misty] = pasteBlocks();

    expect(ash?.textContent).toBe('Venusaur\n\nKommo-o\n');
    expect(misty?.textContent).toBe('');
  });

  it('makes the text focusable and named, so it can be selected by keyboard', () => {
    drawCompleted();
    const [ash] = pasteBlocks();

    expect(ash?.getAttribute('tabindex')).toBe('0');
    expect(ash?.getAttribute('aria-label')).toBe('Ash team paste');
    expect(ash?.getAttribute('aria-label')?.endsWith('team paste')).toBe(true);
  });

  it('shows the post-spike helper text naming both targets', () => {
    drawCompleted();

    expect(EXPORT_HELPER).toBe(
      'Paste into Pokémon Showdown → Teambuilder → import, or pokebase.app → New/Import Team.',
    );
    expect(host.textContent).toContain(EXPORT_HELPER);
  });

  it('puts the copy button ABOVE the text it copies', () => {
    drawCompleted();
    const panel = panels()[0];
    const button = panel?.querySelector('button');
    const pre = panel?.querySelector('pre');

    expect(button).not.toBeNull();
    expect(pre).not.toBeNull();
    if (button === null || button === undefined || pre === null || pre === undefined) return;

    // DOCUMENT_POSITION_FOLLOWING: the pre comes after the button in document order.
    expect(button.compareDocumentPosition(pre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------

describe('copying', () => {
  it('writes that player’s paste, and says so', async () => {
    const writeText = stubClipboard('resolve');
    drawCompleted();

    await act(async () => {
      panels()[1]?.querySelector('button')?.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toBe('Garchomp\n\nMr. Rime\n\nRotom-Wash\n');
    expect(panels()[1]?.querySelector('button')?.textContent).toBe(COPY_SUCCEEDED);
  });

  it('reverts the label after 2000ms and leaves the other panel alone', async () => {
    vi.useFakeTimers();
    stubClipboard('resolve');

    try {
      drawCompleted();

      await act(async () => {
        panels()[0]?.querySelector('button')?.click();
        await Promise.resolve();
      });
      expect(panels()[0]?.querySelector('button')?.textContent).toBe(COPY_SUCCEEDED);
      // Each panel owns its own feedback; one copy must not relabel every button.
      expect(panels()[1]?.querySelector('button')?.textContent).toBe(COPY_LABEL);

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(panels()[0]?.querySelector('button')?.textContent).toBe(COPY_LABEL);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is NOT a dead end when the clipboard refuses — D-09', async () => {
    stubClipboard('reject');
    drawCompleted();

    await act(async () => {
      panels()[0]?.querySelector('button')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(panels()[0]?.querySelector('button')?.textContent).toBe(COPY_FAILED);

    // The whole point: the text is still on screen, still complete, still focusable. A
    // blocked Clipboard API costs a manual select-all and nothing more.
    expect(pasteBlocks()[0]?.textContent).toBe('Venusaur\n\nKommo-o\n\nFarfetch’d\n');
    expect(pasteBlocks()[0]?.getAttribute('tabindex')).toBe('0');
  });

  it('fails cleanly when there is no Clipboard API at all', async () => {
    // An insecure context leaves `navigator.clipboard` undefined outright, so reading
    // `.writeText` off it would throw synchronously rather than reject.
    vi.stubGlobal('navigator', {});
    drawCompleted();

    await act(async () => {
      panels()[0]?.querySelector('button')?.click();
      await Promise.resolve();
    });

    expect(panels()[0]?.querySelector('button')?.textContent).toBe(COPY_FAILED);
    expect(pasteBlocks()[0]?.textContent).toContain('Venusaur');
  });

  it('announces per player, so copying each team in turn is not silent', async () => {
    stubClipboard('resolve');

    // The live region has to be mounted to observe what reaches it.
    act(() => {
      render(
        <>
          <LiveRegion />
          <CompletedDraft
            players={PLAYERS}
            state={stateWith(MIGRATED)}
            entries={ROSTER_ENTRIES}
            entryById={ROSTER}
            checkpointReached
            checkpointDismissed={false}
            onDownload={() => undefined}
            onDismissCheckpoint={() => undefined}
            onOpenTournament={() => undefined}
          />
        </>,
        host,
      );
    });

    const live = (): string => host.querySelector('[role="status"]')?.textContent ?? '';

    await act(async () => {
      panels()[0]?.querySelector('button')?.click();
      await Promise.resolve();
    });
    expect(live()).toBe('Ash team paste copied.');

    await act(async () => {
      panels()[1]?.querySelector('button')?.click();
      await Promise.resolve();
    });

    // The message CHANGED. Assistive technology announces a change to the region, so the
    // bare label `Copied` would be spoken for the first player and silently ignored for
    // every player after — and copying each team in turn is the entire purpose of this
    // screen. Naming the player is what keeps the second announcement audible.
    expect(live()).toBe('Misty team paste copied.');
  });

  it('announces the failure too, and names the fallback', async () => {
    stubClipboard('reject');

    act(() => {
      render(
        <>
          <LiveRegion />
          <CompletedDraft
            players={PLAYERS}
            state={stateWith(MIGRATED)}
            entries={ROSTER_ENTRIES}
            entryById={ROSTER}
            checkpointReached
            checkpointDismissed={false}
            onDownload={() => undefined}
            onDismissCheckpoint={() => undefined}
            onOpenTournament={() => undefined}
          />
        </>,
        host,
      );
    });

    await act(async () => {
      panels()[0]?.querySelector('button')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      'Ash team paste not copied — select the text below.',
    );
  });
});

// ---------------------------------------------------------------------------
// The slot decides the export — D-04, EXPO-02
// ---------------------------------------------------------------------------

/**
 * Every assertion in this block is EXACT STRING EQUALITY on the whole paste.
 *
 * `toContain` is the assertion that would not catch the failure this file exists to
 * prevent. Showdown reads `A\n\nB` as two Pokemon and `A\nB` as one, silently discarding
 * the rest, and a substring check passes identically against both. The blank-line
 * separator and the single trailing newline are part of the value, so they are part of
 * the expectation.
 */
describe('a Mega slot exports with its stone', () => {
  function pasteFor(player: 'p1' | 'p2'): string {
    return pasteBlocks()[player === 'p1' ? 0 : 1]?.textContent ?? '';
  }

  it('emits Species @ StoneItemName for a slot the schedule typed as Mega', () => {
    drawCompleted({ state: stateWith(MEGA_FIRST) });

    expect(pasteFor('p1')).toBe('Venusaur @ Venusaurite\n\nKommo-o\n\nFarfetch’d\n');
    expect(pasteFor('p2')).toBe('Garchomp @ Garchompite\n\nMr. Rime\n\nRotom-Wash\n');
  });

  /**
   * The D-04 assertion, made from the slot side rather than the species side.
   *
   * Venusaur can Mega and exports BARE here, because round 1 is open in this schedule and
   * open slots are untyped. Reading the stone off the species instead would pass every
   * test of the roster table and quietly claim a Mega nobody drafted.
   */
  it('emits a Mega-CAPABLE species bare when its slot is open', () => {
    drawCompleted({ state: stateWith(ALL_OPEN) });

    expect(ROSTER.get('venusaur')?.megaCapable).toBe(true);
    expect(pasteFor('p1')).toBe('Venusaur\n\nKommo-o\n\nFarfetch’d\n');
    expect(pasteFor('p1')).not.toContain(' @ ');
    expect(pasteFor('p2')).not.toContain(' @ ');
  });

  it('keeps the blank-line separator and the single trailing newline with a stone present', () => {
    drawCompleted({ state: stateWith(MEGA_FIRST) });

    const text = pasteFor('p1');
    expect(text.split('\n\n')).toHaveLength(3);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    // And the naive form is genuinely absent, not merely unlikely.
    expect(text).not.toBe('Venusaur @ Venusaurite\nKommo-o\nFarfetch’d\n');
  });

  it('emits a Mega slot bare when the species has no legal forme left', () => {
    // D-10 as behaviour rather than as an error: every forme banned means the species
    // simply cannot Mega in this tournament. Reachable in the export only from an imported
    // document — the Mega round would never have offered it.
    const banned = { ...CONFIG, megaFormeBans: ['venusaurmega'] };
    drawCompleted({ state: stateWith(MEGA_FIRST, TEAMS, banned) });

    expect(pasteFor('p1')).toBe('Venusaur\n\nKommo-o\n\nFarfetch’d\n');
    // The other player's Mega slot is untouched by a ban on somebody else's forme.
    expect(pasteFor('p2')).toBe('Garchomp @ Garchompite\n\nMr. Rime\n\nRotom-Wash\n');
  });

  it('exports a migrated schema-2 document byte-identically to before Phase 3', () => {
    // No `schedule/compiled` in its log, so its folded schedule is empty and every slot is
    // open — which is what that draft actually ran. The expectation below is the string
    // this file asserted before Mega rounds existed, unchanged.
    drawCompleted({ state: stateWith(MIGRATED) });
    const migrated = [pasteFor('p1'), pasteFor('p2')];

    expect(migrated).toEqual([
      'Venusaur\n\nKommo-o\n\nFarfetch’d\n',
      'Garchomp\n\nMr. Rime\n\nRotom-Wash\n',
    ]);

    // And an explicitly compiled all-open schedule produces the same bytes, so the two
    // routes to "no Mega rounds" cannot diverge.
    drawCompleted({ state: stateWith(ALL_OPEN) });
    expect([pasteFor('p1'), pasteFor('p2')]).toEqual(migrated);
  });

  it('drops an unfilled Mega slot rather than emitting a lone stone', () => {
    drawCompleted({
      state: stateWith(MEGA_FIRST, { p1: [null, 'kommoo', null], p2: [null, null, null] }),
    });

    expect(pasteFor('p1')).toBe('Kommo-o\n');
    expect(pasteFor('p2')).toBe('');
  });
});
