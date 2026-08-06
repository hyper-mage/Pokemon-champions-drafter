import { useCallback, useEffect, useRef } from 'preact/hooks';

import { isOwner } from '../../adapters/tab-lock';
import { canUndo } from '../../core/undo';
import { tournamentDoc, undo } from '../../store';

import './TopBar.css';

/**
 * The sticky control bar — `Undo last pick`, `Download JSON` and `Import JSON…`.
 *
 * It is sticky because undo has to be reachable without scrolling. The host is looking
 * at a 235-cell pool when they realise the last pick was wrong, and a safety net you
 * have to scroll to find is not a safety net.
 *
 * All three controls are secondary — transparent fill, hairline outline, plain label —
 * and the draft screen deliberately has no accent-filled button at all. Picking is the
 * action of this screen and the pool cells are its target; a filled button up here would
 * compete with 235 of them for the same attention.
 *
 * Undo is styled as an ordinary secondary control on purpose, and the UI-SPEC states
 * the reason in one line: D-08's one-click no-confirm pick is only defensible because
 * D-10's unlimited undo ships alongside it, so undo must read as routine and reversible
 * rather than as an emergency. Hence no danger colour, no accent fill, no warning glyph
 * and no confirmation step — undo *is* the confirmation step.
 *
 * ## The two file controls are asymmetric, deliberately
 *
 * `Download JSON` acts immediately. It is non-destructive — the worst outcome is a file
 * the host did not want — and putting a confirmation in front of the action that PREVENTS
 * data loss would be exactly backwards.
 *
 * `Import JSON…` carries the ellipsis because it opens a file picker, and its
 * consequences are decided after the file has been read and validated: a file that is not
 * a tournament never reaches a dialog, and a good file only asks before replacing a draft
 * that has picks in it.
 */

export interface TopBarProps {
  /**
   * Display name for a species id, for the live-region announcement. Injected because
   * the roster snapshot belongs to the app, not to the store or to this component.
   */
  resolveSpeciesName: (monId: string) => string;
  /** Write the current tournament out as a file. */
  onDownload: () => void;
  /** A file the host chose. Validation and every consequence belong to the caller. */
  onImportFile: (file: File) => void;
  /**
   * The last import failure, or null. One of the two contracted sentences; this
   * component renders it and never composes it.
   */
  importError: string | null;
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

export function TopBar({
  resolveSpeciesName,
  onDownload,
  onImportFile,
  importError,
}: TopBarProps) {
  const doc = tournamentDoc.value;
  const undoAvailable = doc !== null && canUndo(doc);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUndo = useCallback(() => {
    undo(resolveSpeciesName);
  }, [resolveSpeciesName]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: Event) => {
      const input = event.currentTarget as HTMLInputElement;
      const file = input.files?.[0];

      // Cleared BEFORE the file is handed on, not after. A file input does not fire
      // `change` when the same path is chosen twice running, so a host who fixes a bad
      // file and re-picks it would otherwise get silence — and silence after an error
      // message reads as the app having stopped working. Clearing first also means an
      // async consumer cannot race the reset.
      input.value = '';

      if (file === undefined) return;
      onImportFile(file);
    },
    [onImportFile],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.altKey) return;
      // Ctrl+Shift+Z is redo everywhere it means anything, and there is no redo (D-10).
      // Undoing on it would be worse than ignoring it.
      if (event.shiftKey) return;
      if (event.key !== 'z' && event.key !== 'Z') return;
      if (isTextEntry(event.target)) return;

      // This listener is on `document`, which is OUTSIDE the `inert` draft region. `inert`
      // governs focus and pointer/keyboard targeting inside a subtree; it does not stop a
      // document-level handler from firing when the event target is `<body>`. So the
      // attribute that disables the `Undo last pick` button beside this shortcut does not
      // disable the shortcut, and a read-only tab could undo the owner's pick from the
      // keyboard. `store.undo()` refuses this too and that refusal is the guarantee; this
      // one is here so a secondary tab does not swallow the browser's own Ctrl+Z with the
      // `preventDefault` below.
      if (!isOwner()) return;

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
      <div class="top-bar__controls">
        <button
          type="button"
          class="top-bar__button"
          onClick={handleUndo}
          disabled={!undoAvailable}
          aria-disabled={undoAvailable ? 'false' : 'true'}
        >
          Undo last pick
        </button>

        <button type="button" class="top-bar__button" onClick={onDownload}>
          Download JSON
        </button>

        <button type="button" class="top-bar__button" onClick={openFilePicker}>
          Import JSON…
        </button>

        {/*
          Hidden rather than visually-hidden. A file input styled off-screen stays in the
          tab order, so a keyboard user would meet an unlabelled second control that does
          the same thing as the button beside it. `hidden` removes it from the tab cycle
          and from assistive technology while leaving `.click()` working, which is the
          whole reason this element exists.
        */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={handleFileChange}
        />
      </div>

      {/*
        Polite, and inline rather than modal. A refused import has changed nothing, so
        interrupting the host with a dialog they must dismiss would overstate it — the
        message names the problem and the next action, and the draft is still there
        behind it. `role="status"` is what carries it to a screen reader.
      */}
      {importError !== null && (
        <p class="top-bar__message" role="status">
          {importError}
        </p>
      )}
    </div>
  );
}
