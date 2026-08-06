import './CheckpointPrompt.css';

/**
 * The PERS-06 checkpoint — D-11, UI-SPEC section 4(c).
 *
 * Phase 1 has exactly one hard milestone, and it is draft complete. That is the moment
 * the host has something worth keeping and the moment they are most likely to close the
 * tab, so it is the one place the app asks them to take a copy.
 *
 * ## It never downloads without a click
 *
 * This component cannot auto-download, and the guarantee is structural rather than
 * disciplinary: it imports nothing from the file-io adapter and has no access to the
 * tournament document. It takes a callback and renders a button. There is no code path
 * from mounting to a file appearing, because there is no code path from here to a file
 * at all — the only caller of `onDownload` is the CTA's own click handler.
 *
 * The reason D-11 insists on this: browsers treat unrequested downloads as hostile and
 * some block them outright, so an auto-download is unreliable as well as rude — and a
 * host who ends up with four mystery JSON files in their downloads folder has been given
 * a filing problem instead of a backup.
 *
 * ## Why `reached` is a prop
 *
 * Later phases add milestones against this same mechanism — ban reveal, bracket seeded —
 * so the trigger condition stays a prop rather than an inlined `selectIsComplete` call.
 * A component that decided for itself when it was relevant would have to be edited every
 * time a new milestone arrived, and would be three components by Phase 4.
 *
 * Non-modal, deliberately. The draft is finished and correct; this is an offer, not an
 * interruption, and the export panels below it are what the host actually came for.
 */

/**
 * Verbatim from the approved UI-SPEC copywriting table.
 *
 * Constants rather than inline JSX prose because JSX collapses whitespace between text
 * lines, and the heading's em dash and the body's comma placement are both contract.
 */
export const CHECKPOINT_HEADING = 'Draft complete — save a copy?';
export const CHECKPOINT_BODY =
  'Download the tournament JSON so you can reopen it on another machine, or after this browser clears its storage.';
export const CHECKPOINT_CTA = 'Download tournament JSON';
export const CHECKPOINT_DISMISS = 'Not now';

export interface CheckpointPromptProps {
  /** Whether the milestone has been reached. Phase 1 passes `selectIsComplete`. */
  reached: boolean;
  /** Whether the host has already waved it away this session. */
  dismissed: boolean;
  /** Write the file. The ONLY path from this component to a download. */
  onDownload: () => void;
  onDismiss: () => void;
}

export function CheckpointPrompt({
  reached,
  dismissed,
  onDownload,
  onDismiss,
}: CheckpointPromptProps) {
  if (!reached || dismissed) return null;

  return (
    <section class="checkpoint-prompt" aria-labelledby="checkpoint-heading">
      <h2 id="checkpoint-heading" class="checkpoint-prompt__heading">
        {CHECKPOINT_HEADING}
      </h2>

      <p class="checkpoint-prompt__body">{CHECKPOINT_BODY}</p>

      <div class="checkpoint-prompt__actions">
        <button
          type="button"
          class="checkpoint-prompt__cta"
          onClick={onDownload}
        >
          {CHECKPOINT_CTA}
        </button>

        {/*
          Text-only, and a real option rather than a grudging one. `Not now` says the
          offer will not be repeated at the host's expense, and dismissal lasts the
          session — re-asking on every render would turn a helpful prompt into a nag,
          which is how hosts learn to dismiss things without reading them.
        */}
        <button
          type="button"
          class="checkpoint-prompt__dismiss"
          onClick={onDismiss}
        >
          {CHECKPOINT_DISMISS}
        </button>
      </div>
    </section>
  );
}
