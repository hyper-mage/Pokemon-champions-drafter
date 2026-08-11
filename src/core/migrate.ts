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
export function migrate(doc: TournamentDoc): MigrateResult {
  const version = doc.schemaVersion;

  // A non-integer version is not a version. Rounding it would be guessing, and guessing
  // is the whole behaviour this module exists to refuse.
  if (!Number.isSafeInteger(version)) {
    return { ok: false, reason: 'unknownSchema' };
  }

  if (SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
    // Version 1 is the current version, so there is nothing to do and the document is
    // returned by identity. When version 2 arrives, this becomes a chain of small
    // upgrade steps and each one gets its own test.
    return { ok: true, doc };
  }

  if (version > SCHEMA_VERSION) {
    return { ok: false, reason: 'newerSchema' };
  }

  return { ok: false, reason: 'unknownSchema' };
}
