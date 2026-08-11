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
 * Bumped only when a change makes an older document unreadable.
 *
 * Version 2 widened `TournamentConfig` with the fields the host authors on the config
 * screen: pool size, the banlist, the ban mode, how many Megas a team must carry, the
 * per-species dual-Mega choices, and how deep the tournament runs. Every one of them has
 * a lossless default derivable from a version 1 document, so a draft saved by Phase 1 is
 * upgraded rather than refused.
 *
 * `migrate.ts` owns that upgrade step and is the only module that knows how to perform
 * it. Nothing else compares a document's version against this constant: `store.ts`,
 * `adapters/persistence.ts` and `import-guard.ts` all route through `migrate` instead,
 * so there is one answer to "can this build read this document" rather than three that
 * can drift apart.
 */
export const SCHEMA_VERSION = 2;

export interface PlayerConfig {
  id: string;
  name: string;
}

/**
 * How Pokémon leave the pool before the first pick.
 *
 * A string-literal union rather than a boolean pair or an enum, and every member carries
 * its own comment, because these exact strings are written into a saved document and read
 * back by a later build. That makes them closer to an API than to a label: renaming one
 * breaks every tournament already on disk.
 */
export type BanMode =
  /** The host names the bans up front and everyone can see them. Phase 2 runs only this. */
  | 'hostBanlist'
  /**
   * Every player submits bans privately and they are revealed together. Phase 4 builds
   * it; Phase 2 renders the option disabled (D-12), so the control's shape is settled
   * now rather than rearranged around a late arrival.
   */
  | 'blind'
  /** Players take turns banning in snake order. Phase 4, disabled in Phase 2 (D-12). */
  | 'snake';

/**
 * How far past the last pick the tournament runs.
 *
 * Phase 2 only records this. Phase 5 is what consumes it, and recording it early is what
 * keeps a host from having to re-declare the shape of their night halfway through it.
 */
export type TournamentDepth =
  /** Draft six, export the teams, done. */
  | 'draftOnly'
  /** Draft, then play out a single-elimination bracket. */
  | 'draftAndBrackets'
  /** Draft, bracket, and a match log with standings behind it. */
  | 'draftBracketsAndLog';

/** Which forme a dual-Mega species may become. */
export type DualMegaForme =
  /** Only the X forme is available to whoever drafts this species. */
  | 'x'
  /** Only the Y forme. */
  | 'y'
  /** Either — the player decides when they export. This is what an absent entry means. */
  | 'either';

/**
 * A host's ruling on one species that has more than one Mega forme.
 *
 * An ARRAY of `{ speciesId, forme }` rather than a `Record<speciesId, forme>`, for two
 * reasons that are both structural:
 *
 *   1. ARCHITECTURE sync rule 14 forbids deriving anything order-sensitive from
 *      `Object.keys()`, and a record invites exactly that when the choices are rendered.
 *   2. A record's key count is unbounded, which makes it an unbounded allocation the
 *      import guard would have to bound with a bespoke check. An array is bounded by the
 *      same `copyStringArray`-shaped rule every other list in this document already uses.
 *
 * The list is advisory, never authoritative. Rows are derived from `megaFormes.length > 1`
 * on the roster snapshot and never from this list (D-03), so an ABSENT entry means
 * `'either'` and a STALE entry left behind by a regulation rotation is simply ignored
 * rather than resurrecting a species the roster no longer offers.
 */
export interface DualMegaChoice {
  speciesId: string;
  forme: DualMegaForme;
}

/**
 * Everything decided before the first action and never changed afterwards.
 *
 * `rosterVersion` and `rosterChecksum` pin which snapshot the tournament was created
 * against. Champions regulations rotate roughly every 2.5 months, so a document
 * reopened after a rotation must be able to say which roster it means.
 *
 * The six fields below `rosterChecksum` arrived with schema version 2 and are what the
 * host authors on the config screen.
 */
export interface TournamentConfig {
  formatLabel: string;
  players: PlayerConfig[];
  rounds: number;
  rosterVersion: string;
  rosterChecksum: string;
  /** How many Pokémon the drawn pool holds. Recovered from `pool/built` when migrating. */
  poolSize: number;
  /** Roster ids the host removed before the draw. Ids, never display names. */
  bans: string[];
  banMode: BanMode;
  /** Minimum Mega-capable Pokémon each team must end up with. `0` means no requirement. */
  megasRequiredPerTeam: number;
  dualMegaChoices: DualMegaChoice[];
  depth: TournamentDepth;
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

/**
 * Deep copy of config, so folded state can never alias the caller's object.
 *
 * Every array is copied ELEMENT BY ELEMENT, and that is not stylistic. TypeScript checks
 * this function for a field it forgot — the return is an explicit object literal typed
 * `TournamentConfig`, so `strict` errors on an omission — but it cannot see a shallow
 * copy: `bans: config.bans` type-checks and quietly shares one array between the caller
 * and the folded state. `initialState` runs this on every `fold`, and `fold` runs on
 * every undo, so a shared array shows up as undoing a pick changing the banlist.
 */
function copyConfig(config: TournamentConfig): TournamentConfig {
  return {
    formatLabel: config.formatLabel,
    players: config.players.map((player) => ({ id: player.id, name: player.name })),
    rounds: config.rounds,
    rosterVersion: config.rosterVersion,
    rosterChecksum: config.rosterChecksum,
    poolSize: config.poolSize,
    bans: config.bans.map((id) => id),
    banMode: config.banMode,
    megasRequiredPerTeam: config.megasRequiredPerTeam,
    dualMegaChoices: config.dualMegaChoices.map((choice) => ({
      speciesId: choice.speciesId,
      forme: choice.forme,
    })),
    depth: config.depth,
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
