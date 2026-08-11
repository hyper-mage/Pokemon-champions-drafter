// @vitest-environment happy-dom

/**
 * The landing screen — D-01, 02-UI-SPEC §1.
 *
 * The thing worth asserting here is not that three buttons render; it is the two
 * conditionals around them. `Resume saved draft` appears only when a save exists — there
 * is no empty state, so a bug that always rendered it would offer a button that adopts
 * `null` — and the storage canary suppresses the whole screen rather than warning beside
 * it, which is the difference between a warning and a warning the host can click past.
 *
 * The description line is asserted on exact text rather than on a substring, because its
 * two counts agree with two different numbers and a plural helper that agreed with the
 * wrong one would still contain every word.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { draftStarted, pickMade, poolBuilt, type Action, type Intent } from '../../src/core/actions';
import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from '../../src/core/model';
import { announce } from '../../src/ui/components/LiveRegion';
import { LandingScreen } from '../../src/ui/screens/LandingScreen';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

function config(players: number): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: Array.from({ length: players }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    })),
    rounds: 6,
    rosterVersion: 'mb',
    rosterChecksum: 'abc123',
    poolSize: players * 6,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftOnly',
  };
}

/**
 * A document with `players` rows and `picks` picks recorded.
 *
 * The picks are laid out in plain rotation. `fold` runs `apply`, which is total and does
 * not validate — legality is `canApply`'s job on the dispatch path — so this fixture only
 * has to be well-SHAPED, not playable, and that keeps it readable.
 */
function savedDoc(players: number, picks: number): TournamentDoc {
  const conf = config(players);
  const poolIds = Array.from({ length: players * 6 }, (_, index) => `mon-${index}`);

  const log: Action[] = [
    stamp(poolBuilt(poolIds, 'mb', 'abc123', 11, 0), 0),
    stamp(
      draftStarted(
        conf.players.map((player) => player.id),
        13,
      ),
      1,
    ),
  ];

  for (let index = 0; index < picks; index++) {
    const player = conf.players[index % players];
    if (player === undefined) continue;
    log.push(
      stamp(
        pickMade({
          playerId: player.id,
          monId: `mon-${index}`,
          round: Math.floor(index / players) + 1,
          pickIndex: index,
        }),
        index + 2,
      ),
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'saved-fixture',
    createdAt: 1_770_000_000_000,
    config: conf,
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };
}

// ---------------------------------------------------------------------------

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);

  // `announce` writes a module-level signal that outlives every render, so a message left
  // by an earlier file would still be in the region when this one mounts.
  announce('');
});

afterEach(() => {
  render(null, host);
  host.remove();
});

interface Overrides {
  saved?: TournamentDoc | null;
  storageBlocked?: boolean;
  onNewTournament?: () => void;
  onResume?: () => void;
  onAcknowledgeStorage?: () => void;
}

function mount(overrides: Overrides = {}): void {
  act(() => {
    render(
      <LandingScreen
        saved={overrides.saved ?? null}
        storageBlocked={overrides.storageBlocked ?? false}
        onAcknowledgeStorage={overrides.onAcknowledgeStorage ?? (() => undefined)}
        onNewTournament={overrides.onNewTournament ?? (() => undefined)}
        onResume={overrides.onResume ?? (() => undefined)}
        onImportFile={() => undefined}
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

// ---------------------------------------------------------------------------

describe('the landing screen with nothing saved', () => {
  it('offers exactly two actions and no resume', () => {
    mount({ saved: null });

    expect(buttonNamed('New tournament')).not.toBeNull();
    expect(buttonNamed('Import JSON…')).not.toBeNull();

    // The absence is the assertion. There is no "no saved drafts" empty state either —
    // saying "nothing here" would be noise on the screen with the least to say.
    expect(buttonNamed('Resume saved draft')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(2);
  });

  it('states the title and the subtitle verbatim', () => {
    mount({ saved: null });

    expect(host.querySelector('h1')?.textContent).toBe('Pokémon Champions Drafter');
    expect(host.textContent).toContain(
      'Run a Pokémon Champions draft on one shared screen. Nothing to install, no account.',
    );
  });

  it('reports New tournament to its caller', () => {
    const onNewTournament = vi.fn();
    mount({ saved: null, onNewTournament });

    act(() => {
      buttonNamed('New tournament')?.click();
    });

    expect(onNewTournament).toHaveBeenCalledTimes(1);
  });
});

describe('the landing screen with a saved draft', () => {
  it('offers Resume and describes what it would resume', () => {
    mount({ saved: savedDoc(4, 9) });

    expect(buttonNamed('Resume saved draft')).not.toBeNull();
    expect(host.textContent).toContain('Champions MB — 4 players, 9 of 24 picks');
  });

  it('says 1 player rather than 1 players', () => {
    // One player is not something the feasibility gate would let a host configure, but it
    // is reachable through an imported or hand-edited file, and the description renders
    // whatever is on disk. A visible grammar error reads as a tool that was not finished.
    mount({ saved: savedDoc(1, 1) });

    expect(host.textContent).toContain('1 player, 1 of 6 picks');
    expect(host.textContent).not.toContain('1 players');
  });

  it('reports Resume to its caller', () => {
    const onResume = vi.fn();
    mount({ saved: savedDoc(4, 9), onResume });

    act(() => {
      buttonNamed('Resume saved draft')?.click();
    });

    expect(onResume).toHaveBeenCalledTimes(1);
  });
});

describe('the landing screen when storage is blocked', () => {
  it('renders the warning and none of the actions', () => {
    mount({ saved: savedDoc(4, 9), storageBlocked: true });

    expect(host.textContent).toContain('This browser will not save your draft');

    // Not one of the three, and the saved draft's description is gone too: an action the
    // host can take is an action they can take instead of reading this.
    expect(buttonNamed('New tournament')).toBeNull();
    expect(buttonNamed('Resume saved draft')).toBeNull();
    expect(buttonNamed('Import JSON…')).toBeNull();
    expect(host.textContent).not.toContain('9 of 24 picks');
  });

  it('shows the actions once the warning is acknowledged', () => {
    // Without this the test above would pass against a screen that never renders anything.
    mount({ saved: null, storageBlocked: false });

    expect(buttonNamed('New tournament')).not.toBeNull();
    expect(host.textContent).not.toContain('This browser will not save your draft');
  });
});
