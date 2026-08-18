/**
 * compile.ts — RULE-02. The one place a rule set becomes a round schedule.
 *
 * ## The decision: composition requirements are compiled, never checked after a pick
 *
 * A host says "two Megas per team". There are two ways to honour that, and this file is
 * the commitment to one of them. The rejected way is to let anyone pick anything and then
 * refuse the last pick that would leave a team short — a runtime validator that has to
 * explain, in round six, that a choice made in round two is now the problem. The way taken
 * here is to turn the requirement into the SHAPE of the draft before it starts: two of the
 * six rounds ARE Mega rounds, every player fills them, and no pick can ever violate a
 * requirement because no pick is ever offered that would (D-01).
 *
 * That is why this module runs at config time and why the result is materialized into the
 * log rather than recomputed. Downstream, nothing validates composition: the Mega-round
 * pool filter, the swap predicate and the export stone all read the round's KIND and
 * nothing re-derives a requirement. A second authority on what a team must contain is a
 * second thing that can disagree with this one.
 *
 * ## Canonical order: Mega rounds first
 *
 * `[{ kind: 'mega', count: k }]` at `R` rounds yields `'mega'` for indices `1..k` and
 * `'open'` for the rest. Any deterministic order satisfies RULE-02 equally
 * (03-RESEARCH assumption A1) — this one is a DEFAULT rather than a rule, and the host
 * permutes it on the config screen (RULE-06). First is chosen because the reorder control
 * reads top-down, and because the constrained rounds are the ones a table plans around: a
 * schedule that opens with its hard rounds is the one a group can read at a glance.
 *
 * ## Total, pure, and never throwing
 *
 * `compile` takes whatever it is handed and emits `rounds` specs. A count larger than the
 * round count is `megasExceedRounds`'s problem (`feasibility.ts`), not this function's.
 * That split matters because this runs while the host is still typing, against a config
 * the gate may already have blocked — a compiler that threw on an over-count would turn a
 * blocked Start into a blank screen, and the blocked config is the ordinary case here
 * rather than the exceptional one.
 *
 * Pure, like everything under `src/core`: no clock, no randomness, no roster, no ambient
 * read of any kind. Both arguments arrive already decided, and the returned array is
 * freshly built so a caller cannot mutate a schedule through it.
 */

import type { RoundKind, RoundSpec } from './actions';
import type { CompositionRule } from './model';

/** The canonical order in one expression: the first `megaRounds` positions are Mega rounds. */
function kindAt(position: number, megaRounds: number): RoundKind {
  return position < megaRounds ? 'mega' : 'open';
}

/**
 * The rule list as a round schedule: `rounds` specs, indices contiguous from 1.
 *
 * Never throws and never returns a length other than `rounds` (or an empty array when
 * `rounds` is not a layout a schedule can have). The Mega count is clamped into
 * `[0, rounds]` FOR LAYOUT ONLY — the clamp is how an unsatisfiable number is represented
 * on screen, never a repair of the config, which keeps its own value and keeps failing the
 * feasibility gate until the host lowers it.
 */
export function compile(rules: readonly CompositionRule[], rounds: number): RoundSpec[] {
  const total = Number.isSafeInteger(rounds) && rounds > 0 ? rounds : 0;

  let required = 0;
  for (const rule of rules) {
    // A kind this build has no compiler for contributes nothing rather than throwing —
    // the same posture `apply` takes toward an action type it has never heard of. The
    // import guard already refuses such a rule at the untrusted boundary (T-03-02).
    if (rule.kind !== 'mega') continue;
    if (!Number.isSafeInteger(rule.count)) continue;
    required += rule.count;
  }

  const megaRounds = Math.min(Math.max(required, 0), total);

  return Array.from({ length: total }, (_, position): RoundSpec => ({
    index: position + 1,
    kind: kindAt(position, megaRounds),
  }));
}
