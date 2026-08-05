/**
 * model.ts — the shape of the tournament document and the state folded from it.
 *
 * Two objects live here and they are not the same thing:
 *
 *   TournamentDoc  is what gets persisted, exported, imported and (one day) synced.
 *                  It is config plus an append-only log, and nothing else. It is the
 *                  source of truth.
 *
 *   DraftState     is what `fold` produces by replaying that log. It is a cache of the
 *                  log, thrown away and rebuilt on every load. Nothing derived lives
 *                  here either — the available pool, the teams, whose turn it is and
 *                  whether the draft is finished are all computed in selectors.ts.
 *
 * Every field below is JSON-serializable: no Date, no Map, no Set, no class instance,
 * no function, no meaningful `undefined`. Timestamps are epoch integers and every
 * entity is keyed by a stable string id rather than an array position. That is
 * ARCHITECTURE sync rules 1 and 2, and it is what makes `JSON.stringify(doc)` complete
 * and correct by construction rather than by remembering to keep a serializer updated.
 */

import type { Action } from './actions';

/**
 * Bumped only when a change makes an older document unreadable. Plan 01-10 pairs this
 * with a `migrate(doc)` on the import path; until then it is written and checked.
 */
export const SCHEMA_VERSION = 1;

export interface PlayerConfig {
  id: string;
  name: string;
}

/**
 * Everything decided before the first action and never changed afterwards.
 *
 * `rosterVersion` and `rosterChecksum` pin which snapshot the tournament was created
 * against. Champions regulations rotate roughly every 2.5 months, so a document
 * reopened after a rotation must be able to say which roster it means.
 */
export interface TournamentConfig {
  formatLabel: string;
  players: PlayerConfig[];
  rounds: number;
  rosterVersion: string;
  rosterChecksum: string;
}

/**
 * Randomness as state (SHEL-07). The seed is drawn once at the impure edge when the
 * tournament is created and then never again; `cursor` records how far the pure
 * generator has been advanced. Same seed plus same log means identical state on every
 * machine and after every reload.
 */
export interface RngState {
  seed: number;
  cursor: number;
}

export interface TournamentDoc {
  schemaVersion: number;
  /** Generated at the edge with `newId()`. Never inside a reducer. */
  id: string;
  /** Epoch milliseconds, stamped at the edge. */
  createdAt: number;
  config: TournamentConfig;
  rng: RngState;
  /** Append-only. Corrections are compensating actions, never edits or deletions. */
  log: Action[];
}

/**
 * One recorded pick.
 *
 * `round` is 1-based, matching the `R1`…`R6` board headers and the `Round {r} of 6`
 * banner copy. `pickIndex` is the 0-based position in the whole draft, so it doubles
 * as the count of picks that preceded it. `seq` is the sequence number of the action
 * that recorded it, which is what `draft/pickUndone` targets — an array index would
 * not survive a retraction earlier in the log.
 */
export interface DraftPick {
  playerId: string;
  monId: string;
  round: number;
  pickIndex: number;
  seq: number;
}

/**
 * The fold of the log. Only facts the log asserted; never anything computable.
 *
 * `poolIds` and `order` are materialized results, not derivations (ARCHITECTURE
 * Pattern 5): the pool was resolved against a roster snapshot and the order was rolled
 * from the seed, and both were written into the log so a replay reads what happened
 * rather than recomputing it against a roster that may since have rotated.
 */
export interface DraftState {
  config: TournamentConfig;
  poolIds: string[];
  /** Regulation label recorded by `pool/built`; null until the pool is built. */
  rosterVersion: string | null;
  rosterChecksum: string | null;
  /** Player ids in pick order, recorded by `draft/started`. Empty until then. */
  order: string[];
  picks: DraftPick[];
}

/** Deep copy of config, so folded state can never alias the caller's object. */
function copyConfig(config: TournamentConfig): TournamentConfig {
  return {
    formatLabel: config.formatLabel,
    players: config.players.map((player) => ({ id: player.id, name: player.name })),
    rounds: config.rounds,
    rosterVersion: config.rosterVersion,
    rosterChecksum: config.rosterChecksum,
  };
}

/** The state a document is in before a single action has been applied. */
export function initialState(config: TournamentConfig): DraftState {
  return {
    config: copyConfig(config),
    poolIds: [],
    rosterVersion: null,
    rosterChecksum: null,
    order: [],
    picks: [],
  };
}
