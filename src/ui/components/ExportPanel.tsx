import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { announce } from './LiveRegion';

import './ExportPanel.css';

/**
 * One player's finished team, as text they can take to Showdown or pokebase — EXPO-01…06.
 *
 * ## The button is a convenience; the text is the feature (D-09)
 *
 * The paste is visible and selectable at all times, and the copy button sits ABOVE it
 * rather than replacing it. That ordering is the whole of D-09: the Clipboard API is
 * refused outright in an insecure context, can be blocked by a permissions policy, and
 * throws in several embedded webviews. If the button were the only route to the text,
 * every one of those cases would be a dead end at the exact moment the host has finished
 * a forty-minute draft and wants to leave with it. Because the text is on screen, the
 * worst clipboard failure in the world costs a manual select-all.
 *
 * The `<pre>` therefore carries `tabindex="0"` and an `aria-label`: a keyboard user must
 * be able to reach the text to select it, and a focusable region needs a name.
 *
 * ## One panel per player, never a combined block
 *
 * Even at two players. A combined block would have to be split by hand before either
 * team could be imported anywhere, and the blank line that separates records inside one
 * team is indistinguishable from a blank line between two teams — so a combined block is
 * not merely inconvenient, it is ambiguous.
 *
 * ## Why the paste block takes --text-body
 *
 * Mono family, but the BODY size, not `--text-label`. This is reading copy: the host
 * proof-reads it before pasting, and the one thing they are checking for is the blank
 * line between every species. EXPO-03's separator is load-bearing — newline-separated
 * output imports only the first Pokémon, silently — and 14px semibold would make that
 * blank line harder to spot rather than easier. `white-space: pre` for the same reason;
 * `pre-line` collapses exactly the character that matters.
 *
 * This component never builds paste text. `src/core/export/paste.ts` owns the format,
 * once, and is handed the finished string.
 */

/**
 * Verbatim from the approved UI-SPEC copywriting table.
 *
 * The helper string was corrected against the real menus by plan 01-08's export spike;
 * this is the post-spike wording, naming both targets, because one paste serves both.
 */
export const COPY_LABEL = 'Copy team paste';
export const COPY_SUCCEEDED = 'Copied';
export const COPY_FAILED = 'Copy failed — select the text below';
export const EXPORT_HELPER =
  'Paste into Pokémon Showdown → Teambuilder → import, or pokebase.app → New/Import Team.';

/** Long enough to read, short enough that the button is a button again before it is wanted. */
const SUCCESS_REVERT_MS = 2000;
/** Twice as long: this one asks the host to do something instead. */
const FAILURE_REVERT_MS = 4000;

type CopyFeedback = 'idle' | 'copied' | 'failed';

export interface ExportPanelProps {
  playerName: string;
  /** Finished paste text from `toShowdownPaste`. Never assembled here. */
  paste: string;
}

export function ExportPanel({ playerName, paste }: ExportPanelProps) {
  const [feedback, setFeedback] = useState<CopyFeedback>('idle');
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A panel unmounted mid-countdown must not come back to set state on a component that
  // is gone. Cheap to get right, and the failure mode is a console warning that outlives
  // the release it appeared in.
  useEffect(
    () => () => {
      if (revertTimer.current !== null) clearTimeout(revertTimer.current);
    },
    [],
  );

  const flash = useCallback((next: Exclude<CopyFeedback, 'idle'>, holdMs: number) => {
    if (revertTimer.current !== null) clearTimeout(revertTimer.current);
    setFeedback(next);
    revertTimer.current = setTimeout(() => {
      revertTimer.current = null;
      setFeedback('idle');
    }, holdMs);
  }, []);

  const handleCopy = useCallback(() => {
    // Named per player rather than announcing the bare button label. The live region
    // announces a CHANGE, so "Copied" for player two after "Copied" for player one is
    // silent — and copying every team in turn is precisely what this screen is for.
    const succeed = (): void => {
      flash('copied', SUCCESS_REVERT_MS);
      announce(`${playerName} team paste copied.`);
    };

    const fail = (): void => {
      flash('failed', FAILURE_REVERT_MS);
      announce(`${playerName} team paste not copied — select the text below.`);
    };

    // `navigator.clipboard` is undefined outright in an insecure context, so the optional
    // call is load-bearing rather than defensive habit: reading `.writeText` off
    // undefined would throw synchronously, past the promise rejection path below.
    const write = navigator.clipboard?.writeText(paste);

    if (write === undefined) {
      fail();
      return;
    }

    void write.then(succeed, fail);
  }, [paste, playerName, flash]);

  const buttonLabel =
    feedback === 'copied' ? COPY_SUCCEEDED : feedback === 'failed' ? COPY_FAILED : COPY_LABEL;

  return (
    <section class="export-panel" aria-label={`${playerName} team export`}>
      <h3 class="export-panel__heading">{playerName}</h3>

      {/*
        Above the text, always. The button never changes colour on success — the label
        carries the outcome, and a control that turns green is a control whose meaning
        depends on colour alone.
      */}
      <button type="button" class="export-panel__copy" onClick={handleCopy}>
        {buttonLabel}
      </button>

      {/*
        `tabindex="0"` so a keyboard user can reach the text and select it by hand, which
        is the fallback D-09 requires to always exist. The label names whose team it is,
        because a focusable region with no name is announced as "group".
      */}
      <pre class="export-panel__paste" tabIndex={0} aria-label={`${playerName} team paste`}>
        {paste}
      </pre>

      <p class="export-panel__helper">{EXPORT_HELPER}</p>
    </section>
  );
}
