import type { FeasibilityResult } from '../../core/feasibility';

import './FeasibilityBar.css';

/**
 * The pinned bar at the foot of the config screen — RULE-07, 02-UI-SPEC §5.
 *
 * ## It renders a result and computes nothing
 *
 * `problems` arrives already sorted by the declared precedence order, so `problems[0]` is
 * the reason to show and there is no comparison to make here. The extra-blocker count is
 * arithmetic over what it was handed, not a second opinion about what is satisfiable.
 * `src/core/feasibility.ts` is the single authority; a component that re-derived any part
 * of that answer would be a second one, and two authorities on the same question is how a
 * host ends up arguing with an input box.
 *
 * ## `aria-disabled` WITHOUT native `disabled` — deliberate, do not "fix" it
 *
 * A natively disabled button is not focusable, so a keyboard user could never reach the
 * explanation — and the explanation is the entire point of RULE-07. So `Start draft` takes
 * `aria-disabled` alone, stays in the tab order, and its click handler returns early.
 *
 * This is deliberately UNLIKE `TopBar`'s undo button, which takes the native attribute and
 * is correct to: undo's disabled state needs no explanation, and Start's is nothing but an
 * explanation. The asymmetry between the two buttons is the design, not an oversight.
 *
 * ## The reason region announces itself
 *
 * The reason element is a polite status region in its own right, and there is NO call to
 * `announce`. A surface-local status region is the sanctioned second form for exactly this
 * case; routing it through the global live region as well would have the two competing to
 * describe the same change, and a gate that recomputes on every keystroke would flood it.
 *
 * The comments here describe the attributes rather than quoting them, following the
 * repository pattern the density work established: the acceptance checks for this file are
 * plain text searches, and a doc block that quotes what it is explaining makes the gate
 * match its own documentation.
 *
 * A blocked Start is not danger-coloured. Nothing has been lost — it is a not-yet state —
 * so the reason renders in `--color-text` (02-UI-SPEC §Destructive reserved for).
 */

/**
 * The reason element's id, and the id the Start button names as its description.
 *
 * A module constant rather than a generated id because there is exactly one feasibility
 * bar per screen — it is pinned, and a second one would be two answers to one question.
 */
const REASON_ID = 'feasibility-reason';

/**
 * Verbatim from 02-UI-SPEC §Copywriting Contract → Feasibility reasons.
 *
 * Not praise and not a checkmark: it restates the configuration so the host can read it
 * back before committing to it. `Numbers, not adjectives` is the phase's copy rule and
 * this is the sentence it was written for.
 */
function allClearMessage(players: number, rounds: number, poolSize: number): string {
  return `${players} players, ${rounds} rounds, ${poolSize} Pokémon in the pool.`;
}

/**
 * The count of blockers the bar is NOT showing.
 *
 * `{n} other problems also block the start.` is verbatim from the copy table, including
 * the bare plural that reads "1 other problems" at exactly one hidden blocker. Same
 * posture `src/core/feasibility.ts` records for `after 1 bans`: the copy table is the
 * thing to amend, and a component that pluralised it here would put the two out of
 * agreement without settling which one is right.
 */
function otherProblemsMessage(count: number): string {
  return `${count} other problems also block the start.`;
}

export interface FeasibilityBarProps {
  result: FeasibilityResult;
  /**
   * The three numbers the all-clear sentence restates.
   *
   * They are not derivable from `FeasibilityResult` — it reports what is wrong, not what
   * was asked for — so they arrive beside it rather than being recovered from a message.
   * `poolSize` is nullable because 02-05's free override can be empty; that case is
   * always a blocking problem, so it never reaches the all-clear.
   */
  players: number;
  rounds: number;
  poolSize: number | null;
  onStart: () => void;
}

export function FeasibilityBar({
  result,
  players,
  rounds,
  poolSize,
  onStart,
}: FeasibilityBarProps) {
  const shown = result.problems[0];
  const blockerCount = result.problems.filter(
    (problem) => problem.severity === 'blocking',
  ).length;
  const others = Math.max(0, blockerCount - 1);

  // An empty string is unreachable: `poolSize === null` IS a blocking problem
  // (`poolSizeNotAnInteger`), so `shown` is defined whenever it holds. The branch exists
  // because the compiler cannot see that, and an invented `0` in a sentence the host reads
  // would be worse than the empty region this can never actually render.
  const message =
    shown !== undefined
      ? shown.message
      : poolSize === null
        ? ''
        : allClearMessage(players, rounds, poolSize);

  function handleStart(): void {
    // The early return IS the refusal. See the divergence note in the doc block: the
    // native `disabled` attribute would refuse the click and the explanation together.
    if (result.blocked) return;
    onStart();
  }

  return (
    <div class="feasibility-bar">
      <button
        type="button"
        class="feasibility-bar__start"
        aria-disabled={result.blocked ? 'true' : undefined}
        aria-describedby={REASON_ID}
        onClick={handleStart}
      >
        Start draft
      </button>

      <div class="feasibility-bar__reason">
        <p class="feasibility-bar__message" id={REASON_ID} role="status">
          {message}
        </p>

        {/*
          Outside the status region, not inside it. The region's text is the one reason
          the host is being asked to act on, and folding a count into it would make the
          announcement grow every time a second field went wrong.
        */}
        {others > 0 && <p class="feasibility-bar__others">{otherProblemsMessage(others)}</p>}
      </div>
    </div>
  );
}
