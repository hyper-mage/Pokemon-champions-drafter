// @vitest-environment happy-dom

/**
 * The turn banner, once the round count and the team count are host decisions.
 *
 * Phase 1 wrote `Round {r} of 6` and `Draft complete — 12 picks, 2 teams` as literals, and
 * recorded why: the copy contract stated those sentences and nothing could yet produce a
 * different one. Both halves of that reasoning expire in this plan — a host now names four
 * to eight players — and a literal `6` in a six-round build is invisible until the moment
 * it is wrong, which is exactly the kind of thing that needs a test rather than a reading.
 *
 * So every assertion below uses a round count and a team count that are NOT Phase 1's.
 * A banner that had kept its literals would still pass a `rounds: 6` test.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { announce } from '../../src/ui/components/LiveRegion';
import { TurnBanner } from '../../src/ui/components/TurnBanner';

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

describe('the turn banner mid-draft', () => {
  it('names the round, the round count and the player from props', () => {
    act(() => {
      render(
        <TurnBanner
          round={1}
          rounds={6}
          playerName="Ada"
          complete={false}
          picks={0}
          teams={6}
        />,
        host,
      );
    });

    expect(text()).toBe('Round 1 of 6 — Ada picks');
  });

  it('reports a round count that is not six', () => {
    act(() => {
      render(
        <TurnBanner
          round={3}
          rounds={4}
          playerName="Bo"
          complete={false}
          picks={5}
          teams={3}
        />,
        host,
      );
    });

    expect(text()).toBe('Round 3 of 4 — Bo picks');
    expect(text()).not.toContain('of 6');
  });

  it('renders nothing before a draft is under way', () => {
    act(() => {
      render(
        <TurnBanner
          round={null}
          rounds={6}
          playerName={null}
          complete={false}
          picks={0}
          teams={6}
        />,
        host,
      );
    });

    expect(host.querySelector('.turn-banner')).toBeNull();
  });
});

describe('the turn banner on completion', () => {
  it('counts the picks and the teams from props', () => {
    act(() => {
      render(
        <TurnBanner round={null} rounds={6} playerName={null} complete picks={36} teams={6} />,
        host,
      );
    });

    expect(text()).toBe('Draft complete — 36 picks, 6 teams');
  });

  it('does not fall back to Phase 1s twelve picks and two teams', () => {
    act(() => {
      render(
        <TurnBanner round={null} rounds={6} playerName={null} complete picks={48} teams={8} />,
        host,
      );
    });

    expect(text()).toBe('Draft complete — 48 picks, 8 teams');
    expect(text()).not.toContain('12 picks');
    expect(text()).not.toContain('2 teams');
  });
});
