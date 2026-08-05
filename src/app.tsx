import { useEffect, useMemo, useState } from 'preact/hooks';

import {
  loadRoster,
  ROSTER_LOAD_FAILURE_MESSAGE,
  type RosterBundle,
} from './adapters/roster-source';
import type { RosterEntry } from './core/roster/types';
import { announce, LiveRegion } from './ui/components/LiveRegion';
import { PoolGrid } from './ui/components/PoolGrid';

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
 */
function byDexOrder(a: RosterEntry, b: RosterEntry): number {
  if (a.num !== b.num) return a.num - b.num;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Picking is wired in plan 01-06, where it becomes a dispatch onto the append-only
 * action log. Until then a click is intentionally inert: the cell is a real button, it
 * takes focus and shows the ring, and nothing happens.
 */
function handlePick(_entry: RosterEntry): void {
  // Intentionally empty. See above.
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

  return (
    <div class="app-shell">
      <LiveRegion />

      <h1 class="app-shell__title">Champions Draft</h1>

      {load.status === 'loading' && <p class="app-shell__status">Loading the pool…</p>}

      {load.status === 'failed' && <p class="app-shell__status">{load.message}</p>}

      {load.status === 'ready' && (
        <PoolGrid entries={entries} spriteMeta={load.bundle.spriteMeta} onPick={handlePick} />
      )}
    </div>
  );
}
