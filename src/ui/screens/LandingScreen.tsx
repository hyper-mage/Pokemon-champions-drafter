import { useCallback, useRef } from 'preact/hooks';

import type { TournamentDoc } from '../../core/model';
import { fold } from '../../core/reduce';
import { selectPickCount } from '../../core/selectors';

import { StorageBlocked } from './StorageBlocked';

/**
 * The front door — D-01, 02-UI-SPEC §1.
 *
 * Phase 1 created a tournament the moment the roster finished loading, which meant the
 * app had exactly one entry point and JSON import was something you found on the toolbar
 * of a draft you did not want. This screen replaces that: nothing exists until the host
 * asks for it, and the three things they can ask for are all on one screen.
 *
 * No stylesheet of its own, following `StorageBlocked` in this same directory. The six
 * rules it needs live in `app.css` beside the shell they extend.
 *
 * ## The storage canary surfaces here
 *
 * Phase 1's D-13 put the canary before the first pool cell; D-01 moves the surface to the
 * landing screen, which is now what comes first. The probe itself still runs in `app.tsx`,
 * in a `useState` initializer during the very first render — an effect would run after the
 * first paint and the landing actions would flash up behind the warning. What moves is
 * where the answer is shown, not when it is asked.
 *
 * When it fails this screen renders `StorageBlocked` and NOTHING else — not the subtitle,
 * not the actions. The one thing the host must do first is read it, and a screen offering
 * `New tournament` beside a warning that says nothing will be kept is offering the host a
 * way to ignore it.
 */

/**
 * Verbatim from 02-UI-SPEC §Copywriting Contract → Landing screen.
 *
 * Module constants rather than inline JSX prose, following `StorageBlocked`: whitespace
 * between JSX text lines collapses, which usually produces the right result and cannot be
 * relied on to produce this exact one — and these are contracts down to the em dash.
 */
const TITLE = 'Pokémon Champions Drafter';
const SUBTITLE =
  'Run a Pokémon Champions draft on one shared screen. Nothing to install, no account.';
const NEW_TOURNAMENT = 'New tournament';
const RESUME_SAVED_DRAFT = 'Resume saved draft';
const IMPORT_JSON = 'Import JSON…';

/**
 * The line under `Resume saved draft`: `{formatLabel} — {m} players, {picks} of {total} picks`.
 *
 * No timestamp, per the UI-SPEC: a relative time needs a clock, and the format label plus
 * the progress is already enough to recognise which draft this is.
 *
 * Both counts are pluralised rather than interpolated bare, following
 * `ImportConfirmDialog.tsx:37-50` and for the same stated reason: a visible grammar error
 * reads as a tool that was not finished. The nouns agree with different numbers, which is
 * English rather than an oversight — `players` counts the players, and `picks` in
 * `{picks} of {total} picks` counts the total, so a one-player draft reads
 * `1 player, 1 of 6 picks` and never `1 players`.
 *
 * The pick count is taken from a fold rather than from the log's length: the log also
 * carries `pool/built` and `draft/started`, and later phases add bans and card plays.
 */
export function savedDraftDescription(doc: TournamentDoc): string {
  const playerCount = doc.config.players.length;
  const total = playerCount * doc.config.rounds;
  const picks = selectPickCount(fold(doc));

  const playerNoun = playerCount === 1 ? 'player' : 'players';
  const pickNoun = total === 1 ? 'pick' : 'picks';

  return `${doc.config.formatLabel} — ${playerCount} ${playerNoun}, ${picks} of ${total} ${pickNoun}`;
}

export interface LandingScreenProps {
  /**
   * The document sitting in browser storage, or null when there is none this build can
   * read. Read once at the edge; this screen only describes it.
   */
  saved: TournamentDoc | null;
  /** The canary failed and has not been acknowledged. Suppresses everything else. */
  storageBlocked: boolean;
  onAcknowledgeStorage: () => void;
  onNewTournament: () => void;
  onResume: () => void;
  /** A file the host chose. Validation and every consequence belong to the caller. */
  onImportFile: (file: File) => void;
}

export function LandingScreen({
  saved,
  storageBlocked,
  onAcknowledgeStorage,
  onNewTournament,
  onResume,
  onImportFile,
}: LandingScreenProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: Event) => {
      const input = event.currentTarget as HTMLInputElement;
      const file = input.files?.[0];

      // Cleared BEFORE the file is handed on, exactly as `TopBar` does and for the same
      // reason: a file input does not fire `change` when the same path is chosen twice
      // running, so a host who fixes a bad file and re-picks it would otherwise get
      // silence — and silence after an error message reads as the app having stopped.
      input.value = '';

      if (file === undefined) return;
      onImportFile(file);
    },
    [onImportFile],
  );

  return (
    <div class="landing">
      <h1 class="app-shell__title">{TITLE}</h1>

      {storageBlocked ? (
        <StorageBlocked onAcknowledge={onAcknowledgeStorage} />
      ) : (
        <>
          <p class="landing__subtitle">{SUBTITLE}</p>

          <div class="landing__actions">
            <button
              type="button"
              class="landing__action landing__action--primary"
              onClick={onNewTournament}
            >
              {NEW_TOURNAMENT}
            </button>

            {/*
              Rendered only when a save exists. There is deliberately no "no saved drafts"
              empty state: a first visit shows two buttons and the subtitle, and saying
              "nothing here" would be noise on the screen with the least to say.
            */}
            {saved !== null && (
              <div class="landing__choice">
                <button type="button" class="landing__action" onClick={onResume}>
                  {RESUME_SAVED_DRAFT}
                </button>

                <p class="landing__description">{savedDraftDescription(saved)}</p>
              </div>
            )}

            <button type="button" class="landing__action" onClick={openFilePicker}>
              {IMPORT_JSON}
            </button>

            {/*
              Hidden rather than visually-hidden, for the reason `TopBar` records: a file
              input styled off-screen stays in the tab order, so a keyboard user would meet
              an unlabelled second control doing the same thing as the button beside it.
              `hidden` removes it from the tab cycle and from assistive technology while
              leaving `.click()` working, which is the whole reason this element exists.
            */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={handleFileChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
