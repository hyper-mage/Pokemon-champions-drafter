import { Dialog } from './Dialog';

import './ImportConfirmDialog.css';

/**
 * The one destructive confirmation in Phase 1 — UI-SPEC section 4(d).
 *
 * Everything else the host can do in this phase is reversible: a pick is one click from
 * being undone, a download changes nothing, a refused import changes nothing. Replacing a
 * draft in progress is the single action that destroys work with no way back, which is
 * why it is the only surface in the plan wearing `--color-danger` as a fill and the only
 * one that asks first.
 *
 * The dialog does NOT appear when the current draft has no picks. There is nothing to
 * lose then, and a confirmation that fires when nothing is at stake teaches the host to
 * click through the one that matters.
 *
 * ## The buttons name what they do
 *
 * `Replace draft` and `Keep current draft`, never `OK` and `Cancel`. A host reading only
 * the buttons — which is what people do under a modal — still learns which one loses the
 * work. `Keep current draft` is the safe option and it is worded as a positive action
 * rather than as an absence, because "cancel" in a replace dialog is genuinely ambiguous:
 * it could mean cancel the import or cancel the draft.
 */

/**
 * Verbatim from the approved UI-SPEC copywriting table.
 *
 * Held as constants rather than as inline JSX prose because JSX collapses whitespace
 * between text lines, and these are contracts down to the em dash.
 */
export const IMPORT_CONFIRM_HEADING = 'Replace the current draft?';
export const REPLACE_LABEL = 'Replace draft';
export const KEEP_LABEL = 'Keep current draft';

/**
 * The body copy, with the pick count substituted.
 *
 * The UI-SPEC writes the slot as `{n} picks`. Rendering that literally produces
 * "— 1 picks —" on the first pick, which is reachable: the dialog shows whenever the
 * draft has at least one. The count is pluralised here rather than in the contract, on
 * the phase's own copy rule that the writing is careful — a visible grammar error in the
 * one dialog that destroys work reads as a tool that was not finished.
 */
export function importConfirmBody(pickCount: number): string {
  const picks = pickCount === 1 ? '1 pick' : `${pickCount} picks`;

  return `Importing loads a different tournament. The draft in progress — ${picks} — will be replaced and cannot be recovered unless you have already downloaded it.`;
}

export interface ImportConfirmDialogProps {
  /** Picks in the draft about to be replaced. Drives the body copy. */
  pickCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImportConfirmDialog({
  pickCount,
  onConfirm,
  onCancel,
}: ImportConfirmDialogProps) {
  return (
    <Dialog
      heading={IMPORT_CONFIRM_HEADING}
      dismissible
      tone="danger"
      onDismiss={onCancel}
      actions={
        <>
          {/*
            Order is deliberate: the destructive action first, the safe one second, so
            the safe one is the last thing focus reaches and the last thing read. Escape
            maps to `Keep current draft` — a reflexive Escape must never be the click
            that destroys the draft.
          */}
          <button
            type="button"
            class="dialog__action import-confirm__replace"
            onClick={onConfirm}
          >
            {REPLACE_LABEL}
          </button>

          <button type="button" class="dialog__action" onClick={onCancel}>
            {KEEP_LABEL}
          </button>
        </>
      }
    >
      <p>{importConfirmBody(pickCount)}</p>
    </Dialog>
  );
}
