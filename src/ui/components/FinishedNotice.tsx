import type { DraftState } from '../../core/model';
import { selectTournamentLocked } from '../../core/tournament';

import './FinishedNotice.css';

/**
 * The finished tournament's sentence, and the one way back out of it — TOUR-06, D-17,
 * `05-UI-SPEC` §10.
 *
 * ## Why this is a NEW component and not a `ReadOnlyBanner` variant
 *
 * The component inventory rules it directly: "`ReadOnlyBanner` means *another tab owns
 * this document*; making one banner mean three different things is how a sentence stops
 * being trusted." The two say different things about different facts and offer different
 * actions, and they can be on screen together — a read-only tab looking at a finished
 * tournament is an ordinary state, not a contradiction. One component branching on which
 * of two unrelated conditions raised it would be a sentence the host has to read twice
 * before knowing which world they are in.
 *
 * What IS copied is the shape, deliberately: one sentence, `role="status"`, one action,
 * `--color-surface-raised`, no colour signal. A host who has learned to read one bar has
 * learned to read this one.
 *
 * ## Not danger-coloured, and that is the same argument one fact along
 *
 * §Color: "A locked (finished) tournament is not danger-coloured either. Nothing is wrong;
 * the night finished." `ReadOnlyBanner` carries the original — read-only is emphatically
 * not a *danger* state, another tab simply got there first — and the reservation only
 * works while it is scarce. `--color-danger` belongs to the three surfaces that discard
 * something with no way back, and a finished tournament discards nothing: every result is
 * still on screen, still exported, and one confirmed click from being editable again.
 *
 * ## Locked is a fold, so this component asks rather than remembers
 *
 * `selectTournamentLocked` is a final recorded with no later `tournament/reopened`. It
 * survives a reload, travels with an exported JSON, cannot be disagreed about by two tabs
 * and cannot be claimed falsely by an imported document — none of which would be true of a
 * flag. This file therefore holds no state at all: it asks on every render, which is also
 * what makes undoing a reopen put the notice back with nothing here to reset.
 *
 * ## The confirm's words are NOT here
 *
 * `REOPEN_CONFIRM` in `confirm-copy.ts` owns the heading, the body and both button labels,
 * and the dialog itself is raised by `app.tsx` — a SIBLING of the read-only gate, because
 * `inert` applies to a whole subtree and a modal inside it would trap focus in a panel
 * that refuses its own dismiss the instant another tab took the lock. Restating any of
 * those four strings here would give one dialog two copies of its own words.
 */

/**
 * Verbatim from `05-UI-SPEC` §Copywriting → Finished and reopen.
 *
 * Module constants rather than inline JSX prose, on `ReadOnlyBanner`'s stated rule: JSX
 * collapses whitespace between text lines and these are contracts down to the full stop.
 *
 * `FINISHED_SENTENCE` is declared HERE and imported by `ResultsGrid`, which states the
 * same fact above the crosstable. One declaration on `FINISHED_CELL_REASON`'s precedent —
 * two literals would be two things that can be reworded once.
 */
export const FINISHED_SENTENCE = 'This tournament is finished. Results are read-only.';
export const REOPEN_LABEL = 'Reopen this tournament';

export interface FinishedNoticeProps {
  state: DraftState;
  /**
   * The host asked to reopen. The CALLER raises the confirm — see the doc block.
   *
   * Nothing is dispatched from here, and that is the codebase's standing split rather than
   * a nicety: a component reports an intent and `dispatch` in `src/store.ts` stays the one
   * write path.
   */
  onRequestReopen: () => void;
}

export function FinishedNotice({ state, onRequestReopen }: FinishedNoticeProps) {
  if (!selectTournamentLocked(state)) return null;

  return (
    <div class="finished-notice">
      {/*
        `role="status"` rather than `role="alert"`, on `ReadOnlyBanner`'s reasoning: the
        night finishing is a state to be told about, not an emergency to be interrupted
        for. It is also the one thing on this screen that changes without the host having
        looked at it — the final is recorded in a dialog, and the notice appears behind it.
      */}
      <p class="finished-notice__text" role="status">
        {FINISHED_SENTENCE}
      </p>

      <button type="button" class="finished-notice__action" onClick={onRequestReopen}>
        {REOPEN_LABEL}
      </button>
    </div>
  );
}
