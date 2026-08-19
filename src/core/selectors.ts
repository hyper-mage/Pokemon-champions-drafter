/**
 * selectors.ts — every piece of derived data in the application, in one file.
 *
 * Sync rule 3: derived data is never stored. The available pool, the teams, whose turn
 * it is, and whether the draft is finished are all recomputed from the folded log every
 * time they are asked for. Keeping them together in a single module is deliberate — the
 * next person tempted to cache one of these into state should first hit an obvious
 * existing home for the computed alternative.
 *
 * Everything here reads. Nothing here writes: no function in this file assigns into the
 * state it was handed, and the arrays and objects returned are always freshly built, so
 * a caller cannot mutate state through a selector's return value either.
 *
 * The UI-SPEC makes this a UI rule too: "if a surface seems to need the UI to decide a
 * rule, the selector is missing — add the selector, do not add the logic to the
 * component."
 */

import type { RoundKind, RoundSpec } from './actions';
import { cardOffer, type CardOffer } from './cards';
import { choiceFor, isMegaEligible, legalMegaForme } from './mega';
import type { CardPlay, DraftState } from './model';
import { nextInt } from './rng';
import type { RosterEntry } from './roster/types';

/** The player and slot on the clock. `round` is 1-based; `pickIndex` is 0-based. */
export interface Turn {
  round: number;
  playerId: string;
  pickIndex: number;
}

/** The player whose CARD is on the clock, and the round being bid. `round` is 1-based. */
export interface CardTurn {
  round: number;
  playerId: string;
}

/** Which mode the screen is in. See `selectPhase`. */
export type DraftPhase = 'cards' | 'picking' | 'swapRounds' | 'complete';

/** How many picks have been recorded so far. Also the index of the next one. */
export function selectPickCount(state: DraftState): number {
  return state.picks.length;
}

/**
 * Pool ids minus every picked id, in the pool's original order.
 *
 * Order matters to the UI: the pool ids are built in display order, so a filter that
 * reordered them would reshuffle the grid under the host's cursor on every pick.
 */
export function selectAvailablePool(state: DraftState): string[] {
  const taken = new Set(state.picks.map((pick) => pick.monId));
  return state.poolIds.filter((id) => !taken.has(id));
}

/** Player ids in a stable, deterministic order — never object key order (rule 14). */
function playerIdsInOrder(state: DraftState): string[] {
  return state.config.players.map((player) => player.id).sort(compareIds);
}

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Every player's roster as an ordered slot array, one slot per round, `null` where the
 * slot is not yet filled.
 *
 * A pick made in round `r` occupies slot `r - 1`, which is what makes a board row and a
 * team strip the same element rather than two views that can drift apart.
 */
export function selectTeams(state: DraftState): Record<string, (string | null)[]> {
  const teams: Record<string, (string | null)[]> = {};

  for (const playerId of playerIdsInOrder(state)) {
    teams[playerId] = Array.from({ length: state.config.rounds }, () => null);
  }

  for (const pick of state.picks) {
    const slots = teams[pick.playerId];
    if (slots === undefined) continue;
    const slotIndex = pick.round - 1;
    if (slotIndex < 0 || slotIndex >= slots.length) continue;
    slots[slotIndex] = pick.monId;
  }

  return teams;
}

/**
 * The compiled round schedule — RULE-02, and the one answer every round-typed surface reads.
 *
 * Returns the stored schedule when its length matches the configured round count, and
 * `config.rounds` all-open specs otherwise.
 *
 * That fallback is not a default that guesses. A schema-2 tournament was drafted before the
 * compiler existed and ran flat rounds; `migrateV2ToV3` performs no log surgery, so its log
 * carries no `schedule/compiled` and its folded schedule is empty. All-open is what that
 * draft actually was, and the log is right about it. The length check is the same statement
 * about a schedule that disagrees with its own document — a hand-edited file can carry four
 * specs for a six-round tournament, and two rounds with no answer is worse than six with an
 * honest one.
 *
 * Freshly built, like everything in this file: a caller cannot reach `state.schedule`
 * through the return value.
 */
export function selectSchedule(state: DraftState): RoundSpec[] {
  if (state.schedule.length === state.config.rounds) {
    return state.schedule.map((spec) => ({ index: spec.index, kind: spec.kind }));
  }

  return Array.from({ length: state.config.rounds }, (_, position) => ({
    index: position + 1,
    kind: 'open' as const,
  }));
}

/**
 * What round `round` (1-based) is filtered by. `'open'` for anything out of range.
 *
 * Out of range answers rather than throws for the same reason `apply` tolerates an action
 * type it does not know: this is read while rendering, and a selector that threw on a round
 * number a caller computed badly would take the whole screen down over a header cell.
 */
export function selectRoundKind(state: DraftState, round: number): RoundKind {
  return selectSchedule(state)[round - 1]?.kind ?? 'open';
}

/**
 * What slot `slotIndex` (0-based) of a team accepts — D-08.
 *
 * The inverse of the join `selectTeams` already makes: a round-`r` pick is filed into slot
 * `r - 1`, so slot `i` is typed by round `i + 1`. Derived rather than stored, and that is
 * the decision rather than the implementation: a `slotKind` field on `DraftPick` would be a
 * SECOND copy of the constraint, free to disagree with the schedule after a migration — and
 * the runtime validator that would have caught the disagreement is the thing this phase
 * exists to remove. Recovery is a single array read, so there is nothing to buy by storing it.
 */
export function selectSlotKind(state: DraftState, slotIndex: number): RoundKind {
  return selectRoundKind(state, slotIndex + 1);
}

/**
 * The roster is ambient data the core RECEIVES, never data it holds.
 *
 * Both selectors below take `entries` as an argument, following `checkFeasibility(input.entries)`
 * and `bannedEntries(entries, bans)`. `DraftState` does not gain a roster field and must not:
 * `model.ts:11-13` calls the fold a cache of the log, and 235 entries in it would contradict
 * that and the serializability posture besides. D-07 separately declines to materialize
 * eligible id lists into the log, so there is nothing stored to read either.
 */
function entriesById(entries: readonly RosterEntry[]): Map<string, RosterEntry> {
  // Computation-local, never returned and never stored (CLAUDE.md §Serializability).
  return new Map(entries.map((entry) => [entry.id, entry]));
}

/**
 * Pool ids the given round's kind admits, already minus picked ids — RULE-03.
 *
 * ## What this is FOR, which is not what it looks like
 *
 * The EDGE consults this before dispatching, and that is the whole design. `canApply`
 * structurally cannot check round eligibility: it sees only `DraftState`, round eligibility
 * is a fact about a roster ENTRY (`entry.megaFormes`), and neither putting the roster into
 * the fold nor widening the single write path for one rule is on the table (03-RESEARCH
 * §Where "no post-pick validation anywhere in the system" cannot be honored). So the offer
 * is CONSTRAINED rather than the pick VALIDATED — an illegal pick is unreachable through
 * the UI instead of rejected after the fact.
 *
 * Three things follow, and none of them is an oversight:
 *
 *   - `canApply` gains no eligibility arm and `apply` gains no rule check.
 *   - `selectTeams` is NOT filtered by this. The board shows what the log says
 *     (`reduce.ts:16-19`); a hand-edited document's illegal pick is REPORTED by the
 *     adoption notice in `app.tsx`, never repaired and never hidden.
 *   - A Mega round's offer is never widened when it comes back empty. A fallback that
 *     quietly allowed a non-Mega pick would be the removed validator wearing a friendlier
 *     name, and nothing downstream would be left to catch the team it produced.
 *
 * An `'open'` round returns `selectAvailablePool(state)` unchanged. A `'mega'` round returns
 * that list filtered by `isMegaEligible` under THIS DOCUMENT's own `megaFormeBans` and
 * `dualMegaChoices` — the same predicate the RULE-09 gate and the pool draw read, so the
 * three cannot come to different conclusions about one species.
 *
 * A pool id the current roster no longer carries is dropped from a Mega round's offer and
 * kept in an open round's, which is not an inconsistency: eligibility cannot be established
 * for a species that is not there, and `app.tsx` drops unresolvable ids from the rendered
 * pool anyway. The count of them is the roster-drift notice's, not this function's.
 */
export function selectRoundEligibleIds(
  state: DraftState,
  entries: readonly RosterEntry[],
  round: number,
): string[] {
  const available = selectAvailablePool(state);
  if (selectRoundKind(state, round) === 'open') return available;

  const byId = entriesById(entries);
  const bannedFormeIds = new Set(state.config.megaFormeBans);

  return available.filter((id) => {
    const entry = byId.get(id);
    if (entry === undefined) return false;
    return isMegaEligible(entry, bannedFormeIds, choiceFor(state.config.dualMegaChoices, entry.id));
  });
}

/**
 * How many swaps `playerId` still has — SWAP-01, D-29.
 *
 * `config.swapBudget` minus the swaps that player has actually made. ONE budget, spent
 * either mid-draft or in a dedicated swap round: a swap round is a structured opportunity
 * to spend the same allowance, not a second one.
 *
 * DERIVED, never stored (rule 3). A `swapsLeft` field on the config or on a player would
 * be a second copy of a fact the log already asserts — free to drift after an undo, and
 * free to disagree with the number the pool header prints. `state.swaps` is the log's own
 * record and undo removes from it by re-folding, so the two cannot come apart.
 *
 * Clamped at zero, and the clamp is about where this is read rather than about the
 * arithmetic. A document this build creates can never overspend — `canApply` refuses
 * `noSwapsLeft` — but a hand-edited or imported one can, and this runs on every render of
 * the pool header, where a negative would reach the host as `has -1 swaps left`. Reported
 * as "none", never as a negative; the disagreement itself is the adoption notice's to
 * mention, not this sentence's.
 *
 * A player id this tournament has never heard of gets the full budget rather than an error,
 * for the reason {@link selectHand} gives: this is read while rendering.
 */
export function selectSwapsRemaining(state: DraftState, playerId: string): number {
  const spent = state.swaps.filter((swap) => swap.playerId === playerId).length;
  return Math.max(0, state.config.swapBudget - spent);
}

/**
 * What may fill slot `slotIndex` (0-based) — SWAP-05, SWAP-06, RULE-05, D-27.
 *
 * ## Slot first, then pool
 *
 * This is the mechanism that makes "a Mega slot cannot be swapped into a non-Mega Pokémon"
 * true BY CONSTRUCTION. The slot is armed before anything is clickable, this answers what
 * that slot admits, and the pool renders only those ids — so the illegal swap is never
 * offered rather than rejected after the fact. `canApply` structurally cannot check it (see
 * its `swap/made` arm), which is precisely why the offer has to be right on the first frame.
 *
 * ## It DELEGATES rather than restating the predicate
 *
 * A slot's kind is its round's kind — `selectTeams` files a round-`r` pick into slot
 * `r - 1`, and `selectSlotKind` is that same join — so "what may fill slot `i`" and "what
 * may be picked in round `i + 1`" are the same question and get the same answer here.
 * Composing `selectAvailablePool` with `isMegaEligible` a second time would type-check and
 * would be a SECOND authority on Mega-eligibility, free to disagree with the pick offer
 * about one species after a change to either. RULE-05 asks that a slot's constraint survive
 * a swap; one function answering both is what makes that survival structural.
 *
 * A slot index the schedule does not reach answers as open, for the reason
 * {@link selectRoundKind} answers out of range: this is read while rendering.
 */
export function selectSwapTargets(
  state: DraftState,
  entries: readonly RosterEntry[],
  slotIndex: number,
): string[] {
  return selectRoundEligibleIds(state, entries, slotIndex + 1);
}

/**
 * The stone a slot's pick exports with, or `null` for a bare species — D-04.
 *
 * **The SLOT decides whether a stone is emitted, never the species.** A Mega-capable species
 * drafted into an open round occupies an untyped slot and exports bare; the same species in
 * a Mega slot exports as `Species @ StoneItemName`. Getting that backwards produces exports
 * that are wrong in a way no test of the species table would catch, which is why the tests
 * for this assert from the slot side.
 *
 * That rule is also why `toShowdownPaste` needed no signature change: Phase 1 shipped
 * `PasteSlot.megaStone` for exactly this caller and settled the format then. The returned
 * string is a forme's `requiredItem` read from the committed snapshot, and `declaredStone`
 * re-derives it from the entry's own copy before it reaches the paste — so nothing a
 * tampered document carries can reach text the host pastes into a third-party site.
 *
 * `null` for an empty slot, `null` for an `'open'` slot whatever occupies it, and `null` for
 * a Mega slot whose species has no legal forme left. The last one is D-10 as behaviour
 * rather than as an error: a species with every forme banned exports bare instead of
 * failing.
 */
export function selectSlotStone(
  state: DraftState,
  entries: readonly RosterEntry[],
  playerId: string,
  slotIndex: number,
): string | null {
  if (selectSlotKind(state, slotIndex) !== 'mega') return null;

  const monId = selectTeams(state)[playerId]?.[slotIndex] ?? null;
  if (monId === null) return null;

  const entry = entriesById(entries).get(monId);
  if (entry === undefined) return null;

  const forme = legalMegaForme(
    entry,
    new Set(state.config.megaFormeBans),
    choiceFor(state.config.dualMegaChoices, entry.id),
  );

  return forme === null ? null : forme.requiredItem;
}

/**
 * True exactly when every player holds a full set of `rounds` picks.
 *
 * This is PICKS-complete, and its definition is deliberately unchanged by 03-11. Every
 * caller it had before the dedicated swap rounds existed still means exactly this, and
 * {@link selectIsTournamentComplete} is a new sibling rather than a redefinition — see
 * there for what hangs off which, and for why retyping this one would have been the D-31
 * bug rather than the D-31 fix.
 */
export function selectIsComplete(state: DraftState): boolean {
  if (state.order.length === 0) return false;

  const counts = new Map<string, number>();
  for (const pick of state.picks) {
    counts.set(pick.playerId, (counts.get(pick.playerId) ?? 0) + 1);
  }

  return state.config.players.every(
    (player) => (counts.get(player.id) ?? 0) >= state.config.rounds,
  );
}

/**
 * The round the draft is standing in — 1-based, and valid during card play as well as
 * picking.
 *
 * `selectCurrentTurn` below derives the same number, but only while a pick is on the clock.
 * The card phase needs the round BEFORE any of that round's picks exist and before anyone
 * knows who is picking, so the arithmetic is exposed on its own rather than reached through
 * a turn that is legitimately null.
 *
 * Clamped at `config.rounds`, because a completed draft is standing in its last round
 * rather than in a round that does not exist. `1` before the draft has started, for the
 * same read-while-rendering reason `selectRoundKind` answers instead of throwing.
 */
export function selectCurrentRound(state: DraftState): number {
  const playerCount = state.order.length;
  if (playerCount === 0) return 1;

  const round = Math.floor(state.picks.length / playerCount) + 1;
  return Math.min(round, state.config.rounds);
}

/**
 * The priority cards a player still holds — CARD-01, CARD-06.
 *
 * `1..config.rounds` minus every value that player has played. **`config.rounds`, never the
 * literal 6** (D-06): a four-round tournament deals four cards, and the only way that stays
 * true is for there to be no second number anywhere to disagree with it.
 *
 * Nothing stores a hand. A stored one would be a second copy of a fact the log already
 * asserts — free to drift after an undo, and free to disagree with the strikethroughs on
 * screen, which are rendered from this. The `Set` is computation-local and never returned
 * or stored (CLAUDE.md §Serializability).
 *
 * A player id this tournament has never heard of gets a full hand rather than an error.
 * This is read once per board row on every render; a selector that threw over a stale id
 * would take the whole board down.
 */
export function selectHand(state: DraftState, playerId: string): number[] {
  const spent = new Set(
    state.cardsPlayed.filter((play) => play.playerId === playerId).map((play) => play.value),
  );

  return Array.from({ length: state.config.rounds }, (_, position) => position + 1).filter(
    (value) => !spent.has(value),
  );
}

/**
 * Who plays round `round`'s cards, and in what order — D-18, CARD-03.
 *
 * The rotation: round 1 runs `state.order`, round 2 begins with `order[1]`, and round
 * `players + 1` is round 1 again. That is the fairness mechanism rather than a
 * presentational nicety. Playing LAST is an advantage — you have seen every card already on
 * the table before committing yours — so a fixed play order would hand one player that
 * advantage in all six rounds. Rotating spreads it evenly, and the whole tournament's worth
 * of positions is decided before a single card is played.
 *
 * **Independent of every card outcome.** This reads `state.order` and the round number and
 * nothing else, so no result of any bid can move who bids first next round, and there is
 * nothing here to manipulate. `state.order` is `draft/started.order` — the seeded shuffle,
 * which `selectStartingOrder` already sorts ids before rolling so that it depends only on
 * the set of players and the seed.
 *
 * A round number outside `1..rounds` still answers, normalized into range, for the reason
 * `selectRoundKind` answers out of range: this runs while rendering.
 */
export function selectCardPlayOrder(state: DraftState, round: number): string[] {
  const playerCount = state.order.length;
  if (playerCount === 0) return [];

  const order: string[] = [];
  for (let offset = 0; offset < playerCount; offset++) {
    // The double modulo keeps a round number below 1 in range instead of indexing
    // negatively and silently returning a short order.
    const position = (((round - 1 + offset) % playerCount) + playerCount) % playerCount;
    const playerId = state.order[position];
    if (playerId === undefined) continue;
    order.push(playerId);
  }

  return order;
}

/**
 * The cards played in round `round`, in log order.
 *
 * Log order, NOT resolved order — `resolvePickOrder` is the only thing that decides the
 * latter, and it does so from `seq` rather than from this array's order precisely so that
 * the two cannot come to different conclusions. This is what the card panel renders as the
 * cards go down, and what the resolution reads when the last one lands.
 *
 * Freshly built records, like everything in this file: a caller cannot reach into
 * `state.cardsPlayed` through the return value.
 */
export function selectCardsPlayedThisRound(state: DraftState, round: number): CardPlay[] {
  return state.cardsPlayed
    .filter((play) => play.round === round)
    .map((play) => ({
      playerId: play.playerId,
      value: play.value,
      round: play.round,
      seq: play.seq,
    }));
}

/**
 * Whose card is on the clock — the first player in this round's rotation who has not
 * played yet (D-18, CARD-03).
 *
 * The rotation reads only `state.order` and the round number, so nothing a player does
 * except PLAYING can move this. That is what makes D-18's fairness mechanism
 * unmanipulable, and it is why the answer is the same one whether the caller is
 * `canApply` refusing an out-of-turn play or the card panel deciding whose hand to show.
 *
 * It lives here rather than in either of those because it is a rule, and `canApply` used
 * to hold the only copy of it — which left the panel with a choice between importing from
 * the reducer and working the rotation out a second time. A second copy of "who is on the
 * clock" is a second thing that can disagree with the log about whose turn it is.
 *
 * `null` when the draft has not started, and when every player has already played this
 * round. The second is not a defensive branch: an imported document can sit there, because
 * `fold` runs no `canApply` and resolution is only automatic in a live session.
 *
 * It deliberately does NOT ask whether the round has resolved. A document whose round
 * resolved while somebody still held a card must reach `canApply`'s `roundAlreadyResolved`
 * arm with that player named, rather than being turned away as out of turn. Callers that
 * want "is the screen bidding" ask `selectPhase`.
 */
export function selectCardTurn(state: DraftState): CardTurn | null {
  if (state.order.length === 0) return null;

  const round = selectCurrentRound(state);
  const alreadyPlayed = new Set(
    selectCardsPlayedThisRound(state, round).map((play) => play.playerId),
  );
  const playerId = selectCardPlayOrder(state, round).find((id) => !alreadyPlayed.has(id));

  return playerId === undefined ? null : { round, playerId };
}

/**
 * What `playerId` may play this round, and whether the rule had to be lifted — CARD-04, D-21.
 *
 * ## The posture, which is the whole point
 *
 * This is the same shape `selectRoundEligibleIds` and `checkFeasibility` take: a pure
 * selector the EDGE consults BEFORE dispatching. The constraint belongs upstream of the
 * click, not in a rejection after it — a card the offer excludes renders inert with a
 * reason, so the deadlock CARD-04 otherwise creates is never entered rather than refused
 * on entry. `canApply`'s `cardNotPlayable` arm exists behind this as a backstop; if it
 * ever fires for a real host, the offer and the rule have disagreed and that is a bug.
 *
 * Composed from three selectors that already exist rather than re-deriving any of them:
 * `selectHand` for every hand, `selectCardsPlayedThisRound` for the round's used values,
 * and `selectCardPlayOrder` for who is still to come. A second opinion about any of the
 * three would be a second thing that can disagree with the log.
 *
 * `state.order.length` is the player count, not `config.players.length`. The rotation is
 * what CARD-04's pigeonhole qualifier is about, and a hand-edited document can carry an
 * order shorter than its player list — in which case the players who can actually be
 * stranded are the ones in the rotation.
 */
export function selectCardOffer(state: DraftState, playerId: string): CardOffer {
  const round = selectCurrentRound(state);
  const played = selectCardsPlayedThisRound(state, round);

  // Computation-local, never returned and never stored (CLAUDE.md §Serializability).
  const used = new Set(played.map((play) => play.value));
  const done = new Set(played.map((play) => play.playerId));

  const remainingHands = selectCardPlayOrder(state, round)
    .filter((id) => id !== playerId && !done.has(id))
    .map((id) => selectHand(state, id));

  return cardOffer(
    selectHand(state, playerId),
    remainingHands,
    used,
    state.order.length,
    state.config.rounds,
  );
}

/**
 * The values `playerId` may play this round — {@link selectCardOffer} without the reason.
 *
 * The list is what `canApply` needs; the panel needs the reason too, so it reads the
 * offer. Both go through one computation.
 */
export function selectPlayableCards(state: DraftState, playerId: string): number[] {
  return selectCardOffer(state, playerId).values;
}

/**
 * Round `round`'s recorded pick order, or `null` if it has not resolved yet.
 *
 * `null` is the state D-17 makes representable: every card can be down without an order
 * existing, and the screen is in the card phase until this answers. The order is READ from
 * the log rather than recomputed from the plays, which is the point of materializing it —
 * a build whose comparator changed would otherwise silently reinterpret a finished round.
 *
 * The FIRST match wins, so a hand-edited document carrying two resolutions for one round
 * folds to the earlier one rather than to whichever the array happened to end with.
 */
export function selectResolvedOrder(state: DraftState, round: number): string[] | null {
  const resolved = state.resolvedOrders.find((entry) => entry.round === round);
  return resolved === undefined ? null : [...resolved.order];
}

// ---------------------------------------------------------------------------
// Dedicated swap rounds — SWAP-03, SWAP-04, SWAP-07, D-28…D-31
// ---------------------------------------------------------------------------

/**
 * The order the dedicated swap rounds run in — D-28, SWAP-04.
 *
 * The reverse of the LAST pick round's resolved order: whoever picked last in round
 * `config.rounds` swaps first. That is computed from a value the log already holds, so
 * there is no new randomness, no new config field and nothing extra to materialize — and
 * the room can check it against a line they read off the screen an hour earlier.
 *
 * Reversal is the point rather than a flourish. Priority cards are all spent by the last
 * pick (CARD-06 gives each player one card per round and the draft has exactly `rounds`
 * rounds), so there is no bidding left to decide a swap order with; reversing the last one
 * hands the first swap to whoever the last round treated worst.
 *
 * ## The fallback, and why it is not silent
 *
 * A migrated schema-2 document resolved no round at all, and an imported one can be missing
 * the entry for any reason. The answer then is the reverse of `state.order`, which is
 * deterministic and is the order that draft actually ran in. What makes it acceptable is
 * {@link selectSwapOrderSource}: the screen says WHICH source is in force, so a host reading
 * `Swap order reverses the starting order.` is not being told a different sentence about
 * the same thing. SWAP-04 asks for the order to be explicit, and a fallback nobody was told
 * about would not be (T-03-44).
 *
 * Freshly built, like everything in this file — a caller cannot reach a log entry's array
 * through the return value, and `reverse()` mutates in place.
 */
export function selectSwapRoundOrder(state: DraftState): string[] {
  const resolved = selectResolvedOrder(state, state.config.rounds);
  return [...(resolved ?? state.order)].reverse();
}

/**
 * Which source {@link selectSwapRoundOrder} used — SWAP-04's "explicit" made checkable.
 *
 * One selector rather than a nullable return from the order itself, because the two answer
 * different questions and only one of them is a list. The phase line renders a different
 * sentence per value; nothing else branches on it.
 */
export function selectSwapOrderSource(state: DraftState): 'lastRound' | 'startingOrder' {
  return selectResolvedOrder(state, state.config.rounds) === null ? 'startingOrder' : 'lastRound';
}

/**
 * How many moves — swaps AND passes — are recorded for one dedicated swap round.
 *
 * The `+` that {@link DraftState.passes} exists to keep in exactly one place. A round
 * advances on either kind, which is the whole of why a pass had to become an action
 * (T-03-45): counted this way a round cannot step past a player the log does not represent,
 * and a pass cannot be forged as an absence.
 *
 * `swapRound` 0 counts nothing, because 0 is the mid-draft spend and belongs to no round.
 */
function swapRoundMoveCount(state: DraftState, swapRound: number): number {
  if (swapRound < 1) return 0;

  const swaps = state.swaps.filter((swap) => swap.swapRound === swapRound).length;
  const passes = state.passes.filter((pass) => pass.swapRound === swapRound).length;
  return swaps + passes;
}

/**
 * Which dedicated swap round is on the clock, or `null` when none is.
 *
 * The LOWEST round `1..config.swapRounds` that is still short of a move from everybody, so
 * round 2 cannot open while round 1 is unfinished. Null before the picks are complete
 * (there is no swap round yet), and null once every round is full — which is the same
 * question {@link selectIsTournamentComplete} asks, and it asks it here rather than
 * repeating the loop.
 *
 * A hand-edited document whose last resolved order is empty answers `null`, which reads as
 * "no swap round is running". That is the safe direction: the alternative is a clock naming
 * nobody, on a screen whose only control belongs to the player it cannot name.
 */
export function selectCurrentSwapRound(state: DraftState): number | null {
  if (!selectIsComplete(state)) return null;

  const order = selectSwapRoundOrder(state);
  if (order.length === 0) return null;

  for (let swapRound = 1; swapRound <= state.config.swapRounds; swapRound++) {
    if (swapRoundMoveCount(state, swapRound) < order.length) return swapRound;
  }

  return null;
}

/**
 * Who is on the clock in a given swap round, and where in the order they stand.
 *
 * The player at index `count(moves recorded for that round)` in {@link
 * selectSwapRoundOrder}, or `null` when that count has reached the order's length — which
 * is the round being finished.
 *
 * Per-round arithmetic and nothing more: it does NOT ask whether an earlier round is still
 * running, because "which player would be next in round `s`" and "is round `s` allowed to
 * be running" are two questions and the sequencing one is
 * {@link selectCurrentSwapRound}'s. `canApply` asks both.
 *
 * Null while the picks are still owed, and null for a round outside
 * `1..config.swapRounds` — including `0`, which is the mid-draft spend and is not a round.
 */
export function selectSwapRoundPosition(
  state: DraftState,
  swapRound: number,
): { playerId: string; index: number } | null {
  if (!selectIsComplete(state)) return null;
  if (!Number.isSafeInteger(swapRound)) return null;
  if (swapRound < 1 || swapRound > state.config.swapRounds) return null;

  const order = selectSwapRoundOrder(state);
  const index = swapRoundMoveCount(state, swapRound);
  if (index >= order.length) return null;

  const playerId = order[index];
  return playerId === undefined ? null : { playerId, index };
}

/**
 * Every team full AND every dedicated swap round finished — D-31, and the export gate.
 *
 * ## A NEW SELECTOR beside {@link selectIsComplete}, never a redefinition of it
 *
 * Retyping the older one would have changed every caller it already had, silently and all
 * at once — `selectPhase`, `selectCurrentTurn`, `undoCrossesRoundBoundary` and the board's
 * own completion arithmetic all mean PICKS-complete and are all correct as they stand. D-31
 * asks for a second question to be answerable, not for the first one to be replaced.
 *
 * ## What hangs off which
 *
 *   {@link selectIsComplete}  the picks are in: no more turns, no more pool cells to click
 *   this one                  the teams are FINAL: exports and the PERS-06 checkpoint open
 *
 * That split is the whole of D-31's consequence. A per-player export panel opening while a
 * swap round was still running would invite somebody to copy a paste that is about to
 * change, and they would not find out (T-03-46).
 *
 * With `swapRounds: 0` the two coincide exactly, which is what keeps a swap-free tournament
 * byte-identical to the one Phase 2 shipped.
 */
export function selectIsTournamentComplete(state: DraftState): boolean {
  return selectIsComplete(state) && selectCurrentSwapRound(state) === null;
}

/**
 * Does this tournament deal priority cards at all?
 *
 * The gate is 03-UI-SPEC's, and both halves are load-bearing. A migrated schema-2
 * document carries no `schedule/compiled` — `migrateV2ToV3` performs no log surgery — and
 * no `cards/played`, because that draft ran strict alternation and dealt nothing. Every
 * document this build writes compiles a schedule before the draft starts, so the schedule
 * is what separates a v3 draft standing at round 1 with every hand still full from a
 * migrated one: their `cardsPlayed` are both empty and only the schedule tells them apart.
 * The `cardsPlayed` half then catches a document whose schedule is missing or malformed
 * but which has demonstrably dealt cards.
 *
 * One definition, three readers: `selectPhase` and `selectCurrentTurn` below, and the
 * board's hand strips in `app.tsx`. Written out at each of them, the three would be free
 * to disagree about whether a document deals cards — and the disagreement would show as a
 * board rendering hands for a draft the turn selector was running without them.
 */
export function selectDealsCards(state: DraftState): boolean {
  return state.schedule.length > 0 || state.cardsPlayed.length > 0;
}

/**
 * Which mode the screen is in — and the ONE place that is decided (D-17).
 *
 * `app.tsx` branches on this to choose a panel; no component works it out. That is what
 * makes "played but not yet resolved" unrepresentable as a screen state: the card phase
 * lasts exactly as long as the round has no `order/resolved`, so there is no window in
 * which the cards are all down and the app is pretending to pick. The boundary is a fact
 * about the log rather than a flag anything sets, which is also why an imported document
 * cannot declare a mode it is not in (T-03-29).
 *
 *   `'cards'`       the current round has not resolved, so a card is on the clock
 *   `'picking'`     it has, and some team is still short of `config.rounds`
 *   `'swapRounds'`  every team is full and this tournament runs swap rounds
 *   `'complete'`    every team is full and it does not
 *
 * Two documents are deliberately `'picking'` rather than `'cards'`. A migrated schema-2
 * draft deals no cards at all and must stay playable; and a document whose draft has not
 * started has no rotation to put anybody on the clock, so a card panel there would name
 * nobody. Both keep exactly the behaviour they had before the card phase existed.
 */
export function selectPhase(state: DraftState): DraftPhase {
  if (selectIsComplete(state)) {
    return state.config.swapRounds > 0 ? 'swapRounds' : 'complete';
  }

  if (state.order.length === 0) return 'picking';
  if (!selectDealsCards(state)) return 'picking';

  return selectResolvedOrder(state, selectCurrentRound(state)) === null ? 'cards' : 'picking';
}

/**
 * The slot on the clock, or `null` when no pick is on it.
 *
 * `null` now covers THREE states rather than two: before the draft starts, after every
 * team is full, and while the current round's cards are still being played. A caller that
 * reads a null turn as "the draft is finished" is wrong in the third case — which is why
 * `canApply(DRAFT_PICK_MADE)` gained `cardsNotResolved` and `undoCrossesRoundBoundary`
 * stopped falling back to `config.rounds` in the same change that added the third.
 *
 * The order is READ from `order/resolved` rather than computed here. That is the point of
 * materializing it: this build's comparator is not consulted about a round the room
 * already played, so a later change to the tiebreak cannot silently reinterpret a
 * finished draft.
 *
 * ## The one fallback, and what it is NOT
 *
 * A schema-2 document has no `order/resolved` for any round, and its picks were made in
 * `state.order` by strict alternation. Falling back to `state.order` is what keeps that
 * draft playable, and the log is right about it.
 *
 * The fallback is gated on `selectDealsCards` — a property of the DOCUMENT — and never on
 * the round. Gated per round it would fire for every v3 round before its resolution, which
 * is precisely the card phase, and the app would pick straight through the bidding it
 * exists to run.
 */
export function selectCurrentTurn(state: DraftState): Turn | null {
  if (state.order.length === 0) return null;
  if (selectIsComplete(state)) return null;

  const round = selectCurrentRound(state);
  const pickIndex = state.picks.length;
  const resolved = selectResolvedOrder(state, round);

  if (resolved === null) {
    // A document that deals cards and has not resolved this round is BIDDING, not picking.
    if (selectDealsCards(state)) return null;

    const fallbackId = state.order[pickIndex % state.order.length];
    return fallbackId === undefined ? null : { round, playerId: fallbackId, pickIndex };
  }

  // `% resolved.length` rather than `% state.order.length`: a hand-edited document can
  // carry a short order, and reading past its end must answer null rather than name a
  // player the round never put on the clock. A zero-length order gives `NaN`, which
  // indexes to `undefined` and lands on the same answer.
  const playerId = resolved[pickIndex % resolved.length];
  return playerId === undefined ? null : { round, playerId, pickIndex };
}

/** Display name for a configured player id, or `null` if the tournament has no such player. */
export function selectPlayerName(state: DraftState, playerId: string): string | null {
  return state.config.players.find((player) => player.id === playerId)?.name ?? null;
}

/**
 * Resolve the pick order from the stored seed — SHEL-07's one real consumer.
 *
 * A seeded shuffle that nothing consumes is untestable ceremony, so the starting order
 * is derived here and then MATERIALIZED into the `draft/started` action (Pattern 5).
 * Replay reads the recorded order; it never rolls again. Both halves matter and both
 * are tested: that the derivation is reproducible from the seed, and that the log
 * carries the resolved result.
 *
 * The ids are sorted before the shuffle so the outcome depends only on the *set* of
 * players and the seed, not on the order the caller happened to pass them in.
 */
export function selectStartingOrder(seed: number, playerIds: readonly string[]): string[] {
  const order = [...playerIds].sort(compareIds);

  // Fisher-Yates, with the pure generator supplying every draw.
  let cursor = 0;
  for (let index = order.length - 1; index > 0; index--) {
    const draw = nextInt(seed, cursor, index + 1);
    cursor = draw.cursor;

    const target = order[index];
    const source = order[draw.value];
    if (target === undefined || source === undefined) continue;
    order[index] = source;
    order[draw.value] = target;
  }

  return order;
}
