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
 *
 * Two imports, and neither is a string. `LIBRARY_CAP` is a value this file must not
 * restate — see {@link EVICTION_CONFIRM} for why the number is interpolated rather than
 * written out — and `players` is the one plural rule a sentence in `src/core/` needs
 * too, so it is read from there rather than declared twice (IN-03).
 */

import { LIBRARY_CAP } from '../adapters/library';
import { players } from '../core/plural';

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

// `players` is imported rather than declared here (IN-03). `feasibility.ts` composes a
// sentence that needs the same rule and is in `src/core/`, which may not import from
// `src/ui/` — so the one copy lives in `src/core/plural.ts` and this file reads it, on
// the same argument the block above makes against a second private copy.

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
 * The fourth, and Phase 5's — 05-UI-SPEC §Copywriting names `matches` as one of the two
 * helpers this phase adds, "here and nowhere else".
 *
 * EXPORTED like {@link swaps} and for the same stated reason rather than as a new default:
 * the count is read by more than one surface — the config screen's
 * `A round robin at {p} players is {n} matches.` and the round robin's own
 * `{k} of {n} matches still to play.` — and a second private copy is how two surfaces end up
 * disagreeing about the singular. One match is reachable on both: a two-player round robin
 * is exactly one match, and a round robin with one game left is the state that ends every
 * complete night.
 */
export function matches(count: number): string {
  return count === 1 ? '1 match' : `${count} matches`;
}

/**
 * The fifth, and the second of the two 05-UI-SPEC §Copywriting names for this phase —
 * again "here and nowhere else".
 *
 * EXPORTED like {@link matches} and {@link swaps}, for the reason those two give rather
 * than as a new default: the library count is read by the landing screen's section as well
 * as by the eviction body below, and a second private copy is how two surfaces end up
 * disagreeing about the singular. One tournament is the state every host is in after their
 * first night, so the singular is the common case here rather than a defensive edge.
 */
export function tournaments(count: number): string {
  return count === 1 ? '1 tournament' : `${count} tournaments`;
}

/**
 * 1. Abandoning a draft — D-36, body changed by 05-UI-SPEC §Amendment 1.
 *
 * Still one of the three sets that qualify for the destructive tone. This is genuine data
 * loss with no way back: the log is discarded, the saved record is removed, and the only
 * durable copy is a file the host may or may not have downloaded. The body says exactly
 * that rather than implying a recovery that does not exist.
 *
 * ## Why the body gained a clause and nothing else moved
 *
 * D-15 makes `Start a new tournament` FILE the current one instead of discarding it, so
 * that path stopped being destructive and its dialog now informs rather than warns. That
 * leaves abandon as the ONLY path in the app that discards a tournament — and a host who
 * has just learned that starting a new tournament keeps the old one will reasonably assume
 * this one does too. The added clause says outright that it does not, because the
 * assumption is now the reasonable one and only this sentence can correct it.
 *
 * The heading, the tone and both labels are deliberately unchanged: Amendment 1 moves the
 * body alone, and anything importing this set keeps working.
 */
export const ABANDON_CONFIRM = {
  heading: 'Abandon this draft?',
  tone: 'danger' as const,
  confirmLabel: 'Abandon draft',
  safeLabel: 'Keep drafting',
  body: (pickCount: number, playerCount: number): string =>
    `This discards ${picks(pickCount)} across ${players(playerCount)} and does not file it with your tournaments. Nothing recovers it unless you have already downloaded the tournament JSON.`,
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

/**
 * 11. Abandoning from the ban stage — 04-UI-SPEC §8, D-36.
 *
 * A SECOND set rather than a parameterisation of `ABANDON_CONFIRM`, on the
 * `CLEAR_MEGA_FORME_BANLIST_CONFIRM` precedent: the state genuinely differs. Zero picks
 * have been made and the bans are what is at stake, so "This discards 0 picks across 4
 * players" would be a plain untruth on the one surface whose job is telling the host what
 * they are about to lose. `Keep the bans` is right here for exactly the reason
 * `Keep drafting` is right when picks are what exist.
 *
 * `danger` toned, and the same genuine data loss: the log goes, the saved record goes, and
 * the only durable copy is a file the host may or may not have downloaded. D-09 makes that
 * more pointed rather than less — no JSON checkpoint is offered before the reveal, so
 * during a blind stage there very likely IS no downloaded copy.
 */
export const ABANDON_BAN_STAGE_CONFIRM = {
  heading: 'Abandon this tournament?',
  tone: 'danger' as const,
  confirmLabel: 'Abandon tournament',
  safeLabel: 'Keep the bans',
  body: (playerCount: number): string =>
    `This discards the tournament and every ban the ${players(playerCount)} have entered. Nothing recovers it unless you have already downloaded the tournament JSON.`,
};

/**
 * 12. Undoing a blind submission — 04-UI-SPEC §8, D-03, D-05.
 *
 * ## Why this one confirms when undoing a pick in the current round does not
 *
 * This is the sharpest design point in the phase, and the set reads as an inconsistency
 * until the reason is understood — so the reason lives here.
 *
 * Every other undo in this project acts on something VISIBLE: a pick on the board, a card
 * in the played row, a swap in a slot. The host clicks, the screen changes, and the change
 * is its own receipt. D-05 forbids re-displaying a blind submission once it has been
 * removed, so this undo removes a thing the host cannot see and produces no visible
 * receipt at all.
 *
 * An unconfirmed undo of an invisible thing is precisely the misclick D-03 exists to
 * correct, and this dialog is the ONLY place the host can be told what is about to happen
 * and what it will cost them — a second message to Discord asking for the list again. The
 * body says that outright rather than leaving them to discover it.
 *
 * `default` toned: nothing is destroyed that cannot be re-entered, and the player is still
 * in the room. The cost is a conversation, not a tournament.
 *
 * The set names NO SPECIES, in any of its four strings, so it leaks nothing. That is the
 * same control `undoAnnouncement`'s ban arms carry for the live region, applied to the one
 * surface that speaks about a removal at all.
 */
export const UNDO_BAN_SUBMISSION_CONFIRM = {
  heading: (playerName: string): string => `Remove ${playerName}'s bans?`,
  tone: 'default' as const,
  confirmLabel: (playerName: string): string => `Remove ${playerName}'s bans`,
  safeLabel: (playerName: string): string => `Keep ${playerName}'s bans`,
  body: (playerName: string): string =>
    `This removes ${playerName}'s bans. They are not shown on screen, so ask ${playerName} for the list again before you re-enter it.`,
};

/**
 * The possessive form of the player count, for the one body that needs one.
 *
 * NOT a seventh plural rule. It composes {@link players} rather than restating it, so the
 * singular/plural decision still happens in exactly one place — the module's standing
 * argument against a second copy is respected rather than waived. All this adds is which
 * apostrophe goes on the end, which `players` cannot answer because most of its callers
 * want no apostrophe at all.
 *
 * `The 3 players' bans` and `The 1 player's bans`. Rendering §8's literal slot instead
 * produces `The 1 player' bans` at a one-player configuration.
 */
function playersPossessive(count: number): string {
  return count === 1 ? `${players(count)}'s` : `${players(count)}'`;
}

/**
 * 13. Undoing the reveal — 04-UI-SPEC §8, D-03, D-23.
 *
 * ## Honest about the half it cannot undo
 *
 * Un-revealing does not un-read. The room has seen the bans, and some of them are already
 * planning around them. The body says so in as many words rather than implying a secrecy
 * restoration the tool cannot deliver — which is the difference between a control that
 * steps back and a control that lies about what it did.
 *
 * What it CAN do it does cleanly, and D-23 is why: no pool is drawn until a separate
 * `Start draft`, so there is nothing to un-draw. Every `bans/submitted` survives and the
 * stage returns to `{m} of {m} entered`, which is a designed destination that already
 * exists rather than a state invented for this undo.
 *
 * The last sentence is the one that stops a host pressing again in confusion: the next
 * undo removes a player's bans, which is a different and much more expensive act.
 *
 * `default` toned. Nothing recorded is lost.
 */
export const UNDO_REVEAL_CONFIRM = {
  heading: 'Undo the reveal?',
  tone: 'default' as const,
  confirmLabel: 'Undo the reveal',
  safeLabel: 'Keep the reveal',
  body: (playerCount: number): string =>
    `This takes the reveal back to the locked screen. The ${playersPossessive(playerCount)} bans stay recorded, and everyone who has already read them still has. Undo again to remove a player's bans.`,
};

// ---------------------------------------------------------------------------
// Phase 5 — the library, and the reopen. D-14 / D-15 / D-16 / D-17.
//
// ## All three take the default tone, and the reservation is the reason
//
// The destructive tone in this project means one specific thing: THERE IS NO WAY BACK
// WITHOUT A FILE YOU MAY NOT HAVE DOWNLOADED. Exactly three surfaces qualify — the two
// abandons and the import overwrite — and none of the three sets below joins them:
//
//   - Filing loses nothing. That is the whole of D-15: the tournament goes into the
//     library and stays openable from the landing screen.
//   - Eviction names the tournament that is about to go and offers its download FIRST,
//     which is precisely the property that distinguishes it from the three.
//   - A reopen is itself undoable, and it destroys no recorded result.
//
// Colouring any of them red would make the three irreversible surfaces less legible as a
// category, and being legible as a category is the only job the reservation has.
// ---------------------------------------------------------------------------

/**
 * 14. Filing the current tournament on `Start a new tournament` — D-15, 05-UI-SPEC §12.
 *
 * The dialog INFORMS rather than warns, which is the change D-15 makes and the reason this
 * set exists at all. Nothing is lost, so a warning would be a lie about the consequence;
 * what the host needs to know is where the tournament went and how to get back to it.
 *
 * The download is still offered in the same breath, and that is deliberate rather than
 * belt-and-braces: D-14 accepts that Safari drops script-written storage after seven days
 * idle and that this now costs the whole library, so the JSON file remains the system of
 * record and every filing path keeps saying so.
 *
 * The body takes the format label rather than a date, because that is what the host named
 * the night and what they will look for in the list.
 */
export const FILING_CONFIRM = {
  heading: 'Start a new tournament?',
  tone: 'default' as const,
  confirmLabel: 'Start a new tournament',
  safeLabel: 'Keep this one open',
  body: (formatLabel: string): string =>
    `${formatLabel} is filed with your tournaments and stays open from the landing screen. Download the JSON too if you want a copy that browser storage cannot lose.`,
};

/**
 * 15. Filing at the cap, which drops the oldest — D-16, 05-UI-SPEC §12.
 *
 * The one set in this file with a FIFTH string. `downloadLabel` is a third button, not a
 * variant of the other two: D-16's contract is that the oldest tournament is offered for
 * download and then dropped, and an offer the host cannot act on from inside this dialog
 * is not an offer. It names the tournament rather than saying `Download it`, so a host
 * reading only the buttons still learns which night is at stake.
 *
 * The cap is INTERPOLATED from {@link LIBRARY_CAP} rather than written as a number here.
 * That is the reason the cap is a constant at all — a literal in this sentence would be a
 * second number, free to drift from the one the adapter actually enforces, and the drift
 * would surface as a dialog that promises twelve while the code keeps ten.
 *
 * The em dash and the full stops are contract, per this module's header.
 */
export const EVICTION_CONFIRM = {
  heading: 'Your tournaments are full',
  tone: 'default' as const,
  confirmLabel: 'File it and drop the oldest',
  safeLabel: 'Keep the oldest',
  downloadLabel: (oldLabel: string): string => `Download ${oldLabel}`,
  body: (newLabel: string, oldLabel: string, date: string): string =>
    `This app keeps ${LIBRARY_CAP} tournaments. Filing ${newLabel} drops the oldest — ${oldLabel} from ${date}. Download it first if you want to keep it.`,
};

/**
 * 16. Reopening a finished tournament — D-17, 05-UI-SPEC §Finished and reopen.
 *
 * A plain string body rather than a composer, alone among the sets that say anything
 * substantive. There is nothing to interpolate: the consequence is the same sentence
 * whatever the tournament held, because it describes what CORRECTING will cost rather than
 * what reopening costs. Reopening itself voids nothing.
 *
 * That distinction is the whole point of the second clause. A host reopening a finished
 * night is usually chasing one mistyped score, and the thing they cannot see is that the
 * cut and the bracket were DERIVED from the result they are about to change. The sentence
 * tells them before they spend the evening rebuilding a bracket they did not know they
 * had voided.
 */
export const REOPEN_CONFIRM = {
  heading: 'Reopen this tournament?',
  tone: 'default' as const,
  confirmLabel: 'Reopen it',
  safeLabel: 'Leave it finished',
  body: 'This makes every result editable again. Correcting a round-robin result voids the cut and the bracket; correcting a bracket result voids the matches after it.',
};

// ---------------------------------------------------------------------------
// Phase 5's second group — the undo that reaches past the lock. D-17.
//
// Its own section rather than a fourth row in the one above, because that block's argument
// is about three specific sets and "All three take the default tone" has to stay true. The
// set below takes the default tone as well, and on a reason of its own: a recorded result
// can be entered again from the score the room just read, so it is not the "no way back
// without a file you may not have downloaded" category the danger tone is reserved for.
// ---------------------------------------------------------------------------

/**
 * 17. Undoing a recorded match result — D-17, and `undo.ts`'s `ALWAYS_CONFIRM_KINDS`.
 *
 * A SEPARATE set from {@link UNDO_BOUNDARY_CONFIRM} on the precedent every undo set in
 * this file follows: that one reads "This undoes {name}'s pick from round {r}", which over
 * a match result is a plain untruth on the one surface whose whole job is telling the host
 * what is about to change.
 *
 * WHY IT CONFIRMS AT ALL, when undoing a pick in the current round does not. `canApply`
 * refuses every change to a finished tournament — `reduce.ts` answers `tournamentLocked`
 * at four separate arms — and reopening one is deliberately gated behind `FinishedNotice`
 * and {@link REOPEN_CONFIRM}, which spends a whole dialog on the consequence. Undo reaches
 * that same state, so it asks a question of the same weight rather than being the one path
 * that ignores D-17.
 *
 * The body's second clause is CONDITIONAL and that is deliberate. Core reports which
 * player won and how many entries come off, not whether the match was the final, and a
 * sentence asserting the un-crowning unconditionally would be false over a first-round
 * result — which this module treats as worse than saying less. The first clause is true of
 * every match and is the one that names what is going.
 */
export const UNDO_MATCH_CONFIRM = {
  heading: 'Undo the recorded result?',
  tone: 'default' as const,
  confirmLabel: 'Undo the result',
  safeLabel: 'Keep the result',
  body: (playerName: string): string =>
    `This removes the result, and ${playerName}'s win no longer stands. If it was the match that finished the tournament, the champion is un-crowned and every result becomes editable again.`,
};
