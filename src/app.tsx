import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';

import { downloadJson, readJsonFile, tournamentFilename } from './adapters/file-io';
import {
  fileTournament,
  oldestEntry,
  openLibraryEntry,
  type LibraryEntry,
} from './adapters/library';
import {
  clearSaved,
  load as loadSavedTournament,
  loadIfNewer,
  probeStorage,
  save as saveTournament,
  savingBlocked,
  startAutosave,
  type ProbeResult,
} from './adapters/persistence';
import {
  loadRoster,
  resolveSnapshot,
  ROSTER_LOAD_FAILURE_MESSAGE,
  type RosterBundle,
  type SpriteMeta,
} from './adapters/roster-source';
import { claimOwnership, disposeTabLock, notifyAbandoned } from './adapters/tab-lock';
import { loadViewPrefs, saveViewPrefs, type PaneState } from './adapters/view-prefs';
import {
  bansPlaced,
  bansRevealed,
  bansSubmitted,
  cardsPlayed,
  matchRecorded,
  orderResolved,
  pickMade,
  reopened,
  resultsVoided,
  swapMade,
  swapPassed,
} from './core/actions';
import { bannedEntries } from './core/bans';
import { resolvePickOrder, type CardOffer } from './core/cards';
import { checkFeasibility } from './core/feasibility';
import { parseTournamentFile } from './core/import-guard';
import type { DraftState, TournamentDoc } from './core/model';
import type { RosterEntry } from './core/roster/types';
import {
  selectAvailablePool,
  selectBanStageState,
  selectCardOffer,
  selectCardPlayOrder,
  selectCardsPlayedThisRound,
  selectCardTurn,
  selectCurrentRound,
  selectCurrentSwapRound,
  selectCurrentTurn,
  selectDealsCards,
  selectHand,
  selectIsTournamentComplete,
  selectPhase,
  selectPickCount,
  selectPlayerName,
  selectPublicBanIds,
  selectResolvedOrder,
  selectRoundEligibleIds,
  selectRoundKind,
  selectSchedule,
  selectSlotKind,
  selectSwapOrderSource,
  selectSwapRoundPosition,
  selectSwapsRemaining,
  selectSwapTargets,
  selectTeams,
} from './core/selectors';
import { selectRemainingMatchCount, type VoidCascade } from './core/tournament';
import { undoCrossesRoundBoundary, type RoundBoundaryCrossing } from './core/undo';
import {
  abandonTournament,
  adoptTournament,
  dispatch,
  draftState,
  drawPoolForBanStage,
  getDoc,
  getState,
  subscribe,
  tournamentDoc,
  undo,
} from './store';
import {
  ABANDON_BAN_STAGE_CONFIRM,
  ABANDON_CONFIRM,
  EVICTION_CONFIRM,
  FILING_CONFIRM,
  REOPEN_CONFIRM,
  SWAP_CONFIRM,
  UNDO_BAN_SUBMISSION_CONFIRM,
  UNDO_BOUNDARY_CONFIRM,
  UNDO_RESOLVED_ORDER_CONFIRM,
  UNDO_REVEAL_CONFIRM,
} from './ui/confirm-copy';
import { BoardGrid } from './ui/components/BoardGrid';
import { CardPanel, type PlayedCard } from './ui/components/CardPanel';
import { ConfirmDialog } from './ui/components/ConfirmDialog';
import { Dialog } from './ui/components/Dialog';
import { ImportConfirmDialog } from './ui/components/ImportConfirmDialog';
import { announce, LiveRegion } from './ui/components/LiveRegion';
import { MatchRecordDialog, type MatchRecord } from './ui/components/MatchRecordDialog';
import {
  PoolGrid,
  type MegaRoundRestriction,
  type SwapArming,
  type SwapBudget,
} from './ui/components/PoolGrid';
import { ReadOnlyBanner } from './ui/components/ReadOnlyBanner';
import {
  RESULTS_FIRST_CELL_ID,
  type ResultsGridProps,
} from './ui/components/ResultsGrid';
import {
  CARD_PHASE_EXPAND_REASON,
  SplitPanes,
  SWAP_ROUND_EXPAND_REASON,
} from './ui/components/SplitPanes';
import { SwapPanel } from './ui/components/SwapPanel';
import { boardCellId } from './ui/components/TeamStrip';
import { DOWNLOAD_JSON, libraryDate } from './ui/components/TournamentLibrary';
import { TopBar } from './ui/components/TopBar';
import { TurnBanner } from './ui/components/TurnBanner';
import { BanStageScreen } from './ui/screens/BanStageScreen';
import { CompletedDraft } from './ui/screens/CompletedDraft';
import { ConfigScreen } from './ui/screens/ConfigScreen';
import { LandingScreen } from './ui/screens/LandingScreen';
import { StorageBlocked } from './ui/screens/StorageBlocked';
import { TournamentScreen } from './ui/screens/TournamentScreen';
import { useOwnership } from './ui/use-ownership';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; bundle: RosterBundle }
  | { status: 'failed'; message: string };

/**
 * The OPEN document's own roster — D-24. Separate from `LoadState` above, which is the
 * DEFAULT roster and stays resolved beside this one.
 *
 * Two resolved snapshots at once is the consequence 05-CONTEXT.md spells out under D-24:
 * the app must be able to hold more than one snapshot resolved at once — the live
 * document's and the default — rather than assuming the loader's single default answer.
 * A filed M-B night opening on a build whose default has moved to M-C is the whole point,
 * and it is not a rare path — Champions regulations rotate roughly every 2.5 months.
 *
 * `unresolvable` is a state and not an error, and it is deliberately NOT collapsed into
 * `none`. The difference is everything the host is told: `none` means no document is open,
 * `unresolvable` means one is open and this build has never seen the roster it names. The
 * second gets a sentence; the first gets silence.
 */
type DocumentRoster =
  | { status: 'none' }
  | { status: 'resolving' }
  | { status: 'ready'; bundle: RosterBundle }
  | { status: 'unresolvable'; rosterVersion: string };

/**
 * Which screen the app is showing — D-01.
 *
 * A discriminated union in the same style as `LoadState` and `ImportFlow`, and the reason
 * it exists at all is that Phase 1 had no concept of a screen: the app created a
 * tournament as soon as the roster resolved, so "which screen" and "does a tournament
 * exist" were the same question. They are not the same question any more — a host can be
 * on the config screen with no document, and can arrive at the draft from three different
 * places — so the answer is held rather than inferred.
 *
 * ## Why the ban stage is a FOURTH member and not a mode inside the draft screen
 *
 * Pitfall 4, and the comparison is recorded here so nobody reverses it later. D-11 puts
 * `draft/started` BEFORE the ban stage, so `order` and `schedule` are both populated while
 * `poolIds` is still empty — and `selectPhase` answers `'cards'` for exactly that shape. A
 * mode inside the draft screen would therefore have to shield `selectPhase`, `selectCardTurn`,
 * the card panel, the board and the two hand strips individually: five places that can each
 * be got wrong, against one union member and one `setScreen` call. The answer is not close.
 *
 * ## Why the tournament is a FIFTH member, beside the fourth's reason
 *
 * The same argument one measurement further along, and this time it is arithmetic rather
 * than a count of selectors. `05-UI-SPEC` §Layout Budget: the 8-player crosstable wants
 * 204px columns, `.app-shell`'s 1200px cap yields 114px per column, and
 * `--results-col-min` is 188px. **114 cannot hold 188 and 204 can**, so the tournament
 * surfaces need the full-bleed shell — and the shell is chosen by `screen.name` in the
 * expression below. A mode inside the draft screen could not reach a different shell
 * without teaching that expression about a second state variable. Full-bleed is forced by
 * measurement exactly as `02-UI-SPEC`'s 86px round cell forced sprite-only board chips.
 *
 *   `landing`     the front door — resume, import, or a new tournament
 *   `config`      the form, which writes a document exactly once
 *   `bans`        the blind or snake ban stage, BEFORE the draft (D-11)
 *   `draft`       the pool, the board and the rest of the tournament
 *   `tournament`  the round robin, the cut, the bracket and the recap — entered by an
 *                 explicit host act and never by the router, see `screenForState`
 */
type Screen =
  | { name: 'landing' }
  | {
      name: 'config';
      /**
       * The host arrived by pressing `Update the roster` on the landing screen's staleness
       * banner, so focus goes to `Check for a new roster` rather than to the top of the
       * form — D-26.
       *
       * It rides on the ROUTE rather than living in its own `useState` because it is a
       * property of how this screen was reached, and a separate flag would have to be
       * cleared by hand on every other route into `config` or it would leak: the next
       * `New tournament` would silently steal focus into the roster group.
       */
      focusRoster?: boolean;
    }
  | { name: 'bans' }
  | { name: 'draft' }
  | { name: 'tournament' };

/**
 * Which screen a document belongs on — the one place that is answered.
 *
 * Four call sites route to "the tournament screen": starting one, resuming one, importing
 * one, and adopting one on promotion or a remote save. Every one of them can be handed a
 * snake ban stage, so every one of them has to ask this question — and a `setScreen({ name:
 * 'draft' })` left behind at any of them would drop the host onto the draft screen with an
 * empty pool, which is Pitfall 4 arriving through the router instead of through a mode.
 *
 * It BRANCHES on `selectBanStageState` and decides nothing: `'notRunning'` is that
 * selector's answer for a hostBanlist tournament and for a stage that is already behind the
 * document, which are precisely the two cases that belong on the draft screen.
 *
 * ## `tournament` IS DELIBERATELY ABSENT, and that is not an oversight
 *
 * The doc block above names the failure a FORGOTTEN call site produces, so the reason for
 * a deliberate omission belongs beside it. Routing on `selectIsTournamentComplete` would
 * move the host off the per-player export panels the instant the last pick landed —
 * pastes half-copied, `Download the tournament JSON` gone from under the cursor — to a
 * screen nobody asked for. Nothing about the tournament is unavailable until it is
 * entered: every pairing is derived, so the round robin exists whether it is on screen or
 * not. `CompletedDraft` offers the way in and `TournamentScreen` offers the way back, and
 * both are host acts. **Do not teach this function to return it.**
 */
function screenForState(state: DraftState | null): Screen {
  if (state === null) return { name: 'draft' };
  return selectBanStageState(state) === 'notRunning' ? { name: 'draft' } : { name: 'bans' };
}

/**
 * Where an import has got to.
 *
 * `confirm` holds the already-validated document rather than the file it came from. That
 * ordering is the T-01-45 mitigation made structural: by the time this state exists the
 * file has been read, size-gated, parsed, rebuilt from an allow-list and version-checked,
 * so the only question the dialog asks is the one the host can actually answer. A file
 * that fails never gets as far as a confirmation, and a cancelled confirmation drops a
 * document that was never installed anywhere.
 */
type ImportFlow =
  | { status: 'idle' }
  | { status: 'failed'; message: string }
  | { status: 'confirm'; doc: TournamentDoc };

/**
 * Which confirmation is open — D-36 / D-37.
 *
 * In the same style as `LoadState` and `ImportFlow`, and holding the RESOLVED CONSEQUENCE
 * rather than the intent. `abandon` carries the counts the body sentence names; `undo`
 * carries the crossing the predicate returned and the display name resolved from it. Both
 * were computed at the moment the host asked, so the dialog states the world it was opened
 * against and cannot drift from it while it is on screen.
 *
 * That shape is `ImportFlow`'s, which holds an already-validated document rather than the
 * file it came from, for the same reason: the only question a dialog should ask is the one
 * the host can actually answer.
 */
/**
 * The match the record dialog is open on, already resolved — or `null` for closed.
 *
 * `ResultsGrid` composes this and 05-13's bracket will compose the same shape, so the type
 * is read off the grid's own prop rather than restated: two declarations of one payload is
 * two places a field can be added to only once.
 */
type RecordingMatch = Parameters<ResultsGridProps['onSelectMatch']>[0] | null;

/**
 * What a filing gesture is on its way to doing — D-15, 05-UI-SPEC §12.
 *
 * §12 rules that opening a library entry files the current tournament first "through the
 * same D-15 confirm — one filing path, not two". This is what makes that one path able to
 * serve both gestures: the confirm asks the filing question, and this rides along saying
 * where to go once it is answered. A second confirm shape for the same act would be a
 * second thing to keep in step.
 */
type AfterFiling = { kind: 'newTournament' } | { kind: 'openEntry'; id: string };

type Confirm =
  | { kind: 'idle' }
  | { kind: 'abandon'; picks: number; players: number }
  /**
   * Filing the live tournament — D-15, 05-UI-SPEC §Amendment 1.
   *
   * `default` toned and INFORMING rather than warning, which is the whole of the
   * amendment: with a library in place nothing is lost, so a red dialog would be a lie
   * about the consequence. What the host needs is where the tournament went.
   *
   * The document is captured here rather than re-read when the dialog is answered, on the
   * shape every other variant in this union takes: the sentence describes the world the
   * host was asked about and cannot drift while it is on screen.
   */
  | { kind: 'file'; doc: TournamentDoc; after: AfterFiling }
  /**
   * Filing at the cap — D-16. Raised INSTEAD OF the filing confirm, not after it.
   *
   * One question is asked, and it is the one with the larger consequence attached. Two
   * dialogs in a row for one gesture would train the host to click through the first,
   * which is the one carrying the eviction.
   *
   * `dropped` is read from `oldestEntry()` BEFORE anything is written, which is the whole
   * of D-16: the host is told which night is about to go, and offered its file, while it
   * still exists.
   */
  | { kind: 'evict'; doc: TournamentDoc; dropped: LibraryEntry; after: AfterFiling }
  /**
   * The library write did not land — D-14, and deliberately not a confirmation.
   *
   * It asks nothing: the answer is already decided, and both controls are ways of leaving.
   * It is in this union rather than in a state of its own because it is raised from the
   * same handler and dismissed by the same `closeConfirm`, and a second piece of dialog
   * state would be a second thing that can be left open behind another one.
   */
  | { kind: 'fileFailed'; doc: TournamentDoc }
  /**
   * An undo, with everything its four possible copy sets between them need.
   *
   * `playerCount` is here for the reveal set, whose body names how many players' bans stay
   * recorded. Resolved when the host asked, like every other field on this union — the
   * dialog states the world it was opened against and cannot drift while it is on screen.
   */
  | {
      kind: 'undo';
      crossing: RoundBoundaryCrossing;
      playerName: string;
      playerCount: number;
    }
  /**
   * A swap, resolved at the moment the pool cell was clicked.
   *
   * Ids for the dispatch, names for the sentence, and the remaining count as it stood when
   * the question was asked — the shape the two above already take. Holding names rather than
   * looking them up at render time is what lets the dialog state the world it was opened
   * against: nothing here can drift while it is on screen.
   */
  /**
   * Reopening a finished tournament — D-17, 05-UI-SPEC §10.
   *
   * The one member of this union with NO FIELDS, and that is the copy set's shape rather
   * than an omission. `REOPEN_CONFIRM.body` is a plain string, alone among the sets that
   * say anything substantive, because there is nothing to resolve: the sentence describes
   * what CORRECTING will cost, not what reopening costs, and that is the same sentence
   * whatever the tournament held. Reopening itself voids nothing.
   *
   * So the "state the world the host was asked about" rule that puts counts on every other
   * member is satisfied here by there being no world-dependent claim to make.
   */
  | { kind: 'reopen' }
  | {
      kind: 'swap';
      playerId: string;
      playerName: string;
      round: number;
      outMonId: string;
      outName: string;
      inMonId: string;
      inName: string;
      remaining: number;
    };

/**
 * The slot a player has armed for a swap, or `null` — 03-UI-SPEC §10 step 1.
 *
 * Arming is VIEW STATE and belongs here rather than in the log, which is the whole of D-27's
 * "slot first, then pool": choosing which slot to look at changes nothing about the
 * tournament, and a `swap/armed` action would put a UI mode into a document that has to
 * survive an export. What is NOT view state is the offer — `selectSwapTargets` answers that,
 * and this file only asks.
 *
 * `outMonId` is carried so the dispatch is self-describing without re-reading the board, and
 * so an armed slot whose species has changed underneath it (an undo, another tab) cannot
 * commit against a species that is no longer there.
 */
type ArmedSlot = { playerId: string; round: number; outMonId: string } | null;

/**
 * Verbatim from the approved UI-SPEC copywriting table.
 *
 * Two sentences for five rejection reasons, which is deliberate rather than lazy. The
 * host can act on exactly one distinction: "this is not one of my tournament files" —
 * where the answer is to choose a different file — versus "this IS one, from a newer
 * build" — where the answer is to reload. Reporting `tooLarge` separately from `notJson`
 * would be reporting the guard's internals, and neither leads anywhere different.
 */
const IMPORT_WRONG_SHAPE =
  'That file is not a Champions Drafter tournament. Choose a .json file this app exported.';
const IMPORT_NEWER_SCHEMA =
  'This tournament was saved by a newer version of the app. Reload the page and try again.';

/**
 * The library write was refused — D-14. Here rather than in `confirm-copy.ts`, and the
 * boundary is that file's own: it holds "every confirmation's words", and this asks the
 * host nothing. Both of its controls are ways of leaving a thing that has already
 * happened.
 *
 * Follows the house form for an error — the problem, then the next action — which the two
 * import sentences above take and which is why this sits beside them. The next action is
 * the download, and it is the dialog's primary button rather than a suggestion.
 *
 * The heading states the outcome rather than asking a question, because the other three
 * headings in this flow are questions and this one has no answer to offer. It names the
 * tournament in the body for the same reason every dialog in this app does: a host reading
 * only part of it still learns which night is at stake.
 */
const FILING_FAILED_HEADING = 'That tournament was not filed';

function filingFailedBody(formatLabel: string): string {
  return `Browser storage refused the write, so ${formatLabel} is still open and nothing else has changed. Download the JSON to keep a copy this browser cannot lose.`;
}

/**
 * The adopted-document notice — the one place an imported or resumed tournament's
 * arithmetic becomes visible to the host.
 *
 * `{reason}` is `problems[0].message`, which already ends in a full stop, so nothing is
 * punctuated here. Composed rather than written as JSX prose, for the reason
 * `ImportConfirmDialog` gives: JSX collapses whitespace between text lines.
 */
function adoptedNotice(reason: string): string {
  return `This tournament's configuration no longer adds up: ${reason} The draft still runs, but it may run out of Pokémon before every team is full.`;
}

/**
 * What the host is told when the roster has moved on from the document.
 *
 * NOT in the 02-UI-SPEC copywriting table — flagged here as an amendment rather than
 * edited into the spec, exactly as `importAnnouncement` below is. The table has no row for
 * it because no plan in the phase surfaced the case, and the case is not exotic: CLAUDE.md
 * records that Champions regulations rotate roughly every 2.5 months, and `bans.ts` calls a
 * saved tournament outliving a species "the ordinary case rather than an attack".
 *
 * Two surfaces resolve a stored id through the roster and render nothing on a miss. The
 * pool grid drops the cell — and the `{n} available` count follows the render, so the
 * screen agrees with itself about a number that is quietly wrong — and a board cell for a
 * dropped species used to render as an empty box styled as filled. The board half is fixed
 * in `TeamStrip`; this sentence is the part no amount of per-cell fallback can supply,
 * because a pool entry that is gone leaves nothing behind to annotate.
 *
 * The next action is the honest one. Nothing in the app can restore a species the
 * regulation dropped, so what the host can do is keep the record — which is what
 * `Download JSON` in the top bar is for, named here in the words it wears there.
 *
 * Both forms are written out rather than interpolated around a plural helper, following
 * `LandingScreen.savedDraftDescription`: the two sentences differ in three places, and a
 * visible grammar error reads as a tool that was not finished.
 */
function rosterDriftNotice(missing: number, unresolvedRosterVersion: string | null = null): string {
  /*
    D-24's other half, and the reason this is a THIRD form of an existing sentence rather
    than a second surface. Drift is "some of this pool is gone"; this is "the roster this
    was played on is one this build has never seen", which is the same fact about the same
    pool taken to its limit — so it belongs in the same notice, in the same place, styled
    the same way. A separate banner would make the host learn a second visual language for
    a stricter version of a problem they already know how to read.

    `resolveSnapshot` answers `null` here and MUST NOT fall back to the default. Rendering
    a completed tournament against a roster that could not have contained its picks would
    drop the winning team's Pokémon silently, with nothing on screen saying a substitution
    had happened — the repudiation failure D-24 exists to prevent. So the pool is empty and
    this sentence says why.

    The recovery is REFR-02's file import rather than `Download JSON`, because unlike drift
    this IS recoverable: the roster exists, this build simply does not have it. Both are
    named, in the words they wear on their own controls, and the recoverable one comes
    first.
  */
  if (unresolvedRosterVersion !== null) {
    return `This tournament was played on roster ${unresolvedRosterVersion}, which this build does not have. Its pool is empty and its board slots show ids instead of names. Use Import roster JSON… on the setup screen to load that roster, or Download JSON to keep the record.`;
  }

  if (missing === 1) {
    return "1 Pokémon in this tournament's pool is not in the current roster. It is missing from the pool, and a board slot holding it shows its id instead. Use Download JSON to keep the record.";
  }

  return `${missing} Pokémon in this tournament's pool are not in the current roster. They are missing from the pool, and a board slot holding one shows its id instead. Use Download JSON to keep the record.`;
}

/**
 * What the host is told when a document's picks disagree with its own schedule — RULE-03.
 *
 * NOT in the 03-UI-SPEC copywriting table, and flagged here as an amendment rather than
 * edited into the spec, exactly as `rosterDriftNotice` above and `importAnnouncement` below
 * are. The table has no row for it because §9 covers the pool and not the board.
 *
 * ## Why this is a notice and cannot be a guard
 *
 * `canApply` structurally cannot check round eligibility: it sees only `DraftState`, and
 * eligibility is a fact about a roster ENTRY. Putting the roster into the fold contradicts
 * `model.ts`'s "a cache of the log", and widening the single write path for one rule is
 * worse. So a `draft/pickMade` naming a non-Mega species in a Mega round IS accepted by the
 * reducer, reachable only from a hand-edited file or an import — and `import-guard` keeps
 * its own posture that a bound is not an integrity check.
 *
 * It therefore reports and repairs NOTHING. `selectTeams` is not filtered either: the board
 * shows what the log says (`reduce.ts:16-19`), because a board that quietly dropped a pick
 * would disagree with the file the host can open in a text editor.
 *
 * The next action is the honest one. Nothing here can make an illegal pick legal, so what
 * the host can do is unwind to it or accept it, and the sentence says so rather than
 * implying a repair button exists. Both forms are written out rather than interpolated
 * around a plural helper, following `rosterDriftNotice`.
 */
function scheduleViolationNotice(count: number): string {
  if (count === 1) {
    return '1 pick in this tournament sits in a Mega round with a Pokémon that cannot Mega. It was recorded that way and nothing here changes it. Undo back to that pick to replace it, or carry on.';
  }

  return `${count} picks in this tournament sit in a Mega round with a Pokémon that cannot Mega. They were recorded that way and nothing here changes them. Undo back to them to replace them, or carry on.`;
}

/**
 * What the live region says after a successful import.
 *
 * NOT in the UI-SPEC copywriting table — the table covers both failure sentences and the
 * confirmation dialog, but has no row for the success announcement, and a successful
 * import replaces the whole board without moving focus. A sighted host sees the change;
 * without this a screen-reader user gets silence at the one moment the entire screen
 * changed underneath them. Flagged to the orchestrator as a UI-SPEC amendment rather than
 * edited into the spec here, which plan 01-08 currently owns.
 */
function importAnnouncement(pickCount: number): string {
  if (pickCount === 0) return 'Tournament imported — no picks yet.';
  if (pickCount === 1) return 'Tournament imported — 1 pick restored.';
  return `Tournament imported — ${pickCount} picks restored.`;
}

/**
 * Pokedex order, and deterministic.
 *
 * `num` alone is not a total order — Rotom and its five appliances all share 479, and
 * every Mega-capable row shares its number with nothing but itself. Breaking the tie
 * on `id` means two runs against the same snapshot always produce the same grid, which
 * is what makes a screenshot or a fixture check meaningful.
 *
 * This is also the order the pool ids are recorded in, so the log and the grid agree.
 */
function byDexOrder(a: RosterEntry, b: RosterEntry): number {
  if (a.num !== b.num) return a.num - b.num;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * One click commits a pick and the turn advances — no confirmation step (D-08).
 *
 * That is only defensible because unlimited undo ships in this same phase (D-10), and
 * the two decisions must stay together: adding a confirm dialog here would make the
 * draft slower without making it safer, and removing undo would make this reckless.
 *
 * Note what this function does NOT do: it does not compute whose turn it is, does not
 * check whether the species is still available, and does not touch the log. The turn
 * comes from a selector and the legality check happens inside `dispatch`, because a UI
 * component may not own a game rule (SHEL-04, and the UI-SPEC's pure-core boundary).
 */
function handlePick(entry: RosterEntry): void {
  const state = getState();
  if (state === null) return;

  const turn = selectCurrentTurn(state);
  if (turn === null) return;

  dispatch(
    pickMade({
      playerId: turn.playerId,
      monId: entry.id,
      round: turn.round,
      pickIndex: turn.pickIndex,
    }),
  );
}

/**
 * Spend a swap — SWAP-02, D-25, D-26.
 *
 * `handlePick`'s shape exactly, and the same boundaries: it does not decide whose turn it
 * is, does not decide whether the slot is swappable, and does not check the target against
 * the slot's predicate. The turn comes from a selector, legality is `dispatch`'s through
 * `canApply`, and the PREDICATE was enforced before this was reachable — the pool the player
 * clicked was already `selectSwapTargets`' output (D-27). A UI component may not own a game
 * rule, and neither may this handler.
 *
 * ## The window is READ, never chosen here
 *
 * `swapRound` is `0` for a mid-draft spend and the round in progress for a dedicated one,
 * and `selectCurrentSwapRound` is what says which — the same selector `canApply` judges the
 * action against. Deciding it here from, say, "are the picks complete" would be a second
 * authority on the same question, and the two would disagree the moment one of them changed.
 * There is one swap action in two windows (D-29), not two swap flows.
 *
 * Returns whether the swap landed, so the caller can decide about focus and the announcement
 * without asking the store a second time and getting a different answer.
 */
function handleSwap(slot: { playerId: string; round: number; outMonId: string }, inMonId: string): boolean {
  const state = getState();
  if (state === null) return false;

  return dispatch(
    swapMade({
      playerId: slot.playerId,
      round: slot.round,
      outMonId: slot.outMonId,
      inMonId,
      swapRound: selectCurrentSwapRound(state) ?? 0,
    }),
  ).ok;
}

/**
 * Decline a dedicated swap round's turn — SWAP-07.
 *
 * `handlePick`'s shape and the same boundaries: it does not decide whose turn it is and
 * does not decide whether a pass is legal. The clock is `selectCurrentSwapRound` plus
 * `selectSwapRoundPosition`, and legality is `dispatch`'s through `canApply`.
 *
 * A pass is dispatched as an ACTION rather than handled as an absence, which is the whole
 * of SWAP-07: the round advances by counting recorded moves, so a skip that left no entry
 * would leave the clock sitting on the player forever — and undo could not tell "has not
 * gone yet" from "went, and chose nothing".
 *
 * Returns the announcement, so the caller can compose it onto the turn line rather than
 * firing a second `announce` the turn change would immediately overwrite.
 */
function handlePass(): string | null {
  const state = getState();
  if (state === null) return null;

  const swapRound = selectCurrentSwapRound(state);
  if (swapRound === null) return null;

  const position = selectSwapRoundPosition(state, swapRound);
  if (position === null) return null;

  const playerName = selectPlayerName(state, position.playerId) ?? position.playerId;
  if (!dispatch(swapPassed({ playerId: position.playerId, swapRound })).ok) return null;

  return `${playerName} passes swap round ${swapRound}.`;
}

/**
 * One click plays a priority card, and the round resolves itself when the last one lands
 * (CARD-03, D-17, D-19).
 *
 * Same shape as `handlePick` above and the same boundaries: it does not decide whose card
 * is on the clock, does not decide whether the value is legal, and does not touch the log.
 * The clock comes from `selectCardTurn` and legality is `dispatch`'s, because a UI
 * component may not own a game rule.
 *
 * ## The resolution is automatic, and that is a decision rather than a convenience
 *
 * The instant every player has played, `order/resolved` is dispatched from here — no
 * button, no "start picking" step. An explicit click would cost one per round, and it
 * would put the screen's mode partly in the UI at the precise moment `selectPhase` is
 * meant to be the one place it is decided. It is also what makes "played but not yet
 * resolved" unreachable: the two actions are committed in the same tick, so there is no
 * render between them for the screen to be caught in.
 *
 * The order is computed by `resolvePickOrder` and MATERIALIZED into the action, following
 * the same pattern `draft/started` uses for the shuffle. Replay reads the recorded order;
 * it never re-sorts. A later change to the tiebreak therefore cannot reinterpret a round
 * the room already played.
 *
 * Returns what was announced, so the caller can compose it into the turn line rather than
 * firing a second `announce` the turn change would immediately overwrite.
 */
function handlePlayCard(value: number): string | null {
  const state = getState();
  if (state === null) return null;

  const cardTurn = selectCardTurn(state);
  if (cardTurn === null) return null;

  const playerName = selectPlayerName(state, cardTurn.playerId);
  const played = dispatch(
    cardsPlayed({ playerId: cardTurn.playerId, value, round: cardTurn.round }),
  );
  if (!played.ok) return null;

  const move = playerName === null ? null : `${playerName} plays ${value}.`;

  // Re-read: the play is in the log now, and whether it completed the round is a question
  // about the state it produced rather than the one it was dispatched against.
  const after = getState();
  if (after === null) return move;

  const plays = selectCardsPlayedThisRound(after, cardTurn.round);
  if (plays.length < after.order.length) return move;

  const order = resolvePickOrder(plays);
  const resolved = dispatch(orderResolved(cardTurn.round, order));
  if (!resolved.ok) return move;

  const names = order.map((playerId) => selectPlayerName(after, playerId) ?? playerId);
  const positions = names.map((name, index) => `${index + 1} ${name}`).join(', ');
  const resolution = `Round ${cardTurn.round} pick order: ${positions}.`;

  // Both, in the order they happened. The last card and the resolution it triggered are one
  // tick and `announce` writes one signal, so returning only the resolution would silently
  // drop the play — and only the play would drop the thing CARD-08 exists to say.
  return move === null ? resolution : `${move} ${resolution}`;
}

export function App() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [screen, setScreen] = useState<Screen>({ name: 'landing' });

  // The canary runs during the very first render, before a single pool cell exists.
  // That timing is the requirement, not an optimization (D-13): a host who learns at
  // pick twelve that nothing was ever saved has been told too late to act on it.
  //
  // A state initializer rather than an effect, because an effect runs *after* the first
  // paint and the draft would flash up behind the warning.
  const [probe] = useState<ProbeResult>(() => probeStorage());
  const [probeAcknowledged, setProbeAcknowledged] = useState(false);
  const [writeFailureAcknowledged, setWriteFailureAcknowledged] = useState(false);
  const [importFlow, setImportFlow] = useState<ImportFlow>({ status: 'idle' });

  // An imported document waiting to be written, held between the adoption and the commit
  // of the render it caused. Never a document that has only been validated: it is set
  // after `adoptTournament` succeeds and consumed by the effect further down.
  const [importedToPersist, setImportedToPersist] = useState<TournamentDoc | null>(null);

  // Dismissal lasts the session, which is what "for the session" means here: component
  // state dies with the page, so reopening the tournament tomorrow offers the checkpoint
  // again. Persisting the dismissal would mean a host who clicked `Not now` once is never
  // reminded again, on the one milestone the phase has.
  const [checkpointDismissed, setCheckpointDismissed] = useState(false);

  // A SECOND flag rather than a shared one, because there are now two milestones and one
  // tournament passes both. Sharing it would mean a host who clicked `Not now` at the ban
  // reveal is never offered a copy of the finished draft — the milestone that actually has
  // something worth keeping — with nothing on screen to explain why.
  const [revealCheckpointDismissed, setRevealCheckpointDismissed] = useState(false);

  /*
    --- IS THE BLIND ENTRY SURFACE UP RIGHT NOW? ---

    A BOOLEAN, and deliberately nothing more. `04-UI-SPEC` §3's shell table gives the blind
    entry surface its own row — "own full-screen surface", distinct from both shells the
    rest of the app wears — and the shell class is decided here, on the gate element, so
    this layer has to be able to tell that the stage is in its entry sub-state.

    WHO is entering and WHAT they have chosen stay in `BanStageScreen` and must never be
    lifted here: D-18 requires the in-progress selection to die with the component, and its
    doc block records why. This flag is a rendering fact about the shell, not a copy of that
    state — it says a surface is mounted, never whose or with what on it.

    `BanStageScreen` reports it from a layout effect, so the class flips in the same commit
    that mounts the surface and no frame is ever painted with the entry surface inside the
    capped column. It reports `false` on unmount too, and the class expression below reads
    `screen.name === 'bans'` alongside it, so a stale `true` cannot reach any other screen.
  */
  const [blindEntryActive, setBlindEntryActive] = useState(false);

  const storageOk = probe.ok;

  // The saved document, probed once during the same first render as the canary, so
  // `Resume saved draft` can be rendered conditionally and its description line built.
  //
  // Probed, NOT adopted. Adoption is the button's job, and keeping the two apart is what
  // makes "the host chose this draft" a thing that happened rather than a thing that was
  // assumed — which is the entire difference between this and Phase 1's boot effect.
  //
  // A `useState` initializer rather than an effect for the same reason the canary is one:
  // an effect runs after the first paint, and a `Resume saved draft` button that appears a
  // frame late is a button the host has already decided is not there.
  //
  // Settable since 02-06: abandoning a draft clears the saved record, and a landing
  // screen still offering to resume it would hand the host back the thing they just
  // threw away.
  const [saved, setSaved] = useState<TournamentDoc | null>(() =>
    probe.ok ? loadSavedTournament() : null,
  );

  useEffect(() => {
    let cancelled = false;

    loadRoster().then(
      (bundle) => {
        if (!cancelled) setLoad({ status: 'ready', bundle });
      },
      (error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : ROSTER_LOAD_FAILURE_MESSAGE;
        setLoad({ status: 'failed', message });
        // The failure replaces the loading copy without moving focus, so a screen
        // reader would otherwise never learn the page had given up. Polite, never
        // assertive.
        announce(message);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The open document's own snapshot — D-24. Resolved by the effect further down, which
   * needs the document and is therefore declared after it; this only has to exist before
   * `activeBundle` reads it.
   */
  const [documentRoster, setDocumentRoster] = useState<DocumentRoster>({ status: 'none' });

  /**
   * Bumped whenever the snapshot registry gains a regulation — a refresh or a file import.
   *
   * The registry is module state in `roster-source.ts`, so nothing about it can make a
   * component re-render on its own. This integer is what turns "a roster was adopted" into
   * a render, and it is the reason the drift notice's advice is true rather than decorative:
   * a host told to import the roster their document names gets the notice to CLEAR when
   * they do, in the same session, without reloading.
   *
   * A counter and not a boolean, because the second import has to be as visible as the
   * first.
   */
  const [registryGeneration, setRegistryGeneration] = useState(0);

  const noteRosterAdopted = useCallback(() => {
    setRegistryGeneration((generation) => generation + 1);
  }, []);

  /**
   * The roster the SCREEN is rendering against, which is not always the default one.
   *
   * With a document open it is that document's, by `config.rosterVersion`. With none open
   * it is the default, which is what the landing and config screens are about — a new
   * tournament is created against the current regulation, never against the one the host
   * happened to open a filed night on last.
   *
   * `null` while a document's roster is still resolving AND when it cannot be resolved at
   * all, and the second of those is the load-bearing one: it must NOT fall through to
   * `load.bundle`. Substituting the default would render a completed tournament against a
   * roster that never contained its picks, dropping the winning team's Pokémon with
   * nothing on screen to say so. `resolveSnapshot`'s own header calls that the repudiation
   * failure D-24 exists to prevent. An empty pool plus a sentence is the honest answer.
   */
  const activeBundle = useMemo<RosterBundle | null>(() => {
    if (documentRoster.status === 'ready') return documentRoster.bundle;
    if (documentRoster.status === 'none' && load.status === 'ready') return load.bundle;
    return null;
  }, [documentRoster, load]);

  const entries = useMemo(
    () => (activeBundle === null ? [] : [...activeBundle.snapshot.entries].sort(byDexOrder)),
    [activeBundle],
  );

  /**
   * Art, and only art — so unlike `entries` it may fall back to the default.
   *
   * A sprite map is keyed by roster id and is a separate committed file from any snapshot;
   * 05-04's `readRosterFile` already pairs a host-supplied roster with the map the app
   * holds for exactly this reason, with unknown rows degrading to `_placeholder.png`. The
   * fallback here is that same trade and carries none of the risk `activeBundle` guards,
   * because a missing sprite is a missing picture and a substituted ROSTER is a changed
   * fact about who was drafted.
   */
  const spriteMeta = useMemo<SpriteMeta | null>(() => {
    if (activeBundle !== null) return activeBundle.spriteMeta;
    return load.status === 'ready' ? load.bundle.spriteMeta : null;
  }, [activeBundle, load]);

  const stopAutosaveRef = useRef<(() => void) | null>(null);
  const autosaveStartedRef = useRef(false);

  // Stopping autosave is an unmount concern and only an unmount concern. Tying it to
  // the start effect below would let a dependency change tear the listeners down and
  // then decline to rebuild them, because the start guard has already fired.
  useEffect(
    () => () => {
      stopAutosaveRef.current?.();
      stopAutosaveRef.current = null;
    },
    [],
  );

  /**
   * Let go of the tournament this tab is holding — the LOCAL half of emptying the live
   * slot.
   *
   * THREE routes reach it and they must do the same thing: the host confirming the abandon
   * dialog in this tab, `onAbandoned` arriving from the tab where they confirmed it, and —
   * since D-15 — a filing that has already written the document into the library. The name
   * says "discard" because that is what it does to THIS TAB's copy; whether anything else
   * still holds the tournament is the caller's business, and filing is the caller for which
   * the answer is yes.
   *
   * Written once rather than three times, because a caller that performed three of these
   * four steps would keep the draft alive in the one place nobody is looking at it — and
   * would write it back on promotion.
   *
   * THE ORDER IS LOAD-BEARING AND IS NOT OBVIOUS. `startAutosave`'s teardown function ends
   * in `flush()`, which writes any pending debounced document — so tearing the autosave
   * down AFTER the storage key has gone puts the draft straight back. The teardown goes
   * first, deliberately.
   *
   * Storage itself is NOT touched here. Removing the record is the owning tab's job and it
   * does it once; a secondary reaching for `clearSaved()` would be a second tab deleting a
   * key it does not own, on a timeline nothing coordinates.
   *
   * `setSaved(null)` is the piece easiest to miss. The landing screen offers
   * `Resume saved draft` from a snapshot, so without it the host would abandon a draft and
   * be offered it back on the very next screen.
   */
  const discardTournament = useCallback(() => {
    stopAutosaveRef.current?.();
    stopAutosaveRef.current = null;
    autosaveStartedRef.current = false;

    abandonTournament();

    setSaved(null);

    // PER-TOURNAMENT, NOT PER-SESSION — and the distinction only came into existence when
    // abandon did. `checkpointDismissed`'s own comment argues that a dismissal should last
    // "the session", which was right when a session held exactly one tournament; abandon
    // made a session able to hold several, and a host who clicked `Not now` on tournament A
    // would then complete tournament B and never be offered the checkpoint at all — the
    // phase's only milestone surface, missing with nothing to explain it.
    //
    // `filtersCleared` and `importFlow` are the same shape at lower stakes: a suffix and an
    // error sentence, both about a draft that no longer exists.
    //
    // `probeAcknowledged` and `writeFailureAcknowledged` deliberately stay. They are facts
    // about this BROWSER's storage, not about the tournament, and re-asking the host to
    // acknowledge a quota that is still full would be a nag rather than news.
    setCheckpointDismissed(false);
    setRevealCheckpointDismissed(false);
    setFiltersCleared(false);
    setImportFlow({ status: 'idle' });

    setConfirm({ kind: 'idle' });
    setScreen({ name: 'landing' });
  }, []);

  /**
   * Engage the tab lock — PERS-03 / D-12.
   *
   * Runs once, independently of the roster load, because ownership is a property of the
   * browsing context rather than of the draft: a tab that is still fetching the snapshot
   * is already a tab that must not write.
   *
   * `adoptWhateverIsNewer` is passed as BOTH callbacks because promotion and a remote
   * save want exactly the same thing — take the stored document if it is ahead of ours.
   * On promotion it is the T-01-40 mitigation and it runs while `isOwner()` is still
   * false, so no autosave can race in front of it with this tab's stale copy. On a
   * remote save it is what keeps a read-only board live rather than frozen at the moment
   * the tab opened.
   *
   * `onAbandoned` is the third callback and the only one that is not about reading: there
   * is nothing left to read. It runs the same local teardown the tab that confirmed the
   * dialog ran, which is what stops a secondary from being the last thing alive holding a
   * tournament the host was told nothing recovers.
   */
  useEffect(() => {
    const adoptWhateverIsNewer = (): void => {
      const newer = loadIfNewer();
      if (newer === null) return;
      if (!adoptTournament(newer)) return;

      // The landing screen DESCRIBES `saved`, so leaving the boot snapshot in place would
      // go on advertising a pick count several picks behind the document this tab now
      // holds — and `Resume saved draft` would be a button whose label disagrees with what
      // clicking it produces.
      setSaved(newer);

      // Route unconditionally — on promotion and on a remote save alike — so no tab ever
      // holds a document it does not render. A secondary that adopted the owner's draft
      // while sitting on the landing screen would otherwise go on offering
      // `Resume saved draft` for a tournament it is already holding.
      //
      // Unconditional is safe only because the read-only gate now wraps every screen
      // rather than the draft alone: a secondary tab cannot have been composing anything
      // on the config screen, so there is no in-progress work for this to discard. The
      // two changes shipped together and must not be separated — narrowing the gate back
      // to the draft region turns this line into a form-clobber.
      //
      // Which tournament screen is `screenForState`'s call, not this line's: the document
      // adopted here can be a snake ban stage, and the draft screen would render it with an
      // empty pool.
      setScreen(screenForState(getState()));
    };

    claimOwnership({
      onPromote: adoptWhateverIsNewer,
      onRemoteSave: adoptWhateverIsNewer,
      onAbandoned: discardTournament,
    });

    return disposeTabLock;
    // Empty, and it stays empty. The cleanup DISPOSES the lock, so a dependency that ever
    // moved would tear the ownership protocol down and re-run it mid-draft.
    // `discardTournament` is a `useCallback` with no dependencies of its own, which is what
    // makes leaving it out of this list correct rather than merely convenient.
  }, []);

  const ownership = useOwnership();

  // Read-only is a whole-tab condition, so it outranks the draft's own emptiness: the
  // banner shows even while the roster is still loading, because the answer to "why is
  // nothing happening in this tab" must not wait on a fetch.
  const readOnly = ownership.readOnly;

  const state = draftState.value;

  /**
   * The open record itself, beside the fold of it — PERS-09.
   *
   * Read at render time from the same store `state` comes from, so the two cannot describe
   * different tournaments. It exists because the recap reads the LOG: `src/core/recap.ts`
   * cannot take `DraftState`, since the fold keeps only the latest result per match and D-22
   * needs the superseded ones. Nothing else on this screen wants it.
   */
  const openDoc = tournamentDoc.value;

  /**
   * The roster the OPEN document names, or `null` when none is open — D-24.
   *
   * Read from `config.rosterVersion`, which every document carries and which `ConfigScreen`
   * stamps from `snapshot.regulation` at creation. This is the key the effect below
   * resolves; a string rather than the whole config so that re-folding the log on every
   * pick does not re-run a roster resolution.
   */
  const documentRosterVersion = state === null ? null : state.config.rosterVersion;

  /**
   * Resolve the open document's own snapshot, holding it alongside the default.
   *
   * ## It waits for the default load
   *
   * Gated on `load.status === 'ready'` because the default load is what REGISTERS the
   * current regulation under both of its names. Running first, this would miss a document
   * naming the regulation the app is about to resolve anyway and report the commonest case
   * in the app — open a night on the current roster — as unresolvable.
   *
   * ## The registry read comes before the fetch, and synchronously
   *
   * `resolveSnapshot` is a `Map` lookup over what this process already holds, so the
   * ordinary case commits in the same tick and the pool never flashes empty on its way to
   * being correct. `loadRoster(version)` is only reached for a regulation this session has
   * not resolved yet — a filed M-A night on a build running M-B — and that one really does
   * have to go and read the manifest.
   *
   * ## A failure is `unresolvable`, never the default
   *
   * See `activeBundle` above and `resolveSnapshot`'s own header. The whole reason this
   * state exists is that falling back would be a silent rewrite of what a finished
   * tournament was played on.
   */
  useEffect(() => {
    if (documentRosterVersion === null) {
      setDocumentRoster({ status: 'none' });
      return;
    }

    if (load.status !== 'ready') return;

    const held = resolveSnapshot(documentRosterVersion);
    if (held !== null) {
      setDocumentRoster({ status: 'ready', bundle: held });
      return;
    }

    let cancelled = false;
    setDocumentRoster({ status: 'resolving' });

    loadRoster(documentRosterVersion).then(
      (bundle) => {
        if (!cancelled) setDocumentRoster({ status: 'ready', bundle });
      },
      () => {
        // Deliberately silent here: the sentence belongs on screen, beside the pool it
        // explains, and `announce`-ing it as well would have two things describing one
        // fact. The notice carries `role="status"` and says it once.
        if (!cancelled) {
          setDocumentRoster({ status: 'unresolvable', rosterVersion: documentRosterVersion });
        }
      },
    );

    return () => {
      cancelled = true;
    };
    // `registryGeneration` is in the list so that adopting a roster mid-session re-asks the
    // question. Without it the notice would keep telling a host to import a file they have
    // already imported.
  }, [documentRosterVersion, load.status, registryGeneration]);

  /**
   * The document names a roster this build has never seen, or `null`. Drives the notice.
   */
  const unresolvedRosterVersion =
    documentRoster.status === 'unresolvable' ? documentRoster.rosterVersion : null;

  /**
   * Start autosaving once a tournament EXISTS, and exactly once.
   *
   * Phase 1 started it inside the boot effect, which was the same moment a tournament
   * came into being. There is no such moment any more — a document can arrive from
   * `Start draft`, from `Resume saved draft` or from an import — so the trigger is the
   * document's existence rather than any one of the three routes to it.
   *
   * Still gated on the canary, and the reason is unchanged from Phase 1: scheduling
   * autosaves when the probe already proved writes do not land would spend the whole
   * draft failing quietly at 300ms intervals, which is the silent-retry behaviour the
   * warning screen exists to replace.
   */
  useEffect(() => {
    if (state === null || !storageOk || autosaveStartedRef.current) return;
    autosaveStartedRef.current = true;
    stopAutosaveRef.current = startAutosave({ subscribe, getDoc });
  }, [state, storageOk]);

  const entryById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry])),
    [entries],
  );

  /**
   * The three things the recap needs, or `null` when this tab cannot offer one — PERS-09.
   *
   * ONE bag rather than three props on two screens, on `MonChip.swap`'s stated precedent:
   * a control with no data behind it and data with no control are both unrepresentable, so
   * `View the draft recap` renders exactly when the surface behind it can be drawn.
   *
   * `null` while the roster is still resolving, which is a real state rather than a
   * defensive one: `spriteMeta` falls back to the loaded bundle's, but a recap with no
   * species names would print ids at the one moment somebody is reading the night aloud.
   */
  const recapAccess = useMemo(
    () =>
      openDoc === null || spriteMeta === null ? null : { doc: openDoc, entryById, spriteMeta },
    [openDoc, entryById, spriteMeta],
  );

  // The pool the grid renders is the selector's output, so a picked species leaves the
  // DOM on the same render that recorded it: not greyed, not disabled, removed.
  //
  // Since 02-08 that distinction is load-bearing rather than incidental: this selector
  // REMOVES a drafted species, and the pool filter HIDES an undrafted one. Two mechanisms,
  // two lifetimes — a filtered species comes back the moment the filter clears and a
  // drafted one never does, which `tests/ui/pool-search.test.tsx` pins in a test named for
  // exactly that.
  const availableEntries = useMemo(() => {
    if (state === null) return entries;
    return selectAvailablePool(state)
      .map((id) => entryById.get(id))
      .filter((entry): entry is RosterEntry => entry !== undefined);
  }, [state, entries, entryById]);

  const turn = state === null ? null : selectCurrentTurn(state);

  /*
    THE EXPORT GATE — D-31, and the one line that moves it.

    This used to be `selectIsComplete`, which is PICKS-complete: every team full, the pool
    closed, no turn on the clock. It is now `selectIsTournamentComplete`, which is that AND
    every dedicated swap round finished — the moment the teams stop being able to change.

    Every reader of this local means "the tournament is over": the turn banner's
    `Draft complete` line, the completed-draft view, the per-player export panels, the
    PERS-06 checkpoint and the pool pane's expand availability. Re-pointing them one at a
    time is how one gets missed, and the one that gets missed hands somebody a paste that is
    about to change. So the LOCAL is re-pointed and the name is kept, and the readers below
    are untouched.

    `selectIsComplete` itself is unchanged and still means what it always meant — it is read
    inside `selectPhase`, `selectCurrentTurn` and the swap-round selectors, all of which
    want picks-complete and are correct as they stand.

    With `swapRounds: 0` the two coincide, which is what keeps a swap-free tournament
    byte-identical to the one Phase 2 shipped.
  */
  const complete = state !== null && selectIsTournamentComplete(state);

  /*
    Which mode the screen is in — read, never computed (D-17).

    Every branch below asks this local rather than re-deriving the question from picks,
    cards or resolutions. That is the whole of what makes "played but not yet resolved"
    unrepresentable on screen: there is one answer, and the panel, the banner and the pane
    scoping all read the same one.

    `'picking'` with no state is the pre-draft answer `selectPhase` gives for a document
    that has not started, and it keeps the landing and config screens on the path they had.
  */
  const phase = state === null ? 'picking' : selectPhase(state);

  /*
    Whose card is on the clock, and only while a card IS on the clock.

    Gated on the phase rather than on `selectCardTurn` alone, because that selector
    deliberately does not ask whether the round has resolved — `canApply` needs it not to.
    The gate is the caller's, and this is the caller that wants "is the screen bidding".
  */
  const cardTurn = state === null || phase !== 'cards' ? null : selectCardTurn(state);

  /*
    The dedicated swap round on the clock, and who holds it.

    Gated on the phase for `cardTurn`'s reason exactly: `selectCurrentSwapRound` answers
    whenever the picks are complete and a round is unfinished, which is the same condition
    `selectPhase` calls `'swapRounds'` — the gate makes that agreement explicit rather than
    leaving two expressions free to drift.

    Both are READ. Nothing here works out whose turn it is, and the order they walk is
    `selectSwapRoundOrder`'s, which no component ever sees.
  */
  const swapRound = state === null || phase !== 'swapRounds' ? null : selectCurrentSwapRound(state);
  const swapRoundPlayerId =
    state === null || swapRound === null
      ? null
      : (selectSwapRoundPosition(state, swapRound)?.playerId ?? null);

  // One local, two consumers: the turn banner's sentence and the board's empty state.
  // Written twice they are two expressions that can be changed independently, and the
  // board would then name a different player from the banner directly above it.
  const turnPlayerName =
    state === null || turn === null ? null : selectPlayerName(state, turn.playerId);

  /*
    What the sticky head names. During card play there is no turn at all — that is the
    point of D-17 — so the round and the player come from the card clock instead, and the
    banner goes on being one sentence about one person rather than falling silent for the
    whole of the bidding.
  */
  const bannerRound = phase === 'cards' ? (cardTurn?.round ?? null) : (turn?.round ?? null);

  /*
    Who the head names, from whichever clock is running.

    THREE clocks now, not two, and each turnless state has its own. `selectCurrentTurn` is
    null during card play AND throughout the swap rounds, so a banner reading only that
    would fall silent for the whole of both — which is the failure D-17 introduced this
    local to prevent, arriving a second time by a second route.

    `bannerRound` deliberately does NOT gain a swap-round arm. The swap-round headline
    counts swap rounds rather than pick rounds, and it takes that number from `swapRound`
    below; feeding a pick round into it would put `Round 6` in front of a sentence about
    something else.
  */
  const bannerPlayerName =
    state === null
      ? null
      : phase === 'cards'
        ? cardTurn === null
          ? null
          : selectPlayerName(state, cardTurn.playerId)
        : phase === 'swapRounds'
          ? swapRoundPlayerId === null
            ? null
            : (selectPlayerName(state, swapRoundPlayerId) ?? swapRoundPlayerId)
          : turnPlayerName;

  /*
    The resolved order as names — CARD-08's phase line, for as long as picking lasts.

    Read from `order/resolved` through `selectResolvedOrder`, never re-sorted from the
    plays: the log carries the order the room played to, and this line is that record on
    screen rather than a second opinion about it. Empty for a migrated schema-2 draft,
    which resolved nothing and whose phase line is therefore simply absent.
  */
  const pickOrderNames = useMemo<string[]>(() => {
    if (state === null || phase !== 'picking') return [];
    const resolved = selectResolvedOrder(state, selectCurrentRound(state));
    if (resolved === null) return [];
    return resolved.map((playerId) => selectPlayerName(state, playerId) ?? playerId);
  }, [state, phase]);

  /*
    What is already down this round, in PLAY order, with each player's name attached.

    `selectCardsPlayedThisRound` answers in LOG order, which is the same order for every
    document this build writes. It is composed against `selectCardPlayOrder` anyway, so an
    imported document whose array arrived in some other order still renders the row the
    rotation says — and the row is the tiebreak rule made visible (D-22, CARD-05), so it
    has to be right about a document it did not write.
  */
  const playedThisRound = useMemo<PlayedCard[]>(() => {
    if (state === null || cardTurn === null) return [];

    const byPlayer = new Map(
      selectCardsPlayedThisRound(state, cardTurn.round).map((play) => [play.playerId, play.value]),
    );

    return selectCardPlayOrder(state, cardTurn.round)
      .filter((playerId) => byPlayer.has(playerId))
      .map((playerId) => ({
        playerId,
        playerName: selectPlayerName(state, playerId) ?? playerId,
        value: byPlayer.get(playerId) ?? 0,
      }));
  }, [state, cardTurn]);

  /*
    What the player on the clock may actually put down — CARD-04, D-21.

    A RULE, so it is `selectCardOffer`'s answer and never the panel's. `CardPanel` imports
    nothing from `src/core`; it is handed the playable subset and renders everything else
    in the hand inert. `lifted` rides along because a suspended rule and a lifted one
    produce the same subset and only one of them says anything on screen.
  */
  const cardOffer = useMemo<CardOffer>(() => {
    if (state === null || cardTurn === null) return { values: [], lifted: false };
    return selectCardOffer(state, cardTurn.playerId);
  }, [state, cardTurn]);

  /*
    Who is still to come after the player on the clock — the remaining rotation (D-18).

    The rotation minus everyone who has played and minus the player currently holding it,
    which is exactly "still to play" and not "yet to play including you".
  */
  const stillToPlay = useMemo<string[]>(() => {
    if (state === null || cardTurn === null) return [];

    const done = new Set(
      selectCardsPlayedThisRound(state, cardTurn.round).map((play) => play.playerId),
    );

    return selectCardPlayOrder(state, cardTurn.round)
      .filter((playerId) => !done.has(playerId) && playerId !== cardTurn.playerId)
      .map((playerId) => selectPlayerName(state, playerId) ?? playerId);
  }, [state, cardTurn]);

  /*
    The host's stored pane preference, read synchronously in a state initializer so the
    first paint is already the pane they left. Read in an effect instead, the draft would
    render split and then jump.

    This holds the STORED preference. What renders is `pane` below, which additionally
    scopes `pool` out of a live draft — see there.
  */
  const [storedPane, setStoredPane] = useState<PaneState>(() => loadViewPrefs().pane);

  /*
    All three pane states become available once the TOURNAMENT is over, and that is exactly
    when eight stacked export panels want the full width. While a draft is running,
    `pool-full` would put the board behind a toggle, which ROADMAP criterion 5 forbids.

    `complete` is tournament-complete since 03-11, so a pending swap round keeps this false
    — which is Amendment 3's third row and is correct for a second reason: the export panels
    that wanted the width are not on screen yet.
  */
  const poolExpandable = complete;

  /*
    Amendment 3: while a round's cards are being played, `board-full` is unavailable too —
    and a dedicated swap round is the third row of that table.

    The reason is not the pool's. `pool-full` is refused because it would put the board
    behind a toggle; `board-full` is refused because the pool pane holds the ONLY control
    that can act, and a state that hides the only available action is not a preference.
    During card play that control is the hand; during a swap round it is `Pass this swap`,
    or the armed slot's offer.

    A swap round refuses `pool-full` for a second reason of its own, which is why
    `poolExpandable` above reads `complete` rather than picks-complete: the BOARD is where a
    player chooses the slot they are swapping out of, so hiding it removes half the flow.

    Both come back the moment the phase ends — inert ARIA is always shed (WR-04), and this
    is its last consumer in the phase.
  */
  /*
    `swapRound !== null`, and NOT `phase === 'swapRounds'`.

    `selectPhase` answers `'swapRounds'` for any tournament that runs them once the picks
    are in, including after the last one has closed — its own doc block says so, and that is
    the honest reading of "this tournament runs swap rounds". What gates a restriction is
    whether one is still RUNNING, which is `selectCurrentSwapRound`'s question and is
    already the local below.

    Gated on the phase instead, the board's expand would stay inert for the rest of the
    tournament's life — inert ARIA that is never shed is exactly what WR-04 exists to
    forbid, on the screen where the export panels have just asked for the full width.
  */
  const cardPhase = phase === 'cards';
  const swapPhase = swapRound !== null;
  const boardExpandable = !cardPhase && !swapPhase;
  const phaseReason = cardPhase
    ? CARD_PHASE_EXPAND_REASON
    : swapPhase
      ? SWAP_ROUND_EXPAND_REASON
      : null;

  /*
    The rendered pane. A stored `pool` is silently forced to `split` while a draft is
    running: no warning, no announcement, nothing for the host to dismiss. That is the
    second, independent half of the T-02-24 mitigation — `loadViewPrefs` already refuses
    any value outside the union, and this refuses a legitimate value in the one situation
    where honouring it would hide the board.

    A stored `board` is coerced the same way, and only during card play. Silently, for the
    same reason: the host chose a legitimate state and the app is declining it for the
    duration of one round, which is a smaller event than a message about it would be.

    Derived here rather than inside `SplitPanes`, which must never hold an opinion about
    which of its states are available; and derived rather than coerced in the initializer
    above, because `App` mounts on the LANDING screen — there is no draft in progress at
    the moment that initializer runs, so a coercion there would inspect a state that does
    not exist yet and let a stored `pool` through on resume.

    The two values cannot drift at a write: `handlePaneChange` persists the value it was
    handed, which is always the value about to render.
  */
  const pane: PaneState =
    (storedPane === 'pool' && !poolExpandable) || (storedPane === 'board' && !boardExpandable)
      ? 'split'
      : storedPane;

  const handlePaneChange = useCallback((next: PaneState) => {
    setStoredPane(next);
    // Density is read back rather than held here. This screen does not own that
    // preference, and holding a copy of it is how the pool and the board end up writing
    // each other's settings.
    saveViewPrefs({ density: loadViewPrefs().density, pane: next });
  }, []);

  /*
    THE ADOPTED-DOCUMENT NOTICE, and the four facts that make it a notice rather than a
    guard.

    1. Pool-dry mid-draft is STRUCTURALLY IMPOSSIBLE once `pool/built` carries N distinct
       ids with N >= players x rounds. `canApply` rejects duplicate pool ids
       (reduce.ts:137), the rotation length is exactly the player count (reduce.ts:146),
       each accepted pick removes exactly one distinct id (reduce.ts:167,
       selectors.ts:40), and `selectCurrentTurn` returns null after players x rounds picks
       (selectors.ts:82, :105). The final picker therefore chooses from N - p*r + 1
       options, which is at least one.
    2. The only route to a pool that cannot fill every team is a hand-edited or hostile
       import, and `import-guard` deliberately performs no referential integrity check —
       "A bound is not an integrity check" (import-guard.ts:317-319). That posture is
       intact; this notice exists INSTEAD of changing it, per 02-RESEARCH Open Question 3.
    3. Therefore no defensive mid-draft pool-dry handling and no "out of Pokémon" empty
       state may be added anywhere. The blocker above is the guarantee, and defensive code
       for an unreachable state is code nobody can ever test.
    4. It runs for EVERY document, not only adopted ones. A document this session started
       passed the same gate at Start and will produce nothing here, and an "was this
       adopted?" flag would be a piece of state that can go stale.
  */
  const feasibilityNotice = useMemo(() => {
    if (state === null || entries.length === 0) return null;

    const result = checkFeasibility({
      playerNames: state.config.players.map((player) => player.name),
      rounds: state.config.rounds,
      poolSize: state.poolIds.length,
      megasRequiredPerTeam: state.config.megasRequiredPerTeam,
      bannedIds: state.config.bans,
      // Read from the adopted document's OWN config, never from anything this session
      // configured. The notice is about whether THAT tournament's rules still hold against
      // today's roster, and it stays a notice: a bound is not an integrity check, so a
      // document that disagrees with today's arithmetic is reported, never repaired or
      // refused (Phase 2 decision 5, unchanged).
      megaFormeBans: state.config.megaFormeBans,
      dualMegaChoices: state.config.dualMegaChoices,
      swapBudget: state.config.swapBudget,
      swapRounds: state.config.swapRounds,
      // `'hostBanlist'` and `0` REGARDLESS of `state.config.banMode`, and both for the same
      // reason: these two fields mean "player bans this configuration has not made yet"
      // (see `FeasibilityInput.banMode`). An adopted document has already run whatever
      // ritual it ran, so there are none pending — passing the stored mode here would tell
      // the host of an adopted blind tournament to "enter 1 or more" into a field that no
      // longer exists, which is a problem statement with no next action.
      banMode: 'hostBanlist',
      bansPerPlayer: 0,
      // `'draftOnly'` REGARDLESS of `state.config.depth`, for the same shape of reason as
      // the two fields above — see `FeasibilityInput.depth`. This document's depth is
      // already settled, and the bracket warning's only value is the next action it offers.
      depth: 'draftOnly',
      entries,
    });

    if (!result.blocked) return null;

    const primary = result.problems[0];
    return primary === undefined ? null : adoptedNotice(primary.message);
  }, [state, entries]);

  /**
   * How far the current roster has drifted from what this document recorded — WR-06.
   *
   * Counted ONCE, here, where the roster and the document meet, rather than inferred from
   * either surface that suffers from it. Neither could report it anyway: `availableEntries`
   * above drops the missing ids and the pool's `{n} available` count follows the render, so
   * the screen agrees with itself about a number that is quietly short; and a board cell
   * only ever sees the one id it was handed.
   *
   * Against `state.poolIds`, which is the fold of what `pool/built` materialized — the
   * architecture's own reason for recording actual ids rather than an instruction to
   * rebuild is that a regulation rotation must not silently reinterpret a tournament. This
   * is the sentence that makes "not silently" true.
   *
   * Zero while the roster is still loading, because `entries.length === 0` would otherwise
   * report the whole pool as missing on the first render after resume.
   */
  const missingFromRoster = useMemo(() => {
    if (state === null || entries.length === 0) return 0;
    return state.poolIds.reduce((total, id) => (entryById.has(id) ? total : total + 1), 0);
  }, [state, entryById, entries.length]);

  /**
   * The current round's restriction, or `null` when the round admits the whole pool.
   *
   * The rule is `selectRoundEligibleIds`' to state and this component's to hand on.
   * `PoolGrid` renders the restriction it is given and composes the copy for it; it does
   * not compute which ids a Mega round admits, because a UI component may not own a game
   * rule — the same boundary `handlePick`'s comment draws for the pick itself.
   *
   * The set is COMPUTATION-LOCAL and re-derived on every fold. Nothing stores it: D-07
   * declines to materialize eligible id lists into the log, and a `Set` could not be
   * persisted anyway (CLAUDE.md §Serializability).
   */
  const roundRestriction = useMemo<MegaRoundRestriction | null>(() => {
    if (state === null || entries.length === 0) return null;

    const current = selectCurrentTurn(state);
    if (current === null) return null;
    if (selectRoundKind(state, current.round) !== 'mega') return null;

    return {
      kind: 'mega',
      round: current.round,
      ids: new Set(selectRoundEligibleIds(state, entries, current.round)),
    };
  }, [state, entries]);

  // ---------------------------------------------------------------------------
  // Swaps — SWAP-02, SWAP-05, SWAP-06, D-27
  //
  // The state is declared HERE, above the memos that read it, rather than down beside the
  // handlers that write it. A `useMemo` body runs at its own call site, so an armed slot
  // declared later would be in the temporal dead zone by the time `swapArming` below reached
  // for it — a render-time crash rather than a stale value.
  // ---------------------------------------------------------------------------

  const [armedSlot, setArmedSlot] = useState<ArmedSlot>(null);

  /**
   * Where to send focus after a swap-round transition removes the control that was pressed.
   *
   * A CSS selector rather than a boolean, because two different transitions need two
   * different destinations and both are the same shape of problem — the markup is correct,
   * there is genuinely nothing left to focus where the host was standing, so the fix is to
   * pass focus on rather than to keep a node alive. That is the shape `SplitPanes` uses for
   * its collapse handoff and the one `focusPoolAfterResolveRef` uses below.
   *
   * Both transitions belong to the swap rounds specifically. Disarming a slot mid-draft
   * leaves `PoolGrid` mounted and is unaffected.
   */
  const focusAfterSwapRoundRef = useRef<string | null>(null);

  /**
   * Disarm, and catch the focus that is about to fall through the floor.
   *
   * During a swap round the pool pane holds `PoolGrid` while a slot is armed and `SwapPanel`
   * when none is, so disarming unmounts the whole subtree including the `Keep {species}`
   * button that was just pressed. Preact cannot reuse a node across a vnode type, so focus
   * would land on `<body>` — on the surface whose only remaining control is `Pass this
   * swap`, which is exactly where it should go instead.
   *
   * The selector is armed unconditionally and resolved after the render. Mid-draft there is
   * no `.swap-panel__pass` to find, the query answers null, and nothing about the existing
   * §10 behaviour changes.
   */
  const disarmSwap = useCallback(() => {
    focusAfterSwapRoundRef.current = '.swap-panel__pass';
    setArmedSlot(null);
  }, []);

  /**
   * The ONE player whose filled cells are swap-target buttons, or `null` — Amendment 1.
   *
   * Three of the four conditions are resolved here, where the config and the selectors meet,
   * and handed down as one id. The fourth — "the cell is filled" — is `TeamStrip`'s, because
   * it is the only one that varies per cell.
   *
   * `selectCurrentTurn` is null during the card phase and once every team is full, so both
   * of those fall out as "no swappable cells" with no clause of their own. That is the point
   * of reading the clock rather than the phase: a mid-draft swap is spent BY the player on
   * the clock (D-25), so wherever there is no clock there is no mid-draft swap.
   *
   * ## Two clocks, one answer — 03-11
   *
   * A dedicated swap round runs when the picks are complete, so the pick clock is null
   * throughout it and reading only that would leave the board with no swappable cell on the
   * one screen whose entire purpose is swapping. `swapRoundPlayerId` is the swap round's
   * clock, and it is chosen by the PHASE rather than by falling back on a null — a fallback
   * would silently make the pick clock's null mean "swap round" during the card phase too.
   *
   * The budget check stays where it was, below both, because it is the same check either
   * way: ONE allowance covers both windows (D-29). At zero remaining this is null and no
   * cell on the board is a button, in a swap round exactly as mid-draft.
   */
  const swapPlayerId = useMemo<string | null>(() => {
    if (state === null || state.config.swapBudget <= 0) return null;

    const playerId =
      phase === 'swapRounds' ? swapRoundPlayerId : (selectCurrentTurn(state)?.playerId ?? null);
    if (playerId === null) return null;

    return selectSwapsRemaining(state, playerId) > 0 ? playerId : null;
  }, [state, phase, swapRoundPlayerId]);

  /**
   * The armed slot, as the pool surface needs it — SWAP-06.
   *
   * The ids are `selectSwapTargets`' answer and never this file's; the kind is
   * `selectSlotKind`'s. A UI component may not own a game rule, and neither may a memo here:
   * both are read, neither is derived.
   *
   * `null` when the armed slot no longer holds what was armed. That is reachable without
   * anything going wrong — an undo in this tab, or a takeover from another — and the honest
   * answer is to disarm rather than to offer a swap out of a species that has left.
   *
   * The `Set` is COMPUTATION-LOCAL and re-derived on every fold. Nothing stores it, and a
   * `Set` could not be persisted anyway (CLAUDE.md §Serializability).
   */
  /**
   * `armedSlot`, but `null` once the slot stops holding what was armed.
   *
   * THE ONE PLACE THAT DECIDES WHETHER A SLOT IS ARMED. Both the pool surface below and
   * `handlePoolPick` read this, and neither reads `armedSlot` directly.
   *
   * The staleness rule used to live inside `swapArming`, which only the RENDER consumed.
   * `handlePoolPick` branched on the raw `armedSlot` instead, so the two disagreed exactly
   * when the board moved under an armed slot: the disarm control — reachable only through
   * `swapArming` — vanished, while a pool click still opened a swap confirm. `setArmedSlot`
   * is cleared in two places only (`disarmSwap`, and confirming a swap), neither of which
   * covers undo, abandon, import or a takeover, so the host was left with an armed state
   * they could see no way out of. Found by the phase 03 code review (CR-02).
   *
   * Nothing could be corrupted by it: `apply(SWAP_MADE)` matches on `pick.monId` and folds
   * a disagreeing swap to a no-op (T-03-38). The defect was a trap, not data loss.
   */
  const activeArmedSlot = useMemo<ArmedSlot>(() => {
    if (state === null || armedSlot === null) return null;

    const slotIndex = armedSlot.round - 1;
    if (selectTeams(state)[armedSlot.playerId]?.[slotIndex] !== armedSlot.outMonId) return null;

    return armedSlot;
  }, [state, armedSlot]);

  const swapArming = useMemo<SwapArming | null>(() => {
    if (state === null || activeArmedSlot === null || entries.length === 0) return null;

    const slotIndex = activeArmedSlot.round - 1;

    return {
      outName: entryById.get(activeArmedSlot.outMonId)?.name ?? activeArmedSlot.outMonId,
      round: activeArmedSlot.round,
      kind: selectSlotKind(state, slotIndex),
      ids: new Set(selectSwapTargets(state, entries, slotIndex)),
      onDisarm: disarmSwap,
    };
  }, [state, activeArmedSlot, entries, entryById, disarmSwap]);

  /**
   * `{name} has {n} swaps left`, or `null` when the line does not render.
   *
   * Gated on the same `swapPlayerId` the board is, so the line and the buttons cannot
   * disagree: a header advertising swaps above a board with none is the failure this
   * single source removes. At zero remaining, `swapPlayerId` is already null and nothing
   * about swaps renders anywhere — which is 03-UI-SPEC's "not an empty state; the feature
   * does not exist for this tournament".
   */
  const swapBudget = useMemo<SwapBudget | null>(() => {
    if (state === null || swapPlayerId === null) return null;

    return {
      playerName: selectPlayerName(state, swapPlayerId) ?? swapPlayerId,
      remaining: selectSwapsRemaining(state, swapPlayerId),
    };
  }, [state, swapPlayerId]);

  /**
   * Every player's remaining priority cards, or `null` when this tournament deals none —
   * CARD-07, D-24.
   *
   * The GATE is the whole of the decision here, and it is 03-UI-SPEC's: a document with an
   * empty schedule AND no card ever played is a migrated Phase 2 draft. It ran strict
   * alternation and dealt nothing, so it renders no strips — six unspent pips would be a
   * confident lie about a draft that never had them. Anything else deals cards, including a
   * Phase 3 draft standing at round 1 with every hand still full.
   *
   * That gate is `selectDealsCards` rather than the two clauses written out here, and it
   * moved into the core when `selectPhase` and `selectCurrentTurn` became its other two
   * readers. Three copies of "does this document deal cards" would be free to disagree, and
   * the disagreement would show as a board rendering hands for a draft the turn selector was
   * running without them.
   *
   * The hand itself is `selectHand`'s answer and never this file's. `HandStrip` decides
   * nothing either; it renders the pips and composes the sentence.
   */
  const hands = useMemo<Record<string, number[]> | null>(() => {
    if (state === null) return null;
    if (!selectDealsCards(state)) return null;

    const byPlayer: Record<string, number[]> = {};
    for (const player of state.config.players) {
      byPlayer[player.id] = selectHand(state, player.id);
    }
    return byPlayer;
  }, [state]);

  /**
   * How many picks this document holds that its own schedule would never have offered.
   *
   * Zero for every document this build creates — the offer is constrained rather than the
   * pick validated, so an illegal pick is unreachable through the UI. Non-zero only for a
   * hand-edited or imported log, which is the case `scheduleViolationNotice` above exists
   * for and the one it deliberately does not repair.
   *
   * The reference set is computed against a state with NO PICKS, and that is the whole
   * subtlety: `selectRoundEligibleIds` subtracts picked ids, and every pick under test has
   * by definition been made, so asking it directly would report the entire draft as
   * illegal. The question here is whether the SPECIES was admissible — never whether it
   * was still free, which is `canApply`'s question and one it already answers.
   *
   * A pick naming a species the current roster no longer carries is skipped rather than
   * counted. That is roster drift, `missingFromRoster` above reports it in its own
   * sentence, and accusing a rotation of breaking a rule would send the host to the wrong
   * screen.
   */
  const scheduleViolations = useMemo(() => {
    if (state === null || entries.length === 0) return 0;

    const megaRound = selectSchedule(state).find((spec) => spec.kind === 'mega');
    if (megaRound === undefined) return 0;

    const offer = new Set(
      selectRoundEligibleIds({ ...state, picks: [] }, entries, megaRound.index),
    );

    return state.picks.reduce((total, pick) => {
      if (selectRoundKind(state, pick.round) !== 'mega') return total;
      if (!entryById.has(pick.monId)) return total;
      return offer.has(pick.monId) ? total : total + 1;
    }, 0);
  }, [state, entries, entryById]);

  /**
   * The banned species' names, for the top-bar disclosure — D-13, and `04-UI-SPEC`
   * Amendment 1.
   *
   * ## WHAT THE ROOM MAY SEE IS DECIDED IN ONE PLACE, AND IT IS NOT HERE
   *
   * `selectPublicBanIds` is Amendment 1's four-row table, already implemented and tested in
   * core (04-04). This line is the wiring and nothing else: it does NOT branch on `banMode`,
   * because a branch here would be a second authority free to disagree with the selector at
   * exactly the moment secrecy matters — a blind stage before the reveal, where the
   * difference between the two answers is every sealed ban in the tournament.
   *
   * The disclosure is a native `<details>` anyone standing in the room can open with one
   * click, and the blind stage's visual shield does not cover the chrome above it. Sourced
   * from `config.bans` this was correct for two modes and a total disclosure for the third.
   * `selectAllBanIds` is the one that must never reach a surface.
   *
   * ## The count still comes from the resolved set, and never from an array length
   *
   * Its length IS the set cardinality by construction: `bannedEntries` intersects the ids
   * with the roster, so a duplicate written by two ban surfaces and a stale id left by a
   * regulation rotation both contribute nothing. That makes it equal to the `banCount`
   * inside the feasibility memo above without the two being computed the same way — and it
   * is why the count is not read off a stored array's length anywhere in this file.
   *
   * Phase 4 adds a second form of that same mistake: flattening the revealed submissions and
   * taking the length. It is wrong by exactly the number of collisions, because a collision
   * is two submissions and one banned species. The expression is deliberately not written
   * out here — a comment quoting a forbidden pattern is the first copy of it free to drift,
   * and it makes the mechanical check report its own documentation.
   */
  const bannedNames = useMemo(
    () =>
      state === null
        ? []
        : bannedEntries(entries, selectPublicBanIds(state)).map((entry) => entry.name),
    [state, entries],
  );

  // Undo's live-region announcement names the species that came back. The store holds
  // the document and the document holds ids, so the display name has to arrive from
  // here, where the roster snapshot already is. Falling back to the id keeps the
  // announcement honest rather than empty if a restored document ever references a
  // species the current regulation dropped.
  const resolveSpeciesName = useCallback(
    (monId: string) => entryById.get(monId)?.name ?? monId,
    [entryById],
  );

  // -------------------------------------------------------------------------
  // DRFT-13 — a confirm in front of every destructive action
  // -------------------------------------------------------------------------

  const [confirm, setConfirm] = useState<Confirm>({ kind: 'idle' });

  const closeConfirm = useCallback(() => setConfirm({ kind: 'idle' }), []);

  /**
   * Which match the record dialog is open on — or `null`.
   *
   * Held HERE rather than inside `TournamentScreen`, and the placement is the same one
   * every dialog in this file already takes: `inert` applies to a whole subtree, so a modal
   * rendered inside the read-only gate would render, trap focus and refuse every click the
   * instant another tab took the lock — a dialog nobody can dismiss. The gate can be raised
   * while this dialog is open, which is exactly the case that makes the placement matter.
   *
   * A read-only tab still cannot reach it: the only route to a non-null value is a
   * results-grid cell, and every one of those is inside the gate (T-05-55).
   *
   * It holds the RESOLVED PAIRING rather than an id to look one up from — `Confirm`'s shape
   * and its reason. The surface that owns the pairing names it, so nothing here has to
   * parse a match id, which is the operation `selectRoundRobinMatches` refuses to perform
   * because a player id may legally contain a colon.
   */
  const [recording, setRecording] = useState<RecordingMatch>(null);

  /**
   * Did the pick that caused the current turn also clear active pool filters — D-35.
   *
   * `PoolGrid` owns the filter state and this is the single fact that has to leave it. It
   * exists so the news travels ON the turn announcement rather than as a second one that
   * would overwrite it.
   *
   * Written afresh by every pick, so the pick path is self-correcting: a turn that cleared
   * nothing writes `false` just as loudly as one that cleared something. Undo is the one
   * turn change that does NOT go through this handler, which is why it is also the one
   * that needs an explicit write — see both undo paths below.
   */
  const [filtersCleared, setFiltersCleared] = useState(false);

  /**
   * The board cell focus is owed after a swap confirm closes — 03-UI-SPEC §Interaction.
   *
   * The same ref-then-layout-effect handoff `focusPoolAfterResolveRef` above uses, and for a
   * closely related reason. `Dialog` restores focus to whatever opened it, which here is a
   * pool cell the swap has just removed from the pool — a detached node, so `.focus()` does
   * nothing and focus lands on `<body>`. The markup is not wrong; there is genuinely nothing
   * left where the host was standing, so the fix is to pass focus on.
   */
  const focusCellAfterSwapRef = useRef<string | null>(null);

  /**
   * Arm a slot — 03-UI-SPEC §10 step 1.
   *
   * Reads the outgoing species off the CURRENT fold rather than taking it from the board
   * cell that was clicked, so what gets armed is what the document says is in that slot at
   * this instant. `swap/made` is self-describing, and this is where that description is
   * captured honestly.
   */
  const armSwap = useCallback(
    (playerId: string, round: number) => {
      const current = getState();
      if (current === null) return;

      const outMonId = selectTeams(current)[playerId]?.[round - 1] ?? null;
      if (outMonId === null) return;

      setArmedSlot({ playerId, round, outMonId });

      // The count is the OFFER's, read from the same selector the grid renders, so the
      // sentence somebody hears and the grid somebody sees cannot report different numbers.
      // Announced here rather than from an effect on the armed state: an effect would fire
      // again on any re-render that happened to change the offer, and the live region would
      // repeat itself at a player who has not touched anything.
      const outName = entryById.get(outMonId)?.name ?? outMonId;
      const offer = selectSwapTargets(current, entries, round - 1).length;
      announce(`Swapping ${outName} out of round ${round}. ${offer} Pokémon can fill this slot.`);
    },
    [entries, entryById],
  );

  /**
   * Clicking a pool cell: a pick, or a swap confirm, decided by whether a slot is armed.
   *
   * The branch is HERE rather than inside `PoolGrid`, so the grid keeps one activation path
   * and the component never has to know which of two games it is part of. It also keeps the
   * asymmetry in one place: a pick commits on the click and a swap opens a question, which is
   * the D-08/§12 decision rather than a difference between two components.
   */
  const handlePoolPick = useCallback(
    (entry: RosterEntry, meta: { filtersCleared: boolean }) => {
      const current = getState();

      // `activeArmedSlot`, NOT `armedSlot`: the branch has to agree with what the host is
      // looking at, and the pool only offers a disarm while the slot still holds what was
      // armed. Reading the raw state here is what made CR-02 reachable.
      if (activeArmedSlot !== null && current !== null) {
        // Resolved NOW, into the confirm, so the sentence names the world the host asked
        // about. `remaining` is read before the spend, because the copy says what this swap
        // spends one OF.
        setConfirm({
          kind: 'swap',
          playerId: activeArmedSlot.playerId,
          playerName:
            selectPlayerName(current, activeArmedSlot.playerId) ?? activeArmedSlot.playerId,
          round: activeArmedSlot.round,
          outMonId: activeArmedSlot.outMonId,
          outName: entryById.get(activeArmedSlot.outMonId)?.name ?? activeArmedSlot.outMonId,
          inMonId: entry.id,
          inName: entry.name,
          remaining: selectSwapsRemaining(current, activeArmedSlot.playerId),
        });
        return;
      }

      // Before the dispatch, so the flag and the turn it describes land in one render
      // rather than in two, the first of which would announce the turn without its suffix.
      setFiltersCleared(meta.filtersCleared);
      setLastMove(null);
      handlePick(entry);
    },
    [activeArmedSlot, entryById],
  );

  /**
   * The card play, and the resolution it may have triggered, as one sentence.
   *
   * The same shape as `filtersCleared` above and for the same reason: it travels ON the
   * turn announcement rather than as a second one that would overwrite it. `announce`
   * writes a single signal, and a card play changes the turn in the same tick.
   *
   * Cleared by every pick, so a pick never re-announces the card that preceded it.
   */
  const [lastMove, setLastMove] = useState<string | null>(null);

  /**
   * Armed when a card play resolves the round, and consumed by the effect below.
   *
   * The card panel handles the ordinary case itself — the played card leaves the hand and
   * focus moves to the next one. The LAST card of a round is different in kind: the whole
   * panel unmounts, so there is no successor inside it and the panel's own effect never
   * runs. Focus would fall to `<body>` on the one transition where the next thing to do is
   * in a pane that just appeared.
   */
  const focusPoolAfterResolveRef = useRef(false);

  const handleCardPlay = useCallback((value: number) => {
    // Read BEFORE the dispatch: after it, the button is already gone from the document.
    // The same `activeElement` precondition `SplitPanes` uses — a pointer user who clicked
    // without focusing keeps their focus where they left it.
    const active = document.activeElement;
    const wasOnACard =
      active instanceof HTMLElement && active.closest('.card-panel__hand') !== null;

    setLastMove(handlePlayCard(value));

    const after = getState();
    focusPoolAfterResolveRef.current =
      wasOnACard && after !== null && selectPhase(after) === 'picking';
  }, []);

  /**
   * Record a snake ban — BAN-03.
   *
   * The `playerId` and the `pass` arrive from `BanStageScreen`, which read them from
   * `selectBanTurn`. Neither is worked out here and neither is worked out there: the
   * serpentine clock has exactly one answer and `canApply`'s `notYourBanTurn` reads the same
   * one, so a second derivation at either end could only ever disagree with the log about
   * whose turn it is.
   *
   * A refused dispatch is left refused rather than reported. `canApply`'s `banAlreadyPlaced`
   * backstop is what catches a click on a species that is already banned, and 04-06 renders
   * those cells inert with a stated reason — the constraint upstream of the click rather than
   * a rejection after it. Until it lands the refusal is silent, which is a rough edge that is
   * sequenced rather than missed.
   */
  const handlePlaceBan = useCallback((playerId: string, monId: string, pass: number) => {
    dispatch(bansPlaced(playerId, monId, pass));
  }, []);

  /**
   * Seal one player's allotment — BAN-04, BAN-05, D-06.
   *
   * The WHOLE allotment in one dispatch, because that is what `canApply` accepts: its
   * `wrongBanCount` arm refuses anything that is not exactly `bansPerPlayer` long, so
   * recording a blind ban one species at a time is not a slower version of this — it is a
   * sequence of refusals.
   *
   * The ids arrive from `BanStageScreen`, which read them off the entry surface's own
   * component state, and the `playerId` from the seat that surface was opened for. Neither
   * is worked out here: a second answer to "whose allotment is this" would be a second
   * authority on the one fact the blind ritual cannot get wrong.
   *
   * A refused dispatch is left refused, exactly as `handlePlaceBan` leaves one. The entry
   * surface will not offer the lock control until the allotment is the right length, which
   * is the constraint upstream of the click that the backstop exists behind.
   */
  const handleSubmitBans = useCallback((playerId: string, monIds: string[]) => {
    dispatch(bansSubmitted(playerId, monIds));
  }, []);

  /**
   * The blind reveal — BAN-04, D-08, D-13.
   *
   * ## It is MATERIALIZED, not an instruction to re-derive
   *
   * The payload carries the attributed lists themselves rather than "reveal what was
   * submitted" (ARCHITECTURE Pattern 5). The reveal is a host act at a point in the log, and
   * a build that re-derived it would be free to disagree about which submissions were in it
   * after an undo — which is the one moment the room is watching the screen together.
   *
   * ## In STARTING order, and assembled here rather than in the screen
   *
   * `banSubmissions` is in LOG order, which is the order the host happened to type them. The
   * reveal reads down the starting order like every other list in the phase, so the mapping
   * is over `state.order` and the submission is looked up by `playerId`. It lives at the
   * composition root because this is the layer that owns `dispatch` — `BanStageScreen`
   * reports the tap and carries no payload at all, so it cannot become a second opinion
   * about what was revealed.
   *
   * `getState()` rather than the render's `state`: the tap is an event, and the document at
   * the moment of the tap is the one being revealed.
   */
  const handleRevealBans = useCallback(() => {
    const current = getState();
    if (current === null) return;

    const bans = current.order.map((playerId) => ({
      playerId,
      monIds: current.banSubmissions.find((entry) => entry.playerId === playerId)?.monIds ?? [],
    }));

    dispatch(bansRevealed(bans));
  }, []);

  /**
   * The second, deliberate tap — D-23, RULE-08.
   *
   * The draw is `drawPoolForBanStage`'s, in the store, because it rolls a seed and `dispatch`
   * lives there; this is the routing half and nothing else. The screen moves only if the draw
   * landed, and which screen it moves to is `screenForState`'s call rather than this line's:
   * a non-empty `poolIds` is what ends the ban stage, so the selector answers `'notRunning'`
   * and the draft opens.
   *
   * A refused draw leaves the reveal exactly where it was, which is the only honest thing to
   * do with it. `BanReveal` refuses its own click on a blocking verdict and this refuses
   * again behind it, so the two layers agree without either depending on the other.
   */
  const handleStartDraft = useCallback(() => {
    if (!drawPoolForBanStage(entries)) return;
    setScreen(screenForState(getState()));
  }, [entries]);

  /**
   * Hand focus to the pool grid's first cell when the card panel has just unmounted.
   *
   * The same shape `SplitPanes` uses for the expand that removes the button that was
   * pressed: the markup is correct — there is genuinely nothing left to focus where the
   * host was standing — so the fix is to pass focus on rather than to keep the node.
   *
   * No dependency array, and it always clears its own flag, so an armed handoff can never
   * survive into a later, unrelated render.
   */
  useLayoutEffect(() => {
    if (!focusPoolAfterResolveRef.current) return;
    focusPoolAfterResolveRef.current = false;

    document.querySelector<HTMLButtonElement>('.pool__grid .mon-card')?.focus();
  });

  /**
   * Pass this player's turn in the dedicated swap round — SWAP-07.
   *
   * The sentence goes through `lastMove` rather than through a direct `announce`, and that
   * is the difference between this and a mid-draft swap. A mid-draft swap does not change
   * whose turn it is (D-25), so nothing overwrites its announcement; a pass DOES advance the
   * swap-round clock, so the turn banner re-announces in the same tick and a second
   * `announce` would be dropped. `lastMove` is the mechanism that composes the two into one
   * string, which is why it exists.
   *
   * `focusAfterSwapRoundRef` covers the LAST pass of the LAST round: the panel holding the
   * button that was just pressed unmounts and the completed-draft view takes its place, so
   * focus is handed to the first control there rather than to `<body>`. Every other pass
   * keeps `SwapPanel` mounted at the same position, so Preact reuses the node and focus
   * survives on its own — the query below simply finds the same button again.
   */
  const handlePassClick = useCallback(() => {
    const move = handlePass();
    if (move === null) return;

    setLastMove(move);

    // Re-read: whether that pass finished the tournament is a question about the state it
    // produced, not the one it was dispatched against.
    const after = getState();
    focusAfterSwapRoundRef.current =
      after !== null && selectIsTournamentComplete(after)
        ? '.pane[data-side="pool"] .pane__scroll button'
        : '.swap-panel__pass';
  }, []);

  /**
   * Resolve whatever handoff the swap-round transitions armed.
   *
   * `useLayoutEffect` with no dependency array, always clearing its own state, exactly like
   * the two handoffs above — an armed handoff must never survive into a later, unrelated
   * render. A selector that matches nothing is a no-op, which is what keeps this inert for
   * every mid-draft interaction.
   */
  useLayoutEffect(() => {
    const selector = focusAfterSwapRoundRef.current;
    if (selector === null) return;
    focusAfterSwapRoundRef.current = null;

    document.querySelector<HTMLButtonElement>(selector)?.focus();
  });

  /**
   * The single gate both undo paths pass through — D-37, and the mitigation for Pitfall 6.
   *
   * `TopBar` calls this from the `Undo last move` button AND from its `document`-level
   * Ctrl+Z listener, which is registered outside the `inert` draft region. Putting the
   * question here rather than on the button is the whole reason the two cannot diverge.
   *
   * The cheap case stays cheap: undoing a pick in the round the draft is standing in is
   * still one click and no dialog, exactly as D-10 shipped it.
   */
  const handleRequestUndo = useCallback(() => {
    const currentDoc = getDoc();
    const currentState = getState();
    if (currentDoc === null || currentState === null) return;

    const crossing = undoCrossesRoundBoundary(currentDoc, currentState);
    if (crossing === null || !crossing.crosses) {
      // An undo changes whose turn it is without clearing anything, so a flag left over
      // from the pick being undone would ride the next turn announcement and claim
      // something that did not happen.
      //
      // A SNAKE BAN comes through here, and by construction rather than by a new branch:
      // `undoCrossesRoundBoundary` reports `crosses: false` for `'banPlaced'` because the
      // ban is on the board and reversing it is visible — the same category as a pick,
      // where D-08's no-confirm posture already holds.
      setFiltersCleared(false);
      undo(resolveSpeciesName);
      return;
    }

    setConfirm({
      kind: 'undo',
      crossing,
      // Core holds ids and never a display name. Falling back to the id keeps the
      // sentence honest rather than empty for a document referencing a player the
      // config no longer lists.
      playerName: selectPlayerName(currentState, crossing.playerId) ?? crossing.playerId,
      playerCount: currentState.config.players.length,
    });
  }, [resolveSpeciesName]);

  const handleRequestAbandon = useCallback(() => {
    const currentState = getState();
    if (currentState === null) return;

    setConfirm({
      kind: 'abandon',
      picks: selectPickCount(currentState),
      players: currentState.config.players.length,
    });
  }, []);

  /**
   * Empty the live slot, in the tab that decided to — all three halves.
   *
   * `discardTournament` is the local one and carries the ordering argument; `clearSaved`
   * is the storage one; `notifyAbandoned` is the one this tab owes every OTHER tab.
   *
   * THE SEQUENCE IS THE FIX FOR A CROSS-TAB DEFECT AND EACH STEP HAS TO BE WHERE IT IS.
   * The local teardown runs first because its `flush()` would otherwise write the draft
   * back after the key was removed. `clearSaved` runs before the announcement because the
   * receiving tab is entitled to go and look, and a nudge sent while the record is still
   * there would hand a secondary back the very document it was being told to let go of.
   *
   * Without the announcement a secondary keeps the tournament in memory with no banner and
   * no visible difference, `loadIfNewer()` on takeover finds no record and so reports
   * "nothing newer", and that tab's first autosave re-creates the key with the tournament
   * this tab let go of — which makes `ABANDON_CONFIRM`'s "Nothing recovers it" false
   * whenever a second tab is open.
   *
   * ## Extracted because filing needs exactly this and must not reimplement it
   *
   * D-15 gives the live slot a SECOND way to empty, and the two differ only in what
   * happened just before: abandon discards, filing writes the document into the library
   * first. Everything after that point is identical, and the cross-tab argument above is
   * not something a second call site should be trusted to reproduce. What this function
   * deliberately does NOT decide is where the host goes next — `discardTournament` routes
   * to the landing screen, and a caller that wants somewhere else says so afterwards.
   */
  const vacateLiveSlot = useCallback(() => {
    discardTournament();
    clearSaved();
    notifyAbandoned();
  }, [discardTournament]);

  /**
   * Abandoning — now the ONLY path in the app that discards a tournament.
   *
   * That is what `ABANDON_CONFIRM`'s body gained a clause to say (05-UI-SPEC §Amendment 1):
   * a host who has just learned that starting a new tournament keeps the old one will
   * reasonably assume this one does too, and only that sentence can correct it.
   */
  const confirmAbandon = useCallback(() => {
    vacateLiveSlot();
  }, [vacateLiveSlot]);

  const confirmUndo = useCallback(() => {
    setConfirm({ kind: 'idle' });
    // Same reason as the direct path above: this is the second of the two routes an undo
    // takes, and both are turn changes that no pick caused.
    setFiltersCleared(false);
    undo(resolveSpeciesName);
  }, [resolveSpeciesName]);

  /**
   * Commit the armed swap — 03-UI-SPEC §10 steps 3 and 4.
   *
   * Three things happen in one tick and the order matters. The dialog closes and the slot
   * disarms so the pool goes back to being the pool; the swap dispatches; and the focus
   * target is armed for the layout effect below.
   *
   * ## The announcement takes one of two routes, and the reason is whether the turn moved
   *
   * A MID-DRAFT swap does not change whose turn it is (D-25), so the turn banner does not
   * re-render its sentence and a direct `announce` is heard. `setLastMove(null)` goes with
   * it, so a card play from earlier in the tick is not re-announced as though the swap had
   * caused it.
   *
   * A SWAP-ROUND swap advances the swap-round clock, so the banner writes its own
   * announcement in the same tick — and `announce` is a single signal, so the direct call
   * would be silently overwritten and the room would hear the next player's name instead of
   * what just happened. Routing through `lastMove` composes the two into one string, which
   * is the mechanism that field exists for.
   */
  const confirmSwap = useCallback(() => {
    if (confirm.kind !== 'swap') return;
    const { playerId, playerName, round, outMonId, outName, inMonId, inName } = confirm;

    // Read BEFORE the dispatch: afterwards the move is recorded and the clock may already
    // have moved on to the next player, or off the round entirely.
    const before = getState();
    const inSwapRound = before !== null && selectCurrentSwapRound(before) !== null;

    setConfirm({ kind: 'idle' });
    setArmedSlot(null);

    if (!handleSwap({ playerId, round, outMonId }, inMonId)) return;

    const move = `${inName} fills ${playerName}'s round ${round} slot. ${outName} is back in the pool.`;
    focusCellAfterSwapRef.current = boardCellId(playerId, round);

    if (inSwapRound) {
      setLastMove(move);
      return;
    }

    setLastMove(null);
    announce(move);
  }, [confirm]);

  /**
   * Hand focus to the board cell the swap just changed.
   *
   * `useLayoutEffect` with no dependency array, always clearing its own flag, exactly like
   * the card-resolution handoff above — an armed handoff must never survive into a later,
   * unrelated render.
   *
   * It runs AFTER `Dialog`'s unmount cleanup has restored focus to the detached pool cell,
   * which is why this is an override rather than a race: the last write wins and this is the
   * last write.
   */
  useLayoutEffect(() => {
    const cellId = focusCellAfterSwapRef.current;
    if (cellId === null) return;
    focusCellAfterSwapRef.current = null;

    document.getElementById(cellId)?.focus();
  });

  // -------------------------------------------------------------------------
  // TOUR-04 / TOUR-05 / TOUR-06 — one result, and what correcting it costs
  // -------------------------------------------------------------------------

  /**
   * Record a match, and clear whatever that correction invalidated — D-05, D-10, D-11.
   *
   * ## THE ORDER IS THE DESIGN, and it is RESEARCH §Corrections as Appends'
   *
   * The record goes first and the void second. The reverse would show a result vanishing
   * for no stated reason if anything went wrong between the two — the host would be left
   * looking at an emptied bracket and no record of why. This way round, a failure between
   * them leaves a recorded result and nothing voided, which is the recoverable half.
   *
   * Both dispatches are synchronous inside this one handler and autosave is a 300ms
   * trailing debounce, so no partial correction can reach storage (T-05-54). D-05 already
   * means a single match is never half-recorded; this is the pairing one level up.
   *
   * ## `causedBySeq` is READ BACK, not predicted
   *
   * `dispatch` stamps the envelope, so the record's `seq` does not exist until it is in the
   * log — and it is `max(seq) + 1` rather than `log.length`, which a caller cannot compute
   * for itself once undo has left a gap. So the document is re-read between the two, on
   * the card-resolution handler's precedent above: the play is in the log now, and its
   * number is a question about the state it produced. That pairing is what makes D-10's
   * "undo puts the whole correction back in one step" true rather than intended.
   *
   * ## The cascade is the dialog's, not a second opinion
   *
   * `targetSeqs` arrives from the same `selectVoidCascade` call the button's label was
   * computed from. Re-deriving it here would be a second authority on what the host just
   * agreed to, and the two would disagree the moment either changed — a confirm that lied
   * about its own cost (T-05-53).
   */
  /** The void sentence waiting for the render after the record's. See the handler below. */
  const voidAnnouncementRef = useRef<string | null>(null);

  const handleRecordMatch = useCallback((record: MatchRecord, cascade: VoidCascade) => {
    const before = getState();
    if (before === null) return;

    const winnerName = selectPlayerName(before, record.winnerId);
    const loserName = selectPlayerName(before, record.loserId);

    const recorded = dispatch(
      matchRecorded(
        record.matchId,
        record.winnerId,
        record.loserId,
        record.winnerGames,
        record.loserGames,
        record.metric,
      ),
    );

    // A refused record leaves the dialog open on the values that were refused, which is
    // where the host can still see and change them. Closing here would discard what they
    // typed and tell them nothing.
    if (!recorded.ok) return;

    setRecording(null);

    if (cascade.targetSeqs.length > 0) {
      // Re-read: the record is in the log now, and its `seq` is a fact about the document
      // it produced rather than the one it was dispatched against.
      const after = getDoc();
      const causedBySeq = after === null ? null : (after.log[after.log.length - 1]?.seq ?? null);

      if (causedBySeq !== null) dispatch(resultsVoided(cascade.targetSeqs, causedBySeq));
    }

    /*
      TWO ANNOUNCEMENTS, the record first and the void separately and after — §Interaction's
      two live-region rows. One long sentence would fold the surprising fact into the
      expected one, and the void is the surprising half.

      THE SECOND IS ARMED RATHER THAN SPOKEN HERE, and that is the whole reason the ref
      exists. `announce` writes a single signal, so a second call in this handler would
      silently overwrite the first and the room would hear only the void — the exact
      failure `confirmSwap` above records and routes around. LiveRegion's own header names
      a two-frame write as the real fix for its byte-identical limit; this is that shape,
      applied to two DIFFERENT sentences that must both be heard.

      The count is read AFTER both dispatches, because a void puts matches back to unplayed
      and the sentence must say what is left now rather than what was left a moment ago.
    */
    const settled = getState();
    if (settled === null || winnerName === null || loserName === null) return;

    const games = record.winnerGames > 1 ? ` ${record.winnerGames}–${record.loserGames}` : '';
    announce(
      `${winnerName} beat ${loserName}${games}. ${selectRemainingMatchCount(settled)} matches left.`,
    );

    if (cascade.matchCount > 0) {
      voidAnnouncementRef.current = `${cascade.matchCount} matches were voided.`;
    }
  }, []);

  /**
   * Speak the void, one render after the record — see the block above.
   *
   * No dependency array and it always clears its own flag, exactly like the two focus
   * handoffs in this file: an armed announcement must never survive into a later, unrelated
   * render and be spoken about a correction that has scrolled out of the host's memory.
   */
  useEffect(() => {
    const sentence = voidAnnouncementRef.current;
    if (sentence === null) return;
    voidAnnouncementRef.current = null;

    announce(sentence);
  });

  /** The results cell owed focus once the reopen has folded. See `confirmReopen`. */
  const pendingReopenFocus = useRef(false);

  /**
   * Reopen a finished tournament — D-17, `05-UI-SPEC` §10 and §Interaction.
   *
   * One action and no cascade. Reopening VOIDS NOTHING — it only moves `lastReopenSeq`
   * past the final's result, which is what `selectTournamentLocked` compares against — so
   * this is not the record handler's shape and deliberately does not borrow it. What the
   * host is warned about in `REOPEN_CONFIRM.body` is the cost of the CORRECTION they are
   * about to make, and that cost is charged by `handleRecordMatch` when they make it.
   *
   * ## Focus, because the control the host just pressed does not survive its own success
   *
   * `FinishedNotice` renders itself away the moment the fold says the tournament is open,
   * so the button under the pointer is gone by the next render and focus would drop to
   * `<body>`. §Interaction names the destination: the results grid's first live cell, "the
   * surface the reopen exists to make usable". That is the same shape as the cut's handoff
   * to the bracket heading, and for the same reason.
   *
   * Armed here and fired in the layout effect below rather than in this handler, because
   * the cell is not reachable yet: the dispatch has to fold and the screen has to re-render
   * before an inert cell becomes a live one.
   */
  const confirmReopen = useCallback(() => {
    setConfirm({ kind: 'idle' });

    const done = dispatch(reopened());
    if (!done.ok) return;

    pendingReopenFocus.current = true;
  }, []);

  /**
   * Hand focus to the reopened grid's first live cell.
   *
   * `useLayoutEffect` with no dependency array, always clearing its own flag, exactly like
   * the three handoffs above it — an armed handoff must never survive into a later,
   * unrelated render. It runs after `Dialog`'s unmount cleanup has tried to restore focus
   * to the notice's button, which by then is detached, so this is the last write and wins.
   */
  useLayoutEffect(() => {
    if (!pendingReopenFocus.current) return;
    pendingReopenFocus.current = false;

    document.getElementById(RESULTS_FIRST_CELL_ID)?.focus();
  });

  // -------------------------------------------------------------------------
  // PERS-04 / PERS-05 — the tournament as a file
  // -------------------------------------------------------------------------

  /**
   * Write the document out. No confirmation, because there is nothing to confirm.
   *
   * Reads the document through `getDoc()` rather than through the render-time signal, so
   * what lands in the file is what the store holds at the moment of the click rather than
   * what this component last rendered.
   */
  const handleDownload = useCallback(() => {
    const current = getDoc();
    if (current === null) return;

    downloadJson(tournamentFilename(current), current);
  }, []);

  /**
   * Install a validated document, and tell the host it happened.
   *
   * The write is deliberately NOT performed here. Ordering it before the render was the
   * mechanism that turned one bad file into a permanent brick: an imported document that
   * the render cannot survive had already been written to `localStorage` by the time the
   * render threw, so every subsequent reload restored it, threw again, and never reached
   * `TopBar` — leaving the app's own `Import JSON…` recovery unreachable and site data the
   * only way out. Handing the document to the effect below instead means the write happens
   * after a render has committed with it on screen, so a document that cannot be displayed
   * is also a document that was never kept.
   */
  const adoptImported = useCallback((imported: TournamentDoc) => {
    if (!adoptTournament(imported)) {
      setImportFlow({ status: 'failed', message: IMPORT_WRONG_SHAPE });
      return;
    }

    setImportedToPersist(imported);

    const restored = getState();
    announce(importAnnouncement(restored === null ? 0 : selectPickCount(restored)));
    setImportFlow({ status: 'idle' });
    // A successful import is a tournament, so it goes to the tournament — from the landing
    // screen, which is where D-01 gives import its front door, and from the draft screen,
    // where this is already where the host is. WHICH tournament screen is
    // `screenForState`'s call: an imported document can be parked at a ban stage.
    setScreen(screenForState(restored));
  }, []);

  /**
   * Take up the document that is in storage NOW — not the one that was there at boot.
   *
   * THE RE-READ IS THE WHOLE POINT OF THIS FUNCTION. `saved` is a snapshot taken in a
   * state initializer during the first render, and with two tabs open — the configuration
   * PERS-03 exists for — it goes stale the moment the owning tab makes a pick. Adopting
   * that snapshot loses picks and then survives promotion: `loadIfNewer` compares
   * generations, `onRemoteSave` has already advanced this tab's to the stored one, so the
   * comparison reports "nothing newer" and the stale document is what the next autosave
   * writes out. That is the T-01-40 clobber arriving through a state variable rather than
   * through a read of storage, which is exactly the door `loadIfNewer` cannot watch.
   *
   * `saved` stays the fallback rather than the source: it renders the button and its
   * description line, and it is what remains if the record has been removed under us.
   *
   * A refused adoption leaves the host on the landing screen rather than dropping them on
   * an empty draft. `load()` has already run `isValidTournament` and `migrate`, so this
   * failing means the document is from a build this one cannot read — and the landing
   * screen, with `Import JSON…` on it, is the only place that offers a way out.
   */
  const handleResume = useCallback(() => {
    const current = loadSavedTournament() ?? saved;
    if (current === null) return;
    if (!adoptTournament(current)) return;
    // A resumed document can be parked at a ban stage — that is the ordinary case for a
    // snake tournament the room stopped part way through — so the screen is asked for.
    setScreen(screenForState(getState()));
  }, [saved]);

  // -------------------------------------------------------------------------
  // The library — PERS-08, D-14 / D-15 / D-16.
  //
  // Three gestures write to it and they share one path: `New tournament` over a live
  // document, `Open tournament` on a library row, and the at-cap eviction that either can
  // run into. `05-UI-SPEC` §12 rules that opening files "through the same D-15 confirm —
  // one filing path, not two", so the gesture travels as `AfterFiling` and the filing
  // question is asked in exactly one place.
  // -------------------------------------------------------------------------

  /**
   * The document a filing gesture would file, or `null` when there is nothing to file.
   *
   * THE SAME EXPRESSION `handleResume` USES, deliberately and not by coincidence. Both
   * gestures that reach this — `New tournament` and `Open tournament` — live on the
   * landing screen and nowhere else, which is the screen that offers `Resume saved draft`
   * beside them. Filing has to act on the document that button would have resumed, or the
   * host files one tournament and is offered a different one a moment later.
   *
   * The RE-READ is what makes that true rather than approximately true, for the reason
   * `handleResume` states in full: `saved` is a snapshot taken in a state initializer
   * during the first render, and with two tabs open it goes stale the moment the owning
   * tab makes a pick. Filing the snapshot would write a document several picks behind the
   * one in storage — and then empty the slot holding the better copy. `saved` stays the
   * fallback rather than the source.
   *
   * Deliberately NOT `getDoc()`. Nothing has been adopted while the host is on the landing
   * screen, and reaching into the store for a document this screen is not showing would
   * file whatever a previous tournament left behind there.
   */
  const liveDocument = useCallback(
    (): TournamentDoc | null => loadSavedTournament() ?? saved,
    [saved],
  );

  /**
   * Where a filing gesture ends up. NAVIGATION ONLY — it empties nothing.
   *
   * Separate from {@link vacateLiveSlot} because the two are needed in different
   * combinations: a gesture that filed something must empty the live slot first, and a
   * gesture with nothing to file must not. Folding the teardown in here would make a
   * first-visit `New tournament` broadcast an abandonment to every other tab — over a
   * tournament this tab never had.
   *
   * When it IS preceded by a vacate, `vacateLiveSlot` routes to the landing screen on its
   * way through; the `setScreen` calls here run after it in the same tick and are what
   * decide the destination.
   */
  const navigateAfterFiling = useCallback(
    (after: AfterFiling) => {
      if (after.kind === 'newTournament') {
        setScreen({ name: 'config' });
        return;
      }

      // `openLibraryEntry` validates and migrates through the same read path the list
      // does, so a `null` here means an entry that would not have rendered a row either.
      const opened = openLibraryEntry(after.id);
      if (opened === null) return;
      if (!adoptTournament(opened)) return;

      // The landing screen DESCRIBES `saved`, and this tab now holds the opened document —
      // leaving the old snapshot in place would keep advertising the tournament that was
      // just filed.
      setSaved(opened);
      if (storageOk) saveTournament(opened);

      // A filed document can be parked anywhere from a ban stage to a finished bracket,
      // which is `screenForState`'s call and not this line's.
      setScreen(screenForState(getState()));
    },
    [storageOk],
  );

  /**
   * Write the library, THEN touch the live slot — `library.ts`'s ordering rule, at the one
   * place both writes happen.
   *
   * The two are separate keys and can partially fail. Library-then-live means a failure
   * leaves the live document exactly where it was; the other order loses a night to a
   * storage error. This function is that rule's only caller, which is why the adapter
   * deliberately does not write the live slot itself.
   *
   * On a refusal nothing else happens at all — the live document stays, no new tournament
   * is created, no entry is opened — and the host is told, with the download offered as the
   * next action. That failure is NOT routed into the storage warning the draft screen
   * raises: that one means "this browser will not save your draft" and is the one banner in
   * this app a host genuinely must read, and spending it on a recoverable filing failure is
   * how a real warning gets trained out of somebody's attention (`library.ts` states the
   * same rule from the adapter's side).
   */
  const fileAndProceed = useCallback(
    (doc: TournamentDoc, after: AfterFiling) => {
      const outcome = fileTournament(doc);

      if (outcome.kind === 'quotaFailed') {
        setConfirm({ kind: 'fileFailed', doc });
        return;
      }

      // `filed` and `evicted` are both a landed write. The live slot is emptied only now,
      // and only because the document is somewhere else: leaving it in both places would
      // offer `Resume saved draft` for a night that is already filed — two entry points to
      // one tournament, disagreeing the moment either is used.
      vacateLiveSlot();
      navigateAfterFiling(after);
    },
    [vacateLiveSlot, navigateAfterFiling],
  );

  /**
   * Ask the filing question — or, at the cap, the eviction question instead of it.
   *
   * `oldestEntry()` is consulted BEFORE anything is written, which is the whole of D-16.
   * Discovering the cap by catching a quota error is the failure that decision rejects by
   * name: it lands at the worst possible moment, while the host is trying to save a night,
   * and by then the choice has already been made for them.
   *
   * With nothing live there is no question to ask and no dialog is raised — a first-visit
   * `New tournament` goes straight to the config screen, exactly as it did before D-15.
   */
  const requestFiling = useCallback(
    (after: AfterFiling) => {
      const doc = liveDocument();
      if (doc === null) {
        navigateAfterFiling(after);
        return;
      }

      const dropped = oldestEntry();
      if (dropped !== null) {
        setConfirm({ kind: 'evict', doc, dropped, after });
        return;
      }

      setConfirm({ kind: 'file', doc, after });
    },
    [liveDocument, navigateAfterFiling],
  );

  /**
   * Persist a freshly imported document, once, after the render that displayed it.
   *
   * An effect rather than a call inside `adoptImported`, and the timing is the entire
   * point: Preact flushes effects on commit, so a render that throws never gets here.
   *
   * Still immediate rather than left to the autosave, for the reason the direct call had:
   * the autosave is on a 300ms trailing debounce and an import is exactly the moment where
   * the window between "the screen changed" and "the change is on disk" should be as small
   * as it can be. Gated on the canary for the same reason the autosave is — a browser that
   * already proved it will not keep anything gets no further attempts to fail at.
   *
   * What this does NOT do, stated rather than left to be discovered: the debounced autosave
   * is a separate subscriber and schedules its own write the moment the document changes,
   * so it can still persist a document 300ms later that the render did not survive. The
   * guarantee against that lives in `import-guard.ts`, which refuses the counts that make a
   * document unrenderable in the first place. This ordering is the second line, not the
   * first.
   */
  useEffect(() => {
    if (importedToPersist === null) return;

    // Cleared first. A `save` that throws must not leave this effect re-entering on the
    // same document for the rest of the session.
    setImportedToPersist(null);
    if (storageOk) saveTournament(importedToPersist);
  }, [importedToPersist, storageOk]);

  /**
   * Read, validate, then decide whether anything is at stake.
   *
   * Nothing here mutates the store. Every failure path returns having touched only this
   * component's own message state, which is what makes "a refused import leaves the draft
   * untouched" a property of the control flow rather than a promise (T-01-45).
   */
  const handleImportFile = useCallback(
    (file: File) => {
      // Clear the previous failure first. Leaving a stale sentence on screen while the
      // next file is being read would have the host reading an answer to the last
      // question.
      setImportFlow({ status: 'idle' });

      void readJsonFile(file).then((read) => {
        if (!read.ok) {
          // `tooLarge` and `unreadable` both land here. Neither is a distinction the host
          // can act on differently: the answer to both is a different file.
          setImportFlow({ status: 'failed', message: IMPORT_WRONG_SHAPE });
          announce(IMPORT_WRONG_SHAPE);
          return;
        }

        const result = parseTournamentFile(read.text, read.byteLength);

        if (!result.ok) {
          const message =
            result.reason === 'newerSchema' ? IMPORT_NEWER_SCHEMA : IMPORT_WRONG_SHAPE;
          setImportFlow({ status: 'failed', message });
          announce(message);
          return;
        }

        // An empty draft has nothing to lose, so asking would be ceremony. A
        // confirmation that fires when nothing is at stake is how hosts learn to click
        // through the one that matters.
        const current = getState();
        if (current === null || selectPickCount(current) === 0) {
          adoptImported(result.doc);
          return;
        }

        setImportFlow({ status: 'confirm', doc: result.doc });
      });
    },
    [adoptImported],
  );

  const cancelImport = useCallback(() => {
    // The validated document goes out of scope unused. It was never installed anywhere,
    // so there is nothing to roll back.
    setImportFlow({ status: 'idle' });
  }, []);

  // Two separate acknowledgements because they are two separate events. The canary
  // failing means nothing was ever going to be saved; a write failing mid-draft means
  // saves were working and have stopped. The host deserves to be told the second time
  // even though they clicked through the first — but only once per event, or a full
  // quota turns into a warning on every pick.
  const storageBlockedAtBoot = !storageOk && !probeAcknowledged;
  const storageBlockedMidDraft = storageOk && savingBlocked.value && !writeFailureAcknowledged;

  return (
    /*
      The shell root is a FRAGMENT, and that shape is the whole of the read-only gate.

      ## What is inside the gate, and why it is every screen

      One `inert` element wraps the landing screen, the config screen and the draft. One
      attribute disables pointer, keyboard and focus across all three, and it is
      Baseline-supported. The hand-rolled alternative — `pointer-events: none` plus
      `disabled` on each control — leaks in exactly the way that matters: a Tab key still
      walks into the pool, and a keyboard user reaches a cell that will silently discard
      their pick.

      Gating the draft alone was not enough, and the hole was not in the draft. A
      secondary tab could walk the landing screen to `New tournament`, fill the config
      form, click `Start draft`, and hold a DIFFERENT tournament from the owner's —
      `dispatch` is deliberately un-gated (`store.ts`). Every autosave is refused while
      the tab is a secondary, so nothing looks wrong; then `Take over drafting here`
      makes it the owner and the next save writes that tournament over the owner's draft.
      The landing and config screens were siblings of the gate, so they are now children
      of it.

      `undefined` rather than `false` so Preact removes the attribute outright.

      ## What is outside the gate, and why each one has to be

      `inert` strips a subtree from the accessibility tree as well as from the input
      path, so three things sit beside the gated element rather than inside it:

        `LiveRegion` — the single polite region. Inside the gate it goes silent in
        precisely the tab that most needs to be told why nothing responds.

        `ReadOnlyBanner` — it announces the sentence explaining the state, and it carries
        `Take over drafting here`. Inside the gate that button is unreachable, which is a
        hard lockout: `tab-lock.ts`'s header names that outcome as worse than the race
        the lock exists to prevent.

        The three dialogs — `inert` applies to a whole subtree, so a modal rendered
        inside it would render, trap focus, and refuse every click. A dialog nobody can
        dismiss.

      ## The two shells

      The draft screen is the one screen that is not a scrolling page: it is exactly one
      viewport tall and its two panes scroll inside it, so the board is on screen at every
      moment. Every other screen keeps the capped, centred, page-scrolling shell — which
      is what leaves `FeasibilityBar`'s pinned bar on the config screen untouched. The
      viewport height now lives on `#app`, because the banner is no longer inside the
      element that has to be one viewport tall. See app.css.
    */
    <>
      <LiveRegion />

      {/*
        Above the top bar, and above the storage warning's own gate: the two are
        independent conditions and a tab can genuinely be both read-only and unable to
        save. Suppressing this one would answer the smaller question and leave the
        larger one — why does nothing in this tab respond — unanswered.
      */}
      <ReadOnlyBanner ownership={ownership} />

      <div
        /*
          Four-way, per `04-UI-SPEC` §3's shell table and Amendment 2.

          The snake ban stage keeps `.draft-shell` because it IS the two-pane working screen
          — pool on the left, ban board on the right, exactly the draft the room is about to
          run (D-02). Blind's locked and reveal screens are read-and-act screens like the
          landing screen, so they take `.app-shell` and 04-09 asserts that.

          Blind's ENTRY sub-state takes neither. §3 gives it its own row — "own full-screen
          surface" — and §5 states the reason as the literal reading of BAN-05: "the ban
          entry is the entire working area, not a masked field inside a visible screen." An
          earlier three-way version of this expression keyed on the MODE alone and this arm
          fell through to `.app-shell`, which put the phase's most important screen inside a
          1200px centred column with page padding around it. That was WR-01. The mode is
          still what decides the snake arm, because that answer really is a property of the
          mode; the entry arm is a property of the STAGE, so it is read from the stage.

          ALL FOUR ARMS ARE THE SAME ELEMENT, which is the point. This is the element that
          carries `inert`, and the entry surface has to be under it: a read-only tab handed a
          live ban screen is a rival-tournament hole (T-04-20) and a secrecy one. Moving the
          entry surface out to a sibling would look identical on screen and reopen both.

          THE TOURNAMENT SCREEN JOINS THE `draft-shell` ARM, and by measurement rather than
          by resemblance. `05-UI-SPEC` §Layout Budget: the 8-player crosstable wants 204px
          columns, this cap yields 114px, and `--results-col-min` is 188px. The sentence
          above applies to it unchanged — a read-only tab handed a live results grid could
          record a result nobody in the room played, which is T-05-55.
        */
        class={
          screen.name === 'bans' && blindEntryActive
            ? 'entry-shell'
            : screen.name === 'draft' ||
                screen.name === 'tournament' ||
                (screen.name === 'bans' && state?.config.banMode === 'snake')
              ? 'draft-shell'
              : 'app-shell'
        }
        inert={readOnly ? true : undefined}
      >
        {/*
          The landing screen owns the boot-time storage warning (D-01), because it is what
          comes first now. It renders that and nothing else until it is acknowledged.
        */}
        {screen.name === 'landing' && (
          <LandingScreen
            saved={saved}
            storageBlocked={storageBlockedAtBoot}
            onAcknowledgeStorage={() => setProbeAcknowledged(true)}
            /*
              D-15 changed what this button MEANS. It used to walk straight to the config
              screen and leave the saved draft to be overwritten later; it now files the
              current tournament and says where it went. With nothing to file it still
              walks straight through and raises no dialog at all.
            */
            onNewTournament={() => requestFiling({ kind: 'newTournament' })}
            onResume={handleResume}
            /*
              §12: opening a library entry files the current tournament FIRST, through the
              same D-15 confirm. One filing path, not two — a second confirm shape for the
              same act would be a second thing to keep in step with the first.
            */
            onOpenTournament={(id) => requestFiling({ kind: 'openEntry', id })}
            onImportFile={handleImportFile}
            /*
              The DEFAULT roster, which is what a new tournament would be created against —
              never an opened document's. `null` until it lands, so the banner cannot claim
              a regulation has expired before anything has said which regulation it is.
            */
            roster={
              load.status === 'ready'
                ? {
                    regulationLabel: load.bundle.snapshot.regulation,
                    validUntil: load.bundle.snapshot.validUntil,
                  }
                : null
            }
            /*
              D-26: routes, and does not refresh in place. There is exactly one refresh
              control in the app and it is on the config screen, so this navigates there and
              asks for focus on it.
            */
            onUpdateRoster={() => setScreen({ name: 'config', focusRoster: true })}
          />
        )}

        {/*
          The roster gates the config screen because every derivation on it — the pool
          size, the draw, the feasibility gate — reads the snapshot. There is nothing
          useful to render before it lands, and rendering the form against an empty roster
          would report a configuration as unsatisfiable that is not.
        */}
        {screen.name === 'config' && load.status !== 'ready' && (
          <p class="app-shell__status">
            {load.status === 'failed' ? load.message : 'Loading the pool…'}
          </p>
        )}

        {screen.name === 'config' && load.status === 'ready' && (
          <ConfigScreen
            snapshot={load.bundle.snapshot}
            entries={entries}
            spriteMeta={load.bundle.spriteMeta}
            // The config screen reports that a tournament exists and routes nothing —
            // `ConfigScreen`'s own prop doc states that, and it is why `handleStart`'s
            // branch on `banMode` did not have to grow a second output. A snake start lands
            // on `bans`, a hostBanlist start on `draft`, and one selector decides which.
            onStarted={() => setScreen(screenForState(getState()))}
            /*
              REFR-01's consequence, and the whole of it: a newer regulation becomes the
              roster a NEW tournament is created against. It changes nothing about any
              document — an open one holds its own bundle by `config.rosterVersion` and the
              registry never evicts, so a filed M-B night is still an M-B night one second
              after the app adopts M-C.
            */
            onRosterRefreshed={(bundle) => {
              setLoad({ status: 'ready', bundle });
              noteRosterAdopted();
            }}
            /*
              REFR-02, and deliberately NOT `setLoad`. 05-04 decided an imported roster is
              adopted into the registry but does not become the default: a host importing an
              old regulation in order to read an old night must not silently re-point the
              next tournament at it. So this only announces that the registry grew.
            */
            onRosterImported={noteRosterAdopted}
            // D-26's landing site. `=== true` rather than a bare read because the field is
            // optional on the route and `undefined` is not the prop's type.
            focusRosterRefresh={screen.focusRoster === true}
          />
        )}

        {/*
          INSIDE the gate, as a sibling of the other three screens rather than beside it.
          The gate's doc block above records why: the landing and config screens were moved
          in here because a secondary tab could otherwise build a whole rival tournament, and
          a ban stage rendered beside the gate would reopen exactly that hole (T-04-20). No
          new ownership machinery is needed — the stage's only route in is a control inside
          the gate, so a read-only tab can never reach it.
        */}
        {screen.name === 'bans' && load.status === 'ready' && state !== null && (
          <BanStageScreen
            state={state}
            entries={entries}
            // The ACTIVE sprite map, so a document opened on a prior regulation is drawn
            // with the art that regulation resolved. Falls back inside a `ready` guard
            // only because the type cannot see that `spriteMeta` is non-null here.
            spriteMeta={spriteMeta ?? load.bundle.spriteMeta}
            topBar={{
              onDownload: handleDownload,
              onImportFile: handleImportFile,
              importError: importFlow.status === 'failed' ? importFlow.message : null,
              onRequestUndo: handleRequestUndo,
              onRequestAbandon: handleRequestAbandon,
              bannedNames,
            }}
            onReveal={handleRevealBans}
            onSubmitBans={handleSubmitBans}
            onStartDraft={handleStartDraft}
            /*
              D-09's split. The stage decides WHEN the offer appears — after `bans/revealed`
              and at no earlier point — and this supplies the same `handleDownload` the top
              bar already has, so there is still exactly one way a file is written and it
              still needs a click.
            */
            checkpoint={{
              dismissed: revealCheckpointDismissed,
              onDownload: handleDownload,
              onDismiss: () => setRevealCheckpointDismissed(true),
            }}
            // The STORED preference, uncoerced. `pane` below coerces against the DRAFT's
            // availability, which tracks `selectPhase` — and `selectPhase` answers `'cards'`
            // at a ban stage. Amendment 2's coercion is the stage's own and lives there.
            storedPane={storedPane}
            onPaneChange={handlePaneChange}
            onPlaceBan={handlePlaceBan}
            /*
              The one fact this layer needs about the stage's own transient state, and the
              only one it is given: a surface is up, or it is not. The shell class above
              reads it; nothing else does. `setBlindEntryActive` is a `useState` setter, so
              it is a stable identity and the effect that calls it cannot churn.
            */
            onEntryActiveChange={setBlindEntryActive}
          />
        )}

        {screen.name === 'draft' && <h1 class="app-shell__title">Champions Draft</h1>}

        {/*
          A write that failed mid-draft, which is a different event from the canary and
          gets its own acknowledgement — see above. It can only reach the host on the draft
          screen, because that is the only screen a `save` runs behind. Inside the gate
          costs nothing: a refused write deliberately does not raise `savingBlocked`
          (`persistence.ts`), so a secondary tab never reaches this branch at all.
        */}
        {screen.name === 'draft' && storageBlockedMidDraft && (
          <StorageBlocked onAcknowledge={() => setWriteFailureAcknowledged(true)} />
        )}

        {screen.name === 'draft' && load.status === 'ready' && state !== null && (
          <>
            {/*
              TopBar and TurnBanner are both specified as sticky at the top of the
              viewport, so they stick as one block rather than fighting over the same
              pixel. See TopBar.css.

              `position: sticky` on this head is a no-op now that the panes own the
              scrolling — there is no page scroll left for it to stick against. It is left
              in place rather than deleted: removing it means editing TopBar.css for no
              behavioural gain, and it re-engages verbatim if a later phase reintroduces
              page scroll on this screen.
            */}
            <div class="sticky-head">
              <TopBar
                onDownload={handleDownload}
                onImportFile={handleImportFile}
                importError={importFlow.status === 'failed' ? importFlow.message : null}
                onRequestUndo={handleRequestUndo}
                onRequestAbandon={handleRequestAbandon}
                bannedNames={bannedNames}
              />

              {/*
                Every number here is derived from the config the host authored. `teams` is
                the player count rather than `Object.keys(selectTeams(state)).length`: one
                team per player is what the config asserts, and counting the fold's output
                would report the same figure by a longer route that can disagree with it.
              */}
              <TurnBanner
                round={bannerRound}
                rounds={state.config.rounds}
                playerName={bannerPlayerName}
                complete={complete}
                picks={selectPickCount(state)}
                teams={state.config.players.length}
                filtersCleared={filtersCleared}
                // The mode, read from the one place it is decided. The banner branches on
                // it; it does not work it out.
                phase={phase}
                pickOrder={pickOrderNames}
                // CARD-05 scopes the tie clause to the case where a tie is possible at all.
                // Config is read here, which is why the arithmetic is here rather than in a
                // component that would have to be handed both numbers to do it.
                tiePossible={state.config.players.length > state.config.rounds}
                // The swap-round headline's two numbers and the phase line's variant.
                // All three are read; the banner composes sentences and decides nothing —
                // which source the order came from least of all (SWAP-04).
                swapRound={swapRound}
                swapRounds={state.config.swapRounds}
                swapOrderSource={selectSwapOrderSource(state)}
                lastMove={lastMove}
                // Null on this screen, always: the ban stage is a screen of its own (see
                // the `Screen` doc block), so a non-null pass here would mean the router
                // put a ban stage on the draft. Required rather than optional so every
                // call site states which of the two it is.
                banPass={null}
                banPasses={state.config.bansPerPlayer}
                stillToBan={[]}
              />

              {feasibilityNotice !== null && (
                <p class="draft-notice" role="status">
                  {feasibilityNotice}
                </p>
              )}

              {/*
                A second notice rather than a clause folded into the first. The two describe
                unrelated facts — one is arithmetic the host authored, the other is the
                roster moving underneath it — and either can hold without the other.
              */}
              {/*
                One surface, two forms, and never both at once — D-24. An unresolvable
                roster is not drift plus something; it is the same fact ("this document
                references what this roster does not contain") at its limit, so it reuses
                this notice rather than adding a fourth. `missingFromRoster` reads 0 in that
                state because the pool it compares against is empty, which is exactly why
                the unresolvable branch is asked FIRST rather than left to fall through.
              */}
              {unresolvedRosterVersion !== null ? (
                <p class="draft-notice" role="status">
                  {rosterDriftNotice(state.poolIds.length, unresolvedRosterVersion)}
                </p>
              ) : (
                missingFromRoster > 0 && (
                  <p class="draft-notice" role="status">
                    {rosterDriftNotice(missingFromRoster)}
                  </p>
                )
              )}

              {/*
                A THIRD notice, on the same rule as the second: three unrelated facts, three
                sentences. This one says a pick disagrees with the schedule the document
                itself carries; the one above says the roster moved; the first says the
                arithmetic stopped adding up. Any of them can hold without the others, and a
                folded clause would make the host read a sentence about a problem they do
                not have to reach the one they do.
              */}
              {scheduleViolations > 0 && (
                <p class="draft-notice" role="status">
                  {scheduleViolationNotice(scheduleViolations)}
                </p>
              )}
            </div>

            {/*
              The completed-draft screen takes the POOL's place and nothing else. The head
              and the board stay exactly where they are, so `Undo last move` is still one
              click away — a host who spots a wrong final pick on this screen must be able
              to unwind it, and the board remains the completed record.
            */}
            <SplitPanes
              pane={pane}
              onPaneChange={handlePaneChange}
              poolExpandable={poolExpandable}
              boardExpandable={boardExpandable}
              phaseReason={phaseReason}
              pool={
                phase === 'cards' ? (
                  <CardPanel
                    playerName={bannerPlayerName ?? ''}
                    // Rules, all six of them, and not one is worked out in a component.
                    hand={cardTurn === null ? [] : selectHand(state, cardTurn.playerId)}
                    playable={cardOffer.values}
                    constraintLifted={cardOffer.lifted}
                    played={playedThisRound}
                    stillToPlay={stillToPlay}
                    onPlay={handleCardPlay}
                  />
                ) : phase === 'swapRounds' && swapArming === null && swapRound !== null ? (
                  /*
                    THE SWAP-ROUND SURFACE, and note what the second condition does.

                    `swapArming === null` means no slot is armed. The moment one IS, this
                    branch falls through to `PoolGrid` below — the same component, the same
                    offer and the same confirm that a mid-draft swap uses, with `swapRound`
                    set to the round in progress rather than to 0. 03-UI-SPEC §11: "there is
                    one swap flow, not two", and this is the line that makes that true rather
                    than merely intended.

                    Every value is a selector's. `SwapPanel` is handed the round, the budget
                    and a name, and it renders four sentences and a button.
                  */
                  <SwapPanel
                    swapRound={swapRound}
                    swapRounds={state.config.swapRounds}
                    playerName={
                      swapRoundPlayerId === null
                        ? ''
                        : (selectPlayerName(state, swapRoundPlayerId) ?? swapRoundPlayerId)
                    }
                    remaining={
                      swapRoundPlayerId === null
                        ? 0
                        : selectSwapsRemaining(state, swapRoundPlayerId)
                    }
                    onPass={handlePassClick}
                  />
                ) : complete ? (
                  <CompletedDraft
                    players={state.config.players}
                    // The fold itself, not `selectTeams(state)`. The stone a Mega slot
                    // exports with is read off the schedule and the picks together, so a
                    // pre-folded team array would have been a second copy of one fact.
                    state={state}
                    entries={entries}
                    entryById={entryById}
                    checkpointReached={complete}
                    checkpointDismissed={checkpointDismissed}
                    onDownload={handleDownload}
                    onDismissCheckpoint={() => setCheckpointDismissed(true)}
                    // A route, not a fold. WHETHER the control renders is
                    // `selectTournamentStage`'s call inside the screen — which is what
                    // makes a `draftOnly` night skip every bracket surface — and this
                    // line is only where the host lands when they take it.
                    onOpenTournament={() => setScreen({ name: 'tournament' })}
                    // PERS-09 at `draftOnly` depth, where there is no bracket to reach it
                    // from. `null` while the roster is still resolving — see the memo.
                    recap={recapAccess}
                  />
                ) : (
                  <PoolGrid
                    entries={availableEntries}
                    spriteMeta={spriteMeta ?? load.bundle.spriteMeta}
                    onPick={handlePoolPick}
                    // Not a ban surface. `null` rather than an empty set, so a draft cell
                    // cannot report an unpressed toggle state it does not have.
                    bannedIds={null}
                    // The WHOLE leftover pool above, and the round's restriction here. The
                    // grid composes the two, which is what leaves `{total}` in
                    // `{n} of {total} available` a number worth printing — see PoolGrid.
                    roundRestriction={roundRestriction}
                    // The armed slot's offer, already filtered by that slot's own predicate
                    // on the FIRST frame — SWAP-06 by construction, never by rejecting a
                    // click afterwards.
                    swap={swapArming}
                    swapBudget={swapBudget}
                  />
                )
              }
              board={
                <BoardGrid
                  players={state.config.players}
                  rounds={state.config.rounds}
                  // The compiled schedule, or all-open for a document drafted before the
                  // compiler existed. `selectSchedule` answers both cases; the component
                  // renders the kind it is handed and decides nothing.
                  schedule={selectSchedule(state)}
                  teams={selectTeams(state)}
                  currentTurn={turn}
                  entryById={entryById}
                  spriteMeta={spriteMeta ?? load.bundle.spriteMeta}
                  pickCount={selectPickCount(state)}
                  // Names in `board-full`, none in `split`. One expression, so the two
                  // pane states cannot each grow their own answer.
                  showName={pane === 'board'}
                  firstPlayerName={turnPlayerName}
                  // Null for a migrated schema-2 draft, which dealt no cards. See the memo.
                  hands={hands}
                  // Amendment 1's four conditions, three of them already resolved into this
                  // one id. Null at `swapBudget: 0`, during the card phase, and once the
                  // budget is spent — and then no cell on the board is a button.
                  swapPlayerId={swapPlayerId}
                  onArmSwap={armSwap}
                />
              }
            />
          </>
        )}

        {/*
          THE FIFTH ARM, and it is an arm rather than a sibling for the reason the gate's
          own doc block gives about the entry surface: this is the element that carries
          `inert`, and every record, cut, override and reopen control on the tournament
          surfaces has to be under it. A read-only tab that could reach a results-grid cell
          would record a result the owning tab never saw (T-05-55), and moving the screen
          out to a sibling would look identical on screen while reopening exactly that.

          No new ownership machinery is needed and none is wanted — the only route to this
          screen is a control inside the gate.
        */}
        {screen.name === 'tournament' && state !== null && (
          <TournamentScreen
            state={state}
            topBar={{
              onDownload: handleDownload,
              onImportFile: handleImportFile,
              importError: importFlow.status === 'failed' ? importFlow.message : null,
              onRequestUndo: handleRequestUndo,
              onRequestAbandon: handleRequestAbandon,
              bannedNames,
            }}
            onBackToDraft={() => setScreen({ name: 'draft' })}
            onSelectMatch={setRecording}
            onRequestReopen={() => setConfirm({ kind: 'reopen' })}
            // PERS-09 from the bracket, once the final is recorded — §Color reservation 2.
            recap={recapAccess}
          />
        )}
      </div>

      {/*
        A SIBLING of the gated element above, and that placement is load-bearing rather
        than tidy. `inert` applies to a whole subtree, so a modal rendered inside it in a
        read-only tab would render, trap focus, and refuse every click — a dialog nobody
        can dismiss. Rendered here it is unaffected by the attribute, and the pick count
        it quotes is the CURRENT draft's, which is the thing about to be lost.
      */}
      {/*
        Same placement, same reason as the three below — and here the reason is not
        hypothetical. This dialog is opened from a surface INSIDE the gate, and the gate can
        go up while it is open: another tab presses `Take over drafting here` mid-entry and
        every screen behind this modal goes inert. Rendered inside, the dialog would go
        inert with them — trapping focus in a panel that refuses its own dismiss button.

        A read-only tab still cannot record anything, because the only route to a non-null
        `recording` is a results-grid cell and every one of those IS behind the gate
        (T-05-55). The gate is the record control's guard; it was never this modal's.
      */}
      {recording !== null && state !== null && (
        <MatchRecordDialog
          state={state}
          matchId={recording.matchId}
          aId={recording.aId}
          aName={recording.aName}
          bId={recording.bId}
          bName={recording.bName}
          format={recording.format}
          onRecord={handleRecordMatch}
          onKeep={() => setRecording(null)}
        />
      )}

      {importFlow.status === 'confirm' && state !== null && (
        <ImportConfirmDialog
          pickCount={selectPickCount(state)}
          playerCount={state.config.players.length}
          onConfirm={() => adoptImported(importFlow.doc)}
          onCancel={cancelImport}
        />
      )}

      {/*
        Same placement, same reason. See the note above the import confirm.

        Routed BY SCREEN rather than by a field on `confirm`, because the screen is what
        makes the two sets differ: on the ban stage no pick has been made and the bans are
        what is at stake, so `This discards 0 picks` would be a plain untruth and
        `Keep the bans` is the label that names the thing being kept.
      */}
      {confirm.kind === 'abandon' && screen.name === 'bans' && (
        <ConfirmDialog
          heading={ABANDON_BAN_STAGE_CONFIRM.heading}
          body={ABANDON_BAN_STAGE_CONFIRM.body(confirm.players)}
          confirmLabel={ABANDON_BAN_STAGE_CONFIRM.confirmLabel}
          safeLabel={ABANDON_BAN_STAGE_CONFIRM.safeLabel}
          tone={ABANDON_BAN_STAGE_CONFIRM.tone}
          onConfirm={confirmAbandon}
          onSafe={closeConfirm}
        />
      )}

      {confirm.kind === 'abandon' && screen.name !== 'bans' && (
        <ConfirmDialog
          heading={ABANDON_CONFIRM.heading}
          body={ABANDON_CONFIRM.body(confirm.picks, confirm.players)}
          confirmLabel={ABANDON_CONFIRM.confirmLabel}
          safeLabel={ABANDON_CONFIRM.safeLabel}
          tone={ABANDON_CONFIRM.tone}
          onConfirm={confirmAbandon}
          onSafe={closeConfirm}
        />
      )}

      {/*
        The three library dialogs — D-14, D-15, D-16. Same sibling placement as every
        dialog above and for the same reason the import confirm's note gives.

        ## Built on `Dialog` rather than on `ConfirmDialog`, and the reason is the third
        ## button

        `ConfirmDialog` renders exactly two: the confirming one and the safe one. Each of
        these needs a download beside them, because D-14's whole position is that browser
        storage is not the system of record — Safari discards script-written storage after
        seven days idle, and with a library that now costs twelve nights rather than one —
        so the file is offered at the moment the host is thinking about the tournament,
        not left to a control on another screen. An offer the host cannot act on from
        inside the dialog is not an offer. `MatchRecordDialog` set this precedent in 05-10
        for the same structural reason.

        BOTH OF `ConfirmDialog`'s SAFETY RULES ARE PRESERVED VERBATIM, and they are the
        reason that component exists rather than incidental to it: the confirming button
        is FIRST in DOM order and the safe button is LAST, so the safe one is the last
        thing focus reaches and the last thing read; and `dismissible` maps Escape to the
        safe outcome, so a reflexive Escape is never the click that files or drops
        anything. The download sits between them, where it is neither.
      */}

      {/*
        Filing — D-15, §Amendment 1. `default` toned, and the tone is the decision: the
        tournament goes into the library and stays openable from the landing screen, so a
        red dialog would be warning about a loss that does not happen.

        ONE SET FOR BOTH GESTURES. `New tournament` and `Open tournament` raise this same
        dialog, including its `Start a new tournament` label when the host pressed
        `Open tournament`. That reads oddly for a moment and it is what §12 asks for in as
        many words — "one filing path, not two" — because the question being answered is
        the filing one either way, and two copy sets for one act is how the two drift.
      */}
      {confirm.kind === 'file' && (
        <Dialog
          heading={FILING_CONFIRM.heading}
          dismissible
          tone={FILING_CONFIRM.tone}
          onDismiss={closeConfirm}
          actions={
            <>
              <button
                type="button"
                class="dialog__action confirm-dialog__confirm confirm-dialog__confirm--default"
                onClick={() => {
                  const { doc, after } = confirm;
                  setConfirm({ kind: 'idle' });
                  fileAndProceed(doc, after);
                }}
              >
                {FILING_CONFIRM.confirmLabel}
              </button>

              {/*
                Deliberately does NOT close the dialog. The host is being offered the file
                and the filing in one breath, and dismissing on the download would make
                taking the copy cancel the thing they came here to do.
              */}
              <button
                type="button"
                class="dialog__action"
                onClick={() => downloadJson(tournamentFilename(confirm.doc), confirm.doc)}
              >
                {DOWNLOAD_JSON}
              </button>

              <button type="button" class="dialog__action" onClick={closeConfirm}>
                {FILING_CONFIRM.safeLabel}
              </button>
            </>
          }
        >
          <p>{FILING_CONFIRM.body(confirm.doc.config.formatLabel)}</p>
        </Dialog>
      )}

      {/*
        The cap — D-16. Raised INSTEAD OF the filing confirm, so one gesture asks one
        question.

        The download here is the OLDEST tournament's, not the one being filed, and that is
        the point of the dialog: it names the night about to go and hands over its file
        while it still exists. `oldestEntry()` was read before anything was written, so
        nothing has been dropped at the moment this is on screen and declining drops
        nothing.
      */}
      {confirm.kind === 'evict' && (
        <Dialog
          heading={EVICTION_CONFIRM.heading}
          dismissible
          tone={EVICTION_CONFIRM.tone}
          onDismiss={closeConfirm}
          actions={
            <>
              <button
                type="button"
                class="dialog__action confirm-dialog__confirm confirm-dialog__confirm--default"
                onClick={() => {
                  const { doc, after } = confirm;
                  setConfirm({ kind: 'idle' });
                  fileAndProceed(doc, after);
                }}
              >
                {EVICTION_CONFIRM.confirmLabel}
              </button>

              <button
                type="button"
                class="dialog__action"
                onClick={() =>
                  downloadJson(tournamentFilename(confirm.dropped.doc), confirm.dropped.doc)
                }
              >
                {EVICTION_CONFIRM.downloadLabel(confirm.dropped.doc.config.formatLabel)}
              </button>

              <button type="button" class="dialog__action" onClick={closeConfirm}>
                {EVICTION_CONFIRM.safeLabel}
              </button>
            </>
          }
        >
          <p>
            {EVICTION_CONFIRM.body(
              confirm.doc.config.formatLabel,
              confirm.dropped.doc.config.formatLabel,
              libraryDate(confirm.dropped.doc.createdAt),
            )}
          </p>
        </Dialog>
      )}

      {/*
        The library write was refused — D-14, and NOT a confirmation: it asks nothing, and
        both controls are ways of leaving. Its copy is a module constant here rather than
        in `confirm-copy.ts`, which is that file's own boundary — it holds "every
        confirmation's words", and this is a report.

        The tournament is exactly where it was, which is what the ordering rule bought and
        what the sentence says. `Keep this one open` is reused from the filing set rather
        than given a label of its own: the outcome is identical to having declined, so the
        two are honestly the same button.
      */}
      {confirm.kind === 'fileFailed' && (
        <Dialog
          heading={FILING_FAILED_HEADING}
          dismissible
          onDismiss={closeConfirm}
          actions={
            <>
              <button
                type="button"
                class="dialog__action confirm-dialog__confirm confirm-dialog__confirm--default"
                onClick={() => downloadJson(tournamentFilename(confirm.doc), confirm.doc)}
              >
                {DOWNLOAD_JSON}
              </button>

              <button type="button" class="dialog__action" onClick={closeConfirm}>
                {FILING_CONFIRM.safeLabel}
              </button>
            </>
          }
        >
          <p>{filingFailedBody(confirm.doc.config.formatLabel)}</p>
        </Dialog>
      )}

      {/*
        FOUR copy sets, one dialog, and no new mechanism — the variant is chosen by what the
        undo would REMOVE, which core already reported in `crossing.kind`. Un-resolving a
        pick order is a different event from reaching back into an earlier round, and
        03-UI-SPEC states them as two rows of the copy table; 04-UI-SPEC §8 adds two more
        for the ban stage. The discriminant already flowed end to end, which is why the two
        new rows cost two more branches and nothing else.
      */}
      {confirm.kind === 'undo' && confirm.crossing.kind === 'order' && (
        <ConfirmDialog
          heading={UNDO_RESOLVED_ORDER_CONFIRM.heading}
          body={UNDO_RESOLVED_ORDER_CONFIRM.body(
            confirm.playerName,
            confirm.crossing.removedRound,
            confirm.crossing.cardValue ?? 0,
            confirm.crossing.removedCount,
          )}
          confirmLabel={UNDO_RESOLVED_ORDER_CONFIRM.confirmLabel}
          safeLabel={UNDO_RESOLVED_ORDER_CONFIRM.safeLabel}
          tone={UNDO_RESOLVED_ORDER_CONFIRM.tone}
          onConfirm={confirmUndo}
          onSafe={closeConfirm}
        />
      )}

      {/*
        The swap confirm, and the SIBLING placement is the same trap the note above the
        import confirm describes. Rendered inside the `inert` region it would appear, trap
        focus and refuse every click — a dialog nobody can dismiss.

        Every value comes off `confirm` rather than being recomputed here, so the sentence
        describes the world the host asked about rather than the one that exists a render
        later.
      */}
      {/*
        Reopening a finished tournament — D-17. Same placement, same reason as the record
        dialog directly above: this is opened from a control INSIDE the gate, and the gate
        can go up while it is open when another tab presses `Take over drafting here`
        mid-question. Rendered inside, it would go inert with the screen behind it and trap
        focus in a panel refusing its own dismiss.

        A read-only tab still cannot reopen anything, because the only route to
        `kind: 'reopen'` is the notice's button and the notice is behind the gate.

        `default` toned, and it is the tone reservation's other load test. Nothing is
        destroyed: the reopen voids no result, and it is itself one undo away. What the body
        states plainly is the D-10/D-11 friction the CORRECTION will cost — the cut and the
        bracket, or the matches after it — because that friction is intended, and a host
        chasing one mistyped score is exactly the person who cannot see it coming.
      */}
      {confirm.kind === 'reopen' && (
        <ConfirmDialog
          heading={REOPEN_CONFIRM.heading}
          body={REOPEN_CONFIRM.body}
          confirmLabel={REOPEN_CONFIRM.confirmLabel}
          safeLabel={REOPEN_CONFIRM.safeLabel}
          tone={REOPEN_CONFIRM.tone}
          onConfirm={confirmReopen}
          onSafe={closeConfirm}
        />
      )}

      {confirm.kind === 'swap' && (
        <ConfirmDialog
          heading={SWAP_CONFIRM.heading}
          body={SWAP_CONFIRM.body(
            confirm.playerName,
            confirm.remaining,
            confirm.outName,
            confirm.inName,
            confirm.round,
          )}
          confirmLabel={SWAP_CONFIRM.confirmLabel(confirm.inName)}
          safeLabel={SWAP_CONFIRM.safeLabel(confirm.outName)}
          tone={SWAP_CONFIRM.tone}
          onConfirm={confirmSwap}
          // The SAFE outcome closes the question and leaves the slot armed — the host said
          // "keep this species", not "stop swapping". Disarming is the `Keep {species}`
          // control in the pool header, which is a different sentence about a different thing.
          onSafe={closeConfirm}
        />
      )}

      {/*
        Removing a blind submission — 04-UI-SPEC §8, D-05. Every string names the player
        and none names a species, which is what makes this dialog safe to show in a room
        where the bans are still sealed. The set's own doc block carries the argument for
        why this undo confirms at all when undoing a pick in the current round does not.
      */}
      {confirm.kind === 'undo' && confirm.crossing.kind === 'banSubmission' && (
        <ConfirmDialog
          heading={UNDO_BAN_SUBMISSION_CONFIRM.heading(confirm.playerName)}
          body={UNDO_BAN_SUBMISSION_CONFIRM.body(confirm.playerName)}
          confirmLabel={UNDO_BAN_SUBMISSION_CONFIRM.confirmLabel(confirm.playerName)}
          safeLabel={UNDO_BAN_SUBMISSION_CONFIRM.safeLabel(confirm.playerName)}
          tone={UNDO_BAN_SUBMISSION_CONFIRM.tone}
          onConfirm={confirmUndo}
          onSafe={closeConfirm}
        />
      )}

      {/*
        Taking the reveal back — 04-UI-SPEC §8, D-23. `playerCount` comes off `confirm`
        rather than off `state`, like every other value in these dialogs, so the sentence
        describes the world the host asked about.
      */}
      {confirm.kind === 'undo' && confirm.crossing.kind === 'banReveal' && (
        <ConfirmDialog
          heading={UNDO_REVEAL_CONFIRM.heading}
          body={UNDO_REVEAL_CONFIRM.body(confirm.playerCount)}
          confirmLabel={UNDO_REVEAL_CONFIRM.confirmLabel}
          safeLabel={UNDO_REVEAL_CONFIRM.safeLabel}
          tone={UNDO_REVEAL_CONFIRM.tone}
          onConfirm={confirmUndo}
          onSafe={closeConfirm}
        />
      )}

      {/*
        The boundary set is now the LAST arm rather than the catch-all, and the three
        exclusions are written out rather than folded into a `!== 'order'`. Its copy reads
        "This undoes {name}'s pick from round {r}" — pick-specific prose that would be a
        plain untruth over a removed blind submission, on the one surface whose whole job
        is telling the host what is about to change.
      */}
      {confirm.kind === 'undo' &&
        confirm.crossing.kind !== 'order' &&
        confirm.crossing.kind !== 'banSubmission' &&
        confirm.crossing.kind !== 'banReveal' && (
          <ConfirmDialog
            heading={UNDO_BOUNDARY_CONFIRM.heading}
            body={UNDO_BOUNDARY_CONFIRM.body(
              confirm.playerName,
              confirm.crossing.removedRound,
              confirm.crossing.currentRound,
              confirm.crossing.removedCount,
            )}
            confirmLabel={UNDO_BOUNDARY_CONFIRM.confirmLabel}
            safeLabel={UNDO_BOUNDARY_CONFIRM.safeLabel}
            tone={UNDO_BOUNDARY_CONFIRM.tone}
            onConfirm={confirmUndo}
            onSafe={closeConfirm}
          />
        )}
    </>
  );
}
