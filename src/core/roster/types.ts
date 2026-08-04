/**
 * Roster snapshot shapes.
 *
 * This module is types only. It contains no runtime values, which means every
 * import of it is an `import type` and is erased before the file is ever
 * evaluated. That is deliberate: `scripts/build-roster.mjs` imports
 * `transform.ts` directly under Node's type stripping, and an erased import
 * needs no module resolution at runtime.
 *
 * Everything below is JSON-serializable by construction: no Date, no Map, no
 * Set, no class instances, no functions. A snapshot must survive
 * `JSON.parse(JSON.stringify(x))` unchanged (ARCHITECTURE sync rule 1).
 */

/** The six Champions stats, in Showdown's canonical key order. */
export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

/**
 * The subset of a Showdown species record the transform reads.
 *
 * Never parse `name`. Structure comes from `baseSpecies`, `forme`,
 * `requiredItem` and `battleOnly` — see PITFALLS Pitfall 4 ("two fields, never
 * one"): `Kommo-o` is a base species with a hyphen, and `Meowstic-M-Mega`
 * reverts to `Meowstic` while `Meowstic-F-Mega` reverts to `Meowstic-F`.
 */
export interface RawSpecies {
  /** Showdown `toID`: lowercase, `[^a-z0-9]+` stripped. THE identity key. */
  id: string;
  /** Display name, verbatim from upstream. Rendering and export only. */
  name: string;
  /** National Dex number. */
  num: number;
  /** Display name of the base species this entry belongs to. */
  baseSpecies: string;
  types: string[];
  baseStats: BaseStats;
  /** Slot-keyed ability names, e.g. `{ "0": "Keen Eye", "H": "Prankster" }`. */
  abilities?: Record<string, string> | undefined;
  /** Forme suffix, e.g. `Mega`, `Mega-X`, `M-Mega`, `Wash`, `Paldea-Aqua`. */
  forme?: string | undefined;
  /** Present on Mega formes; the stone name, e.g. `Charizardite X`. */
  requiredItem?: string | undefined;
  /** Present on in-battle-only formes; the display name it reverts to. */
  battleOnly?: string | string[] | undefined;
  /** `"Past" | "Future" | "LGPE" | "Custom"`, or absent/null when standard. */
  isNonstandard?: string | null | undefined;
  /** `"Illegal"` for entries the regulation does not permit. */
  tier?: string | undefined;
}

/** Why an upstream entry did not reach the draftable set. */
export type ExclusionReason = 'nonstandard' | 'illegalTier' | 'battleOnly' | 'cosmetic';

/** Tagged classification of a single upstream species record. */
export type Classification =
  | { kind: 'draftable' }
  | { kind: 'megaForme' }
  | { kind: 'excluded'; reason: ExclusionReason };

/** A legal Mega forme, folded onto the draftable entry it belongs to. */
export interface MegaForme {
  id: string;
  name: string;
  forme: string;
  /** The Mega Stone. Always present — a Mega with no stone is not a Mega. */
  requiredItem: string;
  spriteId: string | null;
  types: string[];
  baseStats: BaseStats;
}

/**
 * One draftable row. ROST-08: the draftable unit is the base species (or a
 * genuinely distinct alternate forme); Mega-capability is a flag on it, never
 * a separate pool row.
 */
export interface RosterEntry {
  id: string;
  name: string;
  num: number;
  types: string[];
  baseStats: BaseStats;
  /** `toID(baseSpecies)`. Equal to `id` for a base-forme entry. */
  baseSpeciesId: string;
  forme: string | null;
  megaCapable: boolean;
  megaFormes: MegaForme[];
  spriteId: string | null;
  spriteMissing: boolean;
}

/**
 * Measured counts. `legalEntries` is the post-filter legal set — draftable
 * rows plus Mega formes — which is the figure PITFALLS reports as 311.
 */
export interface RosterCounts {
  /** `draftable + megaFormes`. */
  legalEntries: number;
  /** Legal entries with no `forme`. */
  baseSpecies: number;
  /** Legal entries with a `forme` (Megas included). */
  alternateFormes: number;
  megaFormes: number;
  /** Draftable entries carrying at least one Mega forme. */
  megaCapableSpecies: number;
  draftable: number;
  excludedNonstandard: number;
  excludedIllegalTier: number;
  excludedBattleOnly: number;
  excludedCosmetic: number;
  /** Distinct `baseSpeciesId` values among draftable rows. */
  distinctBaseSpecies: number;
  /** Distinct `toID(baseSpecies)` values among Mega formes. */
  megaCapableBaseSpecies: number;
  /** Mega formes whose owning species is not draftable. Should be 0. */
  orphanedMegaFormes: number;
}

/** Ambient values the caller captures at the impure edge and passes in. */
export interface TransformMeta {
  schemaVersion: number;
  regulation: string;
  validFrom: string;
  validUntil: string;
  upstreamRef: string;
  /** ISO timestamp. The core never reads a clock; the script supplies this. */
  generatedAt: string;
  /** Sprite ids known to have no art. Drives `spriteMissing` (ROST-11). */
  missingSpriteIds?: readonly string[] | undefined;
}

/** A snapshot before the generator stamps its checksum. */
export interface RosterSnapshotDraft {
  schemaVersion: number;
  regulation: string;
  validFrom: string;
  validUntil: string;
  upstreamRef: string;
  generatedAt: string;
  counts: RosterCounts;
  entries: RosterEntry[];
}

/** The committed artifact. */
export interface RosterSnapshot extends RosterSnapshotDraft {
  /** SHA-256 over the canonical JSON of `entries` only. */
  checksum: string;
}

/** Either an already-built index or a flat list. `transform` accepts both. */
export type SpeciesSource = ReadonlyMap<string, RawSpecies> | readonly RawSpecies[];
