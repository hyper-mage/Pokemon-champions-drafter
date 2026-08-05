import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import {
  loadRoster,
  ROSTER_LOAD_FAILURE_MESSAGE,
  type RosterBundle,
} from './adapters/roster-source';
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
import { createTournament, dispatch, draftState, getState } from './store';
import { BoardGrid } from './ui/components/BoardGrid';
import { announce, LiveRegion } from './ui/components/LiveRegion';
import { PoolGrid } from './ui/components/PoolGrid';
import { TopBar } from './ui/components/TopBar';
import { TurnBanner } from './ui/components/TurnBanner';

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

  // Creating a tournament twice would emit a second pool/built, which canApply rejects
  // — but it would also discard the picks already made, so the guard is a ref rather
  // than a reliance on the reducer refusing.
  const createdRef = useRef(false);
  useEffect(() => {
    if (load.status !== 'ready' || createdRef.current) return;
    createdRef.current = true;
    createTournament(load.bundle.snapshot, entries);
  }, [load, entries]);

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

  return (
    <div class="app-shell">
      <LiveRegion />

      <h1 class="app-shell__title">Champions Draft</h1>

      {load.status === 'loading' && <p class="app-shell__status">Loading the pool…</p>}

      {load.status === 'failed' && <p class="app-shell__status">{load.message}</p>}

      {load.status === 'ready' && state !== null && (
        <>
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
        </>
      )}
    </div>
  );
}
