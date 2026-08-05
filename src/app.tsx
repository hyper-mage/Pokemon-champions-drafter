import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import {
  load as loadSavedTournament,
  loadIfNewer,
  probeStorage,
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
  createTournament,
  dispatch,
  draftState,
  getDoc,
  getState,
  subscribe,
} from './store';
import { BoardGrid } from './ui/components/BoardGrid';
import { announce, LiveRegion } from './ui/components/LiveRegion';
import { PoolGrid } from './ui/components/PoolGrid';
import { ReadOnlyBanner } from './ui/components/ReadOnlyBanner';
import { TopBar } from './ui/components/TopBar';
import { TurnBanner } from './ui/components/TurnBanner';
import { StorageBlocked } from './ui/screens/StorageBlocked';
import { useOwnership } from './ui/use-ownership';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; bundle: RosterBundle }
  | { status: 'failed'; message: string };

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

  // The canary runs during the very first render, before a single pool cell exists.
  // That timing is the requirement, not an optimization (D-13): a host who learns at
  // pick twelve that nothing was ever saved has been told too late to act on it.
  //
  // A state initializer rather than an effect, because an effect runs *after* the first
  // paint and the draft would flash up behind the warning.
  const [probe] = useState<ProbeResult>(() => probeStorage());
  const [probeAcknowledged, setProbeAcknowledged] = useState(false);
  const [writeFailureAcknowledged, setWriteFailureAcknowledged] = useState(false);

  const storageOk = probe.ok;

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

  // Booting a tournament twice would emit a second pool/built, which canApply rejects
  // — but it would also discard the picks already made, so the guard is a ref rather
  // than a reliance on the reducer refusing.
  const bootedRef = useRef(false);
  const stopAutosaveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (load.status !== 'ready' || bootedRef.current) return;
    bootedRef.current = true;

    // Restore before creating, never after: createTournament would emit its own
    // pool/built and the restored log would have nowhere to go. A saved document that
    // this build cannot read is treated exactly like no saved document at all.
    const restored = storageOk ? loadSavedTournament() : null;
    if (restored === null || !adoptTournament(restored)) {
      createTournament(load.bundle.snapshot, entries);
    }

    // No autosave when the canary already proved writes do not land. Scheduling them
    // anyway would spend the whole draft failing quietly at 300ms intervals, which is
    // the silent-retry behaviour the warning screen exists to replace.
    if (storageOk) {
      stopAutosaveRef.current = startAutosave({ subscribe, getDoc });
    }
  }, [load, entries, storageOk]);

  // Stopping autosave is an unmount concern and only an unmount concern. Tying it to
  // the effect above would let a dependency change tear the listeners down and then
  // decline to rebuild them, because the boot guard has already fired.
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

  // Undo's live-region announcement names the species that came back. The store holds
  // the document and the document holds ids, so the display name has to arrive from
  // here, where the roster snapshot already is. Falling back to the id keeps the
  // announcement honest rather than empty if a restored document ever references a
  // species the current regulation dropped.
  const resolveSpeciesName = useCallback(
    (monId: string) => entryById.get(monId)?.name ?? monId,
    [entryById],
  );

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

      <h1 class="app-shell__title">Champions Draft</h1>

      {/*
        Above the top bar, and above the storage warning's own gate: the two are
        independent conditions and a tab can genuinely be both read-only and unable to
        save. Suppressing this one would answer the smaller question and leave the
        larger one — why does nothing in this tab respond — unanswered.
      */}
      <ReadOnlyBanner ownership={ownership} />

      {/*
        Nothing but the warning until it is acknowledged. Not the pool, not the board,
        not even the loading line — the one thing the host must do first is read this.
      */}
      {storageBlockedAtBoot && (
        <StorageBlocked onAcknowledge={() => setProbeAcknowledged(true)} />
      )}

      {!storageBlockedAtBoot && storageBlockedMidDraft && (
        <StorageBlocked onAcknowledge={() => setWriteFailureAcknowledged(true)} />
      )}

      {!storageBlockedAtBoot && load.status === 'loading' && (
        <p class="app-shell__status">Loading the pool…</p>
      )}

      {!storageBlockedAtBoot && load.status === 'failed' && (
        <p class="app-shell__status">{load.message}</p>
      )}

      {!storageBlockedAtBoot && load.status === 'ready' && state !== null && (
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
            <TopBar resolveSpeciesName={resolveSpeciesName} />

            <TurnBanner
              round={turn === null ? null : turn.round}
              playerName={turn === null ? null : selectPlayerName(state, turn.playerId)}
              complete={complete}
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
          />

          <PoolGrid
            entries={availableEntries}
            spriteMeta={load.bundle.spriteMeta}
            onPick={handlePick}
          />
        </div>
      )}
    </div>
  );
}
