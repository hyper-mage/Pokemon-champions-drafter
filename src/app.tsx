import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { downloadJson, readJsonFile, tournamentFilename } from './adapters/file-io';
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
  ROSTER_LOAD_FAILURE_MESSAGE,
  type RosterBundle,
} from './adapters/roster-source';
import { claimOwnership, disposeTabLock, notifyAbandoned } from './adapters/tab-lock';
import { loadViewPrefs, saveViewPrefs, type PaneState } from './adapters/view-prefs';
import { pickMade } from './core/actions';
import { bannedEntries } from './core/bans';
import { checkFeasibility } from './core/feasibility';
import { parseTournamentFile } from './core/import-guard';
import type { TournamentDoc } from './core/model';
import type { RosterEntry } from './core/roster/types';
import {
  selectAvailablePool,
  selectCurrentTurn,
  selectIsComplete,
  selectPickCount,
  selectPlayerName,
  selectSchedule,
  selectTeams,
} from './core/selectors';
import { undoCrossesRoundBoundary, type RoundBoundaryCrossing } from './core/undo';
import {
  abandonTournament,
  adoptTournament,
  dispatch,
  draftState,
  getDoc,
  getState,
  subscribe,
  undo,
} from './store';
import { ABANDON_CONFIRM, UNDO_BOUNDARY_CONFIRM } from './ui/confirm-copy';
import { BoardGrid } from './ui/components/BoardGrid';
import { ConfirmDialog } from './ui/components/ConfirmDialog';
import { ImportConfirmDialog } from './ui/components/ImportConfirmDialog';
import { announce, LiveRegion } from './ui/components/LiveRegion';
import { PoolGrid } from './ui/components/PoolGrid';
import { ReadOnlyBanner } from './ui/components/ReadOnlyBanner';
import { SplitPanes } from './ui/components/SplitPanes';
import { TopBar } from './ui/components/TopBar';
import { TurnBanner } from './ui/components/TurnBanner';
import { CompletedDraft } from './ui/screens/CompletedDraft';
import { ConfigScreen } from './ui/screens/ConfigScreen';
import { LandingScreen } from './ui/screens/LandingScreen';
import { StorageBlocked } from './ui/screens/StorageBlocked';
import { useOwnership } from './ui/use-ownership';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; bundle: RosterBundle }
  | { status: 'failed'; message: string };

/**
 * Which screen the app is showing — D-01.
 *
 * A discriminated union in the same style as `LoadState` and `ImportFlow`, and the reason
 * it exists at all is that Phase 1 had no concept of a screen: the app created a
 * tournament as soon as the roster resolved, so "which screen" and "does a tournament
 * exist" were the same question. They are not the same question any more — a host can be
 * on the config screen with no document, and can arrive at the draft from three different
 * places — so the answer is held rather than inferred.
 */
type Screen = { name: 'landing' } | { name: 'config' } | { name: 'draft' };

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
type Confirm =
  | { kind: 'idle' }
  | { kind: 'abandon'; picks: number; players: number }
  | { kind: 'undo'; crossing: RoundBoundaryCrossing; playerName: string };

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
function rosterDriftNotice(missing: number): string {
  if (missing === 1) {
    return "1 Pokémon in this tournament's pool is not in the current roster. It is missing from the pool, and a board slot holding it shows its id instead. Use Download JSON to keep the record.";
  }

  return `${missing} Pokémon in this tournament's pool are not in the current roster. They are missing from the pool, and a board slot holding one shows its id instead. Use Download JSON to keep the record.`;
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

  const entries = useMemo(
    () => (load.status === 'ready' ? [...load.bundle.snapshot.entries].sort(byDexOrder) : []),
    [load],
  );

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
   * Let go of the tournament this tab is holding — the LOCAL half of abandoning.
   *
   * Two routes reach it and they must do the same thing: the host confirming the dialog in
   * this tab, and `onAbandoned` arriving from the tab where they confirmed it. Written once
   * rather than twice, because a secondary that performed three of these four steps would
   * keep the abandoned draft alive in the one place nobody is looking at it — and would
   * write it back on promotion.
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
      setScreen({ name: 'draft' });
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
  const complete = state !== null && selectIsComplete(state);

  // One local, two consumers: the turn banner's sentence and the board's empty state.
  // Written twice they are two expressions that can be changed independently, and the
  // board would then name a different player from the banner directly above it.
  const turnPlayerName =
    state === null || turn === null ? null : selectPlayerName(state, turn.playerId);

  /*
    The host's stored pane preference, read synchronously in a state initializer so the
    first paint is already the pane they left. Read in an effect instead, the draft would
    render split and then jump.

    This holds the STORED preference. What renders is `pane` below, which additionally
    scopes `pool` out of a live draft — see there.
  */
  const [storedPane, setStoredPane] = useState<PaneState>(() => loadViewPrefs().pane);

  /*
    All three pane states become available once the draft is over, and that is exactly
    when eight stacked export panels want the full width. While a draft is running,
    `pool-full` would put the board behind a toggle, which ROADMAP criterion 5 forbids.
  */
  const poolExpandable = complete;

  /*
    The rendered pane. A stored `pool` is silently forced to `split` while a draft is
    running: no warning, no announcement, nothing for the host to dismiss. That is the
    second, independent half of the T-02-24 mitigation — `loadViewPrefs` already refuses
    any value outside the union, and this refuses a legitimate value in the one situation
    where honouring it would hide the board.

    Derived here rather than inside `SplitPanes`, which must never hold an opinion about
    which of its states are available; and derived rather than coerced in the initializer
    above, because `App` mounts on the LANDING screen — there is no draft in progress at
    the moment that initializer runs, so a coercion there would inspect a state that does
    not exist yet and let a stored `pool` through on resume.

    The two values cannot drift at a write: `handlePaneChange` persists the value it was
    handed, which is always the value about to render.
  */
  const pane: PaneState = storedPane === 'pool' && !poolExpandable ? 'split' : storedPane;

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
   * The banned species' names, for the top-bar disclosure — D-13.
   *
   * Its length IS the set cardinality by construction: `bannedEntries` intersects the stored
   * banlist with the roster, so a duplicate written by two ban surfaces and a stale id left
   * by a regulation rotation both contribute nothing. That makes it equal to the `banCount`
   * inside the feasibility memo above without the two being computed the same way — and it
   * is why the count is not read off the stored array's length anywhere in this file.
   */
  const bannedNames = useMemo(
    () => (state === null ? [] : bannedEntries(entries, state.config.bans).map((entry) => entry.name)),
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

  const handlePoolPick = useCallback((entry: RosterEntry, meta: { filtersCleared: boolean }) => {
    // Before the dispatch, so the flag and the turn it describes land in one render
    // rather than in two, the first of which would announce the turn without its suffix.
    setFiltersCleared(meta.filtersCleared);
    handlePick(entry);
  }, []);

  /**
   * The single gate both undo paths pass through — D-37, and the mitigation for Pitfall 6.
   *
   * `TopBar` calls this from the `Undo last pick` button AND from its `document`-level
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
   * Abandoning, in the tab where the host confirmed it — all three halves.
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
   * Without the announcement a secondary keeps the abandoned tournament in memory with no
   * banner and no visible difference, `loadIfNewer()` on takeover finds no record and so
   * reports "nothing newer", and that tab's first autosave re-creates the key with the
   * tournament the host destroyed — which makes `ABANDON_CONFIRM`'s "Nothing recovers it"
   * false whenever a second tab is open.
   */
  const confirmAbandon = useCallback(() => {
    discardTournament();
    clearSaved();
    notifyAbandoned();
  }, [discardTournament]);

  const confirmUndo = useCallback(() => {
    setConfirm({ kind: 'idle' });
    // Same reason as the direct path above: this is the second of the two routes an undo
    // takes, and both are turn changes that no pick caused.
    setFiltersCleared(false);
    undo(resolveSpeciesName);
  }, [resolveSpeciesName]);

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
    // A successful import is a tournament, so it goes to the draft — from the landing
    // screen, which is where D-01 gives import its front door, and from the draft screen,
    // where this is already where the host is.
    setScreen({ name: 'draft' });
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
    setScreen({ name: 'draft' });
  }, [saved]);

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
        class={screen.name === 'draft' ? 'draft-shell' : 'app-shell'}
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
            onNewTournament={() => setScreen({ name: 'config' })}
            onResume={handleResume}
            onImportFile={handleImportFile}
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
            onStarted={() => setScreen({ name: 'draft' })}
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
                round={turn === null ? null : turn.round}
                rounds={state.config.rounds}
                playerName={turnPlayerName}
                complete={complete}
                picks={selectPickCount(state)}
                teams={state.config.players.length}
                filtersCleared={filtersCleared}
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
              {missingFromRoster > 0 && (
                <p class="draft-notice" role="status">
                  {rosterDriftNotice(missingFromRoster)}
                </p>
              )}
            </div>

            {/*
              The completed-draft screen takes the POOL's place and nothing else. The head
              and the board stay exactly where they are, so `Undo last pick` is still one
              click away — a host who spots a wrong final pick on this screen must be able
              to unwind it, and the board remains the completed record.
            */}
            <SplitPanes
              pane={pane}
              onPaneChange={handlePaneChange}
              poolExpandable={poolExpandable}
              pool={
                complete ? (
                  <CompletedDraft
                    players={state.config.players}
                    teams={selectTeams(state)}
                    entryById={entryById}
                    checkpointReached={complete}
                    checkpointDismissed={checkpointDismissed}
                    onDownload={handleDownload}
                    onDismissCheckpoint={() => setCheckpointDismissed(true)}
                  />
                ) : (
                  <PoolGrid
                    entries={availableEntries}
                    spriteMeta={load.bundle.spriteMeta}
                    onPick={handlePoolPick}
                    // Not a ban surface. `null` rather than an empty set, so a draft cell
                    // cannot report an unpressed toggle state it does not have.
                    bannedIds={null}
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
                  spriteMeta={load.bundle.spriteMeta}
                  pickCount={selectPickCount(state)}
                  // Names in `board-full`, none in `split`. One expression, so the two
                  // pane states cannot each grow their own answer.
                  showName={pane === 'board'}
                  firstPlayerName={turnPlayerName}
                />
              }
            />
          </>
        )}
      </div>

      {/*
        A SIBLING of the gated element above, and that placement is load-bearing rather
        than tidy. `inert` applies to a whole subtree, so a modal rendered inside it in a
        read-only tab would render, trap focus, and refuse every click — a dialog nobody
        can dismiss. Rendered here it is unaffected by the attribute, and the pick count
        it quotes is the CURRENT draft's, which is the thing about to be lost.
      */}
      {importFlow.status === 'confirm' && state !== null && (
        <ImportConfirmDialog
          pickCount={selectPickCount(state)}
          playerCount={state.config.players.length}
          onConfirm={() => adoptImported(importFlow.doc)}
          onCancel={cancelImport}
        />
      )}

      {/* Same placement, same reason. See the note above the import confirm. */}
      {confirm.kind === 'abandon' && (
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

      {confirm.kind === 'undo' && (
        <ConfirmDialog
          heading={UNDO_BOUNDARY_CONFIRM.heading}
          body={UNDO_BOUNDARY_CONFIRM.body(
            confirm.playerName,
            confirm.crossing.pickRound,
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
