import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { downloadJson, readJsonFile, tournamentFilename } from './adapters/file-io';
import {
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
import { claimOwnership, disposeTabLock } from './adapters/tab-lock';
import { pickMade } from './core/actions';
import { parseTournamentFile } from './core/import-guard';
import type { TournamentDoc } from './core/model';
import type { RosterEntry } from './core/roster/types';
import {
  selectAvailablePool,
  selectCurrentTurn,
  selectIsComplete,
  selectPickCount,
  selectPlayerName,
  selectTeams,
} from './core/selectors';
import {
  adoptTournament,
  dispatch,
  draftState,
  getDoc,
  getState,
  subscribe,
} from './store';
import { BoardGrid } from './ui/components/BoardGrid';
import { ImportConfirmDialog } from './ui/components/ImportConfirmDialog';
import { announce, LiveRegion } from './ui/components/LiveRegion';
import { PoolGrid } from './ui/components/PoolGrid';
import { ReadOnlyBanner } from './ui/components/ReadOnlyBanner';
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
  const [saved] = useState<TournamentDoc | null>(() =>
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
   */
  useEffect(() => {
    const adoptWhateverIsNewer = (): void => {
      const newer = loadIfNewer();
      if (newer !== null) adoptTournament(newer);
    };

    claimOwnership({
      onPromote: adoptWhateverIsNewer,
      onRemoteSave: adoptWhateverIsNewer,
    });

    return disposeTabLock;
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
   * Take up the document that was already in storage when this tab opened.
   *
   * A refused adoption leaves the host on the landing screen rather than dropping them on
   * an empty draft. `load()` has already run `isValidTournament` and `migrate`, so this
   * failing means the document is from a build this one cannot read — and the landing
   * screen, with `Import JSON…` on it, is the only place that offers a way out.
   */
  const handleResume = useCallback(() => {
    if (saved === null) return;
    if (!adoptTournament(saved)) return;
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
    <div class="app-shell">
      <LiveRegion />

      {/*
        Above the top bar, and above the storage warning's own gate: the two are
        independent conditions and a tab can genuinely be both read-only and unable to
        save. Suppressing this one would answer the smaller question and leave the
        larger one — why does nothing in this tab respond — unanswered.
      */}
      <ReadOnlyBanner ownership={ownership} />

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
          onStarted={() => setScreen({ name: 'draft' })}
        />
      )}

      {screen.name === 'draft' && <h1 class="app-shell__title">Champions Draft</h1>}

      {/*
        A write that failed mid-draft, which is a different event from the canary and
        gets its own acknowledgement — see above. It can only reach the host on the draft
        screen, because that is the only screen a `save` runs behind.
      */}
      {screen.name === 'draft' && storageBlockedMidDraft && (
        <StorageBlocked onAcknowledge={() => setWriteFailureAcknowledged(true)} />
      )}

      {screen.name === 'draft' && load.status === 'ready' && state !== null && (
        /*
          One attribute disables pointer, keyboard, and focus across the entire draft
          region, and it is Baseline-supported. The hand-rolled alternative —
          `pointer-events: none` plus `disabled` on each control — leaks in exactly the
          way that matters: a Tab key still walks into the pool, and a keyboard user
          reaches a cell that will silently discard their pick.
          `undefined` rather than `false` so Preact removes the attribute outright.
        */
        <div class="draft-region" inert={readOnly ? true : undefined}>
          {/*
            TopBar and TurnBanner are both specified as sticky at the top of the
            viewport, so they stick as one block rather than fighting over the same
            pixel. See TopBar.css.
          */}
          <div class="sticky-head">
            <TopBar
              resolveSpeciesName={resolveSpeciesName}
              onDownload={handleDownload}
              onImportFile={handleImportFile}
              importError={importFlow.status === 'failed' ? importFlow.message : null}
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
            />
          </div>

          <BoardGrid
            players={state.config.players}
            rounds={state.config.rounds}
            teams={selectTeams(state)}
            currentTurn={turn}
            entryById={entryById}
            spriteMeta={load.bundle.spriteMeta}
            pickCount={selectPickCount(state)}
            // False until the pane state exists. The board is not expandable yet, so
            // there is no state in which a name should render.
            showName={false}
            firstPlayerName={turnPlayerName}
          />

          {/*
            The completed-draft screen takes the POOL's place and nothing else. TopBar
            and BoardGrid above stay mounted, so `Undo last pick` is still one click away
            — a host who spots a wrong final pick on this screen must be able to unwind
            it, and the board remains the completed record.
          */}
          {complete ? (
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
              onPick={handlePick}
            />
          )}
        </div>
      )}

      {/*
        OUTSIDE the draft region, and that placement is load-bearing rather than tidy.
        `inert` applies to a subtree, so a modal rendered inside it in a read-only tab
        would render, trap focus, and refuse every click — a dialog nobody can dismiss.
        Rendered here it is unaffected by the attribute, and the pick count it quotes is
        the CURRENT draft's, which is the thing about to be lost.
      */}
      {importFlow.status === 'confirm' && state !== null && (
        <ImportConfirmDialog
          pickCount={selectPickCount(state)}
          onConfirm={() => adoptImported(importFlow.doc)}
          onCancel={cancelImport}
        />
      )}
    </div>
  );
}
