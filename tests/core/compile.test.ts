/**
 * compile — RULE-02. The rule list becomes a round schedule, once, before the first pick.
 *
 * The property this file exists to pin is TOTALITY. `compile` is the step between a host's
 * numbers and a document that can be drafted against, and it runs on a config the
 * feasibility gate may already have blocked — the host is still typing. A compiler that
 * threw on `count: 9` at six rounds would turn a blocked config into a crashed screen, and
 * the blocked config is the ordinary case rather than the exceptional one. So every case
 * below asserts an ANSWER, and several assert the absence of a throw explicitly.
 *
 * The second property is that nothing here knows the round count. `compile(rules, 4)` is
 * asserted beside `compile(rules, 6)` and `compile(rules, 8)` so a literal six cannot hide
 * in the module and pass a six-round suite.
 *
 * Zero mocks, as everywhere in `src/core` — there is nothing ambient to stub. Default
 * environment is `node`.
 */

import { describe, expect, it } from 'vitest';

import type { RoundKind } from '../../src/core/actions';
import { compile } from '../../src/core/compile';
import type { CompositionRule } from '../../src/core/model';

/** The shape every assertion below reads: kinds in position order. */
function kindsOf(rules: readonly CompositionRule[], rounds: number): RoundKind[] {
  return compile(rules, rounds).map((spec) => spec.kind);
}

const M = 'mega' as const;
const O = 'open' as const;

describe('compile turns a rule list into a round schedule', () => {
  const cases: ReadonlyArray<{
    name: string;
    rules: CompositionRule[];
    rounds: number;
    expected: RoundKind[];
  }> = [
    {
      name: 'two Megas over six rounds — Mega rounds first, the canonical order',
      rules: [{ kind: 'mega', count: 2 }],
      rounds: 6,
      expected: [M, M, O, O, O, O],
    },
    {
      name: 'no Megas required — every round is open',
      rules: [{ kind: 'mega', count: 0 }],
      rounds: 6,
      expected: [O, O, O, O, O, O],
    },
    {
      name: 'a Mega in every round — every round is a Mega round',
      rules: [{ kind: 'mega', count: 6 }],
      rounds: 6,
      expected: [M, M, M, M, M, M],
    },
    {
      name: 'no rules at all — every round is open',
      rules: [],
      rounds: 6,
      expected: [O, O, O, O, O, O],
    },
    {
      name: 'one Mega over four rounds — the round count is the argument, never a literal',
      rules: [{ kind: 'mega', count: 1 }],
      rounds: 4,
      expected: [M, O, O, O],
    },
    {
      name: 'three Megas over eight rounds',
      rules: [{ kind: 'mega', count: 3 }],
      rounds: 8,
      expected: [M, M, M, O, O, O, O, O],
    },
    {
      name: 'two mega rules sum rather than the last one winning',
      rules: [
        { kind: 'mega', count: 1 },
        { kind: 'mega', count: 2 },
      ],
      rounds: 6,
      expected: [M, M, M, O, O, O],
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(kindsOf(testCase.rules, testCase.rounds)).toEqual(testCase.expected);
    });
  }

  it('emits exactly `rounds` specs at every round count it is given', () => {
    for (const rounds of [1, 2, 4, 6, 8, 12]) {
      expect(compile([{ kind: 'mega', count: 2 }], rounds)).toHaveLength(rounds);
    }
  });
});

describe('compile is total — it answers rather than throws', () => {
  it('clamps a count larger than the round count instead of throwing', () => {
    // `megasExceedRounds` in feasibility.ts is the gate that blocks this config. The
    // compiler is not a second authority on satisfiability: it is called while the host
    // is still typing, and a throw here is a blank screen rather than a blocked Start.
    expect(() => compile([{ kind: 'mega', count: 9 }], 6)).not.toThrow();

    const schedule = compile([{ kind: 'mega', count: 9 }], 6);
    expect(schedule).toHaveLength(6);
    expect(schedule.map((spec) => spec.kind)).toEqual([M, M, M, M, M, M]);
  });

  it('treats a negative count as no requirement rather than throwing', () => {
    expect(() => compile([{ kind: 'mega', count: -1 }], 6)).not.toThrow();
    expect(kindsOf([{ kind: 'mega', count: -1 }], 6)).toEqual([O, O, O, O, O, O]);
  });

  it('returns an empty schedule for a round count that cannot lay one out', () => {
    expect(compile([{ kind: 'mega', count: 2 }], 0)).toEqual([]);
    expect(compile([{ kind: 'mega', count: 2 }], -3)).toEqual([]);
  });
});

describe('compile output is positionally consistent', () => {
  it('numbers every spec from 1 and in agreement with its array position', () => {
    // 03-02's structural guard pins `rounds[i].index === i + 1`, and a compiler that
    // disagreed with its own guard would refuse the schedule it just produced.
    for (const rounds of [1, 4, 6, 8, 12]) {
      const schedule = compile([{ kind: 'mega', count: 3 }], rounds);
      schedule.forEach((spec, position) => {
        expect(spec.index, `rounds=${rounds} position=${position}`).toBe(position + 1);
      });
    }
  });

  it('returns a fresh array of fresh records on every call', () => {
    const first = compile([{ kind: 'mega', count: 2 }], 6);
    const second = compile([{ kind: 'mega', count: 2 }], 6);

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(first).toEqual(second);
  });

  it('does not read or write the rule list it was handed', () => {
    const rules: CompositionRule[] = [{ kind: 'mega', count: 2 }];
    const before = JSON.parse(JSON.stringify(rules)) as CompositionRule[];

    compile(rules, 6);

    expect(rules).toEqual(before);
  });
});
