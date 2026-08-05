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

import type { DraftState } from './model';
import { nextInt } from './rng';

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
