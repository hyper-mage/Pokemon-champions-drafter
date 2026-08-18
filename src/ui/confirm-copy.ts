/**
 * confirm-copy.ts — every confirmation's words, in one place.
 *
 * ## Why one module and not six
 *
 * 02-UI-SPEC §11 treats these as a single table, and the whole point of `ConfirmDialog`
 * is one pattern and six sets of copy rather than six components. Splitting the copy per
 * caller would recreate the thing the pattern exists to prevent: six dialogs that drift
 * apart in tone, in button order and in how they name what is about to be lost.
 *
 * Every string is a module constant and every interpolation goes through a composer
 * function. Never inline JSX prose — JSX collapses whitespace between text lines, and
 * these are contracts down to the em dash (`ImportConfirmDialog.tsx` set that precedent
 * and states the reason).
 *
 * All seven of 02-UI-SPEC §11's sets are here. The seventh arrived with 02-07's `Bans`
 * group; the note recording it as absent was deleted in the same change that made it false,
 * because a stale contract comment is worse than none — the next reader trusts it.
 */

/**
 * Pluralisation, done here rather than in the contract.
 *
 * 02-UI-SPEC writes the slots as `{n} picks` and `{m} players`. Rendering that literally
 * produces "1 picks" on the first pick and "1 players" on a one-player configuration,
 * both of which are reachable. `importConfirmBody` established the rule and the reason in
 * Phase 1: a visible grammar error in a dialog that destroys work reads as a tool that
 * was not finished.
 */
function picks(count: number): string {
  return count === 1 ? '1 pick' : `${count} picks`;
}

function players(count: number): string {
  return count === 1 ? '1 player' : `${count} players`;
}

/**
 * The third of the three, added with the seventh set and for the same reason.
 *
 * 02-UI-SPEC writes the banlist body's slot as `{n} bans`, which reads "all 1 bans" at
 * exactly one ban — and one ban is the count this dialog is reachable at the moment the
 * host makes their first. The set beside the other six is the only place this belongs; a
 * fourth helper somewhere else would be a fourth place to get a plural wrong.
 */
function bans(count: number): string {
  return count === 1 ? '1 ban' : `${count} bans`;
}

/**
 * 1. Abandoning a draft — D-36.
 *
 * `danger` toned, and one of only two of the six that qualify. This is genuine data loss
 * with no way back: the log is discarded, the saved record is removed, and the only
 * durable copy is a file the host may or may not have downloaded. The body says exactly
 * that rather than implying a recovery that does not exist.
 */
export const ABANDON_CONFIRM = {
  heading: 'Abandon this draft?',
  tone: 'danger' as const,
  confirmLabel: 'Abandon draft',
  safeLabel: 'Keep drafting',
  body: (pickCount: number, playerCount: number): string =>
    `This discards ${picks(pickCount)} across ${players(playerCount)}. Nothing recovers it unless you have already downloaded the tournament JSON.`,
};

/**
 * 2. Importing over a live draft — the Phase 1 dialog, re-homed.
 *
 * The heading and both labels are unchanged from Phase 1, so nothing that imports them
 * breaks. The BODY is new: 02-UI-SPEC §11 supplies a different string and states that
 * "D-39 is an instance-level contract, not a pattern to be improvised against at build
 * time. Every body string is given literally below." Where §11 and the component
 * inventory disagree about this one field, §11 wins on its own terms.
 */
export const IMPORT_CONFIRM = {
  heading: 'Replace the current draft?',
  tone: 'danger' as const,
  confirmLabel: 'Replace draft',
  safeLabel: 'Keep current draft',
  body: (pickCount: number, playerCount: number): string =>
    `This replaces the current draft — ${picks(pickCount)} across ${players(playerCount)}. Download the current tournament JSON first if you want to keep it.`,
};

/**
 * 3. Re-rolling the pool — D-36.
 *
 * `default` toned. Nothing recorded is lost: no tournament exists yet, and the host can
 * re-roll again. What IS lost is shared attention — everyone in the room has been reading
 * the same grid — which is why it asks at all rather than why it shouts.
 */
export const REROLL_POOL_CONFIRM = {
  heading: 'Draw a new pool?',
  tone: 'default' as const,
  confirmLabel: 'Draw a new pool',
  safeLabel: 'Keep this pool',
  body: (poolSize: number): string =>
    `This draws a new pool of ${poolSize} Pokémon. The pool everyone has been looking at is discarded.`,
};

/** 4. Re-rolling the starting order — D-36. Same reasoning as the pool. */
export const REROLL_ORDER_CONFIRM = {
  heading: 'Roll a new starting order?',
  tone: 'default' as const,
  confirmLabel: 'Roll a new order',
  safeLabel: 'Keep this order',
  body: (playerCount: number): string =>
    `This rolls a new order for all ${players(playerCount)}. The order on screen is discarded.`,
};

/**
 * 5. Removing a player — D-36.
 *
 * Every string names the player, including both buttons, so a host reading only the
 * buttons still learns who is about to go.
 *
 * The body drops its middle clause when nobody sits below the removed row. Rendering the
 * literal template there produces "re-numbers the 0 players below them", which is not
 * true and reads as a template that leaked into production.
 */
export const REMOVE_PLAYER_CONFIRM = {
  heading: (name: string): string => `Remove ${name}?`,
  tone: 'default' as const,
  confirmLabel: (name: string): string => `Remove ${name}`,
  safeLabel: (name: string): string => `Keep ${name}`,
  body: (name: string, playersBelow: number): string =>
    playersBelow === 0
      ? `This removes ${name}. Their name is not kept.`
      : `This removes ${name} and re-numbers the ${players(playersBelow)} below them. Their name is not kept.`,
};

/**
 * 6. Undoing a pick from an earlier round — D-37.
 *
 * `default` toned: the pick comes back to the pool and can be made again, so this is a
 * question about shared understanding rather than about data loss. Everyone at the table
 * saw round 1 finish; reaching back into it should be deliberate.
 *
 * The second clause is 02-UI-SPEC §11's and it is gated rather than deleted. `undoLast`
 * removes exactly ONE pick — the most recent — so in the only state where this dialog can
 * appear there are no picks after it and `removedCount` is 1. Inventing a walk-back undo
 * to make a sentence true would be a far larger deviation than a dormant clause, and D-37
 * is explicit that "the mechanism is unchanged". Gated on the count, the clause is silent
 * today and correct the day a walk-back undo exists.
 */
export const UNDO_BOUNDARY_CONFIRM = {
  heading: 'Undo a pick from an earlier round?',
  tone: 'default' as const,
  confirmLabel: 'Undo the pick',
  safeLabel: 'Keep the pick',
  body: (playerName: string, pickRound: number, currentRound: number, removedCount: number): string => {
    const first = `This undoes ${playerName}'s pick from round ${pickRound}, and the draft is currently on round ${currentRound}.`;
    if (removedCount <= 1) return first;
    return `${first} Picks made after it are undone too — ${removedCount} in total.`;
  },
};

/**
 * 7. Clearing the banlist — D-36, and 02-UI-SPEC §11's seventh set.
 *
 * `default` toned, and the tone is the honest one: no tournament exists yet, nothing
 * recorded is lost, and every cleared species can be banned again from either surface. What
 * IS lost is a list the host may have spent five minutes assembling with the room watching,
 * which is why it asks at all rather than why it shouts.
 *
 * The heading follows Phase 1's `Replace the current draft?` precedent — a question naming
 * the action. The count goes through the plural helper above rather than the spec's literal
 * slot; see that helper for the reason, which is `importConfirmBody`'s from Phase 1.
 */
export const CLEAR_BANLIST_CONFIRM = {
  heading: 'Clear the banlist?',
  tone: 'default' as const,
  confirmLabel: 'Clear the banlist',
  safeLabel: 'Keep the bans',
  body: (banCount: number): string =>
    `This clears all ${bans(banCount)} at once. Every banned Pokémon returns to the pool.`,
};

/**
 * 8. Clearing the Mega-forme banlist — 03-UI-SPEC §12's second new set.
 *
 * The sibling of `CLEAR_BANLIST_CONFIRM` and deliberately not a parameterization of it. The
 * two clear different lists, and a shared composer taking a noun would put one string in
 * front of two copy-table rows that the contract states separately — which is how the two
 * end up drifting in a way no test catches, because the test would be reading the composer.
 *
 * `default` toned for the same honest reason: no tournament exists yet, nothing recorded is
 * lost, and every cleared forme can be banned again from either surface.
 *
 * The count is the roster-intersected figure from `bannedMegaFormes`, never the raw array's
 * length, and it is resolved when the dialog OPENS — the sentence has to state the world it
 * was opened against. `Mega-forme ban` takes its own plural helper rather than the `bans`
 * one above, because the two produce different words for the same number.
 */
function megaFormeBans(count: number): string {
  return count === 1 ? '1 Mega-forme ban' : `${count} Mega-forme bans`;
}

export const CLEAR_MEGA_FORME_BANLIST_CONFIRM = {
  heading: 'Clear the Mega-forme banlist?',
  tone: 'default' as const,
  confirmLabel: 'Clear the Mega-forme banlist',
  safeLabel: 'Keep the bans',
  body: (banCount: number): string =>
    `This clears all ${megaFormeBans(banCount)} at once. Every banned forme becomes legal again.`,
};
