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
 * The second clause is 02-UI-SPEC §11's and it was gated rather than deleted, on the
 * argument that a dormant clause beats inventing a mechanism to make a sentence true. It
 * is still dormant HERE — undoing a pick removes exactly that pick, so `removedCount` is
 * 1 in every state this particular dialog can appear in. What changed in 03-09 is that
 * `removedCount` is no longer always 1 in general: a resolved pick order comes off with
 * the card that triggered it, and `UNDO_RESOLVED_ORDER_CONFIRM` below is the set that
 * reports it.
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

/**
 * The fourth plural helper, for the one count that is genuinely multi-step.
 *
 * `{c} steps in total` renders "1 steps" at a lone resolution — reachable from an imported
 * log whose triggering card play is missing — and the module's rule since Phase 1 is that a
 * visible grammar error in a dialog reads as a tool that was not finished.
 */
function steps(count: number): string {
  return count === 1 ? '1 step' : `${count} steps`;
}

/**
 * 9. Undoing back across a resolved pick order — D-20, 03-UI-SPEC §12.
 *
 * A SEPARATE set from `UNDO_BOUNDARY_CONFIRM` rather than a parameterization of it, on the
 * `CLEAR_MEGA_FORME_BANLIST_CONFIRM` precedent: the contract states them as two rows, and
 * one composer behind two rows is how the two drift in a way no test catches.
 *
 * `default` toned, and the tone is the honest one. Nothing is destroyed — the card goes
 * back into a hand and the order can be resolved again by replaying it. What IS lost is
 * shared understanding, and that is what the last sentence is for: everyone in the room
 * read that order off the screen, and some of them are already planning against it.
 *
 * The step count is live here in a way it is not anywhere else in this file. Undoing a
 * resolution removes the resolution AND the card play that triggered it, because resolution
 * is automatic and removing it alone would let the app re-resolve on the next render — so
 * the host is TOLD two things are going rather than discovering it.
 */
export const UNDO_RESOLVED_ORDER_CONFIRM = {
  heading: "Undo this round's pick order?",
  tone: 'default' as const,
  confirmLabel: 'Undo the pick order',
  safeLabel: 'Keep the pick order',
  body: (playerName: string, round: number, value: number, removedCount: number): string =>
    `This un-resolves round ${round}'s pick order and takes ${playerName}'s ${value} back into their hand — ${steps(removedCount)} in total. The order everyone just read changes.`,
};

/**
 * The fifth plural helper, for the swap allowance.
 *
 * `one of {name}'s 1 swaps` is reachable the moment a host sets `swapBudget: 1`, which is
 * the most likely setting anyone picks, so this is not a defensive edge — it is the common
 * case. Same rule the module has followed since Phase 1.
 *
 * EXPORTED, alone among the five, and that is the deliberate exception rather than the
 * start of a pattern. The other four are read only by the dialog bodies in this file. The
 * swap count is read by three surfaces — the swap confirm here, `PoolGrid`'s §10 budget
 * line and `SwapPanel`'s §11 one — and 03-10 already found the second of those writing its
 * own copy of the rule. A third private copy is how the three end up disagreeing about the
 * singular, which is exactly the class of defect this module exists to prevent.
 */
export function swaps(count: number): string {
  return count === 1 ? '1 swap' : `${count} swaps`;
}

/**
 * 10. Making a swap — SWAP-02, D-27, 03-UI-SPEC §12.
 *
 * ## Why a swap confirms when a pick does not
 *
 * The asymmetry is the decision, not an inconsistency. A pick fills an EMPTY slot and undo
 * restores it exactly, so a confirm there would slow the draft without making it safer
 * (D-08 argued that out and this does not reopen it). A swap changes a slot the room has
 * been reading for several rounds AND returns a Pokémon to the shared pool, where the next
 * player may take it before anyone can think again — so it is the one draft-screen action
 * whose consequence lands on somebody other than the person clicking.
 *
 * That is also why Amendment 1 could make a board cell interactive at all: the misclick
 * rule it supersedes was about a no-confirm surface, and this is not one.
 *
 * `default` toned, like the other two `default` sets: nothing is destroyed. The swap is
 * undoable and the outgoing species is back in the pool rather than gone.
 *
 * The body states the RESOLVED CONSEQUENCE in numbers and names — who spends, what leaves,
 * which slot, what arrives — and never the intent. Both buttons name a verb and its object,
 * and the safe one names the species being kept, so a host reading only the buttons still
 * learns which way is which.
 */
export const SWAP_CONFIRM = {
  heading: 'Make this swap?',
  tone: 'default' as const,
  confirmLabel: (inName: string): string => `Swap in ${inName}`,
  safeLabel: (outName: string): string => `Keep ${outName}`,
  body: (
    playerName: string,
    remaining: number,
    outName: string,
    inName: string,
    round: number,
  ): string =>
    `This spends one of ${playerName}'s ${swaps(remaining)}. ${outName} leaves round ${round} and returns to the pool for everyone; ${inName} takes the slot.`,
};
