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
 * All four types exist from day one, including `draft/pickUndone`, which nothing
 * dispatches until plan 01-07. Sync rule 15 requires the compensating action type to
 * exist and be reducible now, so that popping the log stays a local-only optimization
 * rather than a design the log cannot express.
 */

export const POOL_BUILT = 'pool/built';
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
 * `doc.rng` is a single `{ seed, cursor }` reserved for the pure generator that Phase 3's
 * priority-card tie-breaks will advance; putting the pool draw's seed there would make two
 * unrelated consumers share one number and one cursor.
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
  | DraftStartedPayload
  | PickMadePayload
  | PickUndonePayload;

export type PoolBuiltAction = PoolBuiltPayload & ActionEnvelope;
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
