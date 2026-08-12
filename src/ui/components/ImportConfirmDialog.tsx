import { IMPORT_CONFIRM } from '../confirm-copy';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Replacing a draft in progress — UI-SPEC section 4(d), now one instance of D-39.
 *
 * Everything else the host can do on the draft screen is reversible: a pick is one click
 * from being undone, a download changes nothing, a refused import changes nothing.
 * Replacing a draft is one of only two actions in the app that destroy work with no way
 * back, which is why it is `danger` toned.
 *
 * The dialog does NOT appear when the current draft has no picks. There is nothing to
 * lose then, and a confirmation that fires when nothing is at stake teaches the host to
 * click through the one that matters.
 *
 * ## The buttons name what they do
 *
 * `Replace draft` and `Keep current draft`, never `OK` and `Cancel`. A host reading only
 * the buttons — which is what people do under a modal — still learns which one loses the
 * work. `Keep current draft` is worded as a positive action rather than as an absence,
 * because "cancel" in a replace dialog is genuinely ambiguous: it could mean cancel the
 * import or cancel the draft.
 *
 * ## What changed in 02-06
 *
 * The component is now a thin wrapper over `ConfirmDialog` rather than a second hand-rolled
 * dialog. The heading and both labels are re-exported unchanged, so every Phase 1 import of
 * them still resolves.
 */

/**
 * Re-exported from `confirm-copy.ts`, which is now the single home for confirm strings.
 * Kept as named exports here because Phase 1 call sites and tests import them from this
 * module, and a copy contract that moves house should not also change address.
 */
export const IMPORT_CONFIRM_HEADING = IMPORT_CONFIRM.heading;
export const REPLACE_LABEL = IMPORT_CONFIRM.confirmLabel;
export const KEEP_LABEL = IMPORT_CONFIRM.safeLabel;

/**
 * The body copy, with the pick and player counts substituted.
 *
 * THE STRING CHANGED IN 02-06, and it gained a second parameter. 02-UI-SPEC §11 gives
 * every confirm's body literally and states that "D-39 is an instance-level contract, not
 * a pattern to be improvised against at build time"; the Component inventory row for this
 * component separately says its copy is unchanged. §11 wins on its own terms, and only on
 * the one field the two rows disagree about — tone, button order and both labels are as
 * Phase 1 left them.
 *
 * Pluralisation still happens inside the composer rather than in the contract, for the
 * reason Phase 1 gave: a visible grammar error in the one dialog that destroys work reads
 * as a tool that was not finished. Both counts are now pluralised, because a one-player
 * tournament is a configuration this phase allows a host to reach.
 */
export function importConfirmBody(pickCount: number, playerCount: number): string {
  return IMPORT_CONFIRM.body(pickCount, playerCount);
}

export interface ImportConfirmDialogProps {
  /** Picks in the draft about to be replaced. Drives the body copy. */
  pickCount: number;
  /** Players in the draft about to be replaced. */
  playerCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImportConfirmDialog({
  pickCount,
  playerCount,
  onConfirm,
  onCancel,
}: ImportConfirmDialogProps) {
  return (
    <ConfirmDialog
      heading={IMPORT_CONFIRM_HEADING}
      body={importConfirmBody(pickCount, playerCount)}
      confirmLabel={REPLACE_LABEL}
      safeLabel={KEEP_LABEL}
      tone={IMPORT_CONFIRM.tone}
      onConfirm={onConfirm}
      onSafe={onCancel}
    />
  );
}
