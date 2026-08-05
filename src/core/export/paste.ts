/**
 * paste.ts — the Pokemon Showdown export format, in the one place it lives.
 *
 * EXPO-01 (species-only), EXPO-02 (Mega as `Species @ Stone`) and EXPO-03 (blank-line
 * separated) are encoded here exactly once. Nothing else in the codebase may build
 * export text; if a second call site ever needs a variation, it changes this function.
 *
 * ---------------------------------------------------------------------------
 * The blank line is the record separator, and getting it wrong fails silently
 * ---------------------------------------------------------------------------
 *
 * Measured against `Teams.import` from pokemon-showdown 0.11.11:
 *
 *     "Venusaur\n\nGarchomp\n\nRotom-Wash\n"   ->  3 mons
 *     "Venusaur\nGarchomp\nRotom-Wash\n"       ->  1 mon
 *
 * The second form does not throw, warn, or look wrong. It just discards everything
 * after the first line. Joining records with a single newline is the most likely
 * export bug in this project, which is why the separator is a named constant here and
 * why the test suite asserts the naive form's behaviour rather than describing it.
 *
 * ---------------------------------------------------------------------------
 * Names are read, never built
 * ---------------------------------------------------------------------------
 *
 * Every emitted species name is `entry.name` taken verbatim from the committed
 * snapshot. It is never reconstructed from parts, never prettified, never
 * case-adjusted, and no character in it is ever swapped for another. That single rule
 * is what makes `Rotom-Wash`, `Tauros-Paldea-Aqua`, `Kommo-o`, `Mr. Rime`, `Type: Null`
 * and `Farfetch’d` (U+2019, not an ASCII apostrophe) all survive intact, without this
 * function needing to know that any of them are special.
 *
 * Three first-line forms in Showdown's parser are hostile to an exporter that does
 * know better than its data:
 *
 *     `X @ Y`                            ->  Y is the held item
 *     line ending in ` (M)` or ` (F)`    ->  parsed as GENDER, suffix stripped
 *     line ending in `)` containing `(`  ->  parsed as `Nickname (Species)`
 *
 * So a helpful `Nidoran (M)` yields the species `nidoran`, which does not exist. This
 * function emits no parentheses and appends no gender suffix, because it appends
 * nothing at all except a stone the entry itself declares.
 *
 * ---------------------------------------------------------------------------
 * A bare Mega forme imports and then refuses to battle
 * ---------------------------------------------------------------------------
 *
 * A Mega forme's species record carries a truthy `battleOnly` and a `requiredItem`, so
 * Showdown's team validator rejects it:
 *
 *     Venusaur-Mega transforms in-battle with Venusaurite, please fix its item.
 *
 * The only form that validates is the base species plus the stone — `Venusaur @
 * Venusaurite`. The Mega forme's own name is therefore never emitted.
 *
 * Which stone is a decision this function does not make. Charizard carries both
 * `Charizardite X` and `Charizardite Y`, and Raichu carries two likewise, so defaulting
 * to the first would fabricate a draft result that nobody chose. A stone is emitted
 * only when the caller names one, and only when the entry itself declares it.
 */

import type { RosterEntry } from '../roster/types';

/**
 * One filled slot of a drafted team.
 *
 * `megaStone` is the stone the draft recorded for this slot, and it is meaningful only
 * when the slot was drafted into a Mega round. Phase 1 has no Mega rounds and no
 * X-versus-Y selection, so nothing this phase produces sets it — but the format is
 * settled now so that Phase 3 extends a tested function instead of reopening the
 * export format.
 */
export interface PasteSlot {
  /** Roster entry id, the key into the lookup. Never a display name. */
  monId: string;
  /** The recorded Mega Stone, or absent when the slot is not a Mega slot. */
  megaStone?: string | null | undefined;
}

/** The record separator. Two newlines. Not one. See the note above. */
const RECORD_SEPARATOR = '\n\n';

/** What Showdown's first-line parser looks for to find a held item. */
const ITEM_SEPARATOR = ' @ ';

/**
 * Render a drafted team as a Showdown-importable paste.
 *
 * Empty slots are dropped, so a partly drafted team yields only its filled records with
 * no blank ones. An entirely empty team yields an empty string rather than a lone
 * newline. The output otherwise always ends with exactly one trailing newline.
 *
 * A slot whose id is not in `entryById` is dropped rather than emitted. That is
 * deliberate: the alternative is writing an unresolved identifier into text the host
 * pastes into a third-party site, which is the one way arbitrary characters could reach
 * the output at all.
 */
export function toShowdownPaste(
  slots: readonly (PasteSlot | null | undefined)[],
  entryById: ReadonlyMap<string, RosterEntry>,
): string {
  const records: string[] = [];

  for (const slot of slots) {
    if (slot === null || slot === undefined) continue;

    const entry = entryById.get(slot.monId);
    if (entry === undefined) continue;

    const stone = declaredStone(entry, slot.megaStone);
    records.push(stone === null ? entry.name : entry.name + ITEM_SEPARATOR + stone);
  }

  if (records.length === 0) return '';

  return records.join(RECORD_SEPARATOR) + '\n';
}

/**
 * The stone to emit for this slot, or `null` to emit the bare species.
 *
 * The returned string is the entry's OWN copy of the stone name, never the caller's.
 * A request that does not match one of this entry's declared Mega formes yields `null`,
 * so every character that reaches the paste originates in the committed snapshot. A
 * tampered or imported document therefore cannot inject text onto the line — the worst
 * it can do is lose a Mega it was never entitled to.
 */
function declaredStone(entry: RosterEntry, requested: string | null | undefined): string | null {
  if (requested === null || requested === undefined) return null;

  for (const forme of entry.megaFormes) {
    if (forme.requiredItem === requested) return forme.requiredItem;
  }

  return null;
}
