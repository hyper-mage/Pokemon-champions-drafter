import type { DraftState } from '../../core/model';
import { selectStandings, type StandingsRow } from '../../core/tournament';
import { metricLabel } from './ResultsGrid';

import './StandingsTable.css';

/**
 * The standings — TOUR-08, `05-UI-SPEC` §6, D-02 and D-13.
 *
 * ## It renders a result and computes nothing
 *
 * `FeasibilityBar.tsx:6-16` is the shipped statement of the rule and it is not restated
 * here. Every place, every record and — the part that matters — the LINK that decided each
 * row comes out of `selectStandings`. `StandingsRow.decidedBy` maps onto §6's note table,
 * so this file looks a member up rather than working the chain out again. §Pure-core
 * boundary is blunt about it: if a surface seems to need the UI to decide a rule, the
 * selector is missing — add the selector, do not add a comparison here.
 *
 * ## The rows are an ordered list, and that is the arm of `SchedulePreview`'s own test
 *
 * `SchedulePreview.tsx:17-23` states the rule in the tree: `PlayerList` deliberately does
 * NOT wrap its name rows in a list element, because each row is already announced by its
 * own label, while its numbered starting order IS one, because there the ordinal is the
 * information. A standings table is the second case and it is not a close call — the
 * position is the whole of what the table says.
 *
 * ## The metric column is ABSENT at tier 2, not greyed out
 *
 * D-02 considered a greyed-out differential column and rejected it. An empty column is not
 * the same statement as a table that has two tiebreak links rather than three: the first
 * says there is a number here and it is missing, the second says this depth records no
 * numbers at all. `selectStandings` carries the same distinction in code — at
 * `draftAndBrackets` a block passes through link 2 untouched — and the caption below is
 * what states it on screen.
 *
 * The tier-2 caption is the contract's sentence unedited. It admits, in front of the room,
 * that the lighter depth reaches the host's own hands sooner. That is the honest cost of
 * the tier, stated rather than left to be noticed.
 *
 * ## No roving tabindex, and that is a decision
 *
 * `SchedulePreview.tsx:31-37`'s model applied one surface further along: the roving hook
 * exists to collapse a LARGE UNIFORM INTERACTIVE set — 235 pool cells, 18 type pills. A
 * standings table is at most twelve rows and holds no interactive cell at all, so there is
 * nothing to collapse and nothing to focus. §Interaction states this outright so the hook
 * is not wired out of habit.
 *
 * ## Nothing here animates
 *
 * §Interaction's motion budget names this surface: a standings table does not animate a
 * reorder. A row that slides into place is a row nobody can read while it moves, on a
 * screen a room is reading from three metres away. The stylesheet carries no motion rule
 * at all.
 */

/** Verbatim from `05-UI-SPEC` §Copywriting → Standings. */
export const STANDINGS_HEADING = 'Standings';

/**
 * The column names, from §6's table.
 *
 * Module constants rather than inline JSX text (PATTERNS S-6): JSX collapses whitespace
 * between text lines, and the header row is asserted on exact equality.
 */
const COLUMN_POSITION = 'Position';
const COLUMN_PLAYER = 'Player';
const COLUMN_RECORD = 'Record';
const COLUMN_NOTE = 'Tiebreak note';

/**
 * The chain, stated above the table — and the statement differs by depth (D-02).
 *
 * Two whole sentences rather than one sentence with a clause switched out. The tier-2 line
 * is not the tier-3 line with a link removed: it names the depth, says what that depth
 * records, and says what follows for the host. Building it by trimming the other would put
 * a rule back into this component, which is exactly what §Pure-core boundary forbids.
 */
function captionFor(label: string, scoresMetric: boolean): string {
  if (scoresMetric) {
    return `Ties break on record, then ${label} summed across every match, then head-to-head between two players. Anything still tied is yours to order.`;
  }
  return `Ties break on record, then head-to-head between two players. Draft and brackets records no numbers, so there is no ${label} link and a tie reaches you sooner.`;
}

/**
 * §6's note table, one branch per member of the union — and no rule of its own.
 *
 * The two head-to-head notes are DIFFERENT STRINGS selected on depth, not one string with
 * a clause trimmed off. A trim would be this component deciding what the tier-2 chain looks
 * like, and the two would drift the first time either sentence was reworded.
 *
 * `hostOrder` renders nothing, and the omission is deliberate rather than forgotten. §6's
 * note table supplies five rows and none of them is a host-ordered one; the act itself is
 * recorded where the contract does put it, in §Copywriting → Recap's
 * `The host ordered {playerNames} by hand.` Inventing a sixth note here would be copy this
 * surface is not entitled to add — unlike the cut's second inert reason, which was ruled
 * and pinned byte-for-byte before it was rendered.
 */
function noteFor(row: StandingsRow, label: string, scoresMetric: boolean): string {
  switch (row.decidedBy) {
    case 'metric':
      return `Tied on record · ${label} decided it`;
    case 'headToHead':
      return scoresMetric
        ? `Tied on record and ${label} · head-to-head decided it`
        : `Tied on record · head-to-head decided it`;
    case 'tied':
      return 'Tied — order these yourself';
    case 'record':
    case 'hostOrder':
      return '';
  }
}

/** `{w}-{l}` with an en dash. The contract writes the dash and the room reads it. */
function recordText(row: StandingsRow): string {
  return `${row.wins}–${row.losses}`;
}

export interface StandingsTableProps {
  state: DraftState;
}

export function StandingsTable({ state }: StandingsTableProps) {
  const rows = selectStandings(state);
  const scoresMetric = state.config.depth === 'draftBracketsAndLog';
  const label = metricLabel(state.config.matchMetric);

  const className = scoresMetric ? 'standings-table standings-table--metric' : 'standings-table';

  return (
    <div class={className}>
      <h3 class="standings-table__heading">{STANDINGS_HEADING}</h3>

      <p class="standings-table__caption">{captionFor(label, scoresMetric)}</p>

      <div class="standings-table__cells standings-table__head">
        <span class="standings-table__column">{COLUMN_POSITION}</span>
        <span class="standings-table__column">{COLUMN_PLAYER}</span>
        <span class="standings-table__column">{COLUMN_RECORD}</span>

        {/*
          Rendered only at tier 3, and ABSENT rather than empty at tier 2 — see the doc
          block. The header is the element a test can look for that an empty cell would
          still satisfy, which is why the column is dropped from the markup instead of
          being rendered blank.
        */}
        {scoresMetric && <span class="standings-table__column">{label}</span>}

        <span class="standings-table__column">{COLUMN_NOTE}</span>
      </div>

      <ol class="standings-table__rows">
        {rows.map((row) => {
          const player = state.config.players.find((entry) => entry.id === row.playerId);
          const note = noteFor(row, label, scoresMetric);

          return (
            <li class="standings-table__cells standings-table__row" key={row.playerId}>
              {/*
                VERBATIM from the selector. Three players tied for third read 3, 3, 3 and
                the next resolved row reads 6, because that is what `selectStandings`
                produced. Renumbering them 3, 4, 5 is the tidy-up a later reader will reach
                for, and it would assert an order this tool has explicitly refused to
                compute — in the column beside a note that says the opposite.
              */}
              <span class="standings-table__position">{row.position}</span>

              {/* `name` renders; `id` is what keyed the row and what matched the player. */}
              <span class="standings-table__player">{player?.name ?? row.playerId}</span>

              <span class="standings-table__record">{recordText(row)}</span>

              {scoresMetric && <span class="standings-table__metric">{row.metric}</span>}

              <span class="standings-table__note">{note}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
