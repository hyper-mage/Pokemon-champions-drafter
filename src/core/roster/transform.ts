/**
 * Pure classification of upstream Showdown species records into a roster
 * snapshot.
 *
 * Shared by `scripts/build-roster.mjs` at build time and, eventually, by an
 * in-browser roster refresh. Identical logic, different byte source — that
 * sharing is the whole point of the pipeline design (ARCHITECTURE, "Roster
 * Snapshot Pipeline"). Nothing here reads a clock, a network, storage, the
 * DOM, or a random number; `generatedAt` and the checksum are supplied or
 * added by the impure caller.
 *
 * Identity discipline (PITFALLS Pitfall 4, "two fields, never one"): `id` is
 * used for all equality, keying and set membership. `name` is used only for
 * rendering and export. Structure is read from `baseSpecies`, `forme`,
 * `requiredItem` and `battleOnly` — never from a display name.
 */

import type {
  BaseStats,
  Classification,
  MegaForme,
  RawSpecies,
  RosterCounts,
  RosterEntry,
  RosterSnapshotDraft,
  SpeciesSource,
  TransformMeta,
} from './types';

/**
 * Matches a `Mega` segment anywhere in a hyphen-delimited forme string.
 *
 * `Mega`, `Mega-X` and `Mega-Y` all start with it — but `Meowstic-M-Mega` and
 * `Meowstic-F-Mega` carry formes `M-Mega` and `F-Mega`, which do not. A
 * `startsWith('Mega')` test drops both and takes the canonical Mega forme
 * count from 76 to 74 (PITFALLS Pitfall 4(d)).
 *
 * Segment-anchored rather than a substring test, so a hypothetical future
 * forme named `Omega` or `Megalith` cannot match.
 */
const MEGA_FORME_SEGMENT = /(?:^|-)Mega(?:$|-)/;

/** Characters `toRosterId` keeps. Everything else is dropped. */
const NON_ID_CHARACTERS = /[^a-z0-9]+/g;

/**
 * Showdown's `toID`. Lowercase, then strip everything outside `[a-z0-9]`.
 *
 * `Mr. Rime` becomes `mrrime`, `Kommo-o` becomes `kommoo`, and `Farfetch’d`
 * becomes `farfetchd` regardless of whether the apostrophe is U+2019 or ASCII.
 */
export function toRosterId(text: string): string {
  return text.toLowerCase().replace(NON_ID_CHARACTERS, '');
}

/** Build a lookup keyed by `id`, or pass an existing one straight through. */
function asIndex(source: SpeciesSource): ReadonlyMap<string, RawSpecies> {
  if (source instanceof Map) return source;
  const index = new Map<string, RawSpecies>();
  for (const entry of source as readonly RawSpecies[]) index.set(entry.id, entry);
  return index;
}

function equalStringArrays(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let position = 0; position < left.length; position++) {
    if (left[position] !== right[position]) return false;
  }
  return true;
}

/**
 * Order-insensitive shallow comparison of two string-valued records.
 *
 * Key order is not compared, because upstream slot keys (`0`, `1`, `H`, `S`)
 * are not guaranteed to be emitted in the same order on a base species and on
 * its forme, and an order-sensitive comparison would report a false difference.
 */
function equalRecords(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined,
): boolean {
  const leftKeys = Object.keys(left ?? {});
  const rightKeys = Object.keys(right ?? {});
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if ((left ?? {})[key] !== (right ?? {})[key]) return false;
  }
  return true;
}

function equalBaseStats(left: BaseStats, right: BaseStats): boolean {
  return (
    left.hp === right.hp &&
    left.atk === right.atk &&
    left.def === right.def &&
    left.spa === right.spa &&
    left.spd === right.spd &&
    left.spe === right.spe
  );
}

/** True when `forme` names a Mega and the entry carries its stone. */
function isMegaForme(entry: RawSpecies): boolean {
  return (
    typeof entry.forme === 'string' &&
    entry.forme.length > 0 &&
    MEGA_FORME_SEGMENT.test(entry.forme) &&
    typeof entry.requiredItem === 'string' &&
    entry.requiredItem.length > 0
  );
}

/**
 * The draftable entry a Mega forme belongs to.
 *
 * `battleOnly` names the forme the Mega reverts to, and it is the only field
 * that gets Meowstic and Floette right:
 *   - `Meowstic-M-Mega` reverts to `Meowstic`, `Meowstic-F-Mega` to
 *     `Meowstic-F` — two different owners sharing one `baseSpecies`.
 *   - `Floette-Mega` reverts to `Floette-Eternal`, not to base `Floette`,
 *     which is `isNonstandard: "Past"` and not in the roster at all.
 * `baseSpecies` is the fallback for the (currently empty) case of a Mega with
 * no `battleOnly`, or with an array-valued one.
 */
function megaOwnerId(entry: RawSpecies): string {
  if (typeof entry.battleOnly === 'string' && entry.battleOnly.length > 0) {
    return toRosterId(entry.battleOnly);
  }
  return toRosterId(entry.baseSpecies);
}

/**
 * Showdown's sprite naming: `toID(baseSpecies)` for a base species, and
 * `toID(baseSpecies) + '-' + toID(forme)` for a forme (PITFALLS Pitfall 5,
 * verified by live probe). Two derivations, both from fields.
 */
function deriveSpriteId(entry: RawSpecies): string {
  const base = toRosterId(entry.baseSpecies);
  if (typeof entry.forme !== 'string' || entry.forme.length === 0) return base;
  return `${base}-${toRosterId(entry.forme)}`;
}

/**
 * Classify one upstream record.
 *
 * Rules, in priority order:
 *   1. any truthy `isNonstandard` — the correct filter is absence of the
 *      field, NOT `!== 'Past'`, which would admit the `Future` entries
 *   2. `tier === 'Illegal'`
 *   3. a Mega forme (forme segment + `requiredItem`); runs before the
 *      battle-only rule because every Mega is also `battleOnly`
 *   4. any other `battleOnly` forme — Castform-Sunny, Aegislash-Blade,
 *      Mimikyu-Busted, Morpeko-Hangry, Palafin-Hero
 *   5. cosmetic — a forme indistinguishable from its base species in types,
 *      base stats AND abilities
 *   6. draftable
 */
export function classify(entry: RawSpecies, source: SpeciesSource): Classification {
  if (entry.isNonstandard) return { kind: 'excluded', reason: 'nonstandard' };
  if (entry.tier === 'Illegal') return { kind: 'excluded', reason: 'illegalTier' };
  if (isMegaForme(entry)) return { kind: 'megaForme' };
  if (entry.battleOnly) return { kind: 'excluded', reason: 'battleOnly' };

  const hasForme = typeof entry.forme === 'string' && entry.forme.length > 0;
  if (!hasForme) return { kind: 'draftable' };

  const base = asIndex(source).get(toRosterId(entry.baseSpecies));
  if (base === undefined || base.id === entry.id) return { kind: 'draftable' };

  // Types and base stats alone are not enough. Meowstic-F matches Meowstic on
  // both and is still a genuinely distinct draftable entry with its own Mega;
  // its abilities differ (Competitive vs Prankster). Adding abilities to the
  // comparison keeps Meowstic-F while still collapsing the Vivillon patterns,
  // Alcremie sweets, Vivillon-Fancy/Pokeball, Polteageist-Antique,
  // Maushold-Four and Sinistcha-Masterpiece onto their base species.
  const indistinguishable =
    equalStringArrays(entry.types, base.types) &&
    equalBaseStats(entry.baseStats, base.baseStats) &&
    equalRecords(entry.abilities, base.abilities);

  return indistinguishable ? { kind: 'excluded', reason: 'cosmetic' } : { kind: 'draftable' };
}

/**
 * Every legal Mega forme belonging to `ownerId`, sorted by `id`.
 *
 * Never substring-test an `id` for the four letters of "Mega" — that matches
 * 77 entries, one of which is `meganium`. Never break a display name on
 * hyphens — that reads `Kommo-o` as base `Kommo`, forme `o`. Ownership comes
 * from `battleOnly` (see `megaOwnerId`).
 */
export function deriveMegaFormes(ownerId: string, source: SpeciesSource): MegaForme[] {
  const index = asIndex(source);
  const found: MegaForme[] = [];

  for (const entry of index.values()) {
    if (classify(entry, index).kind !== 'megaForme') continue;
    if (megaOwnerId(entry) !== ownerId) continue;
    found.push({
      id: entry.id,
      name: entry.name,
      forme: entry.forme ?? '',
      requiredItem: entry.requiredItem ?? '',
      spriteId: deriveSpriteId(entry),
      types: [...entry.types],
      baseStats: { ...entry.baseStats },
    });
  }

  return found.sort(compareById);
}

/** Deterministic code-unit ordering. `localeCompare` is locale-dependent. */
function compareById(left: { id: string }, right: { id: string }): number {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function toRosterEntry(
  entry: RawSpecies,
  megaFormes: MegaForme[],
  missingSpriteIds: ReadonlySet<string>,
): RosterEntry {
  const spriteId = deriveSpriteId(entry);
  const hasForme = typeof entry.forme === 'string' && entry.forme.length > 0;
  return {
    id: entry.id,
    name: entry.name,
    num: entry.num,
    types: [...entry.types],
    baseStats: { ...entry.baseStats },
    baseSpeciesId: toRosterId(entry.baseSpecies),
    forme: hasForme ? (entry.forme as string) : null,
    megaCapable: megaFormes.length > 0,
    megaFormes,
    spriteId,
    spriteMissing: missingSpriteIds.has(spriteId),
  };
}

/**
 * Fold an upstream species list into a snapshot.
 *
 * ROST-07 / ROST-08: Mega formes never become pool rows. Each is folded onto
 * the draftable entry it reverts to, as the `megaCapable` flag plus a
 * `megaFormes` array carrying each stone's item name.
 *
 * The returned object carries no `checksum`; the generator adds that over the
 * canonical JSON of `entries`.
 */
export function transform(
  rawSpeciesList: readonly RawSpecies[],
  meta: TransformMeta,
): RosterSnapshotDraft {
  const index = asIndex(rawSpeciesList);
  const missingSpriteIds = new Set(meta.missingSpriteIds ?? []);

  const draftableSource: RawSpecies[] = [];
  const megaSource: RawSpecies[] = [];
  let excludedNonstandard = 0;
  let excludedIllegalTier = 0;
  let excludedBattleOnly = 0;
  let excludedCosmetic = 0;

  for (const entry of rawSpeciesList) {
    const classification = classify(entry, index);
    if (classification.kind === 'draftable') {
      draftableSource.push(entry);
      continue;
    }
    if (classification.kind === 'megaForme') {
      megaSource.push(entry);
      continue;
    }
    if (classification.reason === 'nonstandard') excludedNonstandard++;
    else if (classification.reason === 'illegalTier') excludedIllegalTier++;
    else if (classification.reason === 'battleOnly') excludedBattleOnly++;
    else excludedCosmetic++;
  }

  const megasByOwner = new Map<string, MegaForme[]>();
  for (const mega of megaSource) {
    const ownerId = megaOwnerId(mega);
    const bucket = megasByOwner.get(ownerId);
    const folded: MegaForme = {
      id: mega.id,
      name: mega.name,
      forme: mega.forme ?? '',
      requiredItem: mega.requiredItem ?? '',
      spriteId: deriveSpriteId(mega),
      types: [...mega.types],
      baseStats: { ...mega.baseStats },
    };
    if (bucket === undefined) megasByOwner.set(ownerId, [folded]);
    else bucket.push(folded);
  }

  const draftableIds = new Set(draftableSource.map((entry) => entry.id));
  let orphanedMegaFormes = 0;
  for (const [ownerId, formes] of megasByOwner) {
    if (!draftableIds.has(ownerId)) orphanedMegaFormes += formes.length;
  }

  const entries = draftableSource
    .map((entry) =>
      toRosterEntry(entry, (megasByOwner.get(entry.id) ?? []).sort(compareById), missingSpriteIds),
    )
    .sort(compareById);

  const counts = countSnapshot(entries, megaSource, {
    excludedNonstandard,
    excludedIllegalTier,
    excludedBattleOnly,
    excludedCosmetic,
    orphanedMegaFormes,
  });

  return {
    schemaVersion: meta.schemaVersion,
    regulation: meta.regulation,
    validFrom: meta.validFrom,
    validUntil: meta.validUntil,
    upstreamRef: meta.upstreamRef,
    generatedAt: meta.generatedAt,
    counts,
    entries,
  };
}

interface ExclusionTallies {
  excludedNonstandard: number;
  excludedIllegalTier: number;
  excludedBattleOnly: number;
  excludedCosmetic: number;
  orphanedMegaFormes: number;
}

function countSnapshot(
  entries: readonly RosterEntry[],
  megaSource: readonly RawSpecies[],
  tallies: ExclusionTallies,
): RosterCounts {
  const draftableBaseFormes = entries.filter((entry) => entry.forme === null).length;
  const megaBaseFormes = megaSource.filter(
    (entry) => typeof entry.forme !== 'string' || entry.forme.length === 0,
  ).length;

  const legalEntries = entries.length + megaSource.length;
  const baseSpecies = draftableBaseFormes + megaBaseFormes;

  return {
    legalEntries,
    baseSpecies,
    alternateFormes: legalEntries - baseSpecies,
    megaFormes: megaSource.length,
    megaCapableSpecies: entries.filter((entry) => entry.megaCapable).length,
    draftable: entries.length,
    excludedNonstandard: tallies.excludedNonstandard,
    excludedIllegalTier: tallies.excludedIllegalTier,
    excludedBattleOnly: tallies.excludedBattleOnly,
    excludedCosmetic: tallies.excludedCosmetic,
    distinctBaseSpecies: new Set(entries.map((entry) => entry.baseSpeciesId)).size,
    megaCapableBaseSpecies: new Set(megaSource.map((entry) => toRosterId(entry.baseSpecies))).size,
    orphanedMegaFormes: tallies.orphanedMegaFormes,
  };
}
