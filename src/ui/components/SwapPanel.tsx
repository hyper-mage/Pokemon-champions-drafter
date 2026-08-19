import './SwapPanel.css';

/**
 * The pool pane during a dedicated swap round — SWAP-03, SWAP-07, 03-UI-SPEC §11.
 *
 * ## It decides nothing
 *
 * The budget, the order, whose turn it is and whether the tournament is finished are all
 * selector answers that arrive as props. This component composes four sentences and renders
 * one button. That is the same contract `CompletedDraft` has for the same slot — it
 * replaces the pool pane's content and nothing else, taking selector output in and handing
 * callbacks out — and it is what keeps the swap-round rules in `src/core` where
 * `npm run check:pure` can see them.
 *
 * ## There is ONE swap flow, not two
 *
 * This panel is what the pool pane holds UNTIL a slot is armed. Arming one switches the
 * pane back to `PoolGrid` in exactly the surface 03-UI-SPEC §10 specifies — the same
 * component, the same offer, the same confirm — with `swapRound` set to the round in
 * progress rather than to `0`. So this file contains no grid, no offer and no confirm, and
 * a second swap flow is not something a reader has to check for: there is nowhere here for
 * one to live.
 *
 * ## `Pass this swap` does not confirm
 *
 * 03-UI-SPEC §11 is explicit, and the reason is the one §12 gives for why a swap DOES
 * confirm: a confirm buys the host a second look at something that is about to be lost.
 * Nothing is lost by passing — the budget is untouched (D-29), the teams are unchanged, and
 * `Undo last move` takes the pass back as a recorded action rather than as an absence
 * (SWAP-07). A dialog here would be a question with no stake, on the control every player
 * presses at least once.
 *
 * No accent fill either. 03-UI-SPEC keeps accent to exactly three uses and the draft screen
 * spends none of them on a button; this is a secondary control, styled as
 * `ConfigScreen`'s `Reroll pool` is.
 */

/**
 * Verbatim from 03-UI-SPEC's copywriting table, except for the plural agreement.
 *
 * The spec writes the budget slot literally as `{playerName} has {n} swaps left.`, which
 * renders `Ada has 1 swaps left.` — and one remaining swap is the common case rather than
 * an edge, because `swapBudget: 1` is the most likely setting a host picks and every budget
 * passes through 1 on its way to being spent. `confirm-copy.ts` has carried helpers for
 * exactly this class of slot since Phase 1, and 03-10 gave the §10 pool-header line the
 * same treatment; this is the §11 line deferred item 6 addressed to this plan.
 *
 * The helper is IMPORTED rather than copied a third time. Two private copies of one plural
 * rule were already one too many.
 */
import { swaps } from '../confirm-copy';

export const PASS_LABEL = 'Pass this swap';

/**
 * The pending-export sentence — D-31, and the other half of the export gate.
 *
 * The gate itself is `selectIsTournamentComplete` in `app.tsx`, which is what actually
 * withholds the panels. This sentence is what stops that being a mystery: a host who
 * finished the last pick and expected exports is told, on the surface they are looking at,
 * why they are not there and what makes them appear.
 */
export const EXPORTS_PENDING =
  'Teams are not final until the swap rounds finish. Exports open then.';

function heading(swapRound: number, swapRounds: number): string {
  return `Swap round ${swapRound} of ${swapRounds}`;
}

function budgetLine(playerName: string, remaining: number): string {
  return remaining === 0
    ? `${playerName} has no swaps left — pass to continue.`
    : `${playerName} has ${swaps(remaining)} left.`;
}

function instruction(playerName: string): string {
  return `Choose one of ${playerName}'s slots to swap, or pass.`;
}

export interface SwapPanelProps {
  /** 1-based dedicated swap round in progress — `selectCurrentSwapRound`'s answer. */
  swapRound: number;
  /** `config.swapRounds`, never a literal. */
  swapRounds: number;
  /** The player the swap-round clock names. Core holds ids; this is the resolved name. */
  playerName: string;
  /**
   * `selectSwapsRemaining` for that player.
   *
   * At `0` the panel says so and the instruction is dropped, because there is nothing to
   * instruct: the board's cells are not buttons either, which `app.tsx` arranges through
   * the same selector. One number, two surfaces, no way for them to disagree.
   */
  remaining: number;
  onPass: () => void;
}

export function SwapPanel({
  swapRound,
  swapRounds,
  playerName,
  remaining,
  onPass,
}: SwapPanelProps) {
  return (
    <section class="swap-panel" aria-labelledby="swap-panel-heading">
      <h2 id="swap-panel-heading" class="swap-panel__heading">
        {heading(swapRound, swapRounds)}
      </h2>

      <p class="swap-panel__budget">{budgetLine(playerName, remaining)}</p>

      {/*
        Dropped at zero budget rather than reworded. The zero-budget sentence above already
        says what to do next — "pass to continue" — and following it with an instruction to
        choose a slot would name an action this player cannot take.
      */}
      {remaining > 0 && <p class="swap-panel__instruction">{instruction(playerName)}</p>}

      <button type="button" class="swap-panel__pass" onClick={onPass}>
        {PASS_LABEL}
      </button>

      {/*
        Last, and muted. It is the least urgent thing on the panel — a fact about what has
        not happened yet — and putting it above the control would make every player read it
        on every turn before reaching the button they came for.
      */}
      <p class="swap-panel__pending">{EXPORTS_PENDING}</p>
    </section>
  );
}
