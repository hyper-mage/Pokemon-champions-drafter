import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

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
 * The AVAILABILITY of an expand is carried by the control's STATE, not by its presence.
 * An unavailable expand renders inert — `aria-disabled`, a visible reason beside it, and
 * a refused click — rather than being omitted. 02-UI-SPEC section 8 item 3: a control
 * that appears and disappears is worse on a shared screen than one that is predictably
 * inert. The pool expand was the one control in this phase handled by omission, and a
 * host read the empty chrome slot as a broken render.
 *
 * None of which makes this component an authority on WHICH states are available. It holds
 * no opinion at all: `expandable` remains the sole input, and the parent remains the only
 * place the rule is decided. What changed is how a `false` is communicated, not who
 * decides it.
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
 *
 * ## Which screen states offer which panes — the scoping table, kept here for reading only
 *
 * This component decides none of it; the rows below say who does. They are recorded here
 * because this is the file a reader opens when they want to know why an expand is inert,
 * and a table split across four call sites is a table nobody checks.
 *
 * | Screen state          | States available   | Coercion                                    |
 * |-----------------------|--------------------|---------------------------------------------|
 * | Draft, picking        | all three          | none                                        |
 * | Draft, cards in play  | `split`            | both expands inert, `CARD_PHASE_EXPAND_REASON` |
 * | Swap round            | `split`            | both expands inert, `SWAP_ROUND_EXPAND_REASON` |
 * | Draft complete        | all three          | none                                        |
 * | **Snake ban stage**   | `split`, `board`   | a stored `pool` → `split`, SILENTLY — same as picking. `BanStageScreen` applies it, not `app.tsx`, because `app.tsx`'s coercion reads the DRAFT's availability and `selectPhase` answers `'cards'` at the ban stage. |
 * | **Blind ban stage**   | **none — no panes are mounted at all** | **the stored preference is neither read nor written.** It must survive the stage untouched so the draft opens in the state the host chose. `BanStageScreen`'s blind arm states the same rule at the site, because a thing a file does NOT do is invisible in the file. |
 *
 * The two ban rows are 04-UI-SPEC Amendment 2, extending 03-UI-SPEC Amendment 3 above them.
 * Blind's locked and reveal screens use `.app-shell`, not `.draft-shell`: they are
 * read-and-act screens like the landing screen rather than two-pane working screens, so
 * there is nothing here for them to scope.
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

/**
 * Why the pool's expand is inert while a draft runs.
 *
 * No trailing period: it is a fragment annotating a control, the same shape as the
 * `— Not yet available` suffix the ban-mode options carry.
 *
 * --- WHERE THE EM DASH LIVES, AS A RULE RATHER THAN A CONVENIENCE ---
 *
 * The separator is NOT part of this string, and it is no longer generated by CSS either. It
 * used to be `content: '— '` on `.pane__reason::before`, which left half of a visible line in
 * a stylesheet that no test read: changing it to a hyphen, an en dash, or nothing at all
 * altered shipped copy with the suite staying green (WR-03).
 *
 * A separator BETWEEN TWO SIBLING ELEMENTS is markup. It renders below as a nested span
 * marked `aria-hidden`, which keeps it out of the computed accessible description this
 * element supplies through `aria-describedby` and puts it under the same test as the copy
 * beside it.
 *
 * A separator INSIDE ONE CONTROL'S OWN ACCESSIBLE NAME is part of the string.
 * `ConfigScreen.tsx:157`'s `Blind — Not yet available` is one label with a suffix, not two
 * elements, so there is nothing for a sibling to be hidden from.
 *
 * WR-03's finding was that this repo carried two conventions for one pattern. The resolution
 * is that they were two patterns: one rule, applied to each, and neither shape leaves copy
 * untested.
 *
 * The constant itself is unchanged by a single byte, which is the point — it stays identical
 * to 02-UI-SPEC's Phase 2 string table and to the exact-equality assertion in
 * `draft-panes.test.tsx`.
 */
const POOL_EXPAND_REASON = 'Available once the draft is complete';

/**
 * Whether a side's expand is available and, when it is not, why — as ONE value, because it
 * is one fact.
 *
 * These were two independent parameters: an `expandable` boolean, and a nullable `reason`
 * string. The pair `(false, null)` compiled, and it rendered an `aria-disabled` control with no
 * `aria-describedby` and no visible text: precisely the state UAT test 9 reported, silently
 * reintroducible at any time (WR-07). This file's doc blocks already asserted that "the
 * explanation is the whole reason for rendering the control", and nothing enforced it.
 *
 * The union is the enforcement. An unavailable expand without its explanation is no longer
 * a bug to be caught in review — it does not type-check.
 */
export type PaneAvailability = { available: true } | { available: false; reason: string };

/**
 * Why BOTH expands are unavailable while a round's cards are being played — Amendment 3.
 *
 * `board-full` is unavailable for a reason `pool-full` never had: the pool pane holds the
 * only control that can play a card, and a state that hides the only available action is
 * not a preference. `pool-full` is unavailable for its usual reason — it would put the
 * board behind a toggle — but says THIS instead, because "once the draft is complete" is a
 * wait the host is not currently in.
 *
 * Exported so `app.tsx` can name the same string it scopes the states with. The pane
 * component must never hold an opinion about which of its states are available; it holds
 * the copy for the reasons it renders.
 */
export const CARD_PHASE_EXPAND_REASON = "Available once the round's cards are played";

/**
 * Why both expands are unavailable during a dedicated swap round — Amendment 3's third row.
 *
 * The same argument the card phase makes, one phase later: the pool pane holds the only
 * control that can act — `Pass this swap`, or the armed slot's offer — and a state that
 * hides the only available action is not a preference. The pool's expand is refused too,
 * because the board is where a player picks the slot they are swapping out of.
 *
 * A separate constant rather than a reworded shared one. "Once the round's cards are
 * played" names a wait the host is not in during a swap round, and a host reading it there
 * would be told to wait for something that already happened.
 *
 * Shed the moment the round ends, like every inert reason in this file (WR-04). This is
 * that rule's last consumer in Phase 3.
 */
export const SWAP_ROUND_EXPAND_REASON = 'Available once the swap round ends';

/**
 * `side()`'s parameters, named.
 *
 * Plan 02-09 deliberately chose an eighth POSITIONAL parameter here, on the grounds that
 * every other piece of copy `side()` renders was already positional. That decision is
 * reversed rather than forgotten: it left eight parameters with four adjacent strings, and
 * transposing any two of them is clean at compile time and surfaces as the wrong copy on a
 * shared screen. Five strings in a row cannot be checked by eye, so the call sites name
 * them instead.
 *
 * An interface rather than an inline type literal, so these names have one definition.
 */
interface SideOptions {
  key: 'pool' | 'board';
  collapsed: boolean;
  children: ComponentChildren;
  expandLabel: string;
  restoreLabel: string;
  expandedMessage: string;
  availability: PaneAvailability;
}

export interface SplitPanesProps {
  /** 'split' | 'pool' | 'board' — the value from `src/adapters/view-prefs.ts`. */
  pane: PaneState;
  onPaneChange: (pane: PaneState) => void;
  /**
   * False while a draft is in progress, because `pool-full` would put the board behind a
   * toggle and fail criterion 5 (02-UI-SPEC §A tension in the locked set).
   *
   * The button is ALWAYS rendered. `false` does not remove it — it makes it inert:
   * `aria-disabled`, a visible reason beside it, and a click that returns early. Omission
   * left the host unable to tell "unavailable" from "broken".
   */
  poolExpandable: boolean;
  /**
   * False only while a round's cards are being played (Amendment 3).
   *
   * The board's expand was the one that could never be inert, and it is now: during card
   * play the pool pane holds the only control that can act, so hiding it is not a
   * preference this app can honour. It goes back to always-available the moment the round
   * resolves — WR-04's rule that inert ARIA is always shed.
   */
  boardExpandable: boolean;
  /**
   * The reason BOTH expands are unavailable when the PHASE is what makes them so, or null
   * when the phase is not the reason.
   *
   * Paired with the two booleans above rather than replacing them, so the pair
   * "unavailable, no reason given" — the exact defect UAT test 9 reported and
   * `PaneAvailability` exists to prevent — stays unrepresentable: when this is null the
   * fallback reasons below are used, and there is no branch that produces an inert control
   * with nothing to say.
   */
  phaseReason: string | null;
  pool: ComponentChildren;
  board: ComponentChildren;
}

export function SplitPanes({
  pane,
  onPaneChange,
  poolExpandable,
  boardExpandable,
  phaseReason,
  pool,
  board,
}: SplitPanesProps) {
  /**
   * Report the pane change, then announce it.
   *
   * --- DESCOPED 2026-08-20, RECORDED SO IT IS NOT RE-DERIVED (WR-02) ---
   *
   * On the two EXPAND transitions this `announce` is committed in the same tick as the focus
   * handoff below, and a focus move makes assistive technology speak the newly focused
   * control at once. A `aria-live="polite"` update queued in that same tick is routinely
   * preempted or dropped — so `Pool expanded to full width.` and `Draft board expanded to
   * full width.` are precisely the two messages most likely never to be heard, and 02-11
   * changed the conditions they operate under without re-checking them.
   *
   * NEVER ANSWERED, and now not going to be. Settling it needs a real screen reader (NVDA or
   * VoiceOver): happy-dom computes no accessible name, no description and no announcement
   * queue, so no test in this repo can reach it, and 02-13's human checkpoint did not cover
   * it — that list is focus visibility, the hover exclusion, the 02-10 alignment and the
   * reason line. On 2026-08-20 the host descoped screen-reader verification for this
   * milestone. This block therefore records a DECISION, not a result: the pass was not run,
   * and nothing about whether these two messages are heard should be inferred from it.
   *
   * The code below is unchanged by that, on purpose. If the message ever DOES turn out to be
   * preempted, the honest resolution is to stop announcing on the two transitions that MOVE
   * focus: the restore control's own name — `Show the pool` — already states the new state as
   * it takes focus, and an announcement that is emitted and swallowed is worse than none. It
   * is still not removed pre-emptively, because the collapse-to-split transition moves no
   * focus and the announcement is the only signal a screen-reader user gets there; dropping
   * it on an untested premise would trade a possible silence for a certain one.
   *
   * That last sentence is also the boundary of the descope. It leans on every other announced
   * fact having a second carrier; collapse-to-split is the one place that is already untrue.
   * Adding a second such place reopens this. See `03/deferred-items.md` §7.
   */
  function change(next: PaneState, message: string): void {
    onPaneChange(next);
    announce(message);
  }

  const poolExpanded = pane === 'pool';
  const boardExpanded = pane === 'board';

  /**
   * The restore control on whichever side is currently collapsed — the successor a focus
   * handoff aims at, and the only way back from a strip.
   *
   * Attached conditionally in `side()`, because both panes call that function and at most
   * one of them is collapsed at a time. An unconditional attach would let the second call
   * overwrite what the first stored.
   */
  const collapsedControlRef = useRef<HTMLButtonElement | null>(null);

  /**
   * The control the host actually activated — and only when the keyboard was genuinely on
   * it. Recorded in the click handler, consumed and cleared by the effect below.
   */
  const activatedControlRef = useRef<HTMLButtonElement | null>(null);

  /**
   * Hand focus to the successor control — and ONLY when the one the host activated has
   * left the document.
   *
   * WR-08: an expanded pane carries no control of its own, so pressing an expand removes
   * the very button that was pressed and focus falls to `<body>`. That is the correct
   * markup — the restore lives on the collapsed strip opposite, where the missing content
   * is — so the fix is not to keep the node, it is to pass focus on.
   *
   * What this deliberately does NOT do is move focus for a pane change nobody activated.
   * The stored-preference restore on mount and the mid-draft coercion in `app.tsx` both
   * change `pane` with no host input, and stealing focus from either would be a worse bug
   * than the one being fixed. Two conditions guard it, both read rather than assumed: the
   * activated element was `document.activeElement` at activation time, and it is no longer
   * `isConnected`.
   *
   * `isConnected` rather than keying this effect on `pane` and inferring the direction: the
   * effect then states its own precondition instead of encoding a map from pane transitions
   * to outcomes that a later change to the membership rule would silently invalidate. The
   * collapsed-to-split case needs no handoff at all, because that button is reused — which
   * is exactly what `isConnected` observes.
   *
   * No dependency array on purpose: it runs after every render and always clears its own
   * state, so a recorded control can never survive into a later, unrelated render.
   */
  useLayoutEffect(() => {
    const activated = activatedControlRef.current;
    activatedControlRef.current = null;

    if (activated === null) return;
    if (activated.isConnected) return;

    collapsedControlRef.current?.focus();
  });

  /**
   * One side, in one of its two shapes — and it is ONE SUBTREE in both of them.
   *
   * `collapsed` narrows the pane to a strip; the children go on rendering either way, and
   * CSS hides the track. That is not a stylistic preference: unmounting them discarded the
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
   *
   * --- ONE CONTROL, ONE SHAPE, AND WHY THAT IS A CONTRACT ---
   *
   * The chrome does not SWAP one control for another across the collapsed boundary. There
   * is exactly one control in exactly one vnode shape, and `collapsed` changes its LABEL
   * and what its click does — nothing structural.
   *
   * That is load-bearing rather than tidy. This function used to render a bare button
   * vnode in the collapsed branch and a Fragment in the other, so that the reason span
   * could sit beside the expand. Preact cannot reuse a DOM node across a vnode type: it
   * unmounted the old subtree and mounted a new one, `document.activeElement` fell to
   * `<body>`, and it did so on the one control whose entire job is recovery (CR-01). The
   * strip's button is `writing-mode: vertical-rl`, so nothing about it looked different and
   * only a keyboard, a switch or a screen reader could tell.
   *
   * --- AVAILABILITY AND ITS EXPLANATION ARE ONE PARAMETER ---
   *
   * See `PaneAvailability` above for why. In short: they are one fact, they were two
   * independent parameters, and the combination "unavailable, no reason given" was
   * therefore representable and reproduced the exact defect UAT test 9 reported (WR-07).
   */
  function side(options: SideOptions) {
    const { key, collapsed, children, expandLabel, restoreLabel, expandedMessage, availability } =
      options;

    // Expanded here means "this side has the whole width", which is exactly when the
    // other side is collapsed and already offers the way back.
    const isFullWidth = pane === key;

    // Derived from `key` rather than held as a module constant, so this function stays
    // honest about being generic — even though only the pool can currently reach the
    // inert branch.
    const reasonId = `${key}-expand-reason`;

    // The chrome carries a control whenever this pane is collapsed OR is not the pane
    // holding the whole width. Named rather than inlined: the whole point of the change
    // that introduced it is that a later reader can see there is ONE shape here.
    const hasControl = collapsed || !isFullWidth;

    // A restore control is never inert; only an unavailable EXPAND is.
    const isInert = !collapsed && !availability.available;

    // The ternary is where TypeScript narrows the union, so `availability.reason` is
    // reachable only on the branch that has one — no cast, no non-null assertion, and no
    // optional chaining standing in for a proof.
    const reason = availability.available ? null : availability.reason;

    // The `!collapsed` guard is load-bearing, not defensive. While the two chrome states
    // were separate subtrees the collapsed branch simply had no span to render; now that
    // both share one subtree, this guard is the only thing keeping a ~38-character reason
    // out of a strip one `--target-min` wide whose button is set vertically.
    const showReason = !collapsed && reason !== null;

    return (
      <section class={collapsed ? 'pane pane--collapsed' : 'pane'} data-side={key}>
        {/*
          The chrome sits OUTSIDE the scroll container on purpose. A control positioned
          inside a scrolling region scrolls away with the content, and this button is the
          answer to "what is that one" (D-21) — the thing a host reaches for exactly when
          they are deep in a long pool and cannot tell two sprites apart.
        */}
        <div class="pane__chrome">
          {/*
            `expandable` is NOT part of the membership test. An unavailable expand is
            rendered and made inert; only an already-expanded pane carries no control,
            because the restore lives on the collapsed strip opposite.

            `aria-disabled` alone, and deliberately no native `disabled` — the same trade
            `FeasibilityBar` documents. A natively disabled button is not focusable, so a
            keyboard user could never reach the explanation, and the explanation is the
            whole reason for rendering the control.
          */}
          {hasControl && (
            <>
              <button
                type="button"
                class="pane__button"
                // Only the collapsed side holds the ref: it is the successor the focus
                // handoff aims at, and only one side can be collapsed at a time.
                //
                // `null` rather than `undefined` for the other side, and that is the
                // compiler's call, not a style choice: `Ref<T>` is
                // `RefObject<T> | RefCallback<T> | null`, and `exactOptionalPropertyTypes`
                // is on, so `undefined` here does not type-check. Preact detaches on
                // either, since it only re-attaches for a truthy ref.
                ref={collapsed ? collapsedControlRef : null}
                aria-disabled={isInert ? 'true' : undefined}
                aria-describedby={showReason ? reasonId : undefined}
                // A held Enter auto-repeats `keydown`, and a `<button>` activates on every
                // repeat — so the handoff above delivers the NEXT control under a key that is
                // still down. Before this guard one hold walked split → board → split → pool
                // → split for as long as it was held, writing the view preference and
                // rewriting the live region on every step, and the host landed on whichever
                // pane the release happened to fall on (WR-01). The handoff is correct; what
                // is wrong is treating a repeat as a second press, so it is refused here
                // rather than compensated for in the effect.
                //
                // Enter ONLY. A button activates on Space's KEYUP, so Space repeats activate
                // nothing and there is nothing to refuse — while cancelling their `keydown`
                // would suppress the press itself.
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && event.repeat) event.preventDefault();
                }}
                onClick={(event) => {
                  // The early return IS the refusal, exactly as `handleStart` does it.
                  // `change` is never called for an inert control, so nothing reaches
                  // `onPaneChange`, nothing is written and nothing is announced — and
                  // `activatedControlRef` is left untouched, so focus does not move either.
                  if (isInert) return;

                  // Arm the handoff, but only for a host who was actually ON this control.
                  // Without the `activeElement` test a pointer user who clicked without
                  // focusing would have focus yanked somewhere they never put it.
                  const button = event.currentTarget;
                  activatedControlRef.current =
                    document.activeElement === button ? button : null;

                  if (collapsed) {
                    change('split', SPLIT_MESSAGE);
                    return;
                  }

                  change(key, expandedMessage);
                }}
              >
                {collapsed ? restoreLabel : expandLabel}
              </button>

              {/* Button first, reason second, in DOM order as in visual order. */}
              {showReason && (
                <span class="pane__reason" id={reasonId}>
                  {/*
                    The separator is markup rather than `::before` content so the whole
                    visible line is one testable string, and `aria-hidden` so it stays out of
                    the accessible description this element supplies. See
                    `POOL_EXPAND_REASON` above for the rule and for why the ban-mode options
                    bake their dash into the label instead.

                    No class: it needs no rule of its own, it inherits the muted colour from
                    its parent, and a class with no stylesheet entry is dead weight.

                    An expression container holding a string literal, not bare JSX text,
                    because JSX collapses trailing whitespace — and the space is half of the
                    two characters.
                  */}
                  <span aria-hidden="true">{'— '}</span>
                  {reason}
                </span>
              )}
            </>
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
      {side({
        key: 'pool',
        collapsed: boardExpanded,
        children: pool,
        expandLabel: EXPAND_POOL_LABEL,
        restoreLabel: RESTORE_POOL_LABEL,
        expandedMessage: POOL_EXPANDED_MESSAGE,
        // The one asymmetry between the two sides, and it is scoped rather than structural.
        //
        // `phaseReason` wins when there is one: during card play the pool's expand is
        // unavailable for its usual reason, but "once the draft is complete" names a wait
        // the host is not currently in, and the nearer answer is the useful one.
        availability: poolExpandable
          ? { available: true }
          : { available: false, reason: phaseReason ?? POOL_EXPAND_REASON },
      })}

      {side({
        key: 'board',
        collapsed: poolExpanded,
        children: board,
        expandLabel: EXPAND_BOARD_LABEL,
        restoreLabel: RESTORE_BOARD_LABEL,
        expandedMessage: BOARD_EXPANDED_MESSAGE,
        // The board's expand WAS never inert. Amendment 3 made it so for the duration of a
        // round's card play, and `CARD_PHASE_EXPAND_REASON` is the only reason it can carry
        // — which is why the fallback is that constant rather than a second string: an
        // unavailable board expand outside the card phase is not a state this app has.
        availability: boardExpandable
          ? { available: true }
          : { available: false, reason: phaseReason ?? CARD_PHASE_EXPAND_REASON },
      })}
    </div>
  );
}
