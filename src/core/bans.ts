/**
 * bans.ts — BAN-02. The one ban derivation every displayed count reads.
 *
 * ## The decision: `bans.length` is never a ban count
 *
 * This function exists so that every ban figure in the application is one derivation rather
 * than an array length computed at four call sites. The array length is wrong in exactly the
 * two ways 02-RESEARCH F-10 names, and both are reachable:
 *
 *   1. **A duplicate.** D-10 gives the host two input surfaces over one flat list. The grid
 *      toggles and the typeahead adds, so a name typed after a grid click on the same
 *      species lands twice unless the write path dedupes — and a count that trusted the
 *      length would then report one more ban than the gate does.
 *   2. **A stranger.** An imported or migrated tournament may carry ids this regulation no
 *      longer has an entry for. Champions regulations rotate roughly every 2.5 months, so a
 *      saved tournament outliving a species is the ordinary case rather than an attack.
 *
 * The returned array's length is therefore `|B ∩ rosterIds|` — precisely the figure
 * `checkFeasibility` reports as `banCount`, which it reaches independently by subtracting its
 * own set-based legal count from the entry count. `tests/core/bans.test.ts` pins the two
 * equal, so the gate's sentences and the chips above them can never disagree about how many
 * bans there are.
 *
 * Containment rather than validation: a stranger id renders no chip, no disclosure row and
 * contributes to no count because it resolves to nothing, not because a check remembered to
 * reject it.
 *
 * ## The sort is display order and nothing else
 *
 * The result is ordered by `name`, because that is what a host reads down a list of chips.
 * Membership, removal and every comparison anywhere in the application stay keyed on `id`
 * (CLAUDE.md §Identity). Nothing here splits, slices or separator-indexes a name —
 * `Tauros-Paldea-Aqua` and `Mr. Rime` both punish that, and `Kommo-o` is a base species with
 * a hyphen in it.
 *
 * The comparator is written out by hand rather than delegated to the standard library's
 * locale-aware string comparison, matching `selectors.ts`'s `compareIds` and
 * `transform.ts`'s `compareById`. Both record the reason: that comparison depends on the
 * host's locale, and two hosts in different locales must fold one tournament to the same
 * screen.
 *
 * Pure, like everything under `src/core`. The `Set` below is computation-local and is never
 * returned or stored (CLAUDE.md §Serializability) — a banlist that persisted as a `Set` would
 * not survive `JSON.stringify` → `JSON.parse`, which is what undo, autosave and file export
 * all depend on.
 */

import type { RosterEntry } from './roster/types';

/** Deterministic code-unit ordering, the same shape `selectors.ts` uses for ids. */
function compareNames(left: RosterEntry, right: RosterEntry): number {
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
}

/**
 * The roster entries a banlist actually excludes, sorted by `name` for display.
 *
 * The length of the returned array is `|B ∩ rosterIds|` — the same figure
 * `checkFeasibility` reports as `banCount`. A duplicate id counts once and an id that is
 * not in the roster counts zero, so this is the only correct source of a displayed ban
 * count anywhere in the UI. `bans.length` is never that number.
 */
export function bannedEntries(
  entries: readonly RosterEntry[],
  bans: readonly string[],
): RosterEntry[] {
  const banned = new Set(bans);
  // `filter` allocates, so the sort below runs on a fresh array and `entries` is untouched.
  return entries.filter((entry) => banned.has(entry.id)).sort(compareNames);
}
