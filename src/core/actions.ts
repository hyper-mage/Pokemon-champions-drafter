/**
 * actions.ts — the vocabulary of the log.
 *
 * Actions are events, not setters: `draft/pickMade { playerId, monId }`, never
 * `state/setTeams { ... }`. A setter-shaped log is a log that means nothing when read
 * back, and it is unrebasable if sync is ever added (ARCHITECTURE sync rule 7).
 *
 * The creators below return the PAYLOAD only. They do not stamp `seq`, `at` or
 * `actorId` — `dispatch` does that at the impure edge, because a creator that reached
 * for a clock would be an ambient read inside the core and `npm run check:pure` would
 * fail the build for it. That split is the point, not an inconvenience.
 *
 * Phase 1's four types all existed from day one, including `draft/pickUndone`, which
 * nothing dispatched until plan 01-07. Sync rule 15 requires the compensating action type
 * to exist and be reducible now, so that popping the log stays a local-only optimization
 * rather than a design the log cannot express. `schedule/compiled` is the fifth, added in
 * Phase 3, and it lands in the same five places every type here does: constant, payload
 * interface, `Intent` member, creator, structural guard — plus `buildLogEntry`'s arm in
 * `import-guard.ts`, which is the sixth and the one a round trip fails silently without.
 */

export const POOL_BUILT = 'pool/built';
export const SCHEDULE_COMPILED = 'schedule/compiled';
export const DRAFT_STARTED = 'draft/started';
export const DRAFT_PICK_MADE = 'draft/pickMade';
export const DRAFT_PICK_UNDONE = 'draft/pickUndone';

/**
 * What `dispatch` adds to every intent.
 *
 * `seq` is a monotonic integer so ordering is explicit rather than implied by array
 * position; `at` is epoch milliseconds; `actorId` is `'host'` today and a device or
 * player id under sync. Adding any of these later would mean migrating every saved
 * tournament, which is why they are here before there is anything to migrate.
 */
export interface ActionEnvelope {
  seq: number;
  at: number;
  actorId: string;
}

/**
 * The pool, materialized. Replay reads these ids; it never re-derives them.
 *
 * ## Why `seed` lives here and not in `RngState`
 *
 * This is ARCHITECTURE Pattern 5 — a materialized result carrying its own provenance —
 * and it is the same reason this payload already carries `rosterVersion` and `checksum`.
 * `doc.rng` is a single `{ seed, cursor }`, and **nothing in this build advances it**:
 * `rng.cursor` is `0` when a tournament is created and `0` for the rest of its life. Phase
 * 3's priority-card tie-break, which an earlier version of this comment reserved the
 * generator for, breaks ties on `(value, seq)` and consumes no randomness at all (D-22).
 * The field stays because it is the provenance argument's home for any future consumer
 * that does need a seeded derivation — and putting the pool draw's seed there would make
 * two unrelated consumers share one number and one cursor.
 *
 * Keeping it on the action also makes a re-roll expressible without contradicting
 * anything: a Phase 3 re-roll emits a NEW `pool/built` with a new seed and a new id list,
 * and no config field has to be rewritten to explain it. A seed stored in config would
 * have to be, and then the log and the config would disagree about which draw produced
 * the pool on screen.
 *
 * `megaCapableCount` is the number of Mega-capable entries in `ids` at the moment the pool
 * was drawn (D-09). It is recorded rather than recomputed because the roster it was
 * measured against rotates roughly every 2.5 months; Phase 3's RULE-09 gate reads it.
 */
export interface PoolBuiltPayload {
  type: typeof POOL_BUILT;
  ids: string[];
  rosterVersion: string;
  checksum: string;
  /** The pool seed that produced `ids`. `0` when no draw was rolled. */
  seed: number;
  /** How many of `ids` can Mega Evolve, measured against `rosterVersion`. */
  megaCapableCount: number;
}

/**
 * What a round's pool is filtered by (D-07).
 *
 * A TAG, never a resolved id list. The round says what it wants and the eligibility
 * selector answers it against the roster the document is pinned to; a materialized id
 * list would freeze one regulation's answer into a document that outlives it.
 *
 * A string-literal union with a comment per member, for the same reason {@link
 * ../model.BanMode} is one: these exact strings are written into a saved document and
 * read back by a later build, which makes them closer to an API than to a label.
 * Renaming one breaks every tournament already on disk.
 */
export type RoundKind =
  /** The slot only accepts a Pokémon that can Mega Evolve under this document's rules. */
  | 'mega'
  /** The slot accepts anything still in the pool. The default, and what an empty schedule folds as. */
  | 'open';

/**
 * One round of the compiled schedule.
 *
 * `index` is 1-based, matching `DraftPick.round` and the `R1`…`R6` board headers, and it
 * is CARRIED rather than taken from array position: a schedule read back from a file is
 * an array whose order a hand-edit can change without the reader noticing. 03-02's
 * structural guard pins `rounds[i].index === i + 1` so the two can never disagree
 * silently.
 */
export interface RoundSpec {
  index: number;
  kind: RoundKind;
}

/**
 * The schedule the host approved, after any RULE-06 reorder. Written once, at Start.
 *
 * ## Why this is materialized, against "nothing derived is stored"
 *
 * Three arguments, strongest first.
 *
 * 1. **The schedule is not derived.** It carries a host decision `compile()` cannot
 *    reproduce: `compile(rules, rounds)` yields one canonical order, and RULE-06 lets the
 *    host permute it. A document recording only `rules` would recompute the canonical order
 *    on every load, and the reorder would silently not survive a reload. The reorder is an
 *    external input, and Pattern 5 exists for exactly that class.
 * 2. **A compiler change or a roster rotation would retype slots in a FINISHED draft.**
 *    D-08 reads a slot's type from schedule position, so a v1.1 compiler that emitted Mega
 *    rounds last would reinterpret a completed team. `pool/built` above carries resolved
 *    `ids` for the same reason.
 * 3. **The reducer and the selectors need it in `DraftState`,** and the only route into
 *    `DraftState` is through the fold.
 *
 * ## There is no reorder action, and there is deliberately no second schedule
 *
 * The reorder is config-time (D-13) and therefore pre-document form state, exactly like the
 * banlist: only the RESOLVED result reaches the log. There is one schedule for the life of
 * a document — `canApply` refuses a second — which is what makes "a slot's type cannot
 * change under a pick already made" true by construction rather than by a check. A
 * mid-draft reorder is CONTEXT `<deferred>` and would need an action of its own, which this
 * build does not have.
 */
export interface ScheduleCompiledPayload {
  type: typeof SCHEDULE_COMPILED;
  /** `length === config.rounds`, `index` contiguous from 1. */
  rounds: RoundSpec[];
}

/** The starting order, materialized from the seed at creation time. */
export interface DraftStartedPayload {
  type: typeof DRAFT_STARTED;
  order: string[];
  /** The order seed that produced `order`. Same provenance argument as `pool/built`. */
  seed: number;
}

export interface PickMadePayload {
  type: typeof DRAFT_PICK_MADE;
  playerId: string;
  monId: string;
  /** 1-based, matching the board headers and the banner copy. */
  round: number;
  /** 0-based position in the whole draft. */
  pickIndex: number;
}

/** Retracts the pick recorded by the action whose `seq` is `targetSeq`. */
export interface PickUndonePayload {
  type: typeof DRAFT_PICK_UNDONE;
  targetSeq: number;
}

export type Intent =
  | PoolBuiltPayload
  | ScheduleCompiledPayload
  | DraftStartedPayload
  | PickMadePayload
  | PickUndonePayload;

export type PoolBuiltAction = PoolBuiltPayload & ActionEnvelope;
export type ScheduleCompiledAction = ScheduleCompiledPayload & ActionEnvelope;
export type DraftStartedAction = DraftStartedPayload & ActionEnvelope;
export type PickMadeAction = PickMadePayload & ActionEnvelope;
export type PickUndoneAction = PickUndonePayload & ActionEnvelope;

/** A stamped action this build understands. */
export type Action = Intent & ActionEnvelope;

/**
 * A stamped action this build may not understand.
 *
 * A document written by a newer client can carry types that did not exist when this
 * bundle was built. `apply` must fold such a log without crashing (sync rule 11), so
 * it accepts this wider type and ignores what it cannot interpret.
 */
export interface UnknownAction extends ActionEnvelope {
  type: string;
}

export type AnyAction = Action | UnknownAction;

// ---------------------------------------------------------------------------
// Creators — payload only, never the envelope
// ---------------------------------------------------------------------------

/**
 * `seed` and `megaCapableCount` are arguments rather than something this function works
 * out, and that is the purity split rather than an inconvenience: drawing a seed is an
 * ambient read, and counting Mega-capable entries needs the roster snapshot, which lives
 * outside the core. Both are resolved at the edge and handed in already decided.
 */
export function poolBuilt(
  ids: readonly string[],
  rosterVersion: string,
  checksum: string,
  seed: number,
  megaCapableCount: number,
): PoolBuiltPayload {
  return { type: POOL_BUILT, ids: [...ids], rosterVersion, checksum, seed, megaCapableCount };
}

/**
 * A fresh array of FRESH RECORDS, never the caller's objects.
 *
 * The config screen holds its reorder preview in component state and re-renders it on every
 * drag; a payload that aliased that array would let a later render mutate a log entry that
 * has already been written. Copying element by element here is the same rule `copyConfig`
 * states for the document.
 */
export function scheduleCompiled(rounds: readonly RoundSpec[]): ScheduleCompiledPayload {
  return {
    type: SCHEDULE_COMPILED,
    rounds: rounds.map((spec) => ({ index: spec.index, kind: spec.kind })),
  };
}

export function draftStarted(order: readonly string[], seed: number): DraftStartedPayload {
  return { type: DRAFT_STARTED, order: [...order], seed };
}

export function pickMade(pick: {
  playerId: string;
  monId: string;
  round: number;
  pickIndex: number;
}): PickMadePayload {
  return {
    type: DRAFT_PICK_MADE,
    playerId: pick.playerId,
    monId: pick.monId,
    round: pick.round,
    pickIndex: pick.pickIndex,
  };
}

export function pickUndone(targetSeq: number): PickUndonePayload {
  return { type: DRAFT_PICK_UNDONE, targetSeq };
}

// ---------------------------------------------------------------------------
// Payload guards
//
// The discriminant alone is not enough. An imported document (plan 01-10) is
// untrusted input, and a log entry that says `draft/pickMade` while carrying no
// `monId` must fold to "ignored", not to a pick of `undefined`.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function isPoolBuiltAction(action: AnyAction): action is PoolBuiltAction {
  if (action.type !== POOL_BUILT || !isRecord(action)) return false;
  return (
    isStringArray(action['ids']) &&
    typeof action['rosterVersion'] === 'string' &&
    typeof action['checksum'] === 'string' &&
    isSafeInteger(action['seed']) &&
    isSafeInteger(action['megaCapableCount'])
  );
}

const ROUND_KINDS: readonly RoundKind[] = ['mega', 'open'];

/**
 * Structurally typed, and positionally pinned.
 *
 * `rounds[i].index === i + 1` is checked rather than assumed, so a hand-edited file cannot
 * produce a schedule whose carried index and array position disagree — the two are read by
 * different call sites (`selectRoundKind` indexes; the reorder preview renders `index`), and
 * a disagreement between them is invisible until a Mega round appears in the wrong column.
 *
 * `kind` is checked against the union for the reason the union's own comment gives: these
 * strings are an API. A file declaring `kind: 'legendary'` would fold to a round this build
 * has no pool filter, no swap predicate and no export rule for.
 */
export function isScheduleCompiledAction(action: AnyAction): action is ScheduleCompiledAction {
  if (action.type !== SCHEDULE_COMPILED || !isRecord(action)) return false;

  const rounds = action['rounds'];
  if (!Array.isArray(rounds)) return false;

  return rounds.every((spec, position) => {
    if (!isRecord(spec)) return false;
    if (!isSafeInteger(spec['index']) || spec['index'] !== position + 1) return false;
    return ROUND_KINDS.some((kind) => kind === spec['kind']);
  });
}

export function isDraftStartedAction(action: AnyAction): action is DraftStartedAction {
  if (action.type !== DRAFT_STARTED || !isRecord(action)) return false;
  return isStringArray(action['order']) && isSafeInteger(action['seed']);
}

export function isPickMadeAction(action: AnyAction): action is PickMadeAction {
  if (action.type !== DRAFT_PICK_MADE || !isRecord(action)) return false;
  return (
    typeof action['playerId'] === 'string' &&
    typeof action['monId'] === 'string' &&
    isSafeInteger(action['round']) &&
    isSafeInteger(action['pickIndex'])
  );
}

export function isPickUndoneAction(action: AnyAction): action is PickUndoneAction {
  if (action.type !== DRAFT_PICK_UNDONE || !isRecord(action)) return false;
  return isSafeInteger(action['targetSeq']);
}
