/**
 * import-guard.ts — the one untrusted-input boundary in the application.
 *
 * Everything else this app reads, it wrote. This file reads a JSON file the host was
 * handed by someone else, and a record out of `localStorage` that could have been
 * truncated by a tab that died mid-write, hand-edited in devtools, or written by a
 * different build. Both sources get the same treatment, through the same code, because
 * two guards with one job is two guards that can disagree.
 *
 * Hand-rolled rather than delegated to a schema library, and that is a constraint rather
 * than a preference: PROJECT.md fixes the runtime dependency list at exactly two, and
 * validation cannot be a devDependency because it runs in the browser. CLAUDE.md's
 * Supporting Libraries table calls a ~40-line hand-written guard "entirely defensible"
 * for a schema this size, and it is the option that keeps the count at two.
 *
 * ---------------------------------------------------------------------------
 * Four defences, in the order they run
 * ---------------------------------------------------------------------------
 *
 *   1. Size gate, BEFORE parsing. A tournament is tens of KB. Anything past 5 MB is
 *      corrupt or hostile, and the point of refusing first is that the memory is never
 *      spent (T-01-03).
 *
 *   2. A parse-boundary reviver that drops `__proto__`, `constructor` and `prototype`.
 *      A reviver returning undefined omits the key outright, so the poisoned value never
 *      exists as a property even transiently (T-01-01).
 *
 *   3. An allow-list rebuild. The returned tournament is constructed field by field from
 *      named properties of the parsed value. Nothing is merged, spread, bulk-copied or
 *      cloned wholesale into it, so a field this file does not name cannot reach state —
 *      not because it was filtered out, but because nothing ever picked it up.
 *
 *   4. Bounds and ordering. At most 20000 log entries; every entry typed; `seq` values
 *      strictly increasing from zero, which is what makes `draft/pickUndone`'s targeting
 *      unambiguous (T-01-44).
 *
 *      Every COUNT is bounded too, and separately, because the size gate does not
 *      constrain a count: `"rounds": 4000000000` is twenty bytes and passes it. Counts
 *      reach the renderer as allocations — `rounds` becomes a slot array per player,
 *      `players` becomes board rows, `pool/built.ids` becomes cells — so an unbounded
 *      count is an out-of-memory abort inside `App`'s render, which the host meets as a
 *      blank page rather than as a refusal. See {@link MAX_ROUNDS}, {@link MAX_PLAYERS}
 *      and {@link MAX_POOL_IDS}.
 *
 * ---------------------------------------------------------------------------
 * Refuse, do not repair
 * ---------------------------------------------------------------------------
 *
 * Every failure path returns a reason and no tournament. There is deliberately no
 * "fix it up and load what we can": a partially repaired draft looks loaded, and the
 * host discovers what went missing at the point they needed it. The one honest answer to
 * a file that does not match is to say so and leave the draft in progress untouched
 * (T-01-45). The caller maps `reason` to the two specified sentences and does nothing
 * else with it.
 *
 * Pure, like everything under `src/core`: no clock, no randomness, no storage, no DOM.
 * The byte length is passed in by the adapter that read the file, because measuring it
 * would mean reaching for an ambient API from inside the core.
 */

import type { Action, RoundKind, RoundSpec } from './actions';
import { migrate, V1_CONFIG_DEFAULTS, V2_CONFIG_DEFAULTS } from './migrate';
import type {
  BanMode,
  CompositionRule,
  DualMegaChoice,
  DualMegaForme,
  PlayerConfig,
  TournamentConfig,
  TournamentDepth,
  TournamentDoc,
} from './model';

/**
 * The size gate — 5 MB.
 *
 * Two orders of magnitude above the largest plausible tournament (a complete eight-player
 * draft is a few hundred log entries) and comfortably under the ~5 MB `localStorage`
 * origin cap, so a file that passes this gate is a file that could have been saved.
 */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/**
 * The log cap — 20000 entries.
 *
 * A twelve-round eight-player draft with bans, card plays and a bracket is low hundreds.
 * Twenty thousand is unreachable by legitimate play and low enough that folding a
 * rejected-anyway log can never become the denial of service.
 */
export const MAX_LOG_ENTRIES = 20000;

/**
 * The round cap — 24.
 *
 * `config.rounds` is not a number that is merely stored. `selectTeams` turns it directly
 * into `Array.from({ length: rounds })` ONCE PER PLAYER, and `BoardGrid` does the same for
 * its header row, both during render. A twenty-byte field — `"rounds": 4000000000` — is
 * therefore an out-of-memory abort wearing a small number's clothes, and neither the 5 MB
 * size gate nor the log cap constrains it, because it is one small number.
 *
 * Phase 1 drafts six. Twelve is already past anything PROJECT.md describes, and this
 * leaves room for the post-draft swap rounds on top of that. The cap is on the untrusted
 * boundary, not on the application: nothing here decides what a tournament may be, only
 * what an imported file may claim one was.
 */
export const MAX_ROUNDS = 24;

/**
 * The player cap — 64.
 *
 * PROJECT.md sizes this at 4–8 players and asks that higher counts not break, which is a
 * requirement about the draft engine rather than a licence for a file to declare a million
 * players. Sixty-four is more than a room, and `MAX_PLAYERS * MAX_ROUNDS` is 1536 board
 * cells — a big grid, not an allocation failure.
 */
export const MAX_PLAYERS = 64;

/**
 * The pool cap — 5000 ids.
 *
 * A pool is drawn from the roster, and the committed snapshot is 235 rows. Within the 5 MB
 * budget an unbounded `pool/built.ids` is roughly 1.5 million strings, every one of which
 * `PoolGrid` renders as a `MonCard`. Twenty times the current roster absorbs every
 * regulation rotation this project will ever see and still refuses that file.
 */
export const MAX_POOL_IDS = 5000;

/**
 * The swap-budget cap — 24.
 *
 * A budget is not a number that is merely stored either. It becomes a per-turn
 * interactive board cell for every swap still owed and a `n swaps left` countdown line
 * beside every team, so `"swapBudget": 4000000000` is an allocation failure wearing a
 * small number's clothes in exactly the way `rounds` is.
 *
 * Twenty-four is past anything a 4–8 player night describes — a player with more swaps
 * than the roster has rounds is not playing the game PROJECT.md documents — and it is
 * bounded INDEPENDENTLY of `MAX_ROUNDS` because the two numbers answer different
 * questions and would drift the moment either changed for its own reasons.
 */
export const MAX_SWAP_BUDGET = 24;

/**
 * The swap-round cap — 24.
 *
 * Each swap round is one full pass over every player, so this bounds a render loop of
 * `MAX_PLAYERS × MAX_SWAP_ROUNDS` — 1536 turns, a long night rather than a hang. Same
 * independence argument as {@link MAX_SWAP_BUDGET}: swap rounds run AFTER the pick
 * rounds, so `MAX_ROUNDS` does not constrain them.
 */
export const MAX_SWAP_ROUNDS = 24;

/**
 * The composition-rule cap — 8.
 *
 * The version 1 rule vocabulary has exactly one kind, so a well-formed file holds one
 * entry. The bound exists anyway, and it exists NOW rather than when a second kind ships:
 * an unbounded `rules` is an unbounded list of records this build would carry into state
 * and every rules-reading surface would render, and adding the bound later means adding it
 * to a boundary that already accepted files without it.
 */
export const MAX_COMPOSITION_RULES = 8;

/**
 * The Mega-forme ban cap — 5000.
 *
 * The same reasoning as {@link MAX_POOL_IDS}, against a smaller population: the committed
 * snapshot holds 76 Mega formes. Twenty times any roster this project will see absorbs
 * every regulation rotation and still refuses a file that declares a million bans.
 */
export const MAX_MEGA_FORME_BANS = 5000;

/**
 * The three keys that turn a data structure into a code path.
 *
 * `JSON.parse` itself does not invoke setters — it uses a data-property definition, so
 * parsing alone cannot pollute. The danger is everything that happens next: a recursive
 * merge, a bulk field copy, or an index assignment into an existing object will happily
 * walk one of these into `Object.prototype` and change the behaviour of every object in
 * the process. This file performs none of those operations, and drops the keys anyway,
 * because "the current implementation happens not to" is not a security property.
 */
const POISON_KEYS = ['__proto__', 'constructor', 'prototype'] as const;

export type ImportRejectionReason =
  /** Bigger than the size gate. Never parsed. */
  | 'tooLarge'
  /** Not JSON. */
  | 'notJson'
  /** JSON, but not a tournament this build recognises. */
  | 'wrongShape'
  /** A tournament from a newer build. */
  | 'newerSchema'
  /** A schema version this build has never supported. */
  | 'unknownSchema';

export type ImportResult =
  | { ok: true; doc: TournamentDoc }
  | { ok: false; reason: ImportRejectionReason };

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * A JSON object, and specifically not an array.
 *
 * Arrays pass `typeof === 'object'` and would then satisfy every property check by
 * having none of the properties, so excluding them explicitly is load-bearing.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether an object carries one of the poison keys as its OWN property.
 *
 * Checked with the prototype's own `hasOwnProperty` rather than the method on the value,
 * because the value's own `hasOwnProperty` may itself be attacker-supplied — which is
 * exactly the class of trick this function is looking for.
 */
function hasPoisonKey(value: Record<string, unknown>): boolean {
  for (const key of POISON_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  }
  return false;
}

/** A plain object that is also clean. Every descent into the parsed value goes through here. */
function safeObject(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  if (hasPoisonKey(value)) return null;
  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

/**
 * A fresh array of strings, or null. The copy is the point: no aliasing into state.
 *
 * `limit` is required rather than optional. Every string array in this document is
 * rendered — pool ids become cells, the starting order becomes turns — so an unbounded one
 * is an unbounded render, and making the caller name its bound means a new array field
 * cannot arrive without someone deciding what its bound is.
 */
function copyStringArray(value: unknown, limit: number): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > limit) return null;

  const copied: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    copied.push(item);
  }
  return copied;
}

/**
 * The permitted members of each string-literal union, as runtime data.
 *
 * A union exists only in the type system, so nothing about `BanMode` survives to check an
 * imported string against. These arrays are that check, and they are `as const` so the
 * compiler errors if one drifts from the union it mirrors.
 */
const BAN_MODES: readonly BanMode[] = ['hostBanlist', 'blind', 'snake'];
const DEPTHS: readonly TournamentDepth[] = ['draftOnly', 'draftAndBrackets', 'draftBracketsAndLog'];
const DUAL_MEGA_FORMES: readonly DualMegaForme[] = ['x', 'y', 'either'];
const COMPOSITION_RULE_KINDS: readonly CompositionRule['kind'][] = ['mega'];
const ROUND_KINDS: readonly RoundKind[] = ['mega', 'open'];

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/**
 * A recorded seed, `0` when the key is absent, or `null` when it is present and wrong.
 *
 * `null` is the refusal and `0` is the version 1 answer, which is why this returns a
 * number rather than a boolean: a version 1 `pool/built` recorded no seed because there
 * was no second draw to record, and `0` says that rather than inventing one.
 *
 * A seed is a non-negative safe integer here — `newSeed()` draws a `Uint32` — and NOT
 * merely a finite number. The looser check would let a fractional seed through the
 * boundary and then be dropped by `isPoolBuiltAction` one step later, which imports a
 * document successfully and folds it to an empty pool with nothing said.
 */
function optionalSeed(value: unknown): number | null {
  if (value === undefined) return 0;
  if (!isNonNegativeInteger(value)) return null;
  return value;
}

/** The same absent-versus-malformed rule for a bounded count. */
function optionalCount(value: unknown, limit: number): number | null {
  if (value === undefined) return 0;
  if (!isNonNegativeInteger(value) || value > limit) return null;
  return value;
}

// ---------------------------------------------------------------------------
// The allow-list rebuild
// ---------------------------------------------------------------------------

function buildPlayers(value: unknown): PlayerConfig[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.length > MAX_PLAYERS) return null;

  const players: PlayerConfig[] = [];
  for (const raw of value) {
    const entry = safeObject(raw);
    if (entry === null) return null;

    const id = entry['id'];
    const name = entry['name'];
    if (!isNonEmptyString(id) || typeof name !== 'string') return null;

    // Two named fields, written out. A player carrying a third field loses it here, which
    // is the intended outcome rather than a limitation.
    players.push({ id, name });
  }

  // Ids are the key everything else in the document references. Duplicates would make
  // `selectTeams` and `selectCurrentTurn` disagree about who is who.
  const ids = new Set(players.map((player) => player.id));
  if (ids.size !== players.length) return null;

  return players;
}

/**
 * The host's dual-Mega rulings, rebuilt element by element.
 *
 * Modelled on {@link buildPlayers} in every respect that matters: a non-array is refused,
 * the length is bounded, each element goes through `safeObject`, and exactly two named
 * fields are written out — so an element carrying a third loses it, which is the intended
 * outcome rather than a limitation. Duplicate `speciesId` values are refused for the same
 * reason duplicate player ids are: two rulings for one species means the renderer picks
 * one arbitrarily and the host cannot tell which.
 */
function buildDualMegaChoices(value: unknown): DualMegaChoice[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_POOL_IDS) return null;

  const choices: DualMegaChoice[] = [];
  for (const raw of value) {
    const entry = safeObject(raw);
    if (entry === null) return null;

    const speciesId = entry['speciesId'];
    const forme = entry['forme'];
    if (!isNonEmptyString(speciesId) || !isOneOf(forme, DUAL_MEGA_FORMES)) return null;

    choices.push({ speciesId, forme });
  }

  const ids = new Set(choices.map((choice) => choice.speciesId));
  if (ids.size !== choices.length) return null;

  return choices;
}

/**
 * The composition rule list, rebuilt and bounded by the document's own round count.
 *
 * `kind` is checked against {@link COMPOSITION_RULE_KINDS} rather than merely against
 * `typeof 'string'`, so a file cannot declare a rule kind this build has no compiler for
 * and then be folded into a draft that silently ignores it — T-03-02.
 *
 * `count` is bounded by `rounds` for the reason `megasRequiredPerTeam` is: a rule
 * requiring more Mega slots than the document has picks is unsatisfiable by arithmetic,
 * and the sentence that would explain it names a field on a screen the host is no longer
 * looking at. `rounds <= MAX_ROUNDS` already holds at the call site, so this is strictly
 * tighter and needs no second bound.
 */
function buildCompositionRules(value: unknown, rounds: number): CompositionRule[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_COMPOSITION_RULES) return null;

  const rules: CompositionRule[] = [];
  for (const raw of value) {
    const entry = safeObject(raw);
    if (entry === null) return null;

    const kind = entry['kind'];
    const count = entry['count'];
    if (!isOneOf(kind, COMPOSITION_RULE_KINDS)) return null;
    if (!isNonNegativeInteger(count) || count > rounds) return null;

    rules.push({ kind, count });
  }

  return rules;
}

/**
 * One compiled schedule, rebuilt spec by spec.
 *
 * `kind` is checked against the union rather than accepted as a string, for the reason
 * `buildCompositionRules` gives about rule kinds: a file must not be able to declare a
 * round type this build has no pool filter, no swap predicate and no export rule for, and
 * then be folded into a draft that silently ignores it (T-03-07).
 *
 * `index` is required to be a positive integer and nothing more. Whether it AGREES with its
 * array position is `isScheduleCompiledAction`'s check, run by `apply` on every fold — this
 * function's job is to bound the shape, and an entry that survives here and is then ignored
 * by the reducer is the layering working rather than a gap in it.
 */
function buildRoundSpecs(value: unknown): RoundSpec[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_ROUNDS) return null;

  const specs: RoundSpec[] = [];
  for (const raw of value) {
    const entry = safeObject(raw);
    if (entry === null) return null;

    const index = entry['index'];
    const kind = entry['kind'];
    if (!isPositiveInteger(index)) return null;
    if (!isOneOf(kind, ROUND_KINDS)) return null;

    specs.push({ index, kind });
  }

  return specs;
}

/**
 * The config, rebuilt.
 *
 * ## Absent versus malformed — the distinction this function turns on
 *
 * The six keys schema version 2 added and the four version 3 added are all OPTIONAL here,
 * and that is forced by ordering rather than chosen for leniency: this function runs
 * inside `buildDoc`, and `buildDoc` runs BEFORE `migrate`. Requiring them would therefore
 * refuse every older document at the shape check, one step before the migration that
 * exists to upgrade it could run — and the host would be shown a sentence about their file
 * not being a Champions Drafter tournament, which would be false.
 *
 * A key that is PRESENT and wrong is still refused, and refused for the whole config. That
 * keeps this file's posture intact: repairing untrusted input is worse than refusing it.
 * Supplying a value for a key that is not there is not repair, it is migration, and the
 * values come from ONE place — `V1_CONFIG_DEFAULTS` and `V2_CONFIG_DEFAULTS` in
 * `migrate.ts` — so the guard and the migration cannot disagree about what an older
 * tournament was.
 *
 * `rules` is the version 3 field with the same shape of exception `poolSize` has: absent,
 * it is DERIVED from `megasRequiredPerTeam` rather than defaulted, because the document is
 * already carrying the true answer.
 *
 * `poolSize` is the exception with a reason: absent, it falls back to `players × rounds`,
 * which is provisional. `migrateV1ToV2` replaces it with the length of the `pool/built`
 * ids, because that is the number that actually produced the pool. This function cannot do
 * that itself — it types every log entry in isolation and never reads one field against
 * another, which is the same rule the `draft/started` case states as "a bound is not an
 * integrity check".
 */
function buildConfig(value: unknown): TournamentConfig | null {
  const raw = safeObject(value);
  if (raw === null) return null;

  const players = buildPlayers(raw['players']);
  if (players === null) return null;

  // Refused, not clamped. Clamping 4000000000 down to 24 would load a document that
  // claims to be a tournament nobody played, under a board the host would have no reason
  // to distrust — and this file's whole posture is that repairing untrusted input is worse
  // than refusing it.
  const rounds = raw['rounds'];
  if (!isPositiveInteger(rounds) || rounds > MAX_ROUNDS) return null;

  const formatLabel = raw['formatLabel'];
  const rosterVersion = raw['rosterVersion'];
  const rosterChecksum = raw['rosterChecksum'];
  if (
    typeof formatLabel !== 'string' ||
    typeof rosterVersion !== 'string' ||
    typeof rosterChecksum !== 'string'
  ) {
    return null;
  }

  // Every count below is bounded, and bounded separately from the size gate, for the
  // reason the file header gives: a count is a few bytes and an allocation. `poolSize`
  // becomes pool cells, `bans` becomes struck-through rows, `dualMegaChoices` becomes a
  // form control each.
  const rawPoolSize = raw['poolSize'];
  let poolSize = players.length * rounds;
  if (rawPoolSize !== undefined) {
    if (!isPositiveInteger(rawPoolSize) || rawPoolSize > MAX_POOL_IDS) return null;
    poolSize = rawPoolSize;
  }

  let bans: string[] = [...V1_CONFIG_DEFAULTS.bans];
  if (raw['bans'] !== undefined) {
    const copied = copyStringArray(raw['bans'], MAX_POOL_IDS);
    if (copied === null) return null;
    bans = copied;
  }

  let banMode: BanMode = V1_CONFIG_DEFAULTS.banMode;
  if (raw['banMode'] !== undefined) {
    if (!isOneOf(raw['banMode'], BAN_MODES)) return null;
    banMode = raw['banMode'];
  }

  // Bounded by THIS DOCUMENT'S round count rather than by an arbitrary number: a team
  // cannot be required to hold more Megas than it has picks to spend on them. `rounds` was
  // validated above and `rounds <= MAX_ROUNDS` already holds, so this is strictly tighter
  // and needs no second bound.
  //
  // The looser `MAX_ROUNDS` bound this replaced was not merely imprecise. A file declaring
  // `rounds: 6, megasRequiredPerTeam: 10` was accepted, and the accepted document then
  // reached `feasibilityNotice` in `app.tsx` — which renders "at most 6 of them can be
  // Megas. Lower the Megas required per team." on the DRAFT screen, where no such field
  // exists to lower. This file's posture is refuse, do not repair; the old bound did
  // neither.
  let megasRequiredPerTeam: number = V1_CONFIG_DEFAULTS.megasRequiredPerTeam;
  if (raw['megasRequiredPerTeam'] !== undefined) {
    const value_ = raw['megasRequiredPerTeam'];
    if (!isNonNegativeInteger(value_) || value_ > rounds) return null;
    megasRequiredPerTeam = value_;
  }

  let dualMegaChoices: DualMegaChoice[] = [...V1_CONFIG_DEFAULTS.dualMegaChoices];
  if (raw['dualMegaChoices'] !== undefined) {
    const built = buildDualMegaChoices(raw['dualMegaChoices']);
    if (built === null) return null;
    dualMegaChoices = built;
  }

  let depth: TournamentDepth = V1_CONFIG_DEFAULTS.depth;
  if (raw['depth'] !== undefined) {
    if (!isOneOf(raw['depth'], DEPTHS)) return null;
    depth = raw['depth'];
  }

  // ABSENT means derived, not defaulted, and derived from the value validated above — the
  // same wrap `migrateV2ToV3` performs, so a file that predates the field and a file that
  // was migrated say the same thing about the same tournament. PRESENT is typed like every
  // other field here: each entry's `kind` against the union, each `count` against this
  // document's own `rounds`, for the reason `megasRequiredPerTeam` carries that bound.
  //
  // What this does NOT do: compare `rules[0].count` against `megasRequiredPerTeam`, or
  // `megaFormeBans` against a roster. Those are referential-integrity checks, and a bound
  // is not an integrity check. A disagreement between the two shapes of the same fact
  // surfaces as the non-blocking feasibility notice on adoption, never as a refused file.
  let rules: CompositionRule[] = [{ kind: 'mega', count: megasRequiredPerTeam }];
  if (raw['rules'] !== undefined) {
    const built = buildCompositionRules(raw['rules'], rounds);
    if (built === null) return null;
    rules = built;
  }

  let megaFormeBans: string[] = [...V2_CONFIG_DEFAULTS.megaFormeBans];
  if (raw['megaFormeBans'] !== undefined) {
    const copied = copyStringArray(raw['megaFormeBans'], MAX_MEGA_FORME_BANS);
    if (copied === null) return null;
    megaFormeBans = copied;
  }

  let swapBudget: number = V2_CONFIG_DEFAULTS.swapBudget;
  if (raw['swapBudget'] !== undefined) {
    const value_ = raw['swapBudget'];
    if (!isNonNegativeInteger(value_) || value_ > MAX_SWAP_BUDGET) return null;
    swapBudget = value_;
  }

  let swapRounds: number = V2_CONFIG_DEFAULTS.swapRounds;
  if (raw['swapRounds'] !== undefined) {
    const value_ = raw['swapRounds'];
    if (!isNonNegativeInteger(value_) || value_ > MAX_SWAP_ROUNDS) return null;
    swapRounds = value_;
  }

  return {
    formatLabel,
    players,
    rounds,
    rosterVersion,
    rosterChecksum,
    poolSize,
    bans,
    banMode,
    megasRequiredPerTeam,
    dualMegaChoices,
    depth,
    rules,
    megaFormeBans,
    swapBudget,
    swapRounds,
  };
}

/**
 * One log entry: the envelope every action has, plus the payload its type declares.
 *
 * Known types are rebuilt field by field. An UNKNOWN type keeps its envelope and loses
 * its payload, which is a deliberate and slightly uncomfortable trade. `apply` is
 * required to fold an action type this build has never heard of without crashing (sync
 * rule 11), so dropping such entries entirely would be wrong — it would renumber nothing
 * but would silently shorten a newer client's history. Keeping the payload would mean
 * copying arbitrary attacker-shaped structure into state, which is the one thing this
 * file exists to prevent. So the event is preserved as having happened, and what it said
 * is not. Re-exporting such a document loses those payloads; that is stated here rather
 * than discovered later.
 */
function buildLogEntry(value: unknown): Action | null {
  const raw = safeObject(value);
  if (raw === null) return null;

  const type = raw['type'];
  const seq = raw['seq'];
  const at = raw['at'];
  const actorId = raw['actorId'];

  if (typeof type !== 'string') return null;
  if (!isNonNegativeInteger(seq)) return null;
  if (!isFiniteNumber(at)) return null;
  if (typeof actorId !== 'string') return null;

  const envelope = { seq, at, actorId };

  switch (type) {
    case 'pool/built': {
      const ids = copyStringArray(raw['ids'], MAX_POOL_IDS);
      const rosterVersion = raw['rosterVersion'];
      const checksum = raw['checksum'];
      if (ids === null || typeof rosterVersion !== 'string' || typeof checksum !== 'string') {
        return null;
      }

      // Absent versus malformed again, and for the same ordering reason `buildConfig`
      // gives: a version 1 `pool/built` predates both of these fields, and refusing it
      // here would refuse the very entry `migrateV1ToV2` recovers `poolSize` from.
      const seed = optionalSeed(raw['seed']);
      if (seed === null) return null;

      const megaCapableCount = optionalCount(raw['megaCapableCount'], MAX_POOL_IDS);
      if (megaCapableCount === null) return null;

      return {
        type: 'pool/built',
        ids,
        rosterVersion,
        checksum,
        seed,
        megaCapableCount,
        ...envelope,
      };
    }

    case 'schedule/compiled': {
      // Bounded by MAX_ROUNDS rather than by `config.rounds`, and the distinction is the
      // one this file keeps everywhere: a bound is not an integrity check. A count reaches
      // the renderer as an allocation — four hundred specs is four hundred board columns,
      // and the size gate does not constrain it, because four hundred two-key objects is a
      // few KB (T-03-06). Whether the length AGREES with the document's round count is
      // `canApply`'s question on origination and `selectSchedule`'s on fold; neither is
      // this function's, which types every entry in isolation.
      const rounds = buildRoundSpecs(raw['rounds']);
      if (rounds === null) return null;
      return { type: 'schedule/compiled', rounds, ...envelope };
    }

    case 'draft/started': {
      // Bounded by the player cap rather than by `config.players`. Checking it against the
      // configured roster would be referential integrity, which this function deliberately
      // does not do — every entry is typed in isolation. A bound is not an integrity check.
      const order = copyStringArray(raw['order'], MAX_PLAYERS);
      if (order === null) return null;

      const seed = optionalSeed(raw['seed']);
      if (seed === null) return null;

      return { type: 'draft/started', order, seed, ...envelope };
    }

    case 'draft/pickMade': {
      const playerId = raw['playerId'];
      const monId = raw['monId'];
      const round = raw['round'];
      const pickIndex = raw['pickIndex'];
      if (typeof playerId !== 'string' || typeof monId !== 'string') return null;
      if (!isPositiveInteger(round) || !isNonNegativeInteger(pickIndex)) return null;
      return { type: 'draft/pickMade', playerId, monId, round, pickIndex, ...envelope };
    }

    case 'draft/pickUndone': {
      const targetSeq = raw['targetSeq'];
      if (!isNonNegativeInteger(targetSeq)) return null;
      return { type: 'draft/pickUndone', targetSeq, ...envelope };
    }

    default:
      // Envelope only. The cast is honest about what is happening: `TournamentDoc.log` is
      // typed as actions this build understands, and this is an action it does not.
      // `apply` reaches its `default` branch and returns the state unchanged.
      return { type, ...envelope } as unknown as Action;
  }
}

/**
 * The log, bounded, typed, and in an order the reducer can rely on.
 *
 * `seq` must start at zero and strictly increase. Uniqueness is the requirement that
 * actually matters — `draft/pickUndone` names the pick it retracts BY seq, so two entries
 * sharing one would retract an arbitrary one of the two — and monotonicity is what makes
 * `store.ts`'s `max(seq) + 1` allocate a number the log has never used.
 *
 * Gaps are ALLOWED, and that is a considered departure from this plan's prose, which
 * asked for "0, 1, 2, … with no gaps". `store.ts` allocates from `max(seq) + 1` rather
 * than `log.length` for the express purpose of surviving a removal from the middle of the
 * log, which Phase 2 performs the moment undo has card plays and bans to step over. A
 * contiguity requirement would therefore make this application refuse a file it had
 * written itself, which is a worse failure than the one it would be guarding against —
 * and it would guard against nothing, because the reducer reads the log in array order
 * and never treats a `seq` as an index.
 */
function buildLog(value: unknown): Action[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_LOG_ENTRIES) return null;

  const log: Action[] = [];
  let previousSeq = -1;

  for (const raw of value) {
    const entry = buildLogEntry(raw);
    if (entry === null) return null;

    if (log.length === 0 && entry.seq !== 0) return null;
    if (entry.seq <= previousSeq) return null;
    previousSeq = entry.seq;

    log.push(entry);
  }

  return log;
}

/**
 * The whole tournament, rebuilt.
 *
 * Returns null for anything that is not one. The version question is NOT asked here —
 * `parseTournamentFile` asks `migrate` separately, because "this is not a tournament" and
 * "this is a tournament I cannot read" are different sentences on screen.
 */
function buildDoc(value: unknown): TournamentDoc | null {
  const raw = safeObject(value);
  if (raw === null) return null;

  const schemaVersion = raw['schemaVersion'];
  if (typeof schemaVersion !== 'number') return null;

  const id = raw['id'];
  if (!isNonEmptyString(id)) return null;

  const createdAt = raw['createdAt'];
  if (!isNonNegativeInteger(createdAt)) return null;

  const config = buildConfig(raw['config']);
  if (config === null) return null;

  const rng = safeObject(raw['rng']);
  if (rng === null) return null;
  if (!isFiniteNumber(rng['seed']) || !isNonNegativeInteger(rng['cursor'])) return null;

  const log = buildLog(raw['log']);
  if (log === null) return null;

  // Six named fields. This object literal IS the allow-list; there is no second place to
  // keep it in sync with.
  return {
    schemaVersion,
    id,
    createdAt,
    config,
    rng: { seed: rng['seed'], cursor: rng['cursor'] },
    log,
  };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Whether a already-parsed value is a tournament this build can fold.
 *
 * The predicate half of the guard, for `persistence.load()`. A stored record has already
 * been through `JSON.parse` by the time it gets here, so the reviver below never saw it
 * and the poison-key check inside `safeObject` is the only thing standing between a
 * hand-edited `localStorage` entry and the same treatment a hostile file gets.
 *
 * Deliberately narrower than "would fold without throwing": it answers "is this a
 * tournament", so a corrupt autosave is discarded rather than partially restored.
 */
export function isValidTournament(value: unknown): value is TournamentDoc {
  const doc = buildDoc(value);
  if (doc === null) return false;
  return migrate(doc).ok;
}

/**
 * Validate a file's text and hand back a tournament, or a reason and nothing.
 *
 * `byteLength` is measured by the adapter that read the file, before the text was ever
 * in hand — the core may not measure it, and the whole value of the size gate is that it
 * runs before the parse.
 */
export function parseTournamentFile(text: string, byteLength: number): ImportResult {
  // 1. Size, first, and without looking at the text.
  if (byteLength > MAX_IMPORT_BYTES) return { ok: false, reason: 'tooLarge' };

  // 2. Parse, with the poison keys dropped at the boundary.
  //
  // The reviver both removes the key and records that it was there. Removal alone would
  // be sanitising — the file would load, minus a payload the host never learns about —
  // and this app's own exports never contain these keys, so their presence is positive
  // evidence that the file is not one of ours.
  let poisoned = false;
  let parsed: unknown;

  try {
    parsed = JSON.parse(text, (key: string, item: unknown): unknown => {
      if (POISON_KEYS.includes(key as (typeof POISON_KEYS)[number])) {
        poisoned = true;
        return undefined;
      }
      return item;
    });
  } catch {
    return { ok: false, reason: 'notJson' };
  }

  if (poisoned) return { ok: false, reason: 'wrongShape' };

  // 3. Rebuild from the allow-list.
  const doc = buildDoc(parsed);
  if (doc === null) return { ok: false, reason: 'wrongShape' };

  // 4. Version, last, so a well-formed document from a newer build gets the sentence
  //    about reloading rather than the one about choosing a different file.
  const migrated = migrate(doc);
  if (!migrated.ok) return { ok: false, reason: migrated.reason };

  return { ok: true, doc: migrated.doc };
}
