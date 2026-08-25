import { useCallback, useEffect, useRef } from 'preact/hooks';

import { isOwner } from '../../adapters/tab-lock';
import { canUndo } from '../../core/undo';
import { tournamentDoc } from '../../store';

import './TopBar.css';

/**
 * The sticky control bar — `Undo last move`, `Download JSON` and `Import JSON…`.
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
  /** Write the current tournament out as a file. */
  onDownload: () => void;
  /** A file the host chose. Validation and every consequence belong to the caller. */
  onImportFile: (file: File) => void;
  /**
   * The last import failure, or null. One of the two contracted sentences; this
   * component renders it and never composes it.
   */
  importError: string | null;
  /**
   * BOTH the button and the Ctrl+Z listener call this. Gating one only is Pitfall 6.
   *
   * The caller decides whether a confirm is warranted (D-37) and calls `store.undo`
   * itself. That is also where the species-name resolver went: this component no longer
   * touches the store, so it no longer needs one.
   */
  onRequestUndo: () => void;
  /** Throwing the tournament away. The caller owns the confirm and both consequences. */
  onRequestAbandon: () => void;
  /**
   * Names of the banned species, already name-sorted and roster-resolved by
   * `bannedEntries`. Its length is the set cardinality by construction, so the disclosure
   * needs no second count. Empty means the disclosure is not rendered at all.
   *
   * ## WHAT THIS IS HANDED IS WHAT THE ROOM MAY SEE RIGHT NOW — 04-UI-SPEC Amendment 1
   *
   * These are not "the bans". They are whatever the caller decided the room is allowed to
   * see at this moment, and the caller decides it with `selectPublicBanIds` — which in
   * blind mode before `bans/revealed` is the host's banlist ONLY, and never a submission.
   *
   * The reason is this element: the list below is a native disclosure any person standing
   * in the room can open with one click, so its content is one click from readable by
   * everyone present, and the blind stage's full-screen shield does not cover the chrome.
   *
   * This component holds no opinion about any of that and must not grow one. A branch here
   * would be a second authority on secrecy, free to disagree with the selector at exactly
   * the moment it matters.
   */
  bannedNames: readonly string[];
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
  onDownload,
  onImportFile,
  importError,
  onRequestUndo,
  onRequestAbandon,
  bannedNames,
}: TopBarProps) {
  const doc = tournamentDoc.value;
  const undoAvailable = doc !== null && canUndo(doc);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reports the request and does nothing else. Both entry points below already funnel
  // through this one function, so putting the D-37 gate at its FAR END covers both of
  // them; putting it on the button would cover one and leave the other walking past.
  const handleUndo = useCallback(() => {
    onRequestUndo();
  }, [onRequestUndo]);

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

      // This listener is on `document`, which is OUTSIDE the `inert` shell. `inert`
      // governs focus and pointer/keyboard targeting inside a subtree; it does not stop a
      // document-level handler from firing when the event target is `<body>`. So the
      // attribute that disables the `Undo last move` button beside this shortcut does not
      // disable the shortcut, and a read-only tab could undo the owner's pick from the
      // keyboard. `store.undo()` refuses this too and that refusal is the guarantee; this
      // one is here so a secondary tab does not swallow the browser's own Ctrl+Z with the
      // `preventDefault` below.
      //
      // Since 02-06 the D-37 confirm sits at the FAR END of the shared request function
      // above, which is what puts this listener and the button behind the same gate.
      // Moving the confirm onto the button would restore the bypass exactly.
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
          Undo last move
        </button>

        <button type="button" class="top-bar__button" onClick={onDownload}>
          Download JSON
        </button>

        <button type="button" class="top-bar__button" onClick={openFilePicker}>
          Import JSON…
        </button>

        {/*
          The same secondary treatment as its three neighbours. The draft screen still has
          no accent-filled button at all, and an abandon control that shouts is one a host
          clicks by accident — the dialog behind it is where the weight belongs, not here.
        */}
        <button type="button" class="top-bar__button" onClick={onRequestAbandon}>
          Abandon draft
        </button>

        {/*
          WHERE A MISSING POKÉMON WENT — D-13.

          A banned species is absent from the pool entirely: not dimmed, not struck, not
          rendered. That is the right behaviour and it leaves one question unanswered at the
          table — "wait, where's Landorus?" — which this is the answer to. Without it the
          answer lives in someone's memory of the config screen.

          A native disclosure element, because it carries keyboard operation and expanded
          state for free. A hand-rolled one is where both of those quietly go wrong, and
          02-UI-SPEC's accessibility baseline names this element specifically.

          READ-ONLY, and structurally so: this renders list text and contains no control. The
          banlist is written once, at Start, through `createTournament`, so there is no action
          that could edit it mid-draft — adding one would be a Phase 3 schema decision rather
          than a button. Nothing here is a seam for one.

          Not rendered at all when nothing is banned — 02-UI-SPEC §Empty and edge states.
          A zero-count disclosure is a control that answers a question nobody asked, and it
          would sit in the tab order of every draft that banned nothing.
        */}
        {bannedNames.length > 0 && (
          <details class="top-bar__bans">
            <summary class="top-bar__bans-summary">Bans ({bannedNames.length})</summary>
            <ul class="top-bar__bans-list">
              {bannedNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </details>
        )}

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
