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
import {
  draftStarted,
  poolBuilt,
  scheduleCompiled,
  type Action,
  type Intent,
  type RoundSpec,
} from './core/actions';
import { migrate } from './core/migrate';
import {
  initialState,
  SCHEMA_VERSION,
  type DraftState,
  type TournamentConfig,
  type TournamentDoc,
} from './core/model';
import { apply, canApply, fold, type CanApplyResult } from './core/reduce';
import { canUndo, undoLast, undoRemoval, type UndoRemoval } from './core/undo';
import { announce } from './ui/components/LiveRegion';

/**
 * Every action this build originates is the host's. Under sync this becomes a device
 * or player id; the field exists now so no saved tournament ever needs migrating for it.
 */
const ACTOR_HOST = 'host';

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
 * Everything `createTournament` needs, and nothing it could work out for itself.
 *
 * Each field is a result the config screen already computed and already showed the host:
 * the drawn pool, the resolved starting order, and the seed behind each. Passing the
 * results rather than the instructions is what makes "the tournament that starts is the
 * one on screen" structural — a store that re-drew from a seed could disagree with the
 * readout the host clicked Start under, and would, the first time a derivation changed.
 */
export interface CreateTournamentInput {
  /** Host-authored. Player ids are generated at the edge before this is called. */
  config: TournamentConfig;
  /** `drawPool` output, already in display order. */
  poolIds: readonly string[];
  /** The seed that produced `poolIds`. */
  poolSeed: number;
  /** D-09 — the drawn pool's Mega-capable count, for Phase 3's RULE-09 gate. */
  megaCapableCount: number;
  /** `selectStartingOrder` output. */
  order: readonly string[];
  /** The seed that produced `order`. */
  orderSeed: number;
  /**
   * The schedule the host approved — a RESULT the config screen already showed them, after
   * any RULE-06 reorder, not an instruction to recompute.
   *
   * The same argument the fields above make, and here it is load-bearing rather than
   * stylistic: a store that called `compile(config.rules, config.rounds)` itself would
   * discard the reorder entirely, and would do so silently, because the canonical order it
   * produced would be a perfectly valid schedule.
   */
  schedule: readonly RoundSpec[];
}

/**
 * Start a new tournament from a host-authored config.
 *
 * It derives NOTHING. No config synthesis, no seed-driven order roll, no pool built from
 * a roster. The config screen owns all three and has already put them on screen; this is
 * where they become a document.
 *
 * Three actions are emitted, each carrying materialized results rather than instructions to
 * recompute (ARCHITECTURE Pattern 5), and the order is not stylistic:
 *
 *   pool/built         the actual ids, plus the regulation and checksum they came from, the
 *                      seed that drew them and how many can Mega Evolve. Champions
 *                      regulations rotate roughly every 2.5 months; a document that recorded
 *                      only "build a pool" would reopen next regulation as a different
 *                      tournament.
 *   schedule/compiled  the round schedule the host approved, after any reorder. BEFORE the
 *                      draft, because `canApply(DRAFT_STARTED)` requires it and because
 *                      CARD-02 needs the schedule on screen before the first card is played.
 *   draft/started      the resolved starting order, and the seed it was rolled from.
 *
 * ## This ordering is the HOST-BANLIST one, and D-11 made it one of two
 *
 * The sequence above is what a `hostBanlist` tournament emits, and this function only ever
 * creates one — D-01 keeps it atomic and unparameterised for exactly that reason. A `blind`
 * or `snake` tournament runs `schedule/compiled` → `draft/started` → the ban stage →
 * `bans/revealed` → **`pool/built` last**, because the serpentine reads `state.order` and
 * the reveal is what decides what the draw may contain (D-23). `canApply` conditions both
 * `poolNotBuilt` guards on the mode rather than dropping them, so the rule this function
 * relies on is byte-for-byte the one it has always relied on. The second entry point is a
 * SIBLING of this function, never a flag on it; two seams is what D-01 buys.
 *
 * Both seeds ride on the ACTION rather than in `config` or `rng`, which is what keeps a
 * later re-roll expressible: it emits a new action with a new seed and contradicts no
 * field anywhere else in the document.
 *
 * `rng` is a THIRD seed and **nothing in this build advances it**. It is drawn here and
 * `rng.cursor` stays `0` for the life of the document. An earlier version of this comment
 * reserved it for Phase 3's priority-card tie-breaks; those break ties on `(value, seq)`
 * and consume no randomness (D-22). The field remains for the provenance argument and for
 * any future consumer that needs a seeded derivation — and if one ever arrives it must
 * materialize the advanced cursor into the log, or two consumers silently share one stretch
 * of one stream. The config screen's two derivations dodge that by using two independent
 * seeds, each consumed from cursor 0.
 *
 * ## Ordering that looks stylistic and is not
 *
 * Both signals are assigned BEFORE either dispatch, because `dispatch` returns
 * `{ ok: false, reason: 'draftNotStarted' }` while either is null. And both are restored
 * when either dispatch is refused: the assignment has already happened by then, so
 * "leaves the store as it found it" means rolling back rather than never writing.
 */
export function createTournament(input: CreateTournamentInput): TournamentDoc | null {
  const previousDoc = docSignal.peek();
  const previousState = stateSignal.peek();

  docSignal.value = {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    createdAt: now(),
    config: input.config,
    rng: { seed: newSeed(), cursor: 0 },
    log: [],
  };
  stateSignal.value = initialState(input.config);

  const pool = dispatch(
    poolBuilt(
      input.poolIds,
      input.config.rosterVersion,
      input.config.rosterChecksum,
      input.poolSeed,
      input.megaCapableCount,
    ),
  );

  const compiled = pool.ok ? dispatch(scheduleCompiled(input.schedule)) : pool;

  const started = compiled.ok
    ? dispatch(draftStarted(input.order, input.orderSeed))
    : compiled;

  if (!started.ok) {
    // `started` carries the FIRST refusal of the three, because each dispatch is skipped
    // once an earlier one failed. That is what makes this one branch cover all three
    // outcomes rather than needing one arm each.
    //
    // A half-built tournament is worse than none: the pool would render with no turn
    // banner and no way to pick, and a pool plus a schedule with no order would render a
    // typed board nobody can pick into. The caller gets null and the store gets its old
    // life back, including the object identity every component is holding.
    docSignal.value = previousDoc;
    stateSignal.value = previousState;
    return null;
  }

  return docSignal.peek();
}

/**
 * Everything `createBanStage` needs, and — deliberately — nothing about a pool.
 *
 * The posture is `CreateTournamentInput`'s, one field short: each of these is a RESULT the
 * config screen already computed and already showed the host — the resolved starting order,
 * the seed behind it, and the schedule it approved after any RULE-06 reorder. Passing the
 * results rather than the instructions is what makes "the tournament that starts is the one
 * on screen" structural; a store that recompiled the schedule here would discard the reorder
 * silently, and would do so while producing a perfectly valid one.
 *
 * ## The absent fields are the point
 *
 * No `poolIds`, no `poolSeed`, no `megaCapableCount`. In blind and snake the pool does not
 * exist yet and MUST not: D-23 makes the reveal what decides what the draw may contain, so a
 * pool drawn here would be a pool drawn before the bans that constrain it. `pool/built`
 * arrives last instead, and that is already legal — `canApply(POOL_BUILT)` asks about the
 * pool and asserts nothing about the draft having started.
 */
export interface CreateBanStageInput {
  /** Host-authored. Player ids are generated at the edge before this is called. */
  config: TournamentConfig;
  /** `selectStartingOrder` output. */
  order: readonly string[];
  /** The seed that produced `order`. */
  orderSeed: number;
  /** The schedule the host approved, after any RULE-06 reorder. Never recompiled here. */
  schedule: readonly RoundSpec[];
}

/**
 * Start a blind or snake tournament, which begins at a ban stage rather than at a draft.
 *
 * ## A SIBLING of `createTournament`, never a flag on it
 *
 * D-01 buys two seams deliberately, and the value is entirely in what does NOT change:
 * `hostBanlist` keeps the atomic three-dispatch path Phase 2 verified, byte for byte, at
 * zero regression risk, and only the two modes that are new route anywhere new. Reshaping
 * `createTournament` into one parameterised function would spend exactly that. Do not merge
 * them later "for tidiness" — the duplication here is two dispatches and a rollback, and the
 * thing it buys is that the mode nine tenths of the tests cover cannot be broken from here.
 *
 * Two actions, and the order is not stylistic:
 *
 *   schedule/compiled  the round schedule the host approved. FIRST, because
 *                      `canApply(DRAFT_STARTED)` rejects `scheduleNotCompiled` and that
 *                      check has nothing to do with the pool — it is the same requirement
 *                      `createTournament` satisfies, arrived at with one fewer action.
 *   draft/started      the resolved starting order, and the seed it was rolled from. The
 *                      serpentine reads `state.order`, so the ban stage cannot begin until
 *                      this has landed (D-11).
 *
 * Both arrays are copied element by element, exactly as `createTournament` copies its own,
 * so the document never shares an array with the config screen's state.
 *
 * ## The rollback is `createTournament`'s, for the same reason
 *
 * Both signals are assigned BEFORE either dispatch, because `dispatch` returns
 * `{ ok: false, reason: 'draftNotStarted' }` while either is null — so "leaves the store as
 * it found it" means rolling back rather than never writing.
 */
export function createBanStage(input: CreateBanStageInput): TournamentDoc | null {
  const previousDoc = docSignal.peek();
  const previousState = stateSignal.peek();

  docSignal.value = {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    createdAt: now(),
    config: input.config,
    rng: { seed: newSeed(), cursor: 0 },
    log: [],
  };
  stateSignal.value = initialState(input.config);

  const compiled = dispatch(
    scheduleCompiled(input.schedule.map((spec) => ({ index: spec.index, kind: spec.kind }))),
  );

  const started = compiled.ok
    ? dispatch(draftStarted([...input.order], input.orderSeed))
    : compiled;

  if (!started.ok) {
    // `started` carries the FIRST refusal of the two, because the second dispatch is skipped
    // once the first has failed. That is what makes this one branch cover both outcomes
    // rather than needing an arm each — the same construction `createTournament` uses over
    // three.
    //
    // A half-built ban stage is worse than none: a schedule with no order renders a stage
    // that names nobody's turn and accepts no ban, on a shared screen, with no way back. The
    // caller gets null and the store gets its old life back, including the object identity
    // every component is holding.
    docSignal.value = previousDoc;
    stateSignal.value = previousState;
    return null;
  }

  return docSignal.peek();
}

/**
 * Adopt a document that already exists — a restored autosave, or an imported file.
 *
 * The version question goes to `migrate` rather than being answered here with a
 * comparison. That is the difference between "this build cannot read this document" and
 * "this build cannot read this document YET", and the two now have different answers: a
 * schema 1 tournament is UPGRADED and adopted, while one from a build newer than this is
 * still refused rather than half-loaded. `apply` tolerates action types it has never heard
 * of, but a whole document shape it does not understand is a different question, and
 * answering that one optimistically is how a good save gets replaced by a broken one.
 *
 * What gets adopted is `migrate`'s output, never the argument. For a version 1 document
 * those are different objects, and publishing the argument would put a document the
 * reducer cannot fully fold into the signal every component reads.
 *
 * The state is re-folded from scratch rather than trusted, because the log is the truth
 * and the folded state is only ever a cache of it.
 */
export function adoptTournament(doc: TournamentDoc): boolean {
  const migrated = migrate(doc);
  if (!migrated.ok) return false;

  docSignal.value = migrated.doc;
  stateSignal.value = fold(migrated.doc);
  return true;
}

/**
 * Throw the tournament away — D-36.
 *
 * ## Why this is not a `dispatch`
 *
 * An append-only log expresses corrections as compensating actions, and every other
 * mutation in this file is one. Abandoning is not a correction to a tournament. It is the
 * decision that there is no tournament, and there is nothing left to append to: the
 * document itself is what goes. A `tournament/abandoned` action would have to live in a
 * log that the same action says should not exist.
 *
 * ## Why it is not `isOwner()`-gated
 *
 * Same reason `dispatch` is not, and the long comment below `undo` argues it in full. A
 * secondary tab abandoning its own in-memory copy writes nothing — `persistence.save`
 * declines on the spot, which is the guarantee — so gating here would buy nothing and
 * would make one of the two write paths inconsistent with the other.
 *
 * Removing the SAVED record is the caller's separate decision, taken through
 * `persistence.clearSaved()`. The two are apart on purpose: this function is about what
 * this tab is holding, and that one is about what the browser is keeping.
 */
export function abandonTournament(): void {
  docSignal.value = null;
  stateSignal.value = null;
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
 * region `inert` in a secondary tab, which correctly kills the `Undo last move` button,
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

  const removed = undoRemoval(previous);
  if (removed === null) return false;

  // Read BEFORE the write, because the removal names a player and the display name has to
  // come from the state that still contains the move being described.
  const playerName = selectPlayerName(stateSignal.peek(), removed.playerId);

  const next = undoLast(previous);
  docSignal.value = next;
  stateSignal.value = fold(next);

  announce(undoAnnouncement(removed, playerName, resolveSpeciesName));

  return true;
}

/** The display name for a player id, or the id, without assuming a live state. */
function selectPlayerName(state: DraftState | null, playerId: string): string {
  if (state === null) return playerId;
  return state.config.players.find((player) => player.id === playerId)?.name ?? playerId;
}

/**
 * What the live region says an undo just did — 03-UI-SPEC §Live-region announcements.
 *
 * Verbatim from the copywriting table, one string per kind. The board reverting is the
 * primary feedback; this is what makes the same event reach somebody not watching the
 * screen, which on a shared draft screen is most of the room.
 *
 * A card undo needs no species name and must not invent one — `resolveSpeciesName` is
 * consulted for a pick and for a swap, which are the two kinds that move a species, and for
 * nothing else. A pass moves nothing at all and names no species.
 */
function undoAnnouncement(
  removed: UndoRemoval,
  playerName: string,
  resolveSpeciesName?: (monId: string) => string,
): string {
  const speciesName = (monId: string | null): string => {
    const id = monId ?? '';
    return resolveSpeciesName?.(id) ?? id;
  };

  if (removed.kind === 'card') {
    return `Undid ${playerName}'s card — ${removed.cardValue} is back in their hand.`;
  }

  if (removed.kind === 'order') {
    return `Undid round ${removed.round}'s pick order — ${playerName}'s ${removed.cardValue} is back in their hand.`;
  }

  if (removed.kind === 'swap') {
    // Both directions, because a swap moved two species in opposite ones. `monId` is what
    // goes back to the pool and `outMonId` is what goes back to the slot — `UndoRemoval`
    // states that pairing, and reading it backwards yields a sentence that is grammatical
    // and exactly wrong.
    return `Undid the swap — ${speciesName(removed.monId)} is back in the pool and ${speciesName(removed.outMonId)} returns to ${playerName}'s round ${removed.round} slot.`;
  }

  if (removed.kind === 'pass') {
    return `Undid ${playerName}'s pass in swap round ${removed.swapRound}.`;
  }

  return `Undid Round ${removed.round} — ${speciesName(removed.monId)} is back in the pool.`;
}
