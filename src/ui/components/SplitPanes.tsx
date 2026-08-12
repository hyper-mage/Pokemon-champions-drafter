import type { ComponentChildren } from 'preact';

import type { PaneState } from '../../adapters/view-prefs';
import { announce } from './LiveRegion';

import './SplitPanes.css';

/**
 * The two-pane draft shell — the pool and the board, on screen together, always.
 *
 * ROADMAP criterion 5 says the board is visible "at every moment", and this component is
 * the whole of that promise. There is no tab, no accordion and no toggle here: both
 * children are in the document at once and each side scrolls inside its own track. What
 * an expand button changes is the RATIO, never the membership.
 *
 * That last sentence is enforced by `side()` below rather than merely asserted here. A
 * collapsed side keeps its children mounted and hides the track from CSS, so any state
 * they own survives the toggle — which is what a reader who believes this paragraph will
 * assume, and what the component did not do until the assumption was checked.
 *
 * It renders no heading and no chrome for its children. `PoolGrid` and `BoardGrid` keep
 * their own headings and their own roots, and the pool root keeps the density attribute
 * 02-03 put on it — deliberately not repeated on the pane wrapper here, because a density
 * declared in two places is a density that can be set in one of them.
 *
 * It does not write storage either. Every change is reported through `onPaneChange`, and
 * the screen that owns the preference decides what to persist. A component that both
 * reported a change and wrote it would give the caller two sources of truth about one
 * value, and the one it wrote would be the one nobody was rendering.
 */

// Verbatim from 02-UI-SPEC's copywriting contract. Held as constants, not written inline,
// because JSX collapses whitespace between text lines and these are contracts (S-5).
const EXPAND_POOL_LABEL = 'Expand the pool';
const EXPAND_BOARD_LABEL = 'Expand the draft board';
const RESTORE_POOL_LABEL = 'Show the pool';
const RESTORE_BOARD_LABEL = 'Show the draft board';

const POOL_EXPANDED_MESSAGE = 'Pool expanded to full width.';
const BOARD_EXPANDED_MESSAGE = 'Draft board expanded to full width.';
const SPLIT_MESSAGE = 'Pool and draft board shown side by side.';

export interface SplitPanesProps {
  /** 'split' | 'pool' | 'board' — the value from `src/adapters/view-prefs.ts`. */
  pane: PaneState;
  onPaneChange: (pane: PaneState) => void;
  /**
   * False while a draft is in progress: the pool pane's expand button is not rendered,
   * because `pool-full` would put the board behind a toggle and fail criterion 5
   * (02-UI-SPEC §A tension in the locked set).
   */
  poolExpandable: boolean;
  pool: ComponentChildren;
  board: ComponentChildren;
}

export function SplitPanes({ pane, onPaneChange, poolExpandable, pool, board }: SplitPanesProps) {
  function change(next: PaneState, message: string): void {
    onPaneChange(next);
    announce(message);
  }

  const poolExpanded = pane === 'pool';
  const boardExpanded = pane === 'board';

  /**
   * One side, in one of its two shapes — and it is ONE SUBTREE in both of them.
   *
   * `collapsed` narrows the pane to a strip and swaps the control in its chrome for the
   * one that brings the other side back; the children go on rendering either way, and CSS
   * hides the track. That is not a stylistic preference: unmounting them discarded the
   * pool's ephemeral state, which `PoolGrid` owns and which includes the host's search
   * text and type filters. A host who narrowed the pool to Fire, expanded the board to
   * check a rival's team and came back found their filters gone with no announcement —
   * D-35's contract is that a PICK clears filters, and a layout toggle is not a pick.
   *
   * So the membership promise in this file's header is now a property of the markup
   * rather than a description of it. `pane--collapsed` is the whole of the difference.
   *
   * The pane that is currently expanded carries no control of its own — the restore lives
   * on the collapsed strip, where the missing content is, and two buttons saying the same
   * thing on one screen is how a host learns to stop reading either.
   */
  function side(
    key: 'pool' | 'board',
    collapsed: boolean,
    children: ComponentChildren,
    expandLabel: string,
    restoreLabel: string,
    expandedMessage: string,
    expandable: boolean,
  ) {
    // Expanded here means "this side has the whole width", which is exactly when the
    // other side is collapsed and already offers the way back.
    const isFullWidth = pane === key;

    return (
      <section class={collapsed ? 'pane pane--collapsed' : 'pane'} data-side={key}>
        {/*
          The chrome sits OUTSIDE the scroll container on purpose. A control positioned
          inside a scrolling region scrolls away with the content, and this button is the
          answer to "what is that one" (D-21) — the thing a host reaches for exactly when
          they are deep in a long pool and cannot tell two sprites apart.
        */}
        <div class="pane__chrome">
          {collapsed ? (
            <button
              type="button"
              class="pane__button"
              onClick={() => change('split', SPLIT_MESSAGE)}
            >
              {restoreLabel}
            </button>
          ) : (
            !isFullWidth &&
            expandable && (
              <button
                type="button"
                class="pane__button"
                onClick={() => change(key, expandedMessage)}
              >
                {expandLabel}
              </button>
            )
          )}
        </div>

        <div class="pane__scroll">{children}</div>
      </section>
    );
  }

  return (
    <div class="draft-panes" data-pane={pane}>
      {/*
        DOM order is pool then board, and it equals visual order at every state and every
        width. No CSS reordering anywhere in SplitPanes.css, so WCAG 1.3.2 and 2.4.3 hold
        without an argument — see that file's responsive comment for the one place
        02-UI-SPEC asks for the opposite and why this order wins.
      */}
      {side(
        'pool',
        boardExpanded,
        pool,
        EXPAND_POOL_LABEL,
        RESTORE_POOL_LABEL,
        POOL_EXPANDED_MESSAGE,
        // The one asymmetry between the two sides, and it is scoped rather than structural.
        poolExpandable,
      )}

      {side(
        'board',
        poolExpanded,
        board,
        EXPAND_BOARD_LABEL,
        RESTORE_BOARD_LABEL,
        BOARD_EXPANDED_MESSAGE,
        true,
      )}
    </div>
  );
}
