/**
 * migrate.ts — PERS-07. The version decision, in one place, before there is a decision.
 *
 * Five schema versions now, and one arm each. The file was written while version 1 was
 * still a passthrough and it did nothing, and the reason it existed anyway was structural
 * rather than anticipatory: the alternative to a named home for version handling is
 * `if (doc.someNewField === undefined)` accreting across the reducer, the selectors and
 * the guard, at which point the question "can this build read this file" has no answer
 * that lives anywhere. Four bumps later there are four upgrade arms and a chain that
 * runs them in order, all in one place, which is what that structure bought.
 *
 * ## Refusal is a feature
 *
 * A document from a newer build is refused rather than read optimistically. This is the
 * T-01-02 mitigation, and the trade it makes is deliberate: a host who is told to reload
 * has lost a few seconds, while a host whose newer tournament was silently half-read has
 * lost the parts this build did not understand — and will not find out until the parts
 * are missing from a bracket three weeks later. `apply` tolerating an unknown *action* is
 * a different question with a different answer (sync rule 11): one unreadable event in a
 * readable document is survivable, one unreadable document is not.
 *
 * Pure, like everything under `src/core`. It reads its argument and nothing else.
 */

import { SCHEMA_VERSION, type TournamentConfig, type TournamentDoc } from './model';

/**
 * The version 2 config shape: `TournamentConfig` minus everything version 3 added.
 *
 * Written as an `Omit` rather than as a cast so that each arm below stays strictly typed
 * against the shape it actually produces. `migrateV1ToV2` returns a document that is NOT
 * a `TournamentDoc` any more — it is missing four required fields — and saying so in the
 * type is what keeps `migrateV2ToV3` from being optional in the chain. A current
 * `TournamentDoc` is still assignable to {@link V2Doc}, which is what lets the version 2
 * arm hand `migrate`'s own argument straight to `migrateV2ToV3`.
 */
type V2Config = Omit<V3Config, 'rules' | 'megaFormeBans' | 'swapBudget' | 'swapRounds'>;

type V2Doc = Omit<TournamentDoc, 'config'> & { config: V2Config };

/**
 * The version 3 config shape: `TournamentConfig` minus everything version 4 added.
 *
 * Same `Omit`-rather-than-cast construction as {@link V2Config}, and the same payoff:
 * `migrateV2ToV3` now returns a document that is NOT a `TournamentDoc` — it is missing two
 * required fields — and saying so in the type is what makes `migrateV3ToV4` mandatory in
 * the chain rather than something the next arm can forget to call. A current
 * `TournamentDoc` is still assignable to {@link V3Doc}, which is what lets the version 3
 * arm hand `migrate`'s own argument straight to `migrateV3ToV4`.
 */
type V3Config = Omit<V4Config, 'bansPerPlayer' | 'duplicateBanPolicy'>;

type V3Doc = Omit<TournamentDoc, 'config'> & { config: V3Config };

/**
 * The version 4 config shape: `TournamentConfig` minus everything version 5 added.
 *
 * Same `Omit`-rather-than-cast construction as {@link V2Config} and {@link V3Config}, and
 * the same payoff: `migrateV3ToV4` now returns a document that is NOT a `TournamentDoc` —
 * it is missing three required fields — and saying so in the type is what makes
 * {@link migrateV4ToV5} mandatory in the chain rather than something the previous arm can
 * forget to call. A current `TournamentDoc` is still assignable to {@link V4Doc}, which is
 * what lets the version 4 arm hand `migrate`'s own argument straight to `migrateV4ToV5`.
 *
 * The older aliases are defined in terms of this one rather than of `TournamentConfig`
 * directly, so that a sixth version widens the chain in one place instead of four.
 */
type V4Config = Omit<TournamentConfig, 'matchMetric' | 'roundRobinFormat' | 'bracketFormat'>;

type V4Doc = Omit<TournamentDoc, 'config'> & { config: V4Config };

/**
 * Every version this build can fold.
 *
 * A list rather than a floor, because a future version 3 that can still read 1 but not 2
 * is a real possibility and a `>= MIN` check could not express it. Kept in sync with
 * `SCHEMA_VERSION` by test, not by hope.
 */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2, 3, 4, 5];

/**
 * What every version 2 config field is worth in a version 1 document.
 *
 * One place, and `import-guard.buildConfig` imports it rather than repeating the literals:
 * the guard has to know these values because it rebuilds a config for a document whose
 * version it has not asked about yet, and two copies of a default table is two tables that
 * can disagree about what a Phase 1 tournament was.
 *
 * `poolSize` is deliberately NOT here. It is the one field with a real answer rather than a
 * default — the length of the `pool/built` ids the log already carries — so defaulting it
 * would be inventing a number when the document is holding the true one.
 */
export const V1_CONFIG_DEFAULTS = {
  bans: [],
  banMode: 'hostBanlist',
  megasRequiredPerTeam: 0,
  dualMegaChoices: [],
  depth: 'draftOnly',
} as const;

/**
 * What every version 3 config field is worth in a version 2 document.
 *
 * Same contract as {@link V1_CONFIG_DEFAULTS}: one place, imported by
 * `import-guard.buildConfig` rather than repeated, because two copies of a default table
 * is two tables that can disagree about what a Phase 2 tournament was.
 *
 * `rules` is deliberately NOT here, for exactly the reason `poolSize` is absent from the
 * version 1 table. A version 2 document is already carrying the true answer in
 * `megasRequiredPerTeam`, so defaulting the rule list would be inventing a number the
 * document is holding. It is DERIVED — `[{ kind: 'mega', count: megasRequiredPerTeam }]` —
 * and both `migrateV2ToV3` and the import guard derive it the same way, so a file that
 * predates the field and a file that was migrated agree about what it says.
 */
export const V2_CONFIG_DEFAULTS = {
  megaFormeBans: [],
  swapBudget: 0,
  swapRounds: 0,
} as const;

/**
 * What every version 4 config field is worth in a version 3 document.
 *
 * Same contract as {@link V1_CONFIG_DEFAULTS} and {@link V2_CONFIG_DEFAULTS}: one place,
 * imported by `import-guard.buildConfig` rather than repeated, because two copies of a
 * default table is two tables that can disagree about what a Phase 3 tournament was.
 *
 * Both values are LOSSLESS rather than merely reasonable, and the argument is specific to
 * this bump. A version 3 document was necessarily `hostBanlist`: `blind` and `snake`
 * shipped disabled on the Phase 3 config screen, so no version 3 tournament could have had
 * per-player bans at all. `0` is therefore the true answer for every document that exists
 * at version 3, and `'bothApply'` answers a question those tournaments never asked.
 *
 * **`bansPerPlayer: 0` is deliberately a DIFFERENT number from the config screen's default
 * of `1`, and the two constants must not be unified.** They answer different questions.
 * This one answers "what did a tournament saved before the field existed do?" — nothing.
 * The screen's answers "what should a host who has just chosen blind bans see?" — one ban,
 * because zero would make the mode they just picked do nothing. A shared constant would
 * have to be wrong for one of them.
 */
export const V3_CONFIG_DEFAULTS = {
  bansPerPlayer: 0,
  duplicateBanPolicy: 'bothApply',
} as const;

/**
 * What every version 5 config field is worth in a version 4 document.
 *
 * Same contract as the three tables above: one place, imported by
 * `import-guard.buildConfig` rather than repeated, because two copies of a default table
 * is two tables that can disagree about what a Phase 4 tournament was.
 *
 * All three values are LOSSLESS rather than merely reasonable, and the argument here is
 * narrower and stronger than any bump before it. **A version 4 document has no
 * `tournament/*` entries at all, because nothing in this build before Phase 5 could
 * originate one.** There is therefore no recorded match anywhere in such a document for a
 * metric to score or a stage format to describe — which means every value is vacuously
 * true for every document that exists at version 4, rather than a guess standing in for
 * one. Nothing is DERIVED here either, unlike `rules` in the version 2 table: no version 4
 * document is carrying a better answer anywhere for the code to recover.
 *
 * **Whether these coincide with the config screen's own defaults is a separate question
 * from whether they are right here, and the two constants must not be unified.** This
 * table answers "what did a tournament saved before the field existed do?" — nothing, at
 * either stage, by any metric. The screen's defaults answer "what should a host who has
 * just opened the tournament controls see?" As it happens the screen also opens on
 * `pokemonLeft` and `bo1`, because those are the gentlest starting points for a host who
 * has not thought about either question — but that is a coincidence of two defensible
 * answers, not a shared fact. `V3_CONFIG_DEFAULTS.bansPerPlayer` is the precedent for why
 * that distinction is kept: there the two answers DIFFER, and a shared constant would have
 * had to be wrong for one of them.
 */
export const V4_CONFIG_DEFAULTS = {
  matchMetric: 'pokemonLeft',
  roundRobinFormat: 'bo1',
  bracketFormat: 'bo1',
} as const;

export type MigrateRejectionReason =
  /** Written by a build newer than this one. Reload and try again. */
  | 'newerSchema'
  /** A version this build has never supported. Not forward, not backward — unknown. */
  | 'unknownSchema';

export type MigrateResult =
  | { ok: true; doc: TournamentDoc }
  | { ok: false; reason: MigrateRejectionReason };

/**
 * Bring a document up to the current schema, or decline to.
 *
 * Returns a result rather than throwing, because the caller's job is to pick one of two
 * specified sentences to show the host, and an exception is a worse way to carry a
 * two-valued answer than a two-valued answer.
 */
/**
 * The number of ids the first `pool/built` recorded, or `null` when the log holds none.
 *
 * Defensive about the shape because of who calls it: `persistence.load` hands `migrate`
 * the object `JSON.parse` produced, NOT a document the import guard rebuilt. The type
 * says `Action[]`; the value is whatever was in `localStorage`.
 */
/** A recorded number, or `0` for the version 1 case where the field did not exist. */
function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function recordedPoolSize(log: TournamentDoc['log']): number | null {
  for (const action of log) {
    if (action.type !== 'pool/built') continue;
    const ids: unknown = (action as { ids?: unknown }).ids;
    if (Array.isArray(ids)) return ids.length;
  }
  return null;
}

/**
 * Version 1 to version 2.
 *
 * Two things happen here and both are upgrades rather than repairs.
 *
 * **The config gains six fields.** Five come from {@link V1_CONFIG_DEFAULTS} and are
 * lossless by definition — a version 1 tournament had no bans, required no Megas and
 * ended at the last pick, so there is nothing to lose. The sixth, `poolSize`, is
 * RECOVERED rather than defaulted: the first `pool/built` in the log is holding the ids
 * that were actually drawn, and their count is the true pool size rather than an estimate.
 * `players × rounds` is the fallback for a document whose draft never got as far as
 * building a pool, and only for that.
 *
 * That recovery cannot live in `import-guard.buildConfig`, which is why the guard's
 * `poolSize` is explicitly provisional: the guard types every log entry in isolation and
 * never reads one field of the document against another — "a bound is not an integrity
 * check". Reading the log to answer a question about the config is exactly the kind of
 * cross-field reasoning this module is allowed to do and that one is not.
 *
 * **The log's `pool/built` and `draft/started` entries gain their seeds.** This is not
 * bookkeeping. `isPoolBuiltAction` requires `seed` and `megaCapableCount`, so a v1 entry
 * left as it was folds to "ignored" — and a restored Phase 1 draft would open with an
 * empty pool, no error message, and every cell unavailable. `0` is the honest value: no
 * second draw was ever rolled, so there is no seed to record.
 *
 * Never mutates its argument. Every object it returns is a fresh literal, because the
 * caller in the persistence path is holding the parsed record and re-reads it afterwards.
 */
function migrateV1ToV2(doc: TournamentDoc): V2Doc {
  const { config } = doc;

  return {
    schemaVersion: 2,
    id: doc.id,
    createdAt: doc.createdAt,
    config: {
      formatLabel: config.formatLabel,
      players: config.players.map((player) => ({ id: player.id, name: player.name })),
      rounds: config.rounds,
      rosterVersion: config.rosterVersion,
      rosterChecksum: config.rosterChecksum,
      poolSize: recordedPoolSize(doc.log) ?? config.players.length * config.rounds,
      bans: [...V1_CONFIG_DEFAULTS.bans],
      banMode: V1_CONFIG_DEFAULTS.banMode,
      megasRequiredPerTeam: V1_CONFIG_DEFAULTS.megasRequiredPerTeam,
      dualMegaChoices: [...V1_CONFIG_DEFAULTS.dualMegaChoices],
      depth: V1_CONFIG_DEFAULTS.depth,
    },
    rng: { seed: doc.rng.seed, cursor: doc.rng.cursor },
    log: doc.log.map((action) => {
      // The declared type says these fields are there. The VALUE is a version 1 action, so
      // they are not, and the cast is what makes that gap visible instead of letting the
      // compiler assert its way past it — `TournamentDoc` describes version 2, and this
      // function's whole job is the input that does not match it yet.
      const raw = action as unknown as Record<string, unknown>;

      if (action.type === 'pool/built') {
        return {
          ...action,
          seed: numberOrZero(raw['seed']),
          megaCapableCount: numberOrZero(raw['megaCapableCount']),
        };
      }

      if (action.type === 'draft/started') {
        return { ...action, seed: numberOrZero(raw['seed']) };
      }

      return action;
    }),
  };
}

/**
 * Version 2 to version 3.
 *
 * Config only. Three fields come from {@link V2_CONFIG_DEFAULTS} and are lossless by
 * definition — a version 2 tournament banned no Mega formes, granted no swaps and ran no
 * swap rounds. The fourth, `rules`, is DERIVED rather than defaulted: the document is
 * already carrying `megasRequiredPerTeam`, and the rule list is that same fact in the
 * shape the compiler reads.
 *
 * `megasRequiredPerTeam` STAYS. It is still the host-facing number the config screen
 * shows and edits, while the compiler reads the list — one fact in two shapes, and 03-03
 * owns keeping them in step. Dropping the scalar here would blank a field the host typed.
 *
 * **The log is passed through unchanged, entry for entry.** This is the difference from
 * {@link migrateV1ToV2}, which rewrote entries because `isPoolBuiltAction` requires fields
 * a version 1 entry lacks. Nothing in schema 3 makes an existing entry unfoldable, so
 * there is no surgery to do — and splicing a synthetic `schedule/compiled` in would be
 * worse than doing nothing: it would need a fresh `seq` and would therefore be stamped
 * after picks it logically precedes. An empty `DraftState.schedule` folds as all-open,
 * which is precisely what a version 2 draft was.
 *
 * Never mutates its argument. Every object it returns is a fresh literal.
 */
function migrateV2ToV3(doc: V2Doc): V3Doc {
  const { config } = doc;

  return {
    schemaVersion: 3,
    id: doc.id,
    createdAt: doc.createdAt,
    config: {
      ...config,
      players: config.players.map((player) => ({ id: player.id, name: player.name })),
      bans: config.bans.map((id) => id),
      dualMegaChoices: config.dualMegaChoices.map((choice) => ({
        speciesId: choice.speciesId,
        forme: choice.forme,
      })),
      rules: [{ kind: 'mega', count: config.megasRequiredPerTeam }],
      megaFormeBans: [...V2_CONFIG_DEFAULTS.megaFormeBans],
      swapBudget: V2_CONFIG_DEFAULTS.swapBudget,
      swapRounds: V2_CONFIG_DEFAULTS.swapRounds,
    },
    rng: { seed: doc.rng.seed, cursor: doc.rng.cursor },
    log: [...doc.log],
  };
}

/**
 * Version 3 to version 4.
 *
 * Config only, and the smallest arm in the file: two scalars, both from
 * {@link V3_CONFIG_DEFAULTS}, both lossless for the reason stated beside that table — a
 * version 3 document was necessarily `hostBanlist`, so there is nothing to lose and
 * nothing to guess. Neither field is DERIVED, unlike `rules` in the arm above: no version
 * 3 document is carrying a better answer anywhere for the code to recover.
 *
 * **The log is passed through unchanged, entry for entry**, for {@link migrateV2ToV3}'s
 * stated reason. Nothing in schema 4 makes an existing entry unfoldable, and splicing a
 * synthetic ban action in would be worse than doing nothing: it would need a fresh `seq`
 * and would therefore be stamped after picks it logically precedes, describing a ban stage
 * that happened after the draft it was supposed to shape.
 *
 * Never mutates its argument. Every object it returns is a fresh literal, because the
 * caller in the persistence path is holding the parsed record and re-reads it afterwards.
 */
function migrateV3ToV4(doc: V3Doc): V4Doc {
  const { config } = doc;

  return {
    schemaVersion: 4,
    id: doc.id,
    createdAt: doc.createdAt,
    config: {
      ...config,
      players: config.players.map((player) => ({ id: player.id, name: player.name })),
      bans: config.bans.map((id) => id),
      dualMegaChoices: config.dualMegaChoices.map((choice) => ({
        speciesId: choice.speciesId,
        forme: choice.forme,
      })),
      rules: config.rules.map((rule) => ({ kind: rule.kind, count: rule.count })),
      megaFormeBans: config.megaFormeBans.map((id) => id),
      bansPerPlayer: V3_CONFIG_DEFAULTS.bansPerPlayer,
      duplicateBanPolicy: V3_CONFIG_DEFAULTS.duplicateBanPolicy,
    },
    rng: { seed: doc.rng.seed, cursor: doc.rng.cursor },
    log: [...doc.log],
  };
}

/**
 * Version 4 to version 5.
 *
 * Config only, and now the smallest arm in the file: three scalars, all from
 * {@link V4_CONFIG_DEFAULTS}, all lossless for the reason stated beside that table — a
 * version 4 document cannot contain a `tournament/*` entry, so there is no recorded match
 * for any of them to be wrong about. None of the three is DERIVED, unlike `rules` in the
 * version 2 arm: no version 4 document is carrying a better answer anywhere.
 *
 * **The log is passed through unchanged, entry for entry**, and here that is provable
 * rather than merely intended. Nothing in schema 5 makes an existing entry unfoldable, and
 * there is nothing to splice in: the five `tournament/*` types this schema introduces have
 * no version 4 counterpart to translate from. Synthesising one would need a fresh `seq`
 * and would describe a match played before the bracket that was supposed to schedule it.
 *
 * Never mutates its argument. Every object it returns is a fresh literal and every array
 * is rebuilt element by element (T-05-02), because the caller in the persistence path is
 * holding the parsed record and re-reads it afterwards — and because an imported
 * document's arrays are attacker-supplied objects that must not reach folded state.
 */
function migrateV4ToV5(doc: V4Doc): TournamentDoc {
  const { config } = doc;

  return {
    schemaVersion: 5,
    id: doc.id,
    createdAt: doc.createdAt,
    config: {
      ...config,
      players: config.players.map((player) => ({ id: player.id, name: player.name })),
      bans: config.bans.map((id) => id),
      dualMegaChoices: config.dualMegaChoices.map((choice) => ({
        speciesId: choice.speciesId,
        forme: choice.forme,
      })),
      rules: config.rules.map((rule) => ({ kind: rule.kind, count: rule.count })),
      megaFormeBans: config.megaFormeBans.map((id) => id),
      matchMetric: V4_CONFIG_DEFAULTS.matchMetric,
      roundRobinFormat: V4_CONFIG_DEFAULTS.roundRobinFormat,
      bracketFormat: V4_CONFIG_DEFAULTS.bracketFormat,
    },
    rng: { seed: doc.rng.seed, cursor: doc.rng.cursor },
    log: [...doc.log],
  };
}

export function migrate(doc: TournamentDoc): MigrateResult {
  const version = doc.schemaVersion;

  // A non-integer version is not a version. Rounding it would be guessing, and guessing
  // is the whole behaviour this module exists to refuse.
  if (!Number.isSafeInteger(version)) {
    return { ok: false, reason: 'unknownSchema' };
  }

  // The list is the gate, and stays the gate. Asking it first is what keeps it from
  // decaying into documentation: a version cannot be readable here without being on it.
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
    return {
      ok: false,
      reason: version > SCHEMA_VERSION ? 'newerSchema' : 'unknownSchema',
    };
  }

  // The chain of small upgrade steps this file's older comment predicted. Each version
  // gets one arm and one test; the current version is the passthrough, and it returns the
  // document by IDENTITY because a passthrough that rebuilt it would be doing undisclosed
  // work that a caller comparing references would notice.
  if (version === 5) return { ok: true, doc };
  if (version === 4) return { ok: true, doc: migrateV4ToV5(doc) };
  if (version === 3) return { ok: true, doc: migrateV4ToV5(migrateV3ToV4(doc)) };
  if (version === 2) return { ok: true, doc: migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(doc))) };
  if (version === 1) {
    return { ok: true, doc: migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(doc)))) };
  }

  // Reachable only by adding a version to the list without giving it an arm. Refusing is
  // the right answer to that: a version this function cannot name is one it cannot fold.
  return { ok: false, reason: 'unknownSchema' };
}
