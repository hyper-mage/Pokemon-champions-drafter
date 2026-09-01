/**
 * recap.ts — PERS-09 / D-19…D-22. The night, read back in the order it happened.
 *
 * ## Why this takes the whole record and not the fold
 *
 * Every other selector in this codebase takes `DraftState`, and this one deliberately does
 * not. `DraftState` holds only the LATEST result per match, because that is exactly what
 * D-09's fold arm does — later beats earlier, and the superseded entry is dropped so that
 * four readers cannot re-derive which of two results counts. D-22 needs precisely the ones
 * the fold threw away: the recap has to say that a result was recorded and then corrected,
 * and what the correction took with it.
 *
 * So this reads `doc.log`. `undo.ts` already establishes doc-taking pure functions in the
 * core — `lastPickAction(doc)`, `undoRemoval(doc)`, `undoCrossesRoundBoundary(doc, …)` — so
 * this is a precedent rather than an exception. `state` is passed ALONGSIDE for one reason
 * only: rule 1 below routes the ban section through two `DraftState` selectors.
 *
 * 05-RESEARCH Pitfall 8 gives the warning sign for getting this wrong, and it is worth
 * knowing by sight: a `Round robin` section with exactly as many lines as there are
 * matches, no matter how many corrections the log holds.
 *
 * ## Three rules this module is written around
 *
 * **1. D-21 secrecy.** The ban section reads `selectPublicBanIds` and `selectAttributedBans`
 * — never the sealed blind allotments, and never a `bans/submitted` log entry, even though
 * this function has the whole log in hand and Phase 4's D-06 puts those allotments in it as
 * plaintext. D-06's defence is the screen shield rather than the file, and this is a NEW
 * surface over the same log, so it owes the same contract. The case it protects: a blind
 * tournament abandoned BEFORE the reveal and filed into the library. Its recap has no
 * `Bans` section at all, and that is correct — those bans were never public.
 *
 * **2. Corrections are marked, not struck.** A superseded result stays in chronological
 * position carrying `Corrected later`; its replacement carries `Corrects an earlier result`.
 * Strike-through in this project means *gone or unavailable* — the snake ban-list treatment
 * — and a corrected result is neither: it happened, and then it was changed. Using one
 * treatment for both would make a single signal mean two things. This module supplies the
 * `correction` mark; `RecapList` renders the words.
 *
 * **3. Never name a variable after the ambient global that holds a page.** `check-pure-core`
 * forbids that bare token anywhere under `src/core` and is deliberately strict about it, so
 * the record is `doc` here exactly as it is in `undo.ts`.
 *
 * ## Ids, not prose
 *
 * An entry carries `playerIds`, `monIds` and a small `detail` bag; `RecapList` composes the
 * sentences from 05-UI-SPEC §11's table. A pure module that formatted the copy would put
 * contract strings in `src/core/`, where the copy contract has no business being — and the
 * names it would need are on the roster, which the core never holds.
 *
 * ## Ordering
 *
 * Ascending `seq`, always, and never array position: `seq` is allocated `max(seq) + 1` and
 * so is strictly increasing but MAY have gaps, and an imported log is not guaranteed to be
 * stored in that order. The section grouping is 05-UI-SPEC §11's — `Bans`, `Priority cards`,
 * `Round {n}`, `Swaps`, `Round robin`, `Bracket` — and it is a grouping applied by the
 * component, not a re-ordering applied here.
 *
 * The one place `seq` cannot come off a log entry is a host banlist, which is settled in
 * config before the first action exists. Those entries carry {@link NO_LOG_SEQ} and sort
 * ahead of everything, which is where they belong chronologically.
 *
 * Pure, like everything under `src/core`: no clock, no randomness, no storage, no DOM. The
 * record handed in is never mutated and every entry returned is freshly built.
 */

import {
  isBansPlacedAction,
  isBansRevealedAction,
  isCardsPlayedAction,
  isPickMadeAction,
  isSwapMadeAction,
  isSwapPassedAction,
  type Action,
} from './actions';
import type { DraftState, TournamentDoc } from './model';
import { selectAttributedBans, selectBanCollisions, selectPublicBanIds } from './selectors';

/**
 * The six headings of 05-UI-SPEC §11, in the order they render.
 *
 * `round` is one section per round rather than one section: the entry carries the round it
 * was stamped with, and the component groups on that. Deriving the round from log position
 * instead would renumber every pick after an undo removed an earlier one.
 */
export type RecapSection = 'bans' | 'cards' | 'round' | 'swaps' | 'roundRobin' | 'bracket';

/** The ten entry lines of §11's table, one member each. */
export type RecapKind =
  | 'ban'
  | 'collision'
  | 'card'
  | 'pick'
  | 'swap'
  | 'pass'
  | 'match'
  | 'cut'
  | 'override'
  | 'void';

/** D-22's two marks, and the absence of one. Rule 2 above says why there is no third. */
export type RecapCorrection = 'none' | 'correctedLater' | 'corrects';

/**
 * The numbers a line interpolates, all optional because no line uses more than three.
 *
 * A bag rather than a discriminated union per kind. The component switches on `kind` and
 * reads what that kind puts here, and a union would make ten types where the whole content
 * is at most three integers.
 */
export interface RecapDetail {
  winnerGames?: number;
  loserGames?: number;
  metric?: number;
  value?: number;
  count?: number;
}

export interface RecapEntry {
  section: RecapSection;
  /** Present only for `section: 'round'`. */
  round?: number;
  seq: number;
  kind: RecapKind;
  /** Ids and names the line interpolates. No formatted prose — that is the component's job. */
  playerIds: readonly string[];
  monIds: readonly string[];
  /** D-22. A superseded result carries `correctedLater`; its replacement carries `corrects`. */
  correction: RecapCorrection;
  detail: RecapDetail;
}

/**
 * The `seq` of an entry that predates the log — a host banlist, settled in config.
 *
 * Negative rather than `0`, because `0` is a legitimate `seq` that the first action of a
 * tournament actually holds. It sorts first, which is chronologically true: the host chose
 * that banlist before anything was recorded.
 */
export const NO_LOG_SEQ = -1;

/**
 * The log in `seq` order, as a copy.
 *
 * A COPY, because the record handed in is never mutated and `sort` is in place. Ordered by
 * `seq` rather than trusted as stored, because an imported or hand-edited log is untrusted
 * input and array position is not the authority — CLAUDE.md §Conventions is explicit that
 * `seq` is the ordering and that it may have gaps.
 */
function inSeqOrder(log: readonly Action[]): Action[] {
  return [...log].sort((a, b) => a.seq - b.seq);
}

/** One entry, built fresh, with the fields no kind varies filled in. */
function entry(
  section: RecapSection,
  seq: number,
  kind: RecapKind,
  parts: {
    playerIds?: readonly string[];
    monIds?: readonly string[];
    round?: number;
    correction?: RecapCorrection;
    detail?: RecapDetail;
  } = {},
): RecapEntry {
  return {
    section,
    ...(parts.round === undefined ? {} : { round: parts.round }),
    seq,
    kind,
    playerIds: [...(parts.playerIds ?? [])],
    monIds: [...(parts.monIds ?? [])],
    correction: parts.correction ?? 'none',
    detail: { ...(parts.detail ?? {}) },
  };
}

/**
 * The ban section, per rule 1 — and its branch is deliberately `selectPublicBanIds`'.
 *
 * Three arms, in that selector's own order and with the same reading of a hand-edited snake
 * record that also carries a reveal: whichever source the mode makes authoritative is the
 * only one read. One of these two functions decides what the room may see and this decides
 * where it goes on the page; disagreeing about the source would put a species under the
 * wrong heading on the one screen somebody reaches for when they want the honest record.
 *
 * `hostBanlist` has no attribution at all — that mode runs no player ritual, so the banlist
 * belongs to the tournament rather than to a seat, and the entries carry no `playerIds`.
 */
function hostBanEntries(state: DraftState): RecapEntry[] {
  if (state.config.banMode !== 'hostBanlist') return [];

  return selectPublicBanIds(state).map((monId) =>
    entry('bans', NO_LOG_SEQ, 'ban', { monIds: [monId] }),
  );
}

/** Whether the mode's authoritative attribution actually holds this ban for this player. */
function attributionHolds(state: DraftState, playerId: string, monId: string): boolean {
  const record = selectAttributedBans(state).find((seat) => seat.playerId === playerId);
  return record !== undefined && record.monIds.includes(monId);
}

/**
 * Every ban the reveal made public, and the collisions among them.
 *
 * Read off `selectAttributedBans` and `selectBanCollisions` rather than off the action's own
 * payload, which is rule 1 doing its work: both selectors answer `[]` while the reveal has
 * not folded, so a blind night abandoned before it emits nothing here no matter what the log
 * holds. A collision appears ONCE, naming every player who chose that species — not once per
 * submitter, which would report one banned species as several.
 */
function revealEntries(state: DraftState, seq: number): RecapEntry[] {
  const entries: RecapEntry[] = [];

  for (const seat of selectAttributedBans(state)) {
    for (const monId of seat.monIds) {
      entries.push(entry('bans', seq, 'ban', { playerIds: [seat.playerId], monIds: [monId] }));
    }
  }

  for (const collision of selectBanCollisions(state)) {
    entries.push(
      entry('bans', seq, 'collision', {
        playerIds: collision.playerIds,
        monIds: [collision.monId],
      }),
    );
  }

  return entries;
}

/**
 * The night as a list of typed entries, in the order it happened — D-19.
 *
 * Chronological because that is closest to what the log actually is, which is D-19's stated
 * reason for choosing it: the fold is close to a formatting pass, and it reads as a story of
 * the evening rather than as a table of outcomes.
 *
 * Every arm applies `undo.ts`'s structural-guard-before-read discipline — an `is…Action`
 * guard rather than a bare `type` comparison, because an imported or hand-edited log is
 * untrusted input. An entry that fails its guard is SKIPPED rather than emitted half-built:
 * a pick-shaped entry with no `monId` folds to nothing, and a recap line naming a species
 * that is not there would be a sentence about an event that never happened.
 */
export function buildRecap(doc: TournamentDoc, state: DraftState): readonly RecapEntry[] {
  const entries: RecapEntry[] = [...hostBanEntries(state)];

  // The FIRST reveal wins, exactly as the fold's own arm does. A second one appended to a
  // hand-edited log must not be able to render the ban stage twice.
  let revealSeen = false;

  for (const action of inSeqOrder(doc.log)) {
    if (isBansPlacedAction(action) && state.config.banMode === 'snake') {
      if (!attributionHolds(state, action.playerId, action.monId)) continue;
      entries.push(
        entry('bans', action.seq, 'ban', {
          playerIds: [action.playerId],
          monIds: [action.monId],
        }),
      );
      continue;
    }

    if (isBansRevealedAction(action) && state.config.banMode === 'blind') {
      if (revealSeen) continue;
      revealSeen = true;
      entries.push(...revealEntries(state, action.seq));
      continue;
    }

    if (isCardsPlayedAction(action)) {
      entries.push(
        entry('cards', action.seq, 'card', {
          playerIds: [action.playerId],
          detail: { value: action.value },
        }),
      );
      continue;
    }

    if (isPickMadeAction(action)) {
      entries.push(
        entry('round', action.seq, 'pick', {
          round: action.round,
          playerIds: [action.playerId],
          monIds: [action.monId],
        }),
      );
      continue;
    }

    if (isSwapMadeAction(action)) {
      entries.push(
        entry('swaps', action.seq, 'swap', {
          playerIds: [action.playerId],
          monIds: [action.outMonId, action.inMonId],
        }),
      );
      continue;
    }

    if (isSwapPassedAction(action)) {
      entries.push(entry('swaps', action.seq, 'pass', { playerIds: [action.playerId] }));
      continue;
    }

    // Everything else is deliberately silent here. The tournament families arrive with the
    // correction marks, which is the half of this module that cannot be written without
    // reading the whole log.
  }

  return entries;
}
