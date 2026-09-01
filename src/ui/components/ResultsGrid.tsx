import { Fragment } from 'preact';

import type { DraftState, MatchMetric, MatchResult, StageFormat } from '../../core/model';
import {
  selectRemainingMatchCount,
  selectRoundRobinMatches,
  selectTournamentLocked,
} from '../../core/tournament';
import { matches as matchCount } from '../confirm-copy';
import { useRovingTabindex } from '../use-roving-tabindex';
import { FINISHED_SENTENCE } from './FinishedNotice';

import './ResultsGrid.css';

/**
 * The round-robin crosstable — TOUR-02, D-03. Every pairing, from the moment it starts.
 *
 * ## NO "NEXT MATCH" INDICATOR, AND THE EXECUTOR MUST NOT REACH FOR ONE
 *
 * `05-UI-SPEC` §Accent reserved for states the prohibition outright, and states why it is
 * written as a prohibition: **a yellow "next match" is the first thing a bracket
 * implementation reaches for.** There is no on-the-clock player in a fill-in-any-order
 * round robin, so accent must not mark a playable cell, and nothing here is
 * accent-coloured. What is left is carried by two things instead, both readable from three
 * metres: the stated count above the grid, and the holes in it. The eye counts holes; it
 * cannot count filled cells.
 *
 * ## It renders what the selectors return
 *
 * `selectRoundRobinMatches` owns the pair set and `selectRemainingMatchCount` owns the
 * count — the same count the cut control's inert gate reads, which is what makes the
 * sentence load-bearing rather than decorative. Neither is re-derived here, and the pair
 * set is looked up by the two players' IDS rather than by a match id this file assembles:
 * `import-guard` bounds a player id only as a non-empty unique string, so composing one is
 * how two different pairings silently collapse onto one key.
 *
 * ## Only the upper triangle carries live cells
 *
 * §4's reason, and it is about reading load rather than about tidiness: a mirrored lower
 * triangle would render every pairing twice on a screen people are reading from across a
 * room, and it would be a second visual authority on one match. The diagonal and the lower
 * triangle are `aria-hidden` and carry no text at all.
 *
 * ## No grid roles, and that is the accessible name's doing
 *
 * Each live cell's name carries BOTH axes — the row player, the column player and what
 * happened between them — so a screen reader hears which pairing it is on without a
 * row/cell relationship to walk. `BoardGrid` and `BanBoard` do not invent grid, row or
 * cell roles either, and **none may be added here**: the shipped keyboard model is a
 * roving tabindex over the live set, and a grid role announces a two-dimensional structure
 * whose second axis this component deliberately does not implement.
 *
 * The prohibition is DESCRIBED rather than quoted, following the pattern `FeasibilityBar`
 * records: the acceptance checks for this file are plain text searches, and a doc block
 * that spells out what it forbids makes the gate match its own documentation.
 */

/**
 * What the metric is called, for the caption above the grid and the dialog's field label.
 *
 * Declared here because the caption is the one place the unit is stated — §4 puts it above
 * the grid and forbids repeating it inside 28 cells — so the surface that owns saying it
 * owns the words. `MatchMetric`'s members are written into every saved document and a label
 * is free to be reworded, which is why the two are not the same string (`ConfigScreen`
 * states the same split for the control the host picks it on).
 */
export function metricLabel(metric: MatchMetric): string {
  return metric === 'koDifference' ? 'KO difference' : 'Pokémon left';
}

/**
 * Verbatim from `05-UI-SPEC` §Copywriting → Round robin.
 *
 * THE BARE PLURAL IS THE CONTRACT'S. `matchCount` pluralises the noun, so a two-player
 * round robin reads `All 1 match are recorded.` — the same wart `FeasibilityBar` records
 * for `{n} other problems also block the start.`, and the same posture: the copy table is
 * the thing to amend, and a component that fixed the verb here would put the two out of
 * agreement without settling which one is right.
 *
 * ## Why the plural branch spells the noun out instead of interpolating the helper
 *
 * A plan-level gate searches this file for the contract sentence as a contiguous run, so
 * the sentence has to BE one. `FeasibilityBar` states the same rule from the other side —
 * its doc block deliberately does not quote what it explains, because a gate that matches
 * documentation rather than rendered text is a gate that passes on a screen that has
 * stopped saying it. The singular still goes through the shared helper, which is the only
 * thing here that knows a round robin can hold exactly one match.
 */
function remainingLine(remaining: number, total: number): string {
  if (remaining === 0) return `All ${matchCount(total)} are recorded.`;
  if (total === 1) return `${remaining} of ${matchCount(total)} still to play.`;
  return `${remaining} of ${total} matches still to play.`;
}

function captionLine(metric: MatchMetric): string {
  return `Numbers are ${metricLabel(metric)} for the winner.`;
}

export const RESULTS_EMPTY = 'No results yet. Record a match by choosing any empty cell.';

/**
 * §10's locked sentence, re-exported rather than declared — the visible one above the grid.
 *
 * 05-10 declared it here because the INERT half had to exist the moment a cell could be
 * clicked on a finished tournament, which is reachable by importing a document whose final
 * is recorded: without it the reducer's `tournamentLocked` backstop refuses the dispatch
 * with nothing on screen to explain why, a control that silently does nothing. That comment
 * named `FinishedNotice` as the surface that would own the sentence, and 05-13 built it, so
 * the declaration moved there and this is now the second consumer of one literal.
 *
 * `FINISHED_CELL_REASON` below states the rule this follows and the reason for it. The
 * re-export is kept so nothing importing the sentence from the grid has to care which of
 * the two files currently declares it.
 *
 * Inert rather than hidden, which is the codebase's established move: a control that
 * vanished would make a host think the app had lost a feature.
 */
export { FINISHED_SENTENCE };

/**
 * Where focus lands when the host reopens a finished tournament — §Interaction's
 * `Focus after reopening` row.
 *
 * The `FinishedNotice` holding the control that was just pressed is REPLACED BY NOTHING,
 * so focus cannot stay where it was and must not drop to `<body>`. The contract names this
 * grid's first live cell as the destination, and the reason is that the reopen exists to
 * make exactly this surface usable again.
 *
 * A shared exported id, on `BRACKET_HEADING_ID`'s precedent and for its reason: the handoff
 * lives in `app.tsx`, because that is where the confirm dialog is raised and this grid does
 * not know it was reopened. An id retyped at the other end is one that fails silently when
 * either end moves.
 */
export const RESULTS_FIRST_CELL_ID = 'results-grid-first-cell';

/**
 * EXPORTED, on `metricLabel`'s precedent rather than copied into a second file.
 *
 * `MatchCard` renders the other half of this phase's inert consumers and needs the same
 * sentence in the same words. Two literals would be two things that can be reworded once.
 */
export const FINISHED_CELL_REASON =
  'This tournament is finished. Reopen it to change a result.';

/** `2–1`, with an en dash. Never a hyphen: the contract writes the dash and it is read. */
function gamesText(winnerGames: number, loserGames: number, rowWon: boolean): string {
  return rowWon ? `${winnerGames}–${loserGames}` : `${loserGames}–${winnerGames}`;
}

export interface ResultsGridProps {
  state: DraftState;
  /**
   * A live cell the host activated. The caller opens the dialog.
   *
   * The PAIRING travels with the id, and the stage's format with it. Both are facts this
   * surface already holds and neither is recoverable from a match id without parsing it —
   * which is the thing `selectRoundRobinMatches` refuses to do, because a player id may
   * legally contain a colon. `format` is the round robin's because this IS the round robin;
   * a bracket cell hands over the bracket's, which is D-08's per-stage split arriving where
   * it belongs rather than being re-decided in the dialog.
   */
  onSelectMatch: (match: {
    matchId: string;
    aId: string;
    aName: string;
    bId: string;
    bName: string;
    format: StageFormat;
  }) => void;
}

export function ResultsGrid({ state, onSelectMatch }: ResultsGridProps) {
  const players = state.config.players;
  const pairs = selectRoundRobinMatches(state);
  const remaining = selectRemainingMatchCount(state);

  const showGames = state.config.roundRobinFormat === 'bo3';
  const showMetric = state.config.depth === 'draftBracketsAndLog';
  const locked = selectTournamentLocked(state);

  /*
    The hook in its 1-D mode — `count` alone, and the second option deliberately omitted.
    The live set is TRIANGULAR, so a fixed stride down the column axis is wrong on every
    row, and a per-row stride would be a second navigation model for one hook. Left and
    Right walk the live cells in reading order, Home and End jump to the ends, and Enter
    and Space reach the platform untouched as native button activation.

    `pairs.length` rather than a count of what is rendered: every pairing is a live cell,
    which is D-03 restated as arithmetic. The hook reads `:scope > button`, so the label,
    header, diagonal and lower-triangle `<div>`s are invisible to it.
  */
  const rove = useRovingTabindex<HTMLDivElement>({ count: pairs.length });

  function pairFor(rowId: string, columnId: string): string | null {
    const pair = pairs.find((match) => match.aId === rowId && match.bId === columnId);
    return pair === undefined ? null : pair.matchId;
  }

  function resultFor(matchId: string): MatchResult | null {
    return state.matchResults.find((result) => result.matchId === matchId) ?? null;
  }

  /** The cell's one line of text, from the ROW player's perspective. */
  function cellText(result: MatchResult, rowWon: boolean): string {
    const verdict = rowWon ? 'Won' : 'Lost';
    if (!showGames) return verdict;
    return `${verdict} ${gamesText(result.winnerGames, result.loserGames, rowWon)}`;
  }

  /** Both axes, so the grid needs no roles to say which pairing this is. */
  function cellName(
    rowName: string,
    columnName: string,
    result: MatchResult | null,
    rowWon: boolean,
  ): string {
    const finished = locked ? ` — ${FINISHED_CELL_REASON}` : '';

    if (result === null) return `${rowName} versus ${columnName} — not played yet${finished}`;

    const games = showGames
      ? ` ${gamesText(result.winnerGames, result.loserGames, rowWon)}`
      : '';
    const metric = showMetric
      ? `, ${result.metric} ${metricLabel(state.config.matchMetric)}`
      : '';

    return `${rowName} ${rowWon ? 'beat' : 'lost to'} ${columnName}${games}${metric}${finished}`;
  }

  // The tab stop's position among the live cells, counted in the same reading order the
  // hook walks. Incremented as the triangle is laid out rather than computed from a
  // row/position pair, because a triangular set has no closed form worth writing twice.
  let liveIndex = -1;

  return (
    <div class="results-grid">
      <p class="results-grid__count">{remainingLine(remaining, pairs.length)}</p>

      {/*
        Tier 3 only. At `draftAndBrackets` every match carries `metric: 0` and nothing
        reads it, so a caption naming a unit the grid never shows would be a sentence about
        a column that is not there.
      */}
      {showMetric && <p class="results-grid__caption">{captionLine(state.config.matchMetric)}</p>}

      {remaining === pairs.length && <p class="results-grid__empty">{RESULTS_EMPTY}</p>}

      {/* ONE visible sentence, per §4's finished row. The cells carry the rest. */}
      {locked && <p class="results-grid__finished">{FINISHED_SENTENCE}</p>}

      {/*
        The shipped `overflow-x: auto` wrapper. The grid fits with no internal scroll up to
        and including 8 players — the project's stated design ceiling — and degrades to a
        scroll above it rather than to a break, with the label column pinned so the host can
        always see which row they are reading.
      */}
      <div class="results-grid__scroll">
        <div
          class="results-grid__grid"
          ref={rove.containerRef}
          onKeyDown={rove.onKeyDown}
          /*
            THE ONE THING SET INLINE, for the reason the two boards set theirs inline: CSS
            `repeat()` takes an integer at parse time and cannot read a custom property for
            its count, so a player count derived from the config has nowhere else to land.
            The label width stays `--board-label-w` and the floor stays
            `--results-col-min` — both tokens declared once in the file that owns their
            reasoning — so no raw length moves into this component and the crosstable
            cannot drift away from the draft board it sits beside.
          */
          style={{
            gridTemplateColumns: `var(--board-label-w) repeat(${players.length}, minmax(var(--results-col-min), 1fr))`,
          }}
        >
          {/* Above the label column, opposite the headers. Deliberately empty. */}
          <div class="results-grid__corner" />

          {players.map((player) => (
            <div class="results-grid__header" key={player.id}>
              {player.name}
            </div>
          ))}

          {players.map((rowPlayer, rowIndex) => (
            <Fragment key={rowPlayer.id}>
              <div class="results-grid__label">{rowPlayer.name}</div>

              {players.map((columnPlayer, columnIndex) => {
                /*
                  The diagonal and the lower triangle. Hidden from assistive technology and
                  carrying no text, because they carry no information — see the doc block.
                */
                if (columnIndex <= rowIndex) {
                  return (
                    <div class="results-grid__blank" key={columnPlayer.id} aria-hidden="true" />
                  );
                }

                const matchId = pairFor(rowPlayer.id, columnPlayer.id);
                if (matchId === null) {
                  return (
                    <div class="results-grid__blank" key={columnPlayer.id} aria-hidden="true" />
                  );
                }

                const result = resultFor(matchId);
                const rowWon = result !== null && result.winnerId === rowPlayer.id;

                liveIndex += 1;
                const index = liveIndex;

                /*
                  The cell classes are the DRAFT BOARD's, reused rather than restated. The
                  dashed hairline on an empty cell is a shipped mechanism with its
                  justification written beside it, and a second copy here would be a second
                  thing that can disagree about what an empty slot looks like.
                */
                const className = [
                  'board__cell',
                  'results-grid__cell',
                  result === null
                    ? 'board__cell--empty'
                    : 'results-grid__cell--recorded',
                ].join(' ');

                /*
                  `aria-disabled` without the native attribute, and absent rather than
                  `"false"` when it does not hold — WR-04's rule, and the reason is the same
                  one `FeasibilityBar` gives: a natively disabled control is not focusable,
                  so the reason in its accessible name would be unreachable by keyboard.
                */
                const inert = locked ? 'true' : undefined;

                return (
                  <button
                    type="button"
                    class={className}
                    key={columnPlayer.id}
                    /*
                      The reopen's focus destination, on the FIRST live cell in the same
                      reading order the roving hook walks — see `RESULTS_FIRST_CELL_ID`.
                      `undefined` everywhere else, because an id repeated across 28 cells
                      is not an id.
                    */
                    id={index === 0 ? RESULTS_FIRST_CELL_ID : undefined}
                    tabIndex={rove.tabIndexAt(index)}
                    aria-disabled={inert}
                    onFocus={() => rove.onItemFocus(index)}
                    onClick={() => {
                      // The early return IS the refusal — see the note above `inert`.
                      if (locked) return;

                      onSelectMatch({
                        matchId,
                        aId: rowPlayer.id,
                        aName: rowPlayer.name,
                        bId: columnPlayer.id,
                        bName: columnPlayer.name,
                        format: state.config.roundRobinFormat,
                      });
                    }}
                  >
                    {/*
                      An UNPLAYED cell renders nothing at all — no text and no fill. That is
                      the hole the count above is counted against, and adding a placeholder
                      here would take the signal away.
                    */}
                    {result !== null && (
                      <span class="results-grid__result" aria-hidden="true">
                        {cellText(result, rowWon)}

                        {showMetric && (
                          <>
                            <span class="results-grid__sep" aria-hidden="true">
                              {' · '}
                            </span>
                            {result.metric}
                          </>
                        )}
                      </span>
                    )}

                    <span class="visually-hidden">
                      {cellName(rowPlayer.name, columnPlayer.name, result, rowWon)}
                    </span>
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
