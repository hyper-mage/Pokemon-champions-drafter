import { downloadJson, tournamentFilename } from '../../adapters/file-io';
import { listLibrary, type LibraryEntry } from '../../adapters/library';
import type { DraftState } from '../../core/model';
import { fold } from '../../core/reduce';
import {
  selectIsTournamentComplete,
  selectPickCount,
  selectPlayerName,
} from '../../core/selectors';
import { selectBracket, selectTournamentStage } from '../../core/tournament';

import './TournamentLibrary.css';

/**
 * The landing-screen tournament library. PERS-08, D-14, 05-UI-SPEC §12.
 *
 * Its section heading is {@link SECTION_HEADING}, and that string is written down exactly
 * once in this file — the acceptance gate counts it, and a second copy in a comment is a
 * second thing an editor can change without changing what renders.
 *
 * Every entry is a WHOLE document rather than a compacted summary, which is what makes a
 * row re-foldable, re-exportable and able to render a recap. §12 rejected the summary
 * shape outright and this component is downstream of that: it derives every word it shows
 * from a fold, and stores nothing.
 *
 * ## Why this reads `listLibrary()` during render rather than taking a prop
 *
 * The landing screen is reached by a screen change — booting, abandoning, or coming back
 * from a filed tournament — and every one of those re-renders this component, so a read
 * during render is always the library as it stands. A prop threaded from `app.tsx` would
 * be a second copy that has to be invalidated by hand at each of the three write sites,
 * and the failure mode of forgetting one is a list that silently shows yesterday's
 * tournaments.
 *
 * ## No roving tabindex, and that is a decision rather than an omission
 *
 * `use-roving-tabindex` exists for large uniform interactive sets — the pool grid, the
 * board, the results crosstable — where one tab stop is the difference between a usable
 * keyboard path and 234 of them. At most `LIBRARY_CAP` rows with two controls each is 24
 * stops in the worst case and it is not that kind of set. `PlayerList` already sets
 * the precedent: a list of rows uses plain tab stops, because arrow keys inside a vertical
 * list of buttons is a convention screen-reader users do not expect from a list.
 */

/**
 * Verbatim from `05-UI-SPEC` §Copywriting → Library. Module constants rather than inline
 * JSX prose, on `LandingScreen`'s and `StorageBlocked`'s rule: whitespace between JSX text
 * lines collapses, and these are contracts.
 */
const SECTION_HEADING = 'Your tournaments';
const OPEN_TOURNAMENT = 'Open tournament';

/**
 * EXPORTED, on `ResultsGrid.metricLabel`'s precedent rather than as a new default.
 *
 * `app.tsx`'s filing dialog offers the same download this row action offers, and D-14
 * requires the offer at every filing point. Two private copies of the label is how the
 * landing screen and the dialog end up naming one act two ways.
 */
export const DOWNLOAD_JSON = 'Download JSON';

/**
 * `createdAt` as `YYYY-MM-DD`, local, absolute.
 *
 * ## Why a date here does not contradict `savedDraftDescription`'s "no timestamp" rule
 *
 * The two composers sit one file apart and the apparent contradiction will be noticed, so
 * the reason is written down rather than left to be re-derived. That rule rejected a
 * RELATIVE time, because measuring elapsed time needs a clock and core is not allowed
 * one. The elapsed-time phrasing that rule rejects is deliberately not written
 * out here, even as an example: the acceptance check for it is a plain text search, and a
 * module that quotes the pattern in a comment is a module that fails its own gate — the
 * rule `app.css` states about the one CSS declaration this project bans.
 *
 * Formatting a stamp already on the document is a formatting call and needs nothing
 * ambient, which is why this function is allowed to exist at all. §12 states
 * the same reading, and adds the reason the date is needed at all: with up to twelve
 * entries a format label alone cannot distinguish them.
 *
 * `YYYY-MM-DD` rather than a locale format, and the choice is load-bearing twice.
 * `tournamentFilename` dates a download the same way, so a host pairing a row against a
 * file on disk is comparing two strings that already match. And a locale format would make
 * this string depend on the host's ICU data, which is the one thing a contract asserted on
 * exact equality cannot afford.
 *
 * EXPORTED so the eviction confirm's `{date}` slot is formatted by this function too — the
 * dialog names a tournament the host is about to read off this very list, and two date
 * formats for one entry is how they stop looking like the same night.
 */
export function libraryDate(epochMs: number): string {
  const at = new Date(epochMs);
  const year = `${at.getFullYear()}`;
  const month = `${at.getMonth() + 1}`.padStart(2, '0');
  const day = `${at.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * `{date} — {m} players, {status}` — §12's row description.
 *
 * Modelled on `LandingScreen.savedDraftDescription` deliberately, including its plural
 * helpers and its rule about where the pick count comes from: a FOLD, never the size of
 * the log. That measurement is not written out here even as the thing being rejected,
 * because the acceptance check for it is a plain text search — the same rule the date
 * composer above follows for the same reason.
 *
 * The log also carries `pool/built`, `draft/started`, bans, card plays and match results,
 * and an imported or corrected log can have gaps and superseded entries on top of that —
 * so counting its entries answers a different question in every document.
 *
 * The two nouns agree with two different numbers, which is English rather than an
 * oversight: `players` counts the players and `picks` counts the TOTAL, so a one-player
 * document reads `1 player, 1 of 6 picks` and never `1 players`.
 *
 * EXPORTED for the tests, which assert the whole string rather than a substring — a plural
 * helper agreeing with the wrong number still contains every word.
 */
export function libraryRowDescription(doc: LibraryEntry['doc']): string {
  // Folded ONCE and handed on. Every status branch is a question about the same fold, and
  // folding a second time inside the status composer would replay the whole log twice per
  // row — twenty-four replays on a full library, for one string.
  const state = fold(doc);

  const playerCount = doc.config.players.length;
  const playerNoun = playerCount === 1 ? 'player' : 'players';

  return `${libraryDate(doc.createdAt)} — ${playerCount} ${playerNoun}, ${libraryStatus(doc, state)}`;
}

/**
 * One of §12's three status strings, and every branch is a selector call.
 *
 * The three strings are §Copywriting → Library's and each is written here exactly once —
 * the acceptance gate counts them, so this block describes the BRANCHES rather than
 * quoting what they return. 05-10 set that posture for the same reason.
 *
 * The order runs from the most derived fact to the least, because the later branches are
 * only correct once the earlier ones are excluded:
 *
 *   1. The champion.   `championId` is non-null only once the final is recorded, which is
 *                      the whole of that field's contract — so the branch needs no second
 *                      question about whether the tournament is finished.
 *   2. No bracket.     `selectTournamentStage` answers `'notRunning'` on a finished draft,
 *                      and for a COMPLETE tournament that means exactly one thing:
 *                      `depth: 'draftOnly'`. The completeness gate is what keeps a draft
 *                      still in progress out of this branch, since an unfinished draft
 *                      answers `'notRunning'` too.
 *   3. In progress.    Everything else, including a finished draft whose round robin has
 *                      not been played out — which is genuinely in progress, just not the
 *                      part with the picks in it.
 *
 * The champion falls back to the id when the config no longer lists that player, on
 * `handleRequestUndo`'s posture in `app.tsx`: core holds ids and never a display name, and
 * a sentence naming nobody is worse than one naming a raw id.
 */
function libraryStatus(doc: LibraryEntry['doc'], state: DraftState): string {
  const bracket = selectBracket(state);
  if (bracket !== null && bracket.championId !== null) {
    return `${selectPlayerName(state, bracket.championId) ?? bracket.championId} won`;
  }

  const complete = selectIsTournamentComplete(state);
  if (complete && selectTournamentStage(state) === 'notRunning') {
    return 'draft complete, no bracket';
  }

  const total = doc.config.players.length * doc.config.rounds;
  const pickNoun = total === 1 ? 'pick' : 'picks';

  return `in progress, ${selectPickCount(state)} of ${total} ${pickNoun}`;
}

export interface TournamentLibraryProps {
  /**
   * Open a filed tournament by its document id. Every consequence is the caller's —
   * filing whatever is currently live comes first, and §12 routes that through the same
   * D-15 confirm rather than a second one.
   */
  onOpen: (id: string) => void;
}

export function TournamentLibrary({ onOpen }: TournamentLibraryProps) {
  /*
    Re-sorted by `createdAt`, and the re-sort is not redundant. `listLibrary` orders by
    `filedAt` because that is the field it can trust on a hand-edited key; §12 orders the
    VISIBLE list by `createdAt`, which is when the night happened rather than when the host
    got round to starting the next one. The two disagree the moment a tournament is opened
    and re-filed, which is a path this app offers.
  */
  const entries = listLibrary()
    .slice()
    .sort((a, b) => b.doc.createdAt - a.doc.createdAt);

  /*
    Zero entries renders NOTHING — no heading, no empty state. `LandingScreen` deliberately
    has no "no saved drafts" block, with the stated reason that saying "nothing here" would
    be noise on the screen with the least to say. Same rule, same reason, and it lives here
    rather than at the call site so it travels with the component.
  */
  if (entries.length === 0) return null;

  return (
    <section class="tournament-library">
      <h2 class="tournament-library__heading">{SECTION_HEADING}</h2>

      <ul class="tournament-library__list">
        {entries.map((entry) => (
          <li key={entry.doc.id} class="tournament-library__row">
            <h3 class="tournament-library__label">{entry.doc.config.formatLabel}</h3>

            <p class="tournament-library__description">{libraryRowDescription(entry.doc)}</p>

            <div class="tournament-library__actions">
              <button
                type="button"
                class="tournament-library__action"
                onClick={() => onOpen(entry.doc.id)}
              >
                {OPEN_TOURNAMENT}
              </button>

              {/*
                `tournamentFilename` and `downloadJson` unchanged, and no second naming
                scheme. A filed tournament and a live one have to download under the same
                name or a host cannot pair them up on disk — which is the whole reason
                D-14 keeps offering the file at all.
              */}
              <button
                type="button"
                class="tournament-library__action"
                onClick={() => downloadJson(tournamentFilename(entry.doc), entry.doc)}
              >
                {DOWNLOAD_JSON}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
