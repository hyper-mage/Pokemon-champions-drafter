import { useLayoutEffect, useRef } from 'preact/hooks';

import type { RoundKind, RoundSpec } from '../../core/actions';

import './SchedulePreview.css';

/**
 * The compiled round schedule, and the host's reorder of it — RULE-06, D-13, D-14,
 * 03-UI-SPEC §2.
 *
 * It owns no state. The schedule and every change to it arrive and leave as props, which
 * is what keeps `ConfigScreen` the one place that knows the config screen is pre-document
 * form state, and keeps this component from being the second place that could dispatch.
 * There is no `schedule/reordered` action to reach for: the permutation is form state
 * until Start, where it resolves into the single `schedule/compiled` action (D-13).
 *
 * ## The rows ARE an ordered list, and that is on purpose
 *
 * `PlayerList` deliberately does NOT wrap its name rows in a list element, because each
 * row is already announced by its own label and "list, 4 items" would add nothing. Its
 * numbered starting order below them IS an `<ol>`, because there the ordinal is the
 * information. This surface is the second case: a schedule is nothing but an order, so
 * the ordinal is the whole of what it says, and the list semantics carry it.
 *
 * ## A move swaps KINDS between fixed round numbers
 *
 * Round 3 is always the third row. What a move exchanges is the two rows' kinds, not
 * their positions — which is why the rows are keyed by `spec.index` (the round number is
 * the row's identity) and why the button DOM nodes survive a move rather than being
 * rebuilt. That stability is what makes the focus handoff below possible at all.
 *
 * ## No roving tabindex
 *
 * Twelve buttons is not the large uniform set `useRovingTabindex` exists to collapse
 * (235 pool cells, 18 type pills), and `PlayerList` already sets the precedent that a form
 * list of rows uses plain tab stops. 03-UI-SPEC §Interaction states this explicitly for
 * this surface so the hook is not wired out of habit. Every button here is its own tab
 * stop, deliberately.
 *
 * ## Screen-reader check: DESCOPED, not answered
 *
 * 03-UI-SPEC added the reorder move to the WR-02 check list: a polite announcement queued
 * alongside a focus move is routinely preempted, and that finding was never resolved. The
 * host descoped screen-reader verification for this milestone on 2026-08-20, so this block
 * records a decision rather than a result — the NVDA/VoiceOver pass was not run, and no
 * outcome should be inferred from its absence.
 *
 * The reason that is affordable is unchanged and still load-bearing: this surface does not
 * depend on the answer. The destination is carried by the newly focused button's own
 * accessible name, so nothing here exists only in the announcement. Keep it that way — if a
 * future change makes an announcement the ONLY carrier of a fact on this surface, the
 * descope no longer covers it. See `03/deferred-items.md` §7.
 */

export type MoveDirection = 'up' | 'down';

/** Rendered in this order, top to bottom, on every row. */
const MOVE_DIRECTIONS: readonly MoveDirection[] = ['up', 'down'];

const MOVE_CLASS = 'schedule-preview__move';

/**
 * Verbatim from 03-UI-SPEC §Copywriting Contract → Config screen.
 *
 * Module constants rather than inline JSX text (PATTERNS S-6): JSX collapses whitespace
 * between text lines, and these strings are asserted on exact equality.
 */
const MOVE_LABEL: Readonly<Record<MoveDirection, string>> = {
  up: 'Move up',
  down: 'Move down',
};

/** D-14's own wording for a row, and the noun each kind takes inside a sentence. */
const KIND_LABEL: Readonly<Record<RoundKind, string>> = { mega: 'Mega', open: 'Open' };
const KIND_NOUN: Readonly<Record<RoundKind, string>> = {
  mega: 'a Mega round',
  open: 'an open round',
};

const REORDER_RULE = 'A move that would not change the schedule is unavailable.';

const NOTHING_TO_REORDER: Readonly<Record<RoundKind, string>> = {
  open: 'Every round is open, so there is nothing to reorder.',
  mega: 'Every round is a Mega round, so there is nothing to reorder.',
};

/**
 * Whether a move would change the schedule, and — when it would not — why not.
 *
 * The union is the enforcement, exactly as `PaneAvailability` is in `SplitPanes.tsx:101`:
 * "unavailable with no reason given" does not type-check, so an inert button whose
 * accessible name is a bare `Move up` is not a bug to be caught in review.
 */
type MoveAvailability = { movable: true } | { movable: false; reason: string };

function roundText(spec: RoundSpec): string {
  return `Round ${spec.index} — ${KIND_LABEL[spec.kind]}`;
}

/**
 * The three reasons a move changes nothing: there is no row that way, or the row that way
 * already holds this kind.
 *
 * `spec` is passed in rather than read back out of `schedule[position]` so there is no
 * "the row I am rendering might not exist" branch — the caller is a `map` over the array
 * and already holds it.
 */
function availabilityOf(
  schedule: readonly RoundSpec[],
  position: number,
  spec: RoundSpec,
  direction: MoveDirection,
): MoveAvailability {
  const neighbour = schedule[position + stepOf(direction)];

  if (neighbour === undefined) {
    return direction === 'up'
      ? { movable: false, reason: 'round 1 is already first' }
      : { movable: false, reason: `round ${schedule.length} is already last` };
  }

  if (neighbour.kind === spec.kind) {
    return {
      movable: false,
      reason: `round ${neighbour.index} is already ${KIND_NOUN[neighbour.kind]}`,
    };
  }

  return { movable: true };
}

function stepOf(direction: MoveDirection): number {
  return direction === 'up' ? -1 : 1;
}

/**
 * The accessible name, in all five 03-UI-SPEC §2 cases.
 *
 * Every one of them CONTAINS its visible label as a substring — SC 2.5.3 Label in Name,
 * the same construction `PlayerList`'s `Remove {name}` and `BanChipList`'s
 * `Remove {name} from the banlist` use. A host using voice control says what they can
 * read, and a name that dropped `Move up` would leave twelve controls unreachable by
 * voice.
 */
function moveName(
  direction: MoveDirection,
  availability: MoveAvailability,
  destinationRound: number,
): string {
  return availability.movable
    ? `${MOVE_LABEL[direction]} to round ${destinationRound}`
    : `${MOVE_LABEL[direction]} — ${availability.reason}`;
}

export interface SchedulePreviewProps {
  /** The current schedule, already compiled and possibly reordered. Length is `config.rounds`. */
  schedule: readonly RoundSpec[];
  /**
   * The row's ARRAY POSITION — 0-based, and deliberately not `spec.index`, which is the
   * 1-based round number the row displays. The parent owns the array and performs the
   * swap; this component reports an intent and re-renders from what comes back.
   */
  onMove: (index: number, direction: MoveDirection) => void;
}

export function SchedulePreview({ schedule, onMove }: SchedulePreviewProps) {
  /**
   * The move buttons, keyed `{direction}:{position}` — the ref map the focus handoff aims
   * at. Positions are stable across a move (kinds swap, rows do not), so a key written
   * before a move still resolves after it.
   */
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);

  /**
   * Focus follows the moved round, not the pressed button.
   *
   * Leaving focus where it was makes a second press REVERSE the first, which makes walking
   * a Mega round from round 1 to round 6 impossible by keyboard — the exact journey D-14's
   * buttons exist to support. The handoff runs in a layout effect rather than in the click
   * handler because the destination button only holds the moved kind after the parent has
   * re-rendered with the new array.
   */
  useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (key === null) return;
    pendingFocus.current = null;
    buttons.current.get(key)?.focus();
  });

  const first = schedule[0];
  if (first === undefined) return null;

  /**
   * Every round the same kind — `megasRequiredPerTeam` of 0 or of `rounds`.
   *
   * Read off the SCHEDULE rather than off the requirement that produced it: this component
   * renders the array it is handed, and a second derivation of "is there anything to
   * reorder" is a second thing that could disagree with the first.
   */
  const uniform = schedule.every((spec) => spec.kind === first.kind);

  return (
    <div class="schedule-preview">
      <ol class="schedule-preview__rounds">
        {schedule.map((spec, position) => (
          // Keyed by the ROUND NUMBER, which is the row's identity — a move exchanges the
          // kinds of two rows and never the rows themselves.
          <li class="schedule-preview__round" key={spec.index}>
            <span class="schedule-preview__round-label">{roundText(spec)}</span>

            {/*
              Not rendered at all when nothing can move, following the shipped precedent
              for a wholly void affordance (`Clear the banlist` is absent while nothing is
              banned). Twelve permanently inert buttons is not an explanation, it is a
              list of controls that never do anything.
            */}
            {!uniform && (
              <span class="schedule-preview__controls">
                {MOVE_DIRECTIONS.map((direction) => {
                  const availability = availabilityOf(schedule, position, spec, direction);
                  const step = stepOf(direction);

                  return (
                    <button
                      key={direction}
                      type="button"
                      // ONE vnode shape across the availability boundary. A bare button in
                      // one branch and a Fragment in the other unmounts the node and drops
                      // focus to `<body>` — the regression 02-11 fixed on `SplitPanes`.
                      class={
                        availability.movable ? MOVE_CLASS : `${MOVE_CLASS} ${MOVE_CLASS}--inert`
                      }
                      // `undefined`, never `'false'`: the attribute is SHED the moment the
                      // move becomes possible (WR-04). `aria-disabled` and never native
                      // `disabled`, because a natively disabled button is not focusable and
                      // its reason would be unreachable by keyboard.
                      aria-disabled={availability.movable ? undefined : 'true'}
                      aria-label={moveName(direction, availability, spec.index + step)}
                      ref={(element) => {
                        const key = `${direction}:${position}`;
                        if (element === null) buttons.current.delete(key);
                        else buttons.current.set(key, element);
                      }}
                      onClick={() => {
                        // The early return is what keeps the attribute honest. Without it
                        // the ARIA would claim the control is inert while a click still
                        // changed the schedule.
                        if (!availability.movable) return;
                        pendingFocus.current = `${direction}:${position + step}`;
                        onMove(position, direction);
                      }}
                    >
                      {MOVE_LABEL[direction]}
                    </button>
                  );
                })}
              </span>
            )}
          </li>
        ))}
      </ol>

      {/*
        One visible rule line, stated once beneath the list rather than per button —
        twelve reason lines on a config form is noise (03-UI-SPEC §2). Nothing is OMITTED
        here, which is what separates this from plan 02-09's empty chrome slot: the buttons
        are present, focusable, and each carries its own reason in its accessible name.

        03-UI-SPEC words the condition as "renders when at least one button is inert". That
        condition is satisfied structurally rather than by a branch: any schedule that
        renders buttons at all is a mixed one, and in a mixed schedule row 1's `Move up` and
        the last row's `Move down` are BOTH inert. A conditional here could never take its
        false arm, and unreachable code that looks like a check is worse than no check.
      */}
      {uniform ? (
        <p class="schedule-preview__rule">{NOTHING_TO_REORDER[first.kind]}</p>
      ) : (
        <p class="schedule-preview__rule">{REORDER_RULE}</p>
      )}
    </div>
  );
}
