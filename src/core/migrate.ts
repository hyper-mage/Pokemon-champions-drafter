/**
 * migrate.ts — PERS-07. The version decision, in one place, before there is a decision.
 *
 * There is one schema version and version 1 is a passthrough, so this file does nothing
 * today. It exists anyway, and the reason is structural rather than anticipatory: the
 * alternative to a named home for version handling is `if (doc.someNewField === undefined)`
 * accreting across the reducer, the selectors and the guard, at which point the question
 * "can this build read this file" has no answer that lives anywhere.
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

import { SCHEMA_VERSION, type TournamentDoc } from './model';

/**
 * Every version this build can fold.
 *
 * A list rather than a floor, because a future version 3 that can still read 1 but not 2
 * is a real possibility and a `>= MIN` check could not express it. Kept in sync with
 * `SCHEMA_VERSION` by test, not by hope.
 */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2];

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
function migrateV1ToV2(doc: TournamentDoc): TournamentDoc {
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
  if (version === 2) return { ok: true, doc };
  if (version === 1) return { ok: true, doc: migrateV1ToV2(doc) };

  // Reachable only by adding a version to the list without giving it an arm. Refusing is
  // the right answer to that: a version this function cannot name is one it cannot fold.
  return { ok: false, reason: 'unknownSchema' };
}
