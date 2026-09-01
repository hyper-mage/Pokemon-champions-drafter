import { useState } from 'preact/hooks';

import type { DraftState } from '../../core/model';
import {
  byeCountForCut,
  selectCutSplitsTiedBlock,
  selectRemainingMatchCount,
  selectSeeding,
} from '../../core/tournament';
import { matches as matchCount } from '../confirm-copy';
import { NumericField, parseNumericField } from './NumericField';

import './CutControl.css';

/**
 * The cut from the round robin into the bracket — TOUR-09, `05-UI-SPEC` §8, D-06.
 *
 * ## Chosen HERE, on the standings screen, and never at config time
 *
 * D-06, and a config-time default confirmable later was explicitly rejected: two
 * authorities on one number is a shape this codebase has refused repeatedly. The number is
 * decided at the moment the information exists — the host is looking at the finished table
 * when they choose how much of it advances, and the table they are looking at IS the
 * seeding, which is why this file reads `selectSeeding` rather than sorting anything.
 *
 * ## The caller holds the raw string; the field holds nothing
 *
 * `NumericField.tsx:32-36`'s stated reason: a component that held the number would have to
 * invent something to display while the host is mid-edit, and "what is showing" and "what
 * the gate is judging" would be two facts that can disagree. So the raw text lives here and
 * `parseNumericField` turns it into `number | null`.
 *
 * That nullability is the mitigation rather than a nicety. An empty `<input type="number">`
 * read arithmetically yields `NaN`, and every relational comparison with `NaN` is false —
 * so `n < 2` and `n > players` would BOTH pass, the gate would report itself satisfied, and
 * `Take the cut` would go live on a size nobody typed. `null` is a case TypeScript forces
 * this file to handle; `NaN` is one it could not see (T-05-60).
 *
 * Non-integers are refused for the same reason one step along: `parseNumericField`
 * deliberately returns `4.5` as itself, and `Array.prototype.slice` would truncate it into
 * a cut of four while the preview line said `Top 4.5 advance`.
 *
 * ## The bye count is not computed here
 *
 * `byeCountForCut` exists as a separate export precisely so the preview line and the
 * bracket cannot disagree about how many byes a size produces. A host who reads
 * "seeds 1 to 3 get a bye" and then counts four bye cards has been lied to by one of the
 * two, and nothing on screen would say which. This file interpolates that function's
 * answer and owns no arithmetic of its own.
 *
 * ## TWO inert conditions, in the reducer's own order
 *
 * `reduce.ts:1258-1266` refuses `tournament/cutTaken` in the order
 * `roundRobinNotComplete` → `cutSizeOutOfRange` → `cutSplitsTiedBlock`, and this gate asks
 * the same three questions in the same order so the control and the backstop can never
 * name different problems for one click.
 *
 * The second reason is `05-RESEARCH` Pitfall 4, and it is a real failure rather than a
 * theoretical one: the round robin completes, seeds 3, 4 and 5 are still tied with nobody
 * having ordered them, the host cuts to top 4, and whichever of the three the bracket puts
 * at seed 4 is arbitrary. The room will notice.
 *
 * That sentence is **not in `05-UI-SPEC.md`**. §8 gates only on completeness, and
 * completeness does not imply resolution. The copy was supplied by planning under 05-06's
 * ruling and pinned byte-for-byte before it was rendered — recorded here so a future reader
 * who cannot find it in the contract does not conclude it was invented casually.
 *
 * ## Why a size the host has not chosen yet gets NO sentence
 *
 * The two ruled reasons are both about the TOURNAMENT: it is unfinished, or it is unsettled.
 * An empty or out-of-range field is not one of those — it is the host mid-decision, and an
 * inactive primary beside a field they have not filled in is the ordinary shape of a form
 * rather than a refusal that owes them an explanation. The bounds themselves are published
 * where they belong, as the field's own `min` and `max`, which is what the native stepper
 * and assistive technology read.
 *
 * Inventing a third sentence here would be exactly what `StandingsTable`'s doc block
 * refuses for the missing sixth note: copy this surface is not entitled to add. The one
 * sentence this phase did add went through a ruling first. `cutSizeOutOfRange` remains the
 * backstop for anything that reaches the reducer anyway.
 *
 * ## No confirm dialog, and none may be added
 *
 * §8 is explicit: taking the cut destroys nothing and is undoable like everything else
 * (D-12). A confirm here would spend the host's attention on a reversible act and make the
 * three genuinely irreversible confirms less legible as a category — the whole reason the
 * confirmation vocabulary is rationed.
 */

/**
 * The reason element's id, and the id `Take the cut` names as its description.
 *
 * A module constant rather than a generated one on `FeasibilityBar.tsx:42-48`'s model:
 * there is exactly one cut control per screen, so the id is pinned, and a second one would
 * be two answers to one question.
 */
export const CUT_REASON_ID = 'cut-reason';

/**
 * The id the bracket region's `<h2 tabindex="-1">` carries — written once, here, and read
 * by whoever moves focus to it.
 *
 * `TeamStrip`'s `boardCellId` precedent and its reason: the alternative is the same string
 * at two call sites that have to stay identical forever, and the failure when they drift is
 * SILENT — `getElementById` returns null and focus falls to `<body>` with nothing logged.
 *
 * §Interaction: focus goes here after the cut because `Take the cut` no longer exists once
 * the cut is taken, so focus cannot stay where it was. The heading itself is mounted by
 * 05-13 with the bracket it labels; this constant is the seam between the two.
 */
export const BRACKET_HEADING_ID = 'tournament-bracket-heading';

/**
 * Verbatim from `05-UI-SPEC` §Copywriting → The cut.
 *
 * Module constants rather than inline JSX text (PATTERNS S-6): JSX collapses whitespace
 * between text lines, and these strings are asserted on exact equality.
 */
export const CUT_HEADING = 'The cut';
export const CUT_FIELD_LABEL = 'Players who advance';
export const TAKE_THE_CUT = 'Take the cut';

/**
 * The blocked reason's second half, held apart from its first.
 *
 * `ResultsGrid`'s split, and the same trade made in the same direction: a round robin can
 * hold exactly one unrecorded match, and `1 matches are still to play` is a sentence the
 * room would read. The shared `matches` helper knows the singular, so the count and its
 * noun go through it and the instruction is appended — which also keeps this sentence in
 * the file exactly once, however many ways the count reads.
 */
const CUT_BLOCKED_TAIL = 'Record them all before you cut.';

function incompleteReason(remaining: number): string {
  const lead =
    remaining === 1
      ? `${matchCount(remaining)} is still to play.`
      : `${remaining} matches are still to play.`;

  return `${lead} ${CUT_BLOCKED_TAIL}`;
}

/**
 * Pitfall 4's sentence, supplied by planning under 05-06's ruling — see the doc block.
 *
 * It follows the shape of §8's own blocked reason: it states the problem, it names the next
 * action, second person, present tense, no exclamation. The next action is reachable, which
 * is the part that makes it worth saying — the override control is directly above this one.
 */
function tieSplitReason(size: number): string {
  return `The cut at ${size} splits a tie. Order the tied players yourself before you take it.`;
}

/**
 * The preview, recomputed live from `byeCountForCut` as the host types.
 *
 * Two sentences rather than one with a clause switched out, because the second is not the
 * first with the bye count set to zero — a power-of-two cut has no byes to number, and
 * `Seeds 1 to 0 get a bye.` is the sentence a shared template would produce.
 */
function previewFor(size: number): string {
  const byes = byeCountForCut(size);
  if (byes === 0) return `Top ${size} advance. No byes at ${size}.`;
  return `Top ${size} advance. Seeds 1 to ${byes} get a bye.`;
}

/**
 * Whether the cut can be taken, and — when it cannot — the sentence that says why.
 *
 * `SplitPanes.tsx:101`'s `PaneAvailability` shape: the union is the enforcement. The one
 * `reason: null` arm is the size the host has not chosen yet, and it is spelled out as a
 * member rather than left as an absent string so that "inert for no stated reason" has to
 * be written down deliberately to happen at all.
 */
type CutGate = { ready: true; size: number } | { ready: false; reason: string | null };

function gateFor(state: DraftState, size: number | null): CutGate {
  // Completeness first, and it wins outright. It is the EARLIER problem — the host cannot
  // act on a tie in standings that are still moving — and a control carrying two reasons at
  // once would be the tool arguing with itself about which to fix first.
  const remaining = selectRemainingMatchCount(state);
  if (remaining > 0) return { ready: false, reason: incompleteReason(remaining) };

  const playerCount = state.config.players.length;
  if (size === null || !Number.isInteger(size) || size < 2 || size > playerCount) {
    return { ready: false, reason: null };
  }

  if (selectCutSplitsTiedBlock(state, size)) {
    return { ready: false, reason: tieSplitReason(size) };
  }

  return { ready: true, size };
}

export interface CutControlProps {
  state: DraftState;
  /**
   * The seeds the cut materializes, top seed first — an INTENT, not a dispatch.
   *
   * `TournamentScreen` turns it into the one `tournament/cutTaken` the log records and
   * moves focus to the bracket heading afterwards, because this control does not survive
   * its own success: the stage flips and it unmounts, so a focus handoff owned here would
   * be armed by a component that is gone before it could fire.
   */
  onTakeCut: (seeds: readonly string[]) => void;
}

export function CutControl({ state, onTakeCut }: CutControlProps) {
  const [raw, setRaw] = useState('');

  const size = parseNumericField(raw);
  const gate = gateFor(state, size);

  /**
   * The upper bound is the player count.
   *
   * Not a constant of its own: `import-guard.ts`'s `MAX_PLAYERS` already bounds how many
   * players a document can carry, on import and on creation alike, so this field can never
   * publish a bound larger than one the document could hold. Deriving it from the players
   * in front of the host keeps the affordance true of THIS tournament rather than of the
   * largest one the app permits.
   */
  const playerCount = state.config.players.length;

  // The preview follows the typed number rather than the gate, so it keeps answering while
  // the round robin is unfinished — the host is choosing a size against byes they can see.
  const previewSize = size !== null && Number.isInteger(size) && size >= 2 ? size : null;

  return (
    <div class="cut-control">
      <h3 class="cut-control__heading">{CUT_HEADING}</h3>

      <NumericField
        label={CUT_FIELD_LABEL}
        value={raw}
        onInput={setRaw}
        min={2}
        max={playerCount}
      />

      {previewSize !== null && (
        <p class="cut-control__preview">{previewFor(previewSize)}</p>
      )}

      {/*
        Rendered only when there is something to say, so `aria-describedby` below can never
        point at an element that is not there — a dangling reference reads to a screen
        reader as a control with no description at all, which is indistinguishable from the
        bug of having forgotten one.
      */}
      {!gate.ready && gate.reason !== null && (
        <p class="cut-control__reason" id={CUT_REASON_ID}>
          {gate.reason}
        </p>
      )}

      <button
        type="button"
        // ONE vnode shape across the gate boundary, per `SchedulePreview`: a different
        // element in each arm unmounts the node and drops focus to `<body>`.
        class={gate.ready ? 'cut-control__action' : 'cut-control__action cut-control__action--inert'}
        // `undefined`, never `'false'`: the attribute is SHED the moment the last result
        // lands or the tie is ordered (WR-04). `aria-disabled` and never native `disabled`,
        // because a natively disabled button is not focusable and the reason beside it is
        // the entire point of refusing the click.
        aria-disabled={gate.ready ? undefined : 'true'}
        aria-describedby={!gate.ready && gate.reason !== null ? CUT_REASON_ID : undefined}
        onClick={() => {
          // The early return is what keeps the attribute honest. Without it the ARIA would
          // claim the control is inert while a click still seeded a bracket.
          if (!gate.ready) return;

          // The standings order IS the seeding order — D-06's whole point in putting the
          // cut on this screen — so this reads the selector rather than re-sorting.
          onTakeCut(selectSeeding(state).slice(0, gate.size));
        }}
      >
        {TAKE_THE_CUT}
      </button>
    </div>
  );
}
