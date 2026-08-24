// @vitest-environment happy-dom

/**
 * The turn banner, once the round count and the team count are host decisions — and once
 * the sticky head has to carry the phase as well as the turn.
 *
 * Phase 1 wrote `Round {r} of 6` and `Draft complete — 12 picks, 2 teams` as literals, and
 * recorded why: the copy contract stated those sentences and nothing could yet produce a
 * different one. Both halves of that reasoning expire in this plan — a host now names four
 * to eight players — and a literal `6` in a six-round build is invisible until the moment
 * it is wrong, which is exactly the kind of thing that needs a test rather than a reading.
 *
 * So every assertion below uses a round count and a team count that are NOT Phase 1's.
 * A banner that had kept its literals would still pass a `rounds: 6` test.
 *
 * Phase 3 adds the second line. CARD-08 is the reason it is a LINE and not a panel: the
 * resolved order has to be readable at the fourth pick of a round, not only at the moment
 * it resolves, so the assertions below check it after picks have been made rather than
 * only on arrival.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';
import { TurnBanner, type TurnBannerProps } from '../../src/ui/components/TurnBanner';

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);

  // `announce` is a module-level signal that outlives any render, and the banner writes
  // to it on every turn change.
  announce('');
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function text(): string {
  return host.textContent ?? '';
}

function phaseLine(): string | null {
  return host.querySelector('.turn-banner__phase')?.textContent ?? null;
}

/**
 * Defaults for the props no assertion in a given test is about.
 *
 * `filtersCleared` stays required on the component rather than optional, so every real call
 * site states which case it is. This file is about the VISIBLE head, which is identical
 * either way — the suffix is announcement-only, and 02-08's `pool-filter-announce.test.tsx`
 * is where it is asserted.
 */
function mount(props: Partial<TurnBannerProps>): void {
  act(() => {
    render(
      <TurnBanner
        round={props.round === undefined ? null : props.round}
        rounds={props.rounds ?? 6}
        playerName={props.playerName === undefined ? null : props.playerName}
        complete={props.complete ?? false}
        picks={props.picks ?? 0}
        teams={props.teams ?? 6}
        filtersCleared={props.filtersCleared ?? false}
        phase={props.phase ?? 'picking'}
        pickOrder={props.pickOrder ?? []}
        tiePossible={props.tiePossible ?? false}
        swapRound={props.swapRound === undefined ? null : props.swapRound}
        swapRounds={props.swapRounds ?? 0}
        swapOrderSource={props.swapOrderSource ?? 'lastRound'}
        lastMove={props.lastMove === undefined ? null : props.lastMove}
        banPass={props.banPass === undefined ? null : props.banPass}
        banPasses={props.banPasses ?? 0}
        stillToBan={props.stillToBan ?? []}
      />,
      host,
    );
  });
}

describe('the turn banner mid-draft', () => {
  it('names the round, the round count and the player from props', () => {
    mount({ round: 1, rounds: 6, playerName: 'Ada', teams: 6 });
    expect(text()).toBe('Round 1 of 6 — Ada picks');
  });

  it('reports a round count that is not six', () => {
    mount({ round: 3, rounds: 4, playerName: 'Bo', picks: 5, teams: 3 });

    expect(text()).toBe('Round 3 of 4 — Bo picks');
    expect(text()).not.toContain('of 6');
  });

  it('renders nothing before a draft is under way', () => {
    mount({ round: null, playerName: null });
    expect(host.querySelector('.turn-banner')).toBeNull();
  });
});

describe('the turn banner on completion', () => {
  it('counts the picks and the teams from props', () => {
    mount({ complete: true, picks: 36, teams: 6 });
    expect(text()).toBe('Draft complete — 36 picks, 6 teams');
  });

  it('does not fall back to Phase 1s twelve picks and two teams', () => {
    mount({ complete: true, picks: 48, teams: 8 });

    expect(text()).toBe('Draft complete — 48 picks, 8 teams');
    expect(text()).not.toContain('12 picks');
    expect(text()).not.toContain('2 teams');
  });

  it('is byte-identical for a swap-free tournament at twelve picks and two teams', () => {
    // The one sentence this plan must not move. `swapRounds: 0` is the tournament shape
    // Phase 2 shipped, and its completion copy is asserted here on exact equality so that
    // adding the card and swap phases around it cannot nudge a character.
    mount({ complete: true, picks: 12, teams: 2 });

    expect(text()).toBe('Draft complete — 12 picks, 2 teams');
    expect(phaseLine()).toBeNull();
  });
});

describe('the sticky head during card play', () => {
  it('says the player plays a card, not that they pick', () => {
    mount({ phase: 'cards', round: 1, rounds: 6, playerName: 'Ada' });

    expect(host.querySelector('.turn-banner')?.textContent).toBe(
      'Round 1 of 6 — Ada plays a card',
    );
    expect(text()).not.toContain('Ada picks');
  });

  it('states the rule, with no tie clause when a tie is impossible', () => {
    // Four players and six rounds: the no-repeat rule makes two players holding the same
    // value at the same time impossible, so CARD-05's clause would name a case that cannot
    // arise on the one line a room reads from across it.
    mount({ phase: 'cards', round: 1, rounds: 6, playerName: 'Ada', tiePossible: false });

    expect(phaseLine()).toBe('The lowest card picks first.');
    expect(text()).not.toContain('Ties go to');
  });

  it('carries the tie clause when players outnumber rounds', () => {
    // Eight players and six rounds: two players can hold the same value, so the tiebreak
    // is a rule the room can actually hit and has to be told.
    mount({ phase: 'cards', round: 1, rounds: 6, playerName: 'Ada', tiePossible: true });

    expect(phaseLine()).toBe(
      'The lowest card picks first. Ties go to whoever played the value first.',
    );
  });

  it('renders no pick order while the round is still being bid', () => {
    mount({ phase: 'cards', round: 2, rounds: 6, playerName: 'Bo', pickOrder: ['Ada', 'Bo'] });
    expect(text()).not.toContain('Pick order');
  });
});

describe('the sticky head during picking — CARD-08', () => {
  it('carries the resolved order, numbered and middot separated', () => {
    mount({ phase: 'picking', round: 1, rounds: 6, playerName: 'Ada', pickOrder: ['Ada', 'Bo', 'Cy'] });

    expect(phaseLine()).toBe('Pick order: 1 Ada · 2 Bo · 3 Cy');
  });

  it('is still there after two picks have been made', () => {
    // The whole of CARD-08: the order is not a panel that appears and disappears. Picking
    // has moved on to Cy and the line reads exactly the same.
    mount({
      phase: 'picking',
      round: 1,
      rounds: 6,
      playerName: 'Cy',
      picks: 2,
      pickOrder: ['Ada', 'Bo', 'Cy'],
    });

    expect(host.querySelector('.turn-banner')?.textContent).toBe('Round 1 of 6 — Cy picks');
    expect(phaseLine()).toBe('Pick order: 1 Ada · 2 Bo · 3 Cy');
  });

  it('renders no phase line for a draft that resolved nothing', () => {
    // A migrated schema-2 document. It dealt no cards and has no order to show.
    mount({ phase: 'picking', round: 1, rounds: 6, playerName: 'Ada', pickOrder: [] });
    expect(phaseLine()).toBeNull();
  });
});

describe('what the sticky head announces', () => {
  /**
   * The live region lives at app root rather than inside the banner, so this file mounts
   * one of its own beside the component and reads the module-level signal through it.
   */
  function mountWithRegion(props: Partial<TurnBannerProps>): void {
    act(() => {
      render(
        <>
          <LiveRegion />
          <TurnBanner
            round={props.round === undefined ? null : props.round}
            rounds={props.rounds ?? 6}
            playerName={props.playerName === undefined ? null : props.playerName}
            complete={props.complete ?? false}
            picks={props.picks ?? 0}
            teams={props.teams ?? 6}
            filtersCleared={props.filtersCleared ?? false}
            phase={props.phase ?? 'picking'}
            pickOrder={props.pickOrder ?? []}
            tiePossible={props.tiePossible ?? false}
            swapRound={props.swapRound === undefined ? null : props.swapRound}
            swapRounds={props.swapRounds ?? 0}
            swapOrderSource={props.swapOrderSource ?? 'lastRound'}
            lastMove={props.lastMove === undefined ? null : props.lastMove}
            banPass={props.banPass === undefined ? null : props.banPass}
            banPasses={props.banPasses ?? 0}
            stillToBan={props.stillToBan ?? []}
          />
        </>,
        host,
      );
    });
  }

  function spoken(): string {
    return host.querySelector('[role="status"]')?.textContent ?? '';
  }

  it('mirrors the card-play turn, so the phase change is not silent', () => {
    mountWithRegion({ phase: 'cards', round: 1, rounds: 6, playerName: 'Ada' });
    expect(spoken()).toBe('Round 1 of 6 — Ada plays a card');
  });

  it('carries a move ahead of the turn it caused, as ONE string', () => {
    // `announce` writes a single signal, so a card play and the turn change it causes
    // cannot be two announcements — the second would silently replace the first. This is
    // the same construction `. Filters cleared.` uses, for the same reason.
    mountWithRegion({
      phase: 'cards',
      round: 1,
      rounds: 6,
      playerName: 'Bo',
      lastMove: 'Ada plays 4.',
    });

    expect(spoken()).toBe('Ada plays 4. Round 1 of 6 — Bo plays a card');

    // The rendered head is unchanged by the move; only the announcement carries it. Scoped
    // to the two head lines rather than the host, which now also holds the live region.
    expect(host.querySelector('.turn-banner')?.textContent).toBe(
      'Round 1 of 6 — Bo plays a card',
    );
    expect(phaseLine()).toBe('The lowest card picks first.');
  });

  it('announces the resolution ahead of the first picking turn', () => {
    mountWithRegion({
      phase: 'picking',
      round: 1,
      rounds: 6,
      playerName: 'Cy',
      pickOrder: ['Cy', 'Ada', 'Bo'],
      lastMove: 'Cy plays 1. Round 1 pick order: 1 Cy, 2 Ada, 3 Bo.',
    });

    expect(spoken()).toBe(
      'Cy plays 1. Round 1 pick order: 1 Cy, 2 Ada, 3 Bo. Round 1 of 6 — Cy picks',
    );
  });
});

// ---------------------------------------------------------------------------
// The ban stage — BAN-03, D-12, 04-UI-SPEC §6
// ---------------------------------------------------------------------------

describe('the turn banner at the snake ban stage', () => {
  /**
   * `Pass`, never `Round`. `Round` is already taken by the draft's own rounds and by the
   * board's `R{n}` header, and two meanings for one word on a shared screen is how a room
   * ends up arguing about which round it is (04-UI-SPEC §6).
   */
  it('names the pass, the pass count and the player, in full', () => {
    mount({ banPass: 1, banPasses: 2, playerName: 'Sam' });

    expect(host.querySelector('.turn-banner')?.textContent).toBe('Pass 1 of 2 — Sam bans');
  });

  it('counts a later pass', () => {
    mount({ banPass: 2, banPasses: 3, playerName: 'Ada' });

    expect(host.querySelector('.turn-banner')?.textContent).toBe('Pass 2 of 3 — Ada bans');
  });

  /**
   * The ban line wins over the draft's own line even though `round` and `phase` are set.
   * This is Pitfall 4 made a test: `selectPhase` answers `'cards'` during a ban stage — an
   * empty pool with a resolved order — so a banner that consulted `phase` first would put
   * `Round 1 of 6 — Sam plays a card` over the ban roster.
   */
  it('wins over the round line, which selectPhase would otherwise produce', () => {
    mount({ banPass: 1, banPasses: 2, playerName: 'Sam', round: 1, rounds: 6, phase: 'cards' });

    expect(host.querySelector('.turn-banner')?.textContent).toBe('Pass 1 of 2 — Sam bans');
    expect(text()).not.toContain('plays a card');
    expect(text()).not.toContain('Round 1 of 6');
  });

  it('names who is left in the pass, separated by a middle dot', () => {
    mount({ banPass: 1, banPasses: 2, playerName: 'Sam', stillToBan: ['Ada', 'Kim'] });

    expect(phaseLine()).toBe('Still to ban this pass: Ada · Kim');
  });

  /**
   * Not rendered rather than rendered empty. `Still to ban this pass:` trailing into nothing
   * reads as a broken template, and the last player of a pass is the case a room sees on
   * every column.
   */
  it('does not render the phase line when nobody is left in the pass', () => {
    mount({ banPass: 1, banPasses: 2, playerName: 'Sam', stillToBan: [] });

    expect(host.querySelector('.turn-banner')?.textContent).toBe('Pass 1 of 2 — Sam bans');
    expect(phaseLine()).toBeNull();
  });

  /**
   * The pick-order strip is a picking-phase line and must not follow the ban stage onto the
   * screen — the banner would then carry two phase lines saying unrelated things.
   */
  it('renders no pick-order strip at the ban stage', () => {
    mount({
      banPass: 1,
      banPasses: 2,
      playerName: 'Sam',
      phase: 'picking',
      pickOrder: ['Sam', 'Ada'],
      stillToBan: ['Ada'],
    });

    expect(phaseLine()).toBe('Still to ban this pass: Ada');
    expect(host.querySelectorAll('.turn-banner__phase')).toHaveLength(1);
  });

  it('renders nothing when no ban is on the clock and no draft is under way', () => {
    mount({ banPass: null, banPasses: 2, playerName: null, round: null });

    expect(host.querySelector('.turn-banner')).toBeNull();
  });
});
