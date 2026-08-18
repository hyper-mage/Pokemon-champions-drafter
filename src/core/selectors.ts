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

/** True exactly when every player holds a full set of `rounds` picks. */
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

/**
 * The slot on the clock, or `null` when the draft has not started or is finished.
 *
 * Phase 1 pick order is strict alternation: round `r` runs `order[0]` then `order[1]`,
 * and the same arithmetic carries eight players unchanged. Phase 2 replaces this with
 * priority-card resolution, at which point the resolved order becomes another
 * materialized log entry rather than a computation here.
 */
export function selectCurrentTurn(state: DraftState): Turn | null {
  if (state.order.length === 0) return null;
  if (selectIsComplete(state)) return null;

  const pickIndex = state.picks.length;
  const playerId = state.order[pickIndex % state.order.length];
  if (playerId === undefined) return null;

  return {
    round: Math.floor(pickIndex / state.order.length) + 1,
    playerId,
    pickIndex,
  };
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
