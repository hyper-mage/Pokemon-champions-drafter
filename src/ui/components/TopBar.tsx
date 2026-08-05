import { useCallback, useEffect } from 'preact/hooks';

import { canUndo } from '../../core/undo';
import { tournamentDoc, undo } from '../../store';

import './TopBar.css';

/**
 * The sticky control bar — undo today, `Download JSON` and `Import JSON…` in plan 01-10.
 *
 * It is sticky because undo has to be reachable without scrolling. The host is looking
 * at a 235-cell pool when they realise the last pick was wrong, and a safety net you
 * have to scroll to find is not a safety net.
 *
 * Undo is styled as an ordinary secondary control on purpose, and the UI-SPEC states
 * the reason in one line: D-08's one-click no-confirm pick is only defensible because
 * D-10's unlimited undo ships alongside it, so undo must read as routine and reversible
 * rather than as an emergency. Hence no danger colour, no accent fill, no warning glyph
 * and no confirmation step — undo *is* the confirmation step.
 */

export interface TopBarProps {
  /**
   * Display name for a species id, for the live-region announcement. Injected because
   * the roster snapshot belongs to the app, not to the store or to this component.
   */
  resolveSpeciesName: (monId: string) => string;
}

/**
 * Whether a keyboard event landed somewhere the host is typing.
 *
 * Ctrl+Z inside a text field means "undo my typing" and always has. Stealing it there
 * would be the kind of shortcut that teaches people not to trust shortcuts. Phase 1 has
 * no text input on the draft screen, but Phase 2 adds pool search (DRFT-08) directly
 * into this bar, and by then the check has to already exist.
 */
function isTextEntry(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

export function TopBar({ resolveSpeciesName }: TopBarProps) {
  const doc = tournamentDoc.value;
  const undoAvailable = doc !== null && canUndo(doc);

  const handleUndo = useCallback(() => {
    undo(resolveSpeciesName);
  }, [resolveSpeciesName]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.altKey) return;
      // Ctrl+Shift+Z is redo everywhere it means anything, and there is no redo (D-10).
      // Undoing on it would be worse than ignoring it.
      if (event.shiftKey) return;
      if (event.key !== 'z' && event.key !== 'Z') return;
      if (isTextEntry(event.target)) return;

      event.preventDefault();
      handleUndo();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [handleUndo]);

  return (
    <div class="top-bar">
      <button
        type="button"
        class="top-bar__button"
        onClick={handleUndo}
        disabled={!undoAvailable}
        aria-disabled={undoAvailable ? 'false' : 'true'}
      >
        Undo last pick
      </button>
    </div>
  );
}
