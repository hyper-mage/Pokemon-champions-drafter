import { useState } from 'preact/hooks';

import { metricRange } from '../../core/import-guard';
import type { DraftState, MatchMetric, StageFormat } from '../../core/model';
import { liveResultFor, selectVoidCascade, type VoidCascade } from '../../core/tournament';
import { matches as matchCount } from '../confirm-copy';
import { Dialog } from './Dialog';
import { NumericField, parseNumericField } from './NumericField';
import { metricLabel } from './ResultsGrid';
import { SegmentedControl } from './SegmentedControl';

import './MatchRecordDialog.css';

/**
 * Recording one match — TOUR-04…07, D-05, D-08, D-09, D-10, D-11.
 *
 * ## Built on `Dialog`, and on nothing else
 *
 * Not on the two-button confirm beside it: this has INPUTS, and that component is a
 * consequence statement with a body and two buttons. `Dialog` already implements the focus
 * trap, the initial focus and the restore, and its own header records why a second dialog
 * primitive would be a second set of behaviours to keep in step. So there is no focus
 * management here, no Escape handling and no markup beyond the fields and two buttons.
 *
 * The confirm's two rules are kept verbatim: the confirming button is FIRST in DOM order
 * and the safe button SECOND, so the safe one is the last thing focus reaches and the last
 * thing read, and Escape maps to the safe callback.
 *
 * ## THE RELABEL IS THE CONFIRM (D-10, D-11)
 *
 * The moment the entered values differ from what is recorded, the primary button says what
 * pressing it will destroy — the count of later matches, or the bracket itself — and a
 * status region beside it names the same thing in a sentence. **Nobody presses a button
 * that names the bracket as the thing it is about to void without reading it**, and buttons
 * in this project already name a verb and its object; here the object is the void. Stacking
 * a second confirm on top of a form dialog would be a second modal pattern for one gesture,
 * so there is not one and there must not be one.
 *
 * The four labels are DESCRIBED rather than quoted here, on the pattern `FeasibilityBar`
 * records: the acceptance checks for this file are plain text searches, and a doc block
 * that spells out the strings makes the gate match its own documentation. They are module
 * constants below, which is where a reader should look.
 *
 * The label and the seqs the caller voids come out of ONE cascade call. That is what stops
 * the number the host read from disagreeing with the entries the action names (T-05-53): a
 * confirm that lied about its own cost would be worse than no confirm.
 *
 * ## ONE GESTURE, ONE ACTION — and the two-dispatch pairing the caller owes it
 *
 * D-05: the dialog collects everything and reports once, so a match is never half-recorded
 * and the standings never read a match with a winner and no metric. `dispatch` lives in the
 * store and no component may reach it (`CLAUDE.md` §Architecture — one write path), so this
 * hands the caller a finished record together with the cascade its own button label was
 * computed from.
 *
 * **The caller must dispatch `tournament/matchRecorded` FIRST and then, only when the
 * cascade is non-empty, `tournament/resultsVoided` carrying that cascade's `targetSeqs`
 * with `causedBySeq` set to the record's own `seq`, read back off the document between the
 * two.** The order is stated here because it is this component's label that promises it:
 * the reverse would show a result vanishing for no stated reason if anything went wrong
 * between them, and `causedBySeq` is what makes "undo puts the whole correction back in one
 * step" true rather than merely intended. Both dispatches are synchronous in one handler
 * and autosave is a trailing debounce, so no partial correction can be persisted (T-05-54).
 *
 * ## Focus after recording is `Dialog`'s, and no override may be added
 *
 * `Dialog` returns focus to the element that opened this — the cell, which still exists and
 * now shows the result. §Interaction: an override would be a second focus authority for the
 * one case the default already handles correctly. The same target is right after a cascade
 * void, because the downstream cards the host just emptied are on screen and they must see
 * that happen.
 */

/** Verbatim from `05-UI-SPEC` §Copywriting → Match record dialog. */
export const RECORD_PLAIN = 'Record the result';
export const RECORD_VOID_BRACKET = 'Record and void the bracket';
export const KEEP_RECORDED = 'Keep the recorded result';
export const IDENTICAL_REASON = 'This is already the recorded result.';

/**
 * `Record and void {n} matches`, with the count through the shared plural helper.
 *
 * §Copywriting names `matches` as one of the two helpers this phase adds, and the label
 * composes around it exactly — a one-match cascade reads `Record and void 1 match`. The two
 * cascade SENTENCES below keep the contract's bare plural instead, because interpolating
 * the helper into `{n} later matches` would say the noun twice; that is `FeasibilityBar`'s
 * stated posture, and the copy table is the thing to amend.
 */
export function recordVoidLabel(count: number): string {
  return `Record and void ${matchCount(count)}`;
}

export function cascadeSentence(cascade: VoidCascade): string {
  if (cascade.voidsCut) {
    return `The cut was taken from these standings. Changing this result voids the cut and every bracket match — ${cascade.matchCount} in total. Undo puts it all back in one step.`;
  }

  return `This changes who plays in ${cascade.matchCount} later matches. Those results are voided and the matches go back to unplayed. Undo puts it all back in one step.`;
}

/**
 * Two reasons the copy table does not carry, added under D-05 rather than invented.
 *
 * D-05's promise is that a match is never HALF recorded, and both of these are the half
 * cases reaching the button: a winner nobody chose, and a number outside the range the
 * import guard admits. The second is T-05-56 — Phase 3's rule is that the build cannot
 * create a document `isValidTournament` refuses to re-open, and `NumericField` records that
 * its own `min`/`max` are affordances rather than enforcement, so the refusal has to live
 * here. Both follow the house shape for an inert reason: the problem, then the next action.
 */
export const NO_WINNER_REASON = 'Choose a winner.';
/**
 * The range sentence, BY the metric — `metricRange`'s bounds interpolated, never a
 * literal.
 *
 * `Enter a number from 0 to 18.` was wrong for `koDifference` (WR-11): that metric is
 * "KOs scored minus KOs conceded" and signs both ways, so the sentence named a floor the
 * host could not honour and the field would not accept the number the metric asks for.
 */
export function metricRangeReason(metric: MatchMetric): string {
  const range = metricRange(metric);
  return `Enter a number from ${range.min} to ${range.max}.`;
}

/** What the caller dispatches. Every field is decided here; none is worked out again. */
export interface MatchRecord {
  matchId: string;
  winnerId: string;
  loserId: string;
  winnerGames: number;
  loserGames: number;
  metric: number;
}

export interface MatchRecordDialogProps {
  state: DraftState;
  matchId: string;
  /** The two participants, resolved by the surface that owns the pairing. */
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  /**
   * THE STAGE'S format, never the tournament's — D-08 makes them separate fields precisely
   * because a quick best-of-one round robin routinely feeds a best-of-three bracket. The
   * surface the cell belongs to decides which one applies and passes it.
   */
  format: StageFormat;
  onRecord: (record: MatchRecord, cascade: VoidCascade) => void;
  /** Also wired to `Dialog`'s dismiss, so Escape takes the safe outcome. */
  onKeep: () => void;
}

/**
 * `2–0` and `2–1`, with an en dash — the contract writes the dash and it is read.
 *
 * The VALUE is the loser's game count rather than a label slug, because that is the field
 * the action carries: `canApply` fixes the winner's games from the stage format and bounds
 * the loser's strictly below it, so the one number the host is choosing is this one.
 */
type LoserGames = '0' | '1';

const GAMES_OPTIONS: readonly { value: LoserGames; label: string }[] = [
  { value: '0', label: '2–0' },
  { value: '1', label: '2–1' },
];

/**
 * One dialog is on screen at a time, so the reason has one id — `FeasibilityBar`'s
 * reasoning for a module constant rather than a generated id, applied to a modal.
 */
const REASON_ID = 'match-record-reason';

export function MatchRecordDialog({
  state,
  matchId,
  aId,
  aName,
  bId,
  bName,
  format,
  onRecord,
  onKeep,
}: MatchRecordDialogProps) {
  // Core's answer, and `ResultsGrid.resultFor` states why it is asked there (IN-04). It
  // matters most here: this seeds the fields, so a superseded result would open the dialog
  // on a score the host already corrected and make `IDENTICAL_REASON` inert against it.
  const recorded = liveResultFor(state.matchResults, matchId);

  const showGames = format === 'bo3';
  const showMetric = state.config.depth === 'draftBracketsAndLog';

  // Seeded from what is recorded, so a correction opens on the result it is correcting and
  // the host changes the one thing they came to change. `null` on a fresh match: a winner
  // this dialog picked would be a winner nobody chose.
  const [winnerId, setWinnerId] = useState<string | null>(recorded?.winnerId ?? null);
  const [loserGames, setLoserGames] = useState<LoserGames>(
    recorded !== null && recorded.loserGames === 1 ? '1' : '0',
  );
  // The RAW text, held here. `NumericField` records why the caller holds it: a component
  // that held the number would have to invent something to display mid-edit.
  const [metricText, setMetricText] = useState<string>(
    recorded === null ? '0' : String(recorded.metric),
  );

  const winnerGames = showGames ? 2 : 1;
  const enteredLoserGames = showGames ? Number(loserGames) : 0;

  const parsedMetric = showMetric ? parseNumericField(metricText) : 0;
  // The tournament's own range, not a hard-coded floor of zero — one `metricRange` call
  // feeds this gate, the field's bounds and the sentence that says why (WR-11).
  const range = metricRange(state.config.matchMetric);
  const metricInRange =
    parsedMetric !== null &&
    Number.isInteger(parsedMetric) &&
    parsedMetric >= range.min &&
    parsedMetric <= range.max;

  const loserId = winnerId === null ? null : winnerId === aId ? bId : aId;

  /*
    ONE CALL, on every change of the entered values, and both the label and the seqs the
    caller voids come out of it. `nextWinnerId` is what the host has entered rather than
    what is recorded, which is the whole point: the number has to exist while they are
    still deciding whether to cause it.
  */
  const cascade: VoidCascade =
    winnerId === null
      ? { targetSeqs: [], matchCount: 0, voidsCut: false }
      : selectVoidCascade(state, matchId, winnerId);

  /*
    The identical-result state, mirroring `isUnchangedResult` — the reducer's backstop for
    the same fact. `05-UI-SPEC` §5 calls this the constraint-upstream-of-the-click pattern,
    and it does a second job: it is what keeps the live-region announcement safe from
    `LiveRegion`'s byte-identical limitation. The only way to produce two consecutive
    identical announcements is to record the same result twice running, and this state makes
    that unreachable.
  */
  const identical =
    recorded !== null &&
    winnerId !== null &&
    recorded.winnerId === winnerId &&
    recorded.loserId === loserId &&
    recorded.winnerGames === winnerGames &&
    recorded.loserGames === enteredLoserGames &&
    // NaN, not -1, as the "nothing parseable in the field" sentinel: -1 became a LEGAL
    // recorded metric when `koDifference` gained its negative half (WR-11), so a
    // recorded -1 beside an empty field would have compared equal.
    recorded.metric === (showMetric ? (parsedMetric ?? Number.NaN) : 0);

  const reason =
    winnerId === null
      ? NO_WINNER_REASON
      : showMetric && !metricInRange
        ? metricRangeReason(state.config.matchMetric)
        : identical
          ? IDENTICAL_REASON
          : null;

  const primaryLabel = cascade.voidsCut
    ? RECORD_VOID_BRACKET
    : cascade.matchCount > 0
      ? recordVoidLabel(cascade.matchCount)
      : RECORD_PLAIN;

  function handleRecord(): void {
    /*
      The early return IS the refusal. `aria-disabled` without the native attribute keeps
      the button focusable, which is the only way its reason is reachable from a keyboard —
      `FeasibilityBar` states the divergence and the reason at length.
    */
    if (reason !== null || winnerId === null || loserId === null) return;

    onRecord(
      {
        matchId,
        winnerId,
        loserId,
        winnerGames,
        loserGames: enteredLoserGames,
        metric: showMetric ? (parsedMetric ?? 0) : 0,
      },
      cascade,
    );
  }

  return (
    <Dialog
      heading={`${aName} versus ${bName}`}
      dismissible
      onDismiss={onKeep}
      actions={
        <>
          <button
            type="button"
            class="dialog__action match-record__record"
            aria-disabled={reason === null ? undefined : 'true'}
            aria-describedby={reason === null ? undefined : REASON_ID}
            onClick={handleRecord}
          >
            {primaryLabel}
          </button>

          <button type="button" class="dialog__action" onClick={onKeep}>
            {KEEP_RECORDED}
          </button>
        </>
      }
    >
      <div class="match-record">
        <SegmentedControl
          legend="Winner"
          name={`match-record-winner-${matchId}`}
          options={[
            { value: aId, label: aName },
            { value: bId, label: bName },
          ]}
          // No option matches the empty string, so a fresh match opens with nothing chosen
          // rather than with a winner this dialog picked.
          value={winnerId ?? ''}
          onChange={setWinnerId}
        />

        {showGames && (
          <SegmentedControl
            legend="Games"
            name={`match-record-games-${matchId}`}
            options={GAMES_OPTIONS}
            value={loserGames}
            onChange={setLoserGames}
          />
        )}

        {showMetric && (
          <NumericField
            label={`${metricLabel(state.config.matchMetric)} for the winner`}
            value={metricText}
            onInput={setMetricText}
            // Affordances, not enforcement — `NumericField` says so and the refusal above
            // is the authority. The bounds come from the import guard's own
            // `metricRange`, never a literal: the build must not be able to write a
            // document that cannot reopen. `min` is `-18` for `koDifference`, which is
            // what lets a winner who conceded more KOs than they scored enter the number
            // the metric actually names.
            min={range.min}
            max={range.max}
          />
        )}

        {/*
          A SURFACE-OWNED status region, and there is deliberately no `announce` call for
          this sentence: routing it through the global region as well would have the two
          competing to describe the same change, and it recomputes on every keystroke.
        */}
        {/*
          Keyed on the SEQS rather than on the match count, and the difference is D-11's
          case: a round-robin correction after the cut voids the cut itself, which is a
          target without being a match. With no bracket result recorded yet that is a
          cascade of one seq and zero matches — and the sentence naming it is the only
          warning the host gets that the cut is about to go.
        */}
        {cascade.targetSeqs.length > 0 && (
          <p class="match-record__cascade" role="status">
            {cascadeSentence(cascade)}
          </p>
        )}

        {/*
          NOT a second status region. The cascade sentence above owns the one in this
          dialog; a reason that also announced would have the two competing to describe the
          same keystroke. This one is reachable because the button keeps its place in the
          tab order and names this element as its description — which is the entire reason
          `aria-disabled` is used without the native attribute.
        */}
        {reason !== null && (
          <p class="match-record__reason" id={REASON_ID}>
            {reason}
          </p>
        )}
      </div>
    </Dialog>
  );
}
