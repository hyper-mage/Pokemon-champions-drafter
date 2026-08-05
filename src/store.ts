/**
 * store.ts — the one impure orchestration point, and the future sync seam.
 *
 * `dispatch` is the ONLY write path in the application (sync rule 19). No component
 * mutates the document; no component appends to the log; nothing outside this file
 * stamps an envelope. That is not stylistic tidiness — it is the concrete meaning of
 * PROJECT.md's promise that adding sync later is "an integration, not a rewrite".
 * When sync arrives, `dispatch` gains a `broadcast(action)` call and a sibling
 * `receive(remoteAction)`, and nothing else in the codebase changes.
 *
 * The state lives in two signals rather than one because the two things are genuinely
 * different: `docSignal` holds the persisted truth (config plus an append-only log),
 * and `stateSignal` holds the fold of that log, which is a cache. Components read
 * whichever they need and re-render on change; there is no hand-rolled subscription
 * list and no store class.
 *
 * The document is never mutated in place. Every dispatch produces a new document object
 * with a new log array, so a reference captured before a dispatch keeps describing the
 * state it described then. Plan 01-07's undo and plan 01-10's export both depend on
 * that being true.
 */

import { computed, effect, signal, type ReadonlySignal } from '@preact/signals';

import { now } from './adapters/clock';
import { newId, newSeed } from './adapters/id';
import { draftStarted, poolBuilt, type Action, type Intent } from './core/actions';
import {
  initialState,
  SCHEMA_VERSION,
  type DraftState,
  type TournamentConfig,
  type TournamentDoc,
} from './core/model';
import type { RosterEntry, RosterSnapshot } from './core/roster/types';
import { apply, canApply, type CanApplyResult } from './core/reduce';
import { selectStartingOrder } from './core/selectors';

/**
 * Every action this build originates is the host's. Under sync this becomes a device
 * or player id; the field exists now so no saved tournament ever needs migrating for it.
 */
const ACTOR_HOST = 'host';

/** Phase 1 scaffolding: two players, six rounds, twelve picks. Phase 2 configures both. */
const PHASE_ONE_ROUNDS = 6;
const PHASE_ONE_PLAYERS = [
  { id: 'p1', name: 'Player 1' },
  { id: 'p2', name: 'Player 2' },
];

const docSignal = signal<TournamentDoc | null>(null);
const stateSignal = signal<DraftState | null>(null);

/** The persisted document. Null until a tournament is created. */
export const tournamentDoc: ReadonlySignal<TournamentDoc | null> = computed(
  () => docSignal.value,
);

/** The fold of the log. Null until a tournament is created. */
export const draftState: ReadonlySignal<DraftState | null> = computed(() => stateSignal.value);

export function getDoc(): TournamentDoc | null {
  return docSignal.peek();
}

export function getState(): DraftState | null {
  return stateSignal.peek();
}

/**
 * Run `listener` now and after every change to the document or the folded state.
 *
 * Components do not need this — reading a signal inside a component subscribes it
 * automatically. It exists for the consumers that are not components, starting with
 * plan 01-08's debounced autosave.
 */
export function subscribe(listener: () => void): () => void {
  return effect(() => {
    void docSignal.value;
    void stateSignal.value;
    listener();
  });
}

/**
 * The single write path.
 *
 * In order: stamp the envelope; validate; append; advance. Validation happens BEFORE
 * the append, so a rejected action never enters the log — the log is a record of what
 * happened, not of what was attempted (T-01-29).
 *
 * The incremental `apply` here must agree with re-folding the entire log, which is what
 * a reload does. `tests/core/reduce.test.ts` asserts that equivalence action by action
 * rather than trusting it.
 */
export function dispatch(intent: Intent): CanApplyResult {
  const previous = docSignal.peek();
  const current = stateSignal.peek();
  if (previous === null || current === null) {
    return { ok: false, reason: 'draftNotStarted' };
  }

  const action: Action = {
    ...intent,
    seq: previous.log.length,
    at: now(),
    actorId: ACTOR_HOST,
  };

  const check = canApply(current, action);
  if (!check.ok) return check;

  // Copy first, then append: the previous document keeps its own log array, so nothing
  // that captured it observes a retroactive change.
  const next: TournamentDoc = { ...previous, log: [...previous.log] };
  next.log.push(action);

  docSignal.value = next;
  stateSignal.value = apply(current, action);

  return check;
}

/**
 * Start a new tournament against a roster snapshot.
 *
 * `entries` is the pool in the order it will be displayed, so the ids recorded in
 * `pool/built` and the cells on screen agree without a second sort.
 *
 * Two actions are emitted, both carrying materialized results rather than instructions
 * to recompute (ARCHITECTURE Pattern 5):
 *
 *   pool/built     the actual ids, plus the regulation and checksum they came from.
 *                  Champions regulations rotate roughly every 2.5 months; a document
 *                  that recorded only "build a pool" would reopen next regulation as a
 *                  different tournament.
 *   draft/started  the resolved starting order. It is derived here from the stored
 *                  seed, once, and then read from the log forever after.
 *
 * On the RNG cursor: Phase 1 makes exactly one derivation and always from cursor 0, and
 * because its result is materialized a replay never rolls again — so the cursor stays
 * at 0 and stays honest. The first feature that needs a *second* draw (Phase 2's
 * priority-card tie-breaks) must materialize the advanced cursor into the log as well,
 * or two consumers will silently share one draw.
 */
export function createTournament(
  snapshot: RosterSnapshot,
  entries: readonly RosterEntry[],
): TournamentDoc | null {
  const config: TournamentConfig = {
    formatLabel: `Champions ${snapshot.regulation}`,
    players: PHASE_ONE_PLAYERS.map((player) => ({ ...player })),
    rounds: PHASE_ONE_ROUNDS,
    rosterVersion: snapshot.regulation,
    rosterChecksum: snapshot.checksum,
  };

  const seed = newSeed();

  docSignal.value = {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    createdAt: now(),
    config,
    rng: { seed, cursor: 0 },
    log: [],
  };
  stateSignal.value = initialState(config);

  dispatch(poolBuilt(entries.map((entry) => entry.id), snapshot.regulation, snapshot.checksum));
  dispatch(
    draftStarted(selectStartingOrder(seed, config.players.map((player) => player.id))),
  );

  return docSignal.peek();
}
