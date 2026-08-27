import { isSnapshotStale } from '../../core/roster/staleness';

import './StalenessBanner.css';

/**
 * The expired-roster warning — REFR-03, D-25, D-26, 05-UI-SPEC §3.
 *
 * ## Why this is a NEW component and not a `ReadOnlyBanner` variant
 *
 * They look alike, which is the trap. 05-UI-SPEC §Component inventory settles it:
 * "`ReadOnlyBanner` means *another tab owns this document*; making one banner mean three
 * different things is how a sentence stops being trusted." A host who has learned that the
 * bar above the page means "you cannot act here" would read this one the same way, and
 * this one means very nearly the opposite — you can act, you simply should know what you
 * are acting on. Do not merge them later. The shared part is a flex row and a
 * `role="status"`, which is nine lines of CSS, and nine lines is a far smaller cost than
 * one bar with three meanings.
 *
 * ## It warns and never blocks
 *
 * D-25, in its own words: a group mid-rotation can still run a night on last regulation's
 * roster deliberately, and the banner only stops them doing it by accident. Blocking a new
 * tournament was rejected because it would ALSO block a host with no network, which breaks
 * the offline premise this whole app is built on. So nothing here disables anything —
 * `New tournament` and `Start draft` stay live while this is on screen, and a test asserts
 * it. Correspondingly it is not danger-coloured: 05-UI-SPEC §Color keeps destructive to
 * "still exactly three" surfaces and this adds no fourth. Nothing is wrong yet.
 *
 * ## Two sentences, and the second one ROUTES
 *
 * That is the whole content of D-26. D-23 puts the refresh control on the config screen;
 * D-25 gives this banner a next action; the two reconcile by sending the host to the one
 * control rather than by growing a second one here. So the landing variant navigates and
 * moves focus to `Check for a new roster`, and this file imports no adapter that could
 * refresh in place even by accident.
 *
 * ## The clock is read at the edge
 *
 * `isSnapshotStale` is pure and compares two `YYYY-MM-DD` strings; `todayIso()` lives in
 * `src/adapters/clock.ts` and is called by the screen that mounts this. 05-UI-SPEC
 * §Pure-core boundary item 2 names that split, and `npm run check:pure` would fail a core
 * implementation, correctly. This component receives the day; it never asks what it is.
 */

/**
 * Verbatim from 05-UI-SPEC §Copywriting → Staleness banner.
 *
 * Functions rather than inline JSX prose, for `ReadOnlyBanner.tsx:42-51`'s reason: JSX
 * collapses whitespace between text lines and these are contracts down to the full stop.
 * Two near-identical strings rather than one string with a swapped tail, because the tail
 * is the part that differs and a shared prefix would invite a `text` prop — at which point
 * the copy table stops being the contract and the call sites start being it.
 */
export function configSentence(regulationLabel: string, validUntil: string): string {
  return `${regulationLabel} expired on ${validUntil}. Check for a new roster below before you start a night on it.`;
}

export function landingSentence(regulationLabel: string, validUntil: string): string {
  return `${regulationLabel} expired on ${validUntil}. Update the roster before you start a night on it.`;
}

export const UPDATE_LABEL = 'Update the roster';

export interface StalenessBannerProps {
  /**
   * Which of the two screens a night gets started on. Not a generic `text` prop: the two
   * sentences ARE the contract, and the variant only selects between them.
   */
  variant: 'config' | 'landing';
  /** The snapshot's own `regulation` label — `M-B`, never a manifest id. */
  regulationLabel: string;
  /** `YYYY-MM-DD`. The FIRST day the snapshot is stale, so also the day it expired on. */
  validUntil: string;
  /** Today, LOCAL, from `todayIso()` in the mounting screen. Stamped at the edge. */
  today: string;
  /**
   * Route to the config screen and put focus on `Check for a new roster`. Required in
   * practice for the landing variant and meaningless for the config one, where the control
   * is already on screen and the sentence just points down at it.
   */
  onUpdateRoster?: (() => void) | undefined;
}

export function StalenessBanner({
  variant,
  regulationLabel,
  validUntil,
  today,
  onUpdateRoster,
}: StalenessBannerProps) {
  // Half-open, so a snapshot whose `validUntil` is today has ALREADY expired. M-B's
  // committed `validUntil` is 2026-09-02, which makes this an acceptance path within days
  // of shipping rather than a hypothetical.
  if (!isSnapshotStale(validUntil, today)) return null;

  const sentence =
    variant === 'config'
      ? configSentence(regulationLabel, validUntil)
      : landingSentence(regulationLabel, validUntil);

  return (
    <div class="staleness-banner">
      {/*
        `role="status"` and deliberately not `role="alert"`, and deliberately not ALSO
        routed through the global live region. An expired roster is a state to be told
        about on arrival, not an emergency to interrupt for; and `FeasibilityBar.tsx:27-32`
        sanctions a surface-owned status region for exactly this case while forbidding
        doing both, which would leave two regions competing to describe one fact.
      */}
      <p class="staleness-banner__text" role="status">
        {sentence}
      </p>

      {/*
        The config variant offers NO button. The control it names is on the same screen,
        directly below, and a second one here would be the duplication D-26 exists to
        forbid — two buttons doing one thing, one of which is a copy.
      */}
      {variant === 'landing' && onUpdateRoster !== undefined && (
        <button type="button" class="staleness-banner__action" onClick={onUpdateRoster}>
          {UPDATE_LABEL}
        </button>
      )}
    </div>
  );
}
