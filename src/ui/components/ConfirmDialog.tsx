import { Dialog } from './Dialog';

import './ConfirmDialog.css';

/**
 * One confirmation pattern, six sets of copy — D-39.
 *
 * A thin generalisation of Phase 1's `ImportConfirmDialog`, which is now built on it. It
 * adds no focus management, no escape handling and no markup of its own beyond two
 * buttons and a paragraph: `Dialog` already implements the focus trap, the initial focus
 * and the restore, and a second dialog primitive would be a second set of those
 * behaviours to keep in step.
 *
 * ## The two rules that make a confirm safe
 *
 * The confirming button is FIRST in DOM order and the safe button is SECOND, so the safe
 * one is the last thing focus reaches and the last thing read. And Escape maps to the
 * safe callback, not to the confirming one, because a reflexive Escape must never be the
 * click that destroys the draft. Both are inherited verbatim from
 * `ImportConfirmDialog.tsx`, where they were argued out.
 *
 * The body arrives PRE-COMPOSED, as a string, from `confirm-copy.ts`. Never JSX prose and
 * never markup: JSX collapses whitespace between text lines, and a body assembled at the
 * call site is a body that can differ between two callers of the same dialog.
 */

export interface ConfirmDialogProps {
  heading: string;
  /** Pre-composed by a `confirm-copy.ts` function. Never inline JSX prose. */
  body: string;
  confirmLabel: string;
  safeLabel: string;
  /** `danger` only for genuine data loss. Two of the six qualify. */
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  /** Also wired to `Dialog`'s dismiss, so Escape takes the safe outcome. */
  onSafe: () => void;
}

export function ConfirmDialog({
  heading,
  body,
  confirmLabel,
  safeLabel,
  tone = 'default',
  onConfirm,
  onSafe,
}: ConfirmDialogProps) {
  return (
    <Dialog
      heading={heading}
      dismissible
      tone={tone}
      onDismiss={onSafe}
      actions={
        <>
          <button
            type="button"
            class={`dialog__action confirm-dialog__confirm confirm-dialog__confirm--${tone}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>

          <button type="button" class="dialog__action" onClick={onSafe}>
            {safeLabel}
          </button>
        </>
      }
    >
      <p>{body}</p>
    </Dialog>
  );
}
