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
import { isOwner } from './adapters/tab-lock';
import { draftStarted, poolBuilt, type Action, type Intent } from './core/actions';
import {
  initialState,
  SCHEMA_VERSION,
  type DraftState,
  type TournamentConfig,
  type TournamentDoc,
} from './core/model';
import type { RosterEntry, RosterSnapshot } from './core/roster/types';
import { apply, canApply, fold, type CanApplyResult } from './core/reduce';
import { selectStartingOrder } from './core/selectors';
import { canUndo, lastPickAction, undoLast } from './core/undo';
import { announce } from './ui/components/LiveRegion';

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
/**
 * One past the highest `seq` the log has ever handed out.
 *
 * `log.length` would be the obvious answer and is the same number for as long as the
 * log only ever grows. Undo makes it wrong: `undoLast` removes an entry, and once a
 * removal can happen anywhere but the end (Phase 2 interleaves card plays and bans), a
 * length-derived `seq` collides with one already in the log. `seq` is the identity a
 * `draft/pickUndone` targets and the thing `DraftPick.seq` promises is stable, so a
 * duplicate would silently retract the wrong pick.
 */
function nextSeq(log: readonly Action[]): number {
  let highest = -1;
  for (const action of log) {
    if (action.seq > highest) highest = action.seq;
  }
  return highest + 1;
}

export function dispatch(intent: Intent): CanApplyResult {
  const previous = docSignal.peek();
  const current = stateSignal.peek();
  if (previous === null || current === null) {
    return { ok: false, reason: 'draftNotStarted' };
  }

  const action: Action = {
    ...intent,
    seq: nextSeq(previous.log),
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
 *   pool/built     the actual ids, plus the regulation and checksum they came from, the
 *                  seed that drew them and how many can Mega Evolve. Champions
 *                  regulations rotate roughly every 2.5 months; a document that recorded
 *                  only "build a pool" would reopen next regulation as a different
 *                  tournament.
 *   draft/started  the resolved starting order, and the seed it was rolled from. It is
 *                  derived here once and then read from the log forever after.
 *
 * Both seeds ride on the ACTION rather than in `config` or `rng`, which is what keeps a
 * later re-roll expressible: it emits a new action with a new seed and contradicts no
 * field anywhere else in the document.
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
  // The six version 2 fields are all at their v1-equivalent defaults here, because Phase 1
  // has no config screen to author them: the pool is the whole roster, nothing is banned,
  // no Megas are required and the night ends at the last pick. Plan 02-04 replaces this
  // literal with the host's answers; until then these are the values a migrated Phase 1
  // document lands on, which keeps a freshly created tournament and a restored one the
  // same shape rather than two shapes that happen to fold alike.
  const config: TournamentConfig = {
    formatLabel: `Champions ${snapshot.regulation}`,
    players: PHASE_ONE_PLAYERS.map((player) => ({ ...player })),
    rounds: PHASE_ONE_ROUNDS,
    rosterVersion: snapshot.regulation,
    rosterChecksum: snapshot.checksum,
    poolSize: entries.length,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth: 'draftOnly',
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

  // Phase 1 does not DRAW the pool — it is the whole roster in display order — so no pool
  // seed was ever rolled, and `0` records exactly that. Borrowing `seed` here would claim a
  // draw that never happened, and a document's provenance is worth less than nothing when
  // it is confidently wrong. Plan 02-05's constrained draw supplies the real one.
  const megaCapableCount = entries.filter((entry) => entry.megaCapable).length;

  dispatch(
    poolBuilt(
      entries.map((entry) => entry.id),
      snapshot.regulation,
      snapshot.checksum,
      0,
      megaCapableCount,
    ),
  );
  dispatch(
    draftStarted(selectStartingOrder(seed, config.players.map((player) => player.id)), seed),
  );

  return docSignal.peek();
}

/**
 * Adopt a document that already exists — a restored autosave today, an imported file in
 * plan 01-10.
 *
 * The state is re-folded from scratch rather than trusted, because the log is the truth
 * and the folded state is only ever a cache of it. A document from a schema this build
 * does not recognise is refused rather than half-loaded: `apply` tolerates action types
 * it has never heard of, but a whole document shape it does not understand is a
 * different question, and answering it optimistically is how a good save gets replaced
 * by a broken one.
 */
export function adoptTournament(doc: TournamentDoc): boolean {
  if (doc.schemaVersion !== SCHEMA_VERSION) return false;

  docSignal.value = doc;
  stateSignal.value = fold(doc);
  return true;
}

/**
 * Unwind the most recent pick — SHEL-06 / D-10.
 *
 * This is the second write path in the file and it is deliberately not a `dispatch`.
 * `dispatch` appends; undo removes, which is the one operation an append-only log
 * cannot express as an append. The equivalence that makes the removal safe was
 * established and asserted by plan 01-06 (`tests/core/reduce.test.ts`: folding a log
 * prefix equals the state before the removed action), and `src/core/undo.ts` is where
 * the removal itself lives, pure and testable without any of this.
 *
 * The state is re-folded rather than advanced incrementally. `apply` moves forward only
 * — there is no `unapply` and there must not be one, because a second transition
 * function is a second thing that can disagree with the first.
 *
 * `resolveSpeciesName` is injected rather than looked up here. The store holds the
 * tournament document, and a display name is not in it: species names belong to the
 * roster snapshot, which the UI already has in hand. Caching a copy in this module
 * would be a second piece of state living outside the document, which is exactly what
 * D-10 rejects redo for.
 *
 * Returns whether anything was undone, so a caller can stay silent when there was not.
 *
 * ## The ownership gate — PERS-03 / T-01-40
 *
 * A tab that does not hold write ownership may not undo, and the check lives HERE rather
 * than only in the keyboard handler that exposed it. `app.tsx` marks the whole draft
 * region `inert` in a secondary tab, which correctly kills the `Undo last pick` button,
 * every pool cell and the tab order — but `TopBar` registers `Ctrl+Z` on `document`, which
 * is outside that subtree, and `inert` governs targeting inside a subtree rather than
 * document-level listeners. So the keystroke reached this function.
 *
 * The consequence was not a refused write; it was a delayed clobber. `persistence.save()`
 * declines on the spot, so nothing is corrupted immediately, but the secondary keeps a
 * locally-undone document. On `Take over drafting here`, `loadIfNewer()` compares
 * generations, finds them equal if the owner has not saved since this tab last read, and
 * returns null — so the secondary keeps its own log and its next autosave writes the
 * owner's pick out of existence. That is exactly the T-01-40 clobber the lock exists to
 * prevent, arriving through the keyboard.
 *
 * `TopBar` gates the keystroke too, so a read-only tab does not swallow the browser's own
 * Ctrl+Z with a `preventDefault`. This line is the guarantee; that one is the manners.
 *
 * ## Why `dispatch` is NOT gated the same way
 *
 * Asked and answered rather than overlooked. `isOwner()` is false for the 250ms
 * `CLAIM_WINDOW_MS` as well as in a secondary, and `createTournament` dispatches
 * `pool/built` and `draft/started` during boot — inside that window whenever the roster
 * snapshot comes from cache, which offline is every time. Gating `dispatch` would refuse
 * those two and leave a document with an empty log, an unpickable pool and no turn banner,
 * which is a certain outage traded for a rare race. The pick path needs no such gate
 * anyway: `handlePick` is only ever reached from a pool cell, and pool cells are inside the
 * `inert` region with no document-level listener of their own.
 *
 * Undo can afford the same window because the cost of losing it is one refused keystroke a
 * quarter-second after load, on a draft that must already have a pick in it.
 */
export function undo(resolveSpeciesName?: (monId: string) => string): boolean {
  if (!isOwner()) return false;

  const previous = docSignal.peek();
  if (previous === null || !canUndo(previous)) return false;

  const removed = lastPickAction(previous);
  if (removed === null) return false;

  const next = undoLast(previous);
  docSignal.value = next;
  stateSignal.value = fold(next);

  // Verbatim from the UI-SPEC copywriting table. The board reverting is the primary
  // feedback; this is what makes the same event reach someone not watching the screen.
  const species = resolveSpeciesName?.(removed.monId) ?? removed.monId;
  announce(`Undid Round ${removed.round} — ${species} is back in the pool.`);

  return true;
}
