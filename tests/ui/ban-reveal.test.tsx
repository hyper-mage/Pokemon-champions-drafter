// @vitest-environment happy-dom

/**
 * The reveal — BAN-04, BAN-07, RULE-08, D-13, D-19, D-22, D-23.
 *
 * `04-UI-SPEC` §7 gives this surface as seven rows with every string a contract, and the
 * grammar is where a bug on a shared screen would actually land: a comma list read aloud to
 * eight people is the payoff of the whole ritual, and "Sam banned Garchomp, Landorus, and
 * Kyogre." is a different sentence from the approved one. Every case below asserts a whole
 * sentence on exact equality rather than a substring, for that reason.
 *
 * The component is presentational and takes resolved entries, so the fixtures here are
 * hand-built rather than read off the committed roster: the two collision forms need three
 * players sharing one species, which is a shape no snapshot happens to contain.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SpriteMeta } from '../../src/adapters/roster-source';
import type { FeasibilityProblem } from '../../src/core/feasibility';
import type { RosterEntry } from '../../src/core/roster/types';
import { BanReveal, type BanRevealProps } from '../../src/ui/components/BanReveal';
import { announce } from '../../src/ui/components/LiveRegion';

const SPRITE_META: SpriteMeta = {
  nativeWidth: 96,
  nativeHeight: 96,
  byRosterId: {},
};

function entry(name: string): RosterEntry {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
    name,
    num: 1,
    types: ['Normal'],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    baseSpeciesId: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
    forme: null,
    megaCapable: false,
    megaFormes: [],
    spriteId: null,
    spriteMissing: true,
  };
}

const GARCHOMP = entry('Garchomp');
const LANDORUS = entry('Landorus');
const KYOGRE = entry('Kyogre');
const VENUSAUR = entry('Venusaur');

let host: HTMLDivElement;

beforeEach(() => {
  // `announce` writes a module-level signal that outlives any render (CLAUDE.md §Tests).
  // Nothing on this surface speaks, and the sweep below is what holds that to account.
  announce('');
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

function mount(overrides: Partial<BanRevealProps> = {}): { started: number } {
  const counter = { started: 0 };

  const props: BanRevealProps = {
    rows: [{ playerName: 'Sam', entries: [GARCHOMP] }],
    collisions: [],
    bannedCount: 1,
    blocking: null,
    spriteMeta: SPRITE_META,
    onStartDraft: () => {
      counter.started += 1;
    },
    ...overrides,
  };

  act(() => {
    render(<BanReveal {...props} />, host);
  });

  return counter;
}

function text(selector: string): string {
  return host.querySelector(selector)?.textContent?.trim() ?? '';
}

function allText(selector: string): string[] {
  return [...host.querySelectorAll(selector)].map((node) => node.textContent?.trim() ?? '');
}

/** Every row's accessible sentence, in render order. */
function rowSentences(): string[] {
  return allText('.ban-reveal__row .visually-hidden');
}

function startDraft(): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('.ban-reveal__action');
  if (button === null) throw new Error('the reveal rendered no primary action');
  return button;
}

describe('BanReveal — the heading and the sub-head', () => {
  it('reads the count first, and takes it from the prop rather than from the rows', () => {
    // Two players, three bans between them, but only two DISTINCT species — the exact
    // arithmetic that makes flattening the rows and taking the length wrong.
    mount({
      rows: [
        { playerName: 'Sam', entries: [GARCHOMP, KYOGRE] },
        { playerName: 'Ada', entries: [KYOGRE] },
      ],
      bannedCount: 2,
    });

    expect(text('.ban-reveal__headline')).toBe('2 Pokémon banned');
  });

  it('gives the heading a programmatic focus target that is not a tab stop', () => {
    mount();

    const heading = host.querySelector<HTMLHeadingElement>('.ban-reveal__headline');
    expect(heading?.tagName).toBe('H1');
    expect(heading?.getAttribute('tabindex')).toBe('-1');
  });

  it('lands focus on the heading when the reveal mounts', () => {
    mount();

    expect(document.activeElement).toBe(host.querySelector('.ban-reveal__headline'));
  });

  it('states the sub-head in full', () => {
    mount();

    expect(text('.ban-reveal__sub-head')).toBe(
      "Every player's bans are below. They apply to everyone.",
    );
  });
});

describe('BanReveal — attribution rows', () => {
  it('renders one row per player, in the order it is given', () => {
    mount({
      rows: [
        { playerName: 'Ada', entries: [GARCHOMP] },
        { playerName: 'Bo', entries: [KYOGRE] },
        { playerName: 'Sam', entries: [VENUSAUR] },
      ],
      bannedCount: 3,
    });

    expect(allText('.ban-reveal__player')).toEqual(['Ada', 'Bo', 'Sam']);
  });

  it('renders every ban as a named chip', () => {
    mount({
      rows: [{ playerName: 'Sam', entries: [GARCHOMP, LANDORUS] }],
      bannedCount: 2,
    });

    expect(allText('.ban-reveal__row .mon-chip__name')).toEqual(['Garchomp', 'Landorus']);
  });

  it('summarises one ban with no list at all', () => {
    mount({ rows: [{ playerName: 'Sam', entries: [GARCHOMP] }], bannedCount: 1 });

    expect(rowSentences()).toEqual(['Sam banned Garchomp.']);
  });

  it('summarises two bans with `and` and no comma', () => {
    mount({
      rows: [{ playerName: 'Sam', entries: [GARCHOMP, LANDORUS] }],
      bannedCount: 2,
    });

    expect(rowSentences()).toEqual(['Sam banned Garchomp and Landorus.']);
  });

  it('summarises three bans with no Oxford comma', () => {
    mount({
      rows: [{ playerName: 'Sam', entries: [GARCHOMP, LANDORUS, KYOGRE] }],
      bannedCount: 3,
    });

    expect(rowSentences()).toEqual(['Sam banned Garchomp, Landorus and Kyogre.']);
  });

  it('hides the visible row from assistive technology, so the sentence is read once', () => {
    mount({ rows: [{ playerName: 'Sam', entries: [GARCHOMP] }], bannedCount: 1 });

    expect(host.querySelector('.ban-reveal__player')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.ban-reveal__chips')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('BanReveal — collisions, named out loud', () => {
  it('names a two-player collision and says the second ban is spent', () => {
    mount({
      rows: [
        { playerName: 'Sam', entries: [GARCHOMP] },
        { playerName: 'Ada', entries: [GARCHOMP] },
      ],
      collisions: [{ speciesName: 'Garchomp', playerNames: ['Sam', 'Ada'] }],
      bannedCount: 1,
    });

    expect(allText('.ban-reveal__collision')).toEqual([
      'Sam and Ada both banned Garchomp. It is banned once; the second ban is spent.',
    ]);
  });

  it('names a three-player collision and counts the bans it cost', () => {
    mount({
      rows: [
        { playerName: 'Sam', entries: [GARCHOMP] },
        { playerName: 'Ada', entries: [GARCHOMP] },
        { playerName: 'Bo', entries: [GARCHOMP] },
      ],
      collisions: [{ speciesName: 'Garchomp', playerNames: ['Sam', 'Ada', 'Bo'] }],
      bannedCount: 1,
    });

    expect(allText('.ban-reveal__collision')).toEqual([
      'Sam, Ada and Bo all banned Garchomp. It is banned once; the other 2 bans are spent.',
    ]);
  });

  it('renders one line per collided species', () => {
    mount({
      collisions: [
        { speciesName: 'Garchomp', playerNames: ['Sam', 'Ada'] },
        { speciesName: 'Kyogre', playerNames: ['Bo', 'Cy'] },
      ],
      bannedCount: 2,
    });

    expect(allText('.ban-reveal__collision')).toHaveLength(2);
  });

  it('renders no collision element at all when there are none', () => {
    mount({ collisions: [] });

    expect(host.textContent).not.toContain('banned once');
    expect(host.querySelector('.ban-reveal__collisions')).toBeNull();
    expect(host.querySelector('.ban-reveal__collision')).toBeNull();
  });

  it('renders a snake reveal, where collisions are impossible by construction', () => {
    mount({
      rows: [
        { playerName: 'Ada', entries: [GARCHOMP, KYOGRE] },
        { playerName: 'Bo', entries: [LANDORUS, VENUSAUR] },
      ],
      collisions: [],
      bannedCount: 4,
    });

    expect(text('.ban-reveal__headline')).toBe('4 Pokémon banned');
    expect(rowSentences()).toEqual([
      'Ada banned Garchomp and Kyogre.',
      'Bo banned Landorus and Venusaur.',
    ]);
    expect(host.textContent).not.toContain('banned once');
  });
});

describe('BanReveal — the feasibility line and Start draft', () => {
  const BLOCKING: FeasibilityProblem = {
    code: 'notEnoughMegas',
    severity: 'blocking',
    message:
      'Not enough Pokémon can Mega after the bans. 4 players × 2 Mega rounds needs 8; 3 can still Mega. The bans are locked, so this tournament cannot start — abandon it and set it up again.',
  };

  it('says the pool can be drawn on a passing verdict', () => {
    mount({ blocking: null });

    expect(text('.ban-reveal__feasibility')).toBe('The pool can be drawn.');
  });

  it('leaves Start draft live on a passing verdict', () => {
    const counter = mount({ blocking: null });

    act(() => {
      startDraft().click();
    });

    expect(startDraft().getAttribute('aria-disabled')).toBeNull();
    expect(startDraft().getAttribute('aria-describedby')).toBeNull();
    expect(counter.started).toBe(1);
  });

  it('states the blocking reason in full, ending with the only remaining exit', () => {
    mount({ blocking: BLOCKING });

    expect(text('.ban-reveal__feasibility')).toBe(BLOCKING.message);
    expect(BLOCKING.message.endsWith('— abandon it and set it up again.')).toBe(true);
  });

  it('puts the blocking reason in a status region the button points at', () => {
    mount({ blocking: BLOCKING });

    const region = host.querySelector('.ban-reveal__feasibility');
    expect(region?.getAttribute('role')).toBe('status');
    expect(startDraft().getAttribute('aria-describedby')).toBe(region?.id);
  });

  it('marks Start draft blocked with aria-disabled and never the native attribute', () => {
    mount({ blocking: BLOCKING });

    expect(startDraft().getAttribute('aria-disabled')).toBe('true');
    expect(startDraft().disabled).toBe(false);
  });

  it('does nothing at all when a blocked Start draft is clicked', () => {
    const counter = mount({ blocking: BLOCKING });

    act(() => {
      startDraft().click();
    });

    expect(counter.started).toBe(0);
  });

  it('names the primary action Start draft in both verdicts', () => {
    mount({ blocking: null });
    expect(startDraft().textContent).toBe('Start draft');

    mount({ blocking: BLOCKING });
    expect(startDraft().textContent).toBe('Start draft');
  });
});

describe('BanReveal — nothing on it is interactive except Start draft', () => {
  it('renders no button other than Start draft', () => {
    mount({
      rows: [
        { playerName: 'Sam', entries: [GARCHOMP, LANDORUS] },
        { playerName: 'Ada', entries: [KYOGRE, VENUSAUR] },
      ],
      collisions: [{ speciesName: 'Garchomp', playerNames: ['Sam', 'Ada'] }],
      bannedCount: 4,
    });

    const buttons = [...host.querySelectorAll('button')];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.className).toContain('ban-reveal__action');
  });

  it('puts no chip and no row in the tab order', () => {
    mount({
      rows: [{ playerName: 'Sam', entries: [GARCHOMP, LANDORUS] }],
      bannedCount: 2,
    });

    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
    expect(host.querySelectorAll('.ban-reveal__row [tabindex]')).toHaveLength(0);
  });
});
