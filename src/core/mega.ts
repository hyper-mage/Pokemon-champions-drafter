/**
 * mega.ts — RULE-04. The one answer to "can this species still Mega here".
 *
 * ## One predicate, four consumers
 *
 * `isMegaEligible` is written once because four separate surfaces need the same answer and
 * a second copy of it would be a second thing that can disagree with the first:
 *
 *   1. **The RULE-09 gate** (`feasibility.ts`) counts eligible entries among the
 *      post-species-ban candidates to decide whether `players × megaRounds` is satisfiable.
 *   2. **The draw's Mega quota** (`draw.ts`) partitions candidates on it, so a drawn pool
 *      carries enough Megas to fill the Mega rounds.
 *   3. **The Mega-round pool filter** (`search.ts`, RULE-03/D-16) hides everything that
 *      cannot Mega while a Mega round is picking.
 *   4. **The swap target filter** (SWAP-05/06) answers the same question for one slot.
 *
 * A fifth surface needs the same conjunction and one thing more: `selectSlotStone`
 * (`selectors.ts`) must emit the stone a Mega slot exports with, so it needs the FORME
 * rather than a boolean. `legalMegaForme` below is where the conjunction is written; the
 * predicate is a `!== null` over it, so the export and the filter cannot come to different
 * conclusions about the same species.
 *
 * Two comments already in the repository exist to prevent exactly this duplication:
 * `search.ts`'s written-down Phase 3 seam, which specifies the join as one clause reading a
 * predicate rather than a re-implementation, and `feasibility.ts`'s opening rule that one
 * place knows what is satisfiable. This module is the place they both point at.
 *
 * ## D-10 has an honest reading, so it is behaviour and not an error
 *
 * Eligibility is "at least one forme that is both unbanned and permitted by the X/Y/Either
 * choice". A species with ZERO legal formes — Charizard pinned to `x` with `Charizard-Mega-X`
 * banned is the worked case — simply leaves the Mega rounds and stays draftable in an open
 * round. There is no error state, no tenth `FeasibilityCode`, and no warning, because the
 * contradiction reads honestly as "Charizard cannot Mega in this tournament". The host is
 * told this on the config screen in prose; the rule needs no branch for it. `some` over an
 * empty or fully-excluded `megaFormes` array answers it with no special case, which is also
 * why a species that was never Mega-capable needs none either.
 *
 * ## Identity is `megaFormes[].id`, and the pin compares the `forme` FIELD
 *
 * Comparison, membership and removal are keyed on `megaFormes[].id` everywhere (CLAUDE.md
 * §Identity). Nothing here splits, slices or substring-matches a display name. Filtering ids
 * by a `mega` substring test returns **Meganium**, and `Meowstic-M-Mega` carries
 * `battleOnly: "Meowstic"` with no `-M`, so name surgery gets both of them wrong in opposite
 * directions. `Kommo-o`, `Mr. Rime` and `Tauros-Paldea-Aqua` punish it as well.
 *
 * The X/Y pin therefore compares `forme.forme` — a small closed vocabulary the snapshot
 * carries (`Mega`, `Mega-X`, `Mega-Y`, `M-Mega`, `F-Mega`) — and never the name it appears in.
 *
 * ## The sort is display order and nothing else
 *
 * `bannedMegaFormes` orders by `name`, because that is what a host reads down a list of
 * chips, and its length is `|B ∩ formeIds|` rather than `formeBans.length` — the same
 * containment `bannedEntries` documents at length. A duplicate id counts once and an id this
 * regulation no longer carries counts zero, because it resolves to nothing rather than
 * because a check remembered to reject it. The comparator is written out by hand, matching
 * `bans.ts` and `selectors.ts`: locale-aware comparison would fold one tournament to two
 * different screens in two different locales.
 *
 * Pure, like everything under `src/core`. The `Set` the caller passes is computation-local
 * and is never returned or stored (CLAUDE.md §Serializability) — a banlist that persisted as
 * a `Set` would not survive `JSON.stringify` → `JSON.parse`, which undo, autosave and file
 * export all depend on.
 */

import type { DualMegaChoice, DualMegaForme } from './model';
import type { MegaForme, RosterEntry } from './roster/types';

/** Deterministic code-unit ordering, the same shape `bans.ts` uses for entries. */
function compareFormeNames(left: MegaForme, right: MegaForme): number {
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
}

/**
 * Does the host's X/Y pin allow this forme?
 *
 * `'either'` passes everything, which is what an ABSENT `DualMegaChoice` means. `'x'` and
 * `'y'` compare the `forme` FIELD against the two values the snapshot uses for a dual-Mega
 * species.
 *
 * A species whose formes were `M-Mega` / `F-Mega` on ONE row would be excluded by BOTH pins
 * and would drop out of the Mega rounds silently. That is not handled by a runtime branch
 * here, deliberately: the snapshot puts `M-Mega` and `F-Mega` on two SEPARATE draftable rows
 * (Meowstic and Meowstic-F), so neither is ever offered an X/Y choice — the rows come from
 * `megaFormes.length > 1`. A regulation that changed that would be a data change, and
 * `tests/core/roster/fixtures.test.ts` carries the tripwire that fails loudly when it
 * happens. A silent runtime fallback here would hide it instead.
 */
function permittedByChoice(forme: MegaForme, choice: DualMegaForme): boolean {
  if (choice === 'either') return true;
  return choice === 'x' ? forme.forme === 'Mega-X' : forme.forme === 'Mega-Y';
}

/**
 * The forme this entry would actually become, or `null` when there is none — D-09, D-10.
 *
 * The same question `isMegaEligible` asks, answered with the forme rather than with a
 * boolean, because the export path needs the forme's `requiredItem` and the filter path
 * needs only whether one exists. Written once and consumed twice rather than twice: a
 * second copy of the "unbanned AND permitted by the pin" conjunction is a second thing
 * that can disagree with the first, which is the duplication this module's opening
 * paragraph exists to prevent.
 *
 * FIRST in the entry's own forme order, which is the snapshot's order — so a Charizard
 * pinned to `'either'` with nothing banned resolves to `Charizard-Mega-X`. That is a
 * display-order tie-break and not a ruling: the only case where the order is observable is
 * a dual-Mega species left unpinned, and D-12 makes the pin the host's to set.
 */
export function legalMegaForme(
  entry: RosterEntry,
  bannedFormeIds: ReadonlySet<string>,
  choice: DualMegaForme,
): MegaForme | null {
  return (
    entry.megaFormes.find(
      (forme) => !bannedFormeIds.has(forme.id) && permittedByChoice(forme, choice),
    ) ?? null
  );
}

/**
 * Does this entry still have a Mega forme it is allowed to become? — D-09, D-10.
 *
 * `false` for a species that was never Mega-capable, for one whose every forme is banned,
 * and for one whose only permitted forme is banned. All three are the same answer to the
 * same question, and none of them is an error.
 *
 * `bannedFormeIds` is the caller's computation-local `Set` of `megaFormes[].id` values, and
 * `choice` is the host's pin — `'either'` when `config.dualMegaChoices` has no entry for the
 * species, which is what `choiceFor` below returns.
 */
export function isMegaEligible(
  entry: RosterEntry,
  bannedFormeIds: ReadonlySet<string>,
  choice: DualMegaForme,
): boolean {
  return legalMegaForme(entry, bannedFormeIds, choice) !== null;
}

/**
 * Every Mega forme on the roster, in display order.
 *
 * Display order is the entries' own order, and within an entry the order the snapshot lists
 * its formes — so `Charizard-Mega-X` precedes `Charizard-Mega-Y` and both sit where Charizard
 * sits. A dual-Mega species contributes TWO rows, which is what per-forme banning means
 * (03-UI-SPEC §A locked decision whose reach this spec declines): the count line says so, and
 * the grid is not a merged two-toggle cell.
 *
 * Derived from the snapshot on every call, never a hardcoded list — the roster rotates.
 */
export function megaFormeRows(entries: readonly RosterEntry[]): MegaForme[] {
  return entries.flatMap((entry) => entry.megaFormes);
}

/**
 * The Mega formes a forme banlist actually excludes, sorted by `name` for display.
 *
 * The sibling of `bannedEntries`, and the same containment rule: the returned length is the
 * only correct source of a displayed Mega-forme ban count. `formeBans.length` is not that
 * number, for the two reasons `bans.ts` sets out — the grid and the typeahead are two write
 * surfaces over one flat list, and an imported document may carry ids this regulation
 * dropped.
 */
export function bannedMegaFormes(
  entries: readonly RosterEntry[],
  formeBans: readonly string[],
): MegaForme[] {
  const banned = new Set(formeBans);
  // `filter` allocates, so the sort below runs on a fresh array and `entries` is untouched.
  return megaFormeRows(entries)
    .filter((forme) => banned.has(forme.id))
    .sort(compareFormeNames);
}

/**
 * Resolve one species' X/Y pin from the host's choices.
 *
 * An ABSENT entry means `'either'` — `DualMegaChoice`'s own contract (`model.ts`). A STALE
 * entry for a species this regulation no longer carries is simply never consulted, because
 * the lookup is driven by the species being asked about rather than by iterating the list.
 */
export function choiceFor(
  choices: readonly DualMegaChoice[],
  speciesId: string,
): DualMegaForme {
  const match = choices.find((choice) => choice.speciesId === speciesId);
  return match === undefined ? 'either' : match.forme;
}
