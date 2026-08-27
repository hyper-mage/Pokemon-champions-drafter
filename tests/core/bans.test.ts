/**
 * bannedEntries — the one ban derivation, and the tripwire that pins it to the gate.
 *
 * Two surfaces write one flat banlist (D-10), so a duplicate id is not a hypothetical: the
 * grid toggles and the typeahead adds, and a host who types a name the grid already banned
 * writes it twice unless the write path dedupes. An imported document adds the second case,
 * a ban id this regulation no longer has an entry for. Both make `bans.length` the wrong
 * number, and both are covered below.
 *
 * The assertion that matters most is `agrees with checkFeasibility's banCount` — 02-RESEARCH
 * F-10. Every displayed ban count in the application reads `bannedEntries(...).length`, and
 * every feasibility sentence quotes `banCount`; those are two independent computations of one
 * figure, and a host who reads "12 bans" beside a sentence computed from 11 has no way to
 * tell which one is lying.
 *
 * Real ids from the committed snapshot, zero mocks, and no import of `src/store.ts` — the
 * observable payoff of the purity rule.
 */

import { describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import { bannedEntries } from '../../src/core/bans';
import { checkFeasibility } from '../../src/core/feasibility';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';

const SNAPSHOT = committedSnapshot as unknown as RosterSnapshot;
const ENTRIES: readonly RosterEntry[] = SNAPSHOT.entries;

/** Three real ids whose names sort in an order the id order does not produce. */
const PIKACHU = 'pikachu';
const ROTOM_WASH = 'rotomwash';
const MR_RIME = 'mrrime';

describe('bannedEntries', () => {
  it('returns nothing for an empty banlist', () => {
    expect(bannedEntries(ENTRIES, [])).toEqual([]);
  });

  it('counts a duplicate id once', () => {
    const banned = bannedEntries(ENTRIES, [PIKACHU, PIKACHU]);

    expect(banned).toHaveLength(1);
    expect(banned[0]?.id).toBe(PIKACHU);
  });

  it('counts an id the roster does not carry as zero', () => {
    expect(bannedEntries(ENTRIES, ['not-a-real-id'])).toHaveLength(0);
  });

  it('resolves each banned id to its roster entry', () => {
    const banned = bannedEntries(ENTRIES, [ROTOM_WASH, PIKACHU]);

    expect(banned.map((entry) => entry.id).sort()).toEqual([PIKACHU, ROTOM_WASH]);
  });

  it('orders the result by name, not by id and not by the banlist', () => {
    // Passed in an order that is neither the wanted output nor the roster's own, so a
    // function that simply preserved one of them would fail here.
    const banned = bannedEntries(ENTRIES, [ROTOM_WASH, PIKACHU, MR_RIME]);

    expect(banned.map((entry) => entry.name)).toEqual(['Mr. Rime', 'Pikachu', 'Rotom-Wash']);
  });

  it('mutates neither argument', () => {
    const bans = [ROTOM_WASH, PIKACHU, 'not-a-real-id'];
    const entriesBefore = JSON.stringify(ENTRIES);
    const bansBefore = JSON.stringify(bans);

    bannedEntries(ENTRIES, bans);

    expect(JSON.stringify(ENTRIES)).toBe(entriesBefore);
    expect(JSON.stringify(bans)).toBe(bansBefore);
  });

  /**
   * The F-10 tripwire. Not a nice-to-have.
   *
   * `bannedEntries` intersects the banlist with the roster; `checkFeasibility` reaches the
   * same figure by subtracting its own set-based `legalCount` from the entry count. They are
   * written independently and they must never disagree, so the equality is asserted directly
   * rather than inferred from both being "obviously right".
   */
  it('agrees with checkFeasibility banCount, duplicates and strangers included', () => {
    const bans = [PIKACHU, PIKACHU, 'not-a-real-id'];

    const result = checkFeasibility({
      playerNames: ['Ada', 'Bo'],
      rounds: 6,
      poolSize: 12,
      megasRequiredPerTeam: 0,
      bannedIds: bans,
      megaFormeBans: [],
      dualMegaChoices: [],
      swapBudget: 0,
      swapRounds: 0,
      // `banCount` counts host bans that hit the roster, and nothing about it moves with the
      // ban mode. The `hostBanlist` values keep this equality the one thing it asserts.
      banMode: 'hostBanlist',
      bansPerPlayer: 0,
      // The bracket gate asks nothing at 'draftOnly'. This test is about banCount, and the
      // depth question is settled — see FeasibilityInput.depth's doc block.
      depth: 'draftOnly',
      entries: ENTRIES,
    });

    expect(bannedEntries(ENTRIES, bans)).toHaveLength(result.banCount);
    expect(result.banCount).toBe(1);
  });

  it('agrees with checkFeasibility banCount across a larger banlist', () => {
    const bans = ENTRIES.slice(0, 30).map((entry) => entry.id);

    const result = checkFeasibility({
      playerNames: ['Ada', 'Bo'],
      rounds: 6,
      poolSize: 12,
      megasRequiredPerTeam: 0,
      bannedIds: bans,
      megaFormeBans: [],
      dualMegaChoices: [],
      swapBudget: 0,
      swapRounds: 0,
      // `banCount` counts host bans that hit the roster, and nothing about it moves with the
      // ban mode. The `hostBanlist` values keep this equality the one thing it asserts.
      banMode: 'hostBanlist',
      bansPerPlayer: 0,
      // The bracket gate asks nothing at 'draftOnly'. This test is about banCount, and the
      // depth question is settled — see FeasibilityInput.depth's doc block.
      depth: 'draftOnly',
      entries: ENTRIES,
    });

    expect(bannedEntries(ENTRIES, bans)).toHaveLength(result.banCount);
    expect(result.banCount).toBe(30);
  });
});
