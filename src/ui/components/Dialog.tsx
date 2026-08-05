import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useId, useRef } from 'preact/hooks';

import './Dialog.css';

/**
 * The modal primitive. Phase 1 needs it twice — the storage-unavailable screen here,
 * and plan 01-10's import-overwrite confirmation — which is why it is a component with
 * a `dismissible` flag rather than two hand-built overlays that drift apart.
 *
 * `role="alertdialog"` rather than `role="dialog"`: both uses interrupt the host with a
 * consequence they have not asked about, which is the distinction the role draws.
 *
 * Focus is the whole accessibility story of a modal, and it has three parts, all of them
 * here rather than assumed:
 *
 *   moved in    to the heading on mount, because the heading is the sentence that
 *               explains why the dialog appeared. `tabIndex={-1}` makes it a focus
 *               target without adding it to the tab cycle.
 *   trapped     so Tab and Shift+Tab cannot walk out into a page the host cannot see
 *               and must not act on.
 *   restored    to whatever was focused before, on unmount, so dismissing returns the
 *               keyboard to where it was rather than to the top of the document.
 *
 * When `dismissible` is false there is no close control and Escape does nothing.
 * Acknowledgement is required, and a dialog that can be dismissed by a reflexive Escape
 * has not been acknowledged (D-13).
 */

/**
 * Everything tabbable, minus anything explicitly removed from the cycle. Deliberately
 * not a library: the panel contains a heading, a paragraph and one or two buttons.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface DialogProps {
  heading: string;
  /** The body. Rendered as children so callers pass elements, never markup strings. */
  children: ComponentChildren;
  /** The buttons. The caller owns their order and their labels. */
  actions: ComponentChildren;
  /** False means no close control, and Escape is ignored. */
  dismissible: boolean;
  /**
   * `danger` is reserved for genuine data loss — the storage warning and plan 01-10's
   * import-overwrite confirm, and nothing else in this phase.
   */
  tone?: 'default' | 'danger';
  onDismiss?: () => void;
}

export function Dialog({
  heading,
  children,
  actions,
  dismissible,
  tone = 'default',
  onDismiss,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const headingId = useId();
  const bodyId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    headingRef.current?.focus();

    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Not a dismissal path when `dismissible` is false — the key is swallowed so it
        // cannot reach anything behind the dialog either.
        event.preventDefault();
        if (dismissible) onDismiss?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (panel === null) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (first === undefined || last === undefined) {
        // Nothing to move to. Keeping focus where it is beats letting it escape.
        event.preventDefault();
        return;
      }

      // -1 covers the heading, which holds focus on mount and is deliberately outside
      // the cycle. Treating it as "before the first" is what stops Shift+Tab from the
      // heading walking straight out of the panel.
      const index = focusable.indexOf(document.activeElement as HTMLElement);

      if (event.shiftKey) {
        if (index <= 0) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (index === -1 || index === focusable.length - 1) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismissible, onDismiss],
  );

  return (
    <div class="dialog-backdrop" onKeyDown={handleKeyDown}>
      <div
        ref={panelRef}
        class={`dialog dialog--${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={bodyId}
      >
        <h2 id={headingId} ref={headingRef} tabIndex={-1} class="dialog__heading">
          {heading}
        </h2>

        <div id={bodyId} class="dialog__body">
          {children}
        </div>

        <div class="dialog__actions">{actions}</div>
      </div>
    </div>
  );
}
