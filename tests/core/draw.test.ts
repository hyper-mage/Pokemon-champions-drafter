/**
 * DRFT-02 / BAN-08 — the constrained pool draw.
 *
 * Two properties here are not "nice to have" and are the reason this suite exists.
 *
 * **It must terminate.** Reject-and-redraw would need roughly sixty-four million attempts
 * at eight players requiring four Megas each on an Exact pool — a configuration that passes
 * every feasibility blocker, so an ordinary host can reach it. The elapsed-time assertion
 * below is a real assertion, not a benchmark: a browser freeze there is a correctness bug.
 *
 * **It must emit ids in the candidates' order.** `selectors.ts:36-39` records why: the pool
 * ids are built in display order, so anything that reordered them would reshuffle the grid
 * under the host's cursor on every pick. Returning the shuffle's prefix compiles, passes a
 * length assertion, and scatters Rotom's five appliances across the grid. The subsequence
 * check is written as a forward two-cursor walk precisely so a set comparison cannot pass it.
 *
 * Runs against the real committed roster, sorted by the same dex order the app uses.
 * Zero mocks. Default environment is `node`.
 */

import { describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import { drawPool, type DrawInput } from '../../src/core/draw';
import type { RosterEntry, RosterSnapshot } from '../../src/core/roster/types';

const snapshot = committedSnapshot as unknown as RosterSnapshot;

/**
 * `num` ascending, tie-broken on `id` — `app.tsx:111-116`.
 *
 * The tie-break is not decoration: Rotom and its five appliances all share 479, so `num`
 * alone is not a total order and two runs would not agree.
 */
function byDexOrder(a: RosterEntry, b: RosterEntry): number {
  if (a.num !== b.num) return a.num - b.num;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

const CANDIDATES: readonly RosterEntry[] = [...snapshot.entries].sort(byDexOrder);
const CANDIDATE_IDS = CANDIDATES.map((entry) => entry.id);
const MEGA_CAPABLE_TOTAL = CANDIDATES.filter((entry) => entry.megaCapable).length;

/**
 * The stratum stage 1 partitions on since 03-05 — ids that still have a legal Mega forme.
 *
 * With nothing banned this is every species carrying a forme, which on the committed
 * snapshot is exactly the `megaCapable` set (asserted rather than assumed, below). That
 * equality is why no fixture in this file pinning drawn ids had to move: the partition
 * changed predicate without changing membership, so the seed-to-pool mapping is unmoved.
 */
const MEGA_ELIGIBLE_IDS: readonly string[] = CANDIDATES.filter(
  (entry) => entry.megaFormes.length > 0,
).map((entry) => entry.id);

/**
 * Every request in this file starts from the whole roster with nothing banned.
 *
 * `megaEligibleIds` is REQUIRED on `DrawInput` rather than optional, so this helper exists
 * to supply the unbanned case once. An optional field defaulting to "everything that can
 * Mega" would let a caller forget the one argument Pitfall 7 is about and get the old
 * behaviour back silently.
 */
function request(
  overrides: Omit<DrawInput, 'candidates' | 'megaEligibleIds'> &
    Partial<Pick<DrawInput, 'candidates' | 'megaEligibleIds'>>,
): DrawInput {
  return { candidates: CANDIDATES, megaEligibleIds: MEGA_ELIGIBLE_IDS, ...overrides };
}

/** True when `subset` appears inside `sequence` in order. Deliberately not a set check. */
function isSubsequence(subset: readonly string[], sequence: readonly string[]): boolean {
  let cursor = 0;
  for (const id of subset) {
    while (cursor < sequence.length && sequence[cursor] !== id) cursor++;
    if (cursor === sequence.length) return false;
    cursor++;
  }
  return true;
}

function megaCountOf(ids: readonly string[]): number {
  const drawn = new Set(ids);
  return CANDIDATES.filter((entry) => entry.megaCapable && drawn.has(entry.id)).length;
}

/** How many of `ids` are in `eligible` — the figure `megaEligibleCount` must agree with. */
function eligibleCountOf(ids: readonly string[], eligible: readonly string[]): number {
  const allowed = new Set(eligible);
  return ids.filter((id) => allowed.has(id)).length;
}

/**
 * The ids left eligible once every forme of the `count` alphabetically-first Mega-capable
 * species is banned.
 *
 * Alphabetical rather than dex order because Pitfall 7 is about a contiguous BLOCK of
 * species whose every forme is gone, and the snapshot's own id order is the cheapest
 * reproducible way to name one. Every id is read from the roster, never constructed.
 */
function eligibleAfterBanning(count: number): string[] {
  const starved = new Set(
    [...CANDIDATES]
      .filter((entry) => entry.megaFormes.length > 0)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, count)
      .map((entry) => entry.id),
  );

  return MEGA_ELIGIBLE_IDS.filter((id) => !starved.has(id));
}

// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('gives the same ids for the same seed', () => {
    const first = drawPool(request({ size: 48, megasRequired: 0, seed: 1234 }));
    const second = drawPool(request({ size: 48, megasRequired: 0, seed: 1234 }));

    expect(first.ids).toEqual(second.ids);
  });

  it('gives the same ids for the same seed when a Mega quota is in play', () => {
    const input = request({ size: 48, megasRequired: 16, seed: 99 });

    expect(drawPool(input).ids).toEqual(drawPool(input).ids);
  });

  it('gives different ids for two different fixed seeds', () => {
    const first = drawPool(request({ size: 48, megasRequired: 0, seed: 1 }));
    const second = drawPool(request({ size: 48, megasRequired: 0, seed: 2 }));

    expect(first.ids).not.toEqual(second.ids);
  });
});

describe('shape of the result', () => {
  it('draws exactly the requested size at every configuration tested', () => {
    const configurations = [
      { size: 12, megasRequired: 0 },
      { size: 24, megasRequired: 4 },
      { size: 48, megasRequired: 0 },
      { size: 48, megasRequired: 32 },
      { size: 96, megasRequired: 8 },
      { size: 234, megasRequired: 0 },
    ];

    for (const configuration of configurations) {
      const result = drawPool(request({ seed: 7, ...configuration }));
      expect(result.ids, `size ${configuration.size}`).toHaveLength(configuration.size);
      expect(new Set(result.ids).size, `size ${configuration.size} distinct`).toBe(
        configuration.size,
      );
    }
  });

  it('emits the ids in the candidates order, never the shuffle order', () => {
    const result = drawPool(request({ size: 48, megasRequired: 16, seed: 4242 }));

    expect(isSubsequence(result.ids, CANDIDATE_IDS)).toBe(true);
  });

  it('has a subsequence check that a shuffled result actually fails', () => {
    // The guard on the guard. A set comparison would pass a reversed array, so this pins
    // that the assertion above is testing what it claims to.
    const result = drawPool(request({ size: 48, megasRequired: 0, seed: 5 }));

    expect(isSubsequence([...result.ids].reverse(), CANDIDATE_IDS)).toBe(false);
  });

  it('counts the drawn Mega-capable entries rather than echoing the quota', () => {
    const result = drawPool(request({ size: 96, megasRequired: 8, seed: 31 }));

    expect(result.megaCapableCount).toBe(megaCountOf(result.ids));
    expect(result.megaCapableCount).toBeGreaterThanOrEqual(8);
    // Stage 3 draws from a set that still holds unused Mega-capable entries, so the drawn
    // count is normally larger than the quota. This is D-09's recorded figure.
    expect(result.megaCapableCount).toBeGreaterThan(8);
  });

  it('advances the cursor by exactly one draw per selected entry', () => {
    expect(drawPool(request({ size: 48, megasRequired: 0, seed: 1 })).cursor).toBe(48);
    expect(drawPool(request({ size: 48, megasRequired: 16, seed: 1 })).cursor).toBe(48);
    expect(
      drawPool(request({ size: 48, megasRequired: 16, seed: 1, cursor: 100 })).cursor,
    ).toBe(148);
  });

  it('draws a different pool from the same seed at a different cursor', () => {
    const fresh = drawPool(request({ size: 48, megasRequired: 0, seed: 8 }));
    const resumed = drawPool(request({ size: 48, megasRequired: 0, seed: 8, cursor: 48 }));

    expect(resumed.ids).not.toEqual(fresh.ids);
  });
});

describe('the unconstrained default', () => {
  it('is a plain uniform draw when no Megas are required', () => {
    const result = drawPool(request({ size: 48, megasRequired: 0, seed: 77 }));

    expect(result.ids).toHaveLength(48);
    expect(isSubsequence(result.ids, CANDIDATE_IDS)).toBe(true);
    expect(result.megaCapableCount).toBe(megaCountOf(result.ids));
  });

  it('is still deterministic with no quota', () => {
    const input = request({ size: 48, megasRequired: 0, seed: 77 });

    expect(drawPool(input).ids).toEqual(drawPool(input).ids);
  });
});

describe('the Mega quota', () => {
  it('satisfies eight players requiring four Megas each on an Exact pool, promptly', () => {
    // The configuration rejection sampling cannot serve: it needs ~6.4 x 10^7 redraws and
    // it passes every feasibility blocker, so a host can reach it and would watch the tab
    // freeze. This must be effectively instant.
    const startedAt = Date.now();
    const result = drawPool(request({ size: 48, megasRequired: 32, seed: 2026 }));
    const elapsed = Date.now() - startedAt;

    expect(result.ids).toHaveLength(48);
    expect(result.megaCapableCount).toBeGreaterThanOrEqual(32);
    expect(elapsed).toBeLessThan(100);
  });

  it('can take every Mega-capable entry the roster has', () => {
    const result = drawPool(
      request({ size: 120, megasRequired: MEGA_CAPABLE_TOTAL, seed: 3 }),
    );

    expect(result.megaCapableCount).toBe(MEGA_CAPABLE_TOTAL);
    expect(result.ids).toHaveLength(120);
  });
});

describe('the Mega quota comes from ELIGIBLE species (Pitfall 7)', () => {
  it('agrees with the megaCapable flag while nothing is banned', () => {
    // The premise the unmoved fixtures rest on. If a regulation ever separates the flag
    // from the formes array this fails first, and every pinned id in this file is suspect.
    expect(MEGA_ELIGIBLE_IDS).toHaveLength(MEGA_CAPABLE_TOTAL);
    expect(new Set(MEGA_ELIGIBLE_IDS)).toEqual(
      new Set(CANDIDATES.filter((entry) => entry.megaCapable).map((entry) => entry.id)),
    );
  });

  it('still fills the quota when the first twenty Mega-capable species lose every forme', () => {
    // Partitioning on `entry.megaCapable` fills the quota from species that can no longer
    // Mega at all: the pool passes every check, the Mega round opens with an empty offer,
    // and the compiler removed the runtime validator that used to catch it. The gate and
    // this partition together are the whole guarantee.
    const eligible = eligibleAfterBanning(20);
    const players = 8;
    const perTeam = 4;

    const result = drawPool(
      request({
        size: 48,
        megasRequired: players * perTeam,
        megaEligibleIds: eligible,
        seed: 5150,
      }),
    );

    expect(result.ids).toHaveLength(48);
    expect(eligibleCountOf(result.ids, eligible)).toBeGreaterThanOrEqual(players * perTeam);
    expect(result.megaEligibleCount).toBe(eligibleCountOf(result.ids, eligible));
  });

  it('draws NONE of a starved species into the quota, at a quota that fills the stratum', () => {
    const eligible = eligibleAfterBanning(20);
    const starved = new Set(MEGA_ELIGIBLE_IDS.filter((id) => !eligible.includes(id)));

    // The quota is the whole remaining eligible stratum, so stage 2 takes every one of
    // them — and any starved species in the result can only have come from stage 3.
    const result = drawPool(
      request({
        size: eligible.length + 10,
        megasRequired: eligible.length,
        megaEligibleIds: eligible,
        seed: 61,
      }),
    );

    expect(result.megaEligibleCount).toBe(eligible.length);
    expect(starved.size).toBe(20);
  });

  it('counts megaEligibleCount and megaCapableCount as two different numbers', () => {
    const eligible = eligibleAfterBanning(30);
    const result = drawPool(
      request({ size: 96, megasRequired: 16, megaEligibleIds: eligible, seed: 31 }),
    );

    expect(result.megaEligibleCount).toBe(eligibleCountOf(result.ids, eligible));
    // `megaCapableCount` keeps counting the FLAG — D-11's pre-ban upper bound and the
    // figure `pool/built` records, which is why it is larger here.
    expect(result.megaCapableCount).toBe(megaCountOf(result.ids));
    expect(result.megaCapableCount).toBeGreaterThan(result.megaEligibleCount);
  });

  it('is still deterministic and still a subsequence with a starved eligibility list', () => {
    const eligible = eligibleAfterBanning(20);
    const input = request({
      size: 48,
      megasRequired: 32,
      megaEligibleIds: eligible,
      seed: 909,
    });

    expect(drawPool(input).ids).toEqual(drawPool(input).ids);
    expect(isSubsequence(drawPool(input).ids, CANDIDATE_IDS)).toBe(true);
  });
});

describe('the caller keeps its input', () => {
  it('does not mutate the candidates array or its entries', () => {
    const before = JSON.stringify(CANDIDATES);
    drawPool(request({ size: 48, megasRequired: 16, seed: 61 }));

    expect(JSON.stringify(CANDIDATES)).toBe(before);
  });
});

describe('refusing an impossible request', () => {
  it('surfaces the generator RangeError rather than clamping the size', () => {
    expect(() =>
      drawPool(request({ size: CANDIDATES.length + 1, megasRequired: 0, seed: 1 })),
    ).toThrow(RangeError);
  });

  it('surfaces a RangeError when the quota outruns the ELIGIBLE entries, not the capable ones', () => {
    const eligible = eligibleAfterBanning(20);

    // Still comfortably inside `MEGA_CAPABLE_TOTAL`. Partitioning on the flag would draw
    // this happily and hand back a pool that starves the Mega rounds.
    expect(eligible.length).toBeLessThan(MEGA_CAPABLE_TOTAL);
    expect(() =>
      drawPool(
        request({
          size: 120,
          megasRequired: eligible.length + 1,
          megaEligibleIds: eligible,
          seed: 1,
        }),
      ),
    ).toThrow(RangeError);
  });

  it('surfaces a RangeError when the Mega quota outruns the Mega-capable entries', () => {
    expect(() =>
      drawPool(request({ size: 120, megasRequired: MEGA_CAPABLE_TOTAL + 1, seed: 1 })),
    ).toThrow(RangeError);
  });
});
