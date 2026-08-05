import { useEffect } from 'preact/hooks';

import { requestTakeover, type OwnershipState } from '../../adapters/tab-lock';
import { announce } from './LiveRegion';

import './ReadOnlyBanner.css';

/**
 * The read-only tab's banner — PERS-03 / D-12.
 *
 * This is the *explanation*. The guarantee is one line in `persistence.save()`, which
 * returns early unless this tab holds the lock. That split matters: if this component
 * were the mechanism, a rendering bug would become a data-loss bug. It cannot, because
 * nothing here gates a write.
 *
 * ## Two sentences, one button
 *
 * The banner says one of two things and offers the same action either way. That is
 * deliberate and comes straight from the UI-SPEC: a stale lock changes what is *true*
 * ("the other tab has stopped responding" rather than "the other tab is drafting"), and
 * changes nothing about what the host can *do* about it. Relabelling the button on the
 * stale path would imply a second, more forceful kind of takeover that does not exist —
 * there is exactly one, and it is the same click in both states.
 *
 * ## No colour signal, on purpose
 *
 * Read-only is the one state in the phase with no colour at all. The UI-SPEC's
 * "colour is never the only signal" rule is usually satisfied by adding a non-colour
 * signal alongside a colour one; here it is satisfied by having no colour signal to
 * begin with. The signals are the sentence and the `inert` draft region, both of which
 * survive a monochrome display, a colour-blind reader, and a screenshot.
 *
 * Read-only is emphatically not a *danger* state — nothing is wrong, another tab simply
 * got there first — so `--color-danger` is reserved for the two surfaces that own it.
 */

/**
 * Verbatim from the approved UI-SPEC copywriting table.
 *
 * Held as constants rather than inline JSX prose because JSX collapses whitespace
 * between text lines, and these are contracts down to the full stop.
 */
export const READ_ONLY_SENTENCE =
  'Another tab is drafting this tournament. This tab is read-only.';
export const STALE_SENTENCE = 'The tab that was drafting has stopped responding.';
export const TAKEOVER_LABEL = 'Take over drafting here';

export interface ReadOnlyBannerProps {
  ownership: OwnershipState;
}

export function ReadOnlyBanner({ ownership }: ReadOnlyBannerProps) {
  const { readOnly, stale } = ownership;
  const sentence = stale ? STALE_SENTENCE : READ_ONLY_SENTENCE;

  // Announce the sentence that is actually on screen, and re-announce when it changes
  // from one to the other. A host who is not looking at this tab still needs to learn
  // that the tab holding the draft stopped answering — that transition is the single
  // most important thing this component ever has to say.
  useEffect(() => {
    if (readOnly) announce(sentence);
  }, [readOnly, sentence]);

  if (!readOnly) return null;

  return (
    <div class="read-only-banner">
      {/*
        `role="status"` rather than `role="alert"`. Another tab holding the draft is a
        state to be told about, not an emergency to be interrupted for, and the polite
        live region above already carries the words.
      */}
      <p class="read-only-banner__text" role="status">
        {sentence}
      </p>

      <button type="button" class="read-only-banner__action" onClick={requestTakeover}>
        {TAKEOVER_LABEL}
      </button>
    </div>
  );
}
