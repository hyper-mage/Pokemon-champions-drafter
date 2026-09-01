import { useEffect, useRef } from 'preact/hooks';

import type { SpriteMeta } from '../../adapters/roster-source';
import type { DraftState, TournamentDoc } from '../../core/model';
import { buildRecap, type RecapEntry, type RecapSection } from '../../core/recap';
import type { RosterEntry } from '../../core/roster/types';
import { selectPlayerName } from '../../core/selectors';
import { matches } from '../confirm-copy';
import { MonChip } from './MonChip';
import { metricLabel } from './ResultsGrid';

import './RecapList.css';

/**
 * The night, read back in the order it happened — PERS-09, `05-UI-SPEC` §11.
 *
 * ## This component decides nothing
 *
 * `buildRecap` returns typed entries carrying ids and numbers, and this maps them onto the
 * ten lines of §11's table. That split is the whole reason the core module emits ids rather
 * than prose: a pure module that formatted the copy would put contract strings in
 * `src/core/`, where the copy contract has no business being — and the names those lines
 * interpolate live on the roster, which the core never holds.
 *
 * Which entries exist, what order they are in, which section each belongs to and whether a
 * result was corrected are all answered before this file sees them. There is no rule here.
 *
 * ## Corrections are marked with WORDS
 *
 * §11 is explicit about the treatment this surface must not use, and the reason is worth
 * keeping: a struck-through line already means *gone or unavailable* in this project — it is
 * the snake ban-list's treatment — and a corrected result is neither. It happened, and then
 * it was changed. Giving one visual signal two meanings makes the signal worth less than the
 * two sentences it replaced, so the marks here are words at `--text-label` and the stylesheet
 * carries a standing prohibition on the property that would draw the line.
 *
 * ## It replaces the main region and nothing else
 *
 * `CompletedDraft.tsx`'s posture, inherited verbatim rather than re-argued: a host who
 * realises HERE that the last result was wrong must still be able to unwind it, and
 * `Undo last move` lives in the top bar. A recap that took over the whole screen would make
 * the correction it is describing unreachable from the surface describing it.
 *
 * ## It is rendered, and only rendered
 *
 * There is deliberately no control here that puts the recap anywhere else — no
 * copy-to-the-system-buffer button, no text export, no print stylesheet. `05-CONTEXT.md`
 * §Deferred records that this was raised while D-19 and D-20 were being designed and not
 * pursued: PERS-09 says the recap is rendered, and the export surface in this project is
 * species-only pastes for two specific targets. A later reader finds a decision here rather
 * than an oversight.
 *
 * ## Not interactive beyond the way out
 *
 * §Interaction names this surface in the no-roving-tabindex list: the recap is not an
 * interactive set at all, so there is nothing to rove between. One back control, and lines.
 */

/** Verbatim from `05-UI-SPEC` §Copywriting → Recap and → Bracket. */
export const RECAP_HEADING = 'Draft recap';
export const VIEW_RECAP = 'View the draft recap';

/**
 * The two ways out, and they are NOT a second declaration of `TournamentScreen`'s own
 * `BACK_TO_DRAFT`.
 *
 * Three of these words coincide with that control's, and the controls do not: that one
 * leaves the tournament screen for the draft board, and this one closes the recap over a
 * `draftOnly` night. One constant serving both would mean rewording one silently rewords the
 * other, which is the failure a shared constant is supposed to prevent rather than cause.
 */
export const BACK_TO_BRACKET = 'Back to the bracket';
export const BACK_TO_DRAFT_FROM_RECAP = 'Back to the draft';

/** D-22's two marks. Neither is ever drawn as a struck-through line — see the doc block. */
const CORRECTED_LATER = 'Corrected later';
const CORRECTS_EARLIER = 'Corrects an earlier result';

/**
 * The focus seam, as a shared exported id constant — 05-13's established pattern.
 *
 * §Interaction: focus enters the recap on its heading and leaves to `View the draft recap`,
 * the control that was activated and which exists again. The control does not exist at the
 * moment of the click that closes the recap, so the caller cannot hold a ref to it and has
 * to address it after the render that puts it back.
 */
export const RECAP_ACTION_ID = 'recap-action';
const RECAP_HEADING_ID = 'recap-heading';

/** Section headings, in the order §11 gives them. `round` is composed per round. */
const SECTION_HEADING: Record<Exclude<RecapSection, 'round'>, string> = {
  bans: 'Bans',
  cards: 'Priority cards',
  swaps: 'Swaps',
  roundRobin: 'Round robin',
  bracket: 'Bracket',
};

function roundHeading(round: number): string {
  return `Round ${round}`;
}

/**
 * The comma-and-`and` composer, in `BanReveal.nameList`'s shape and for its reason.
 *
 * **No Oxford comma**, matching the three shipped forms that phase settled. The empty case
 * returns an empty string rather than throwing: a block with no members is a shape only a
 * hand-edited record produces, and a blank clause is a better answer on a shared screen than
 * a crash in the middle of an account of the evening.
 */
function nameList(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0] ?? '';

  const last = names[names.length - 1] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${last}`;
}

/**
 * A collision, named once however many players chose the species — §11.
 *
 * `both` at two and `all` above it, on `BanReveal.collisionSentence`'s split: English has a
 * word for two and it is not the word for five. The consequence clause is ONE literal shared
 * by both arms, so the sentence the copy table pins cannot drift between the two.
 */
const BANNED_ONCE = 'It was banned once.';

function collisionLine(playerNames: readonly string[], speciesName: string): string {
  const quantifier = playerNames.length === 2 ? 'both' : 'all';
  return `${nameList(playerNames)} ${quantifier} banned ${speciesName}. ${BANNED_ONCE}`;
}

/**
 * The void line, and its bare plural is the contract's — §Copywriting → Recap.
 *
 * `ResultsGrid.remainingLine` states the rule this follows and states it from experience:
 * a plan-level gate searches this file for the contract sentence as a contiguous run, so the
 * sentence has to BE one, and the singular goes through the shared helper while the plural
 * spells the noun out. `All 1 match are recorded.` is the same wart one surface along, and
 * `FeasibilityBar` carries a third — the copy table is the thing to amend, and a component
 * that quietly fixed the verb here would put the three out of agreement without settling
 * which of them is right.
 */
function voidLine(count: number): string {
  if (count === 1) return `${matches(count)} were voided by a correction.`;
  return `${count} matches were voided by a correction.`;
}

/** `2–1`, winner first. `ResultsGrid.gamesText`'s shape, without its row perspective. */
function gamesText(winnerGames: number, loserGames: number): string {
  return `${winnerGames}–${loserGames}`;
}

export interface RecapAccess {
  /**
   * The whole record, because the recap reads the LOG.
   *
   * `buildRecap` cannot take the fold: D-09's arm keeps only the latest result per match and
   * D-22 needs the ones it dropped. `src/core/recap.ts`'s header carries the full argument.
   */
  doc: TournamentDoc;
  /** Species names and sprites. A rotated roster answers `undefined` and the line falls back to the id. */
  entryById: ReadonlyMap<string, RosterEntry>;
  spriteMeta: SpriteMeta;
}

export interface RecapListProps extends RecapAccess {
  state: DraftState;
  /** `Back to the bracket`, or `Back to the draft` at `draftOnly` depth. */
  backLabel: string;
  onBack: () => void;
}

/** One rendered block: a heading and the entries under it. */
interface Group {
  key: string;
  heading: string;
  entries: RecapEntry[];
}

/**
 * §11's six headings, in log order, with `Round {n}` expanded to one block per round.
 *
 * A section with no entries produces no group and therefore no heading, on the same
 * no-empty-state reasoning the landing screen uses: a host who banned nothing does not need
 * a heading telling them so.
 */
function groupsFor(entries: readonly RecapEntry[]): Group[] {
  const groups: Group[] = [];

  const push = (key: string, heading: string, members: RecapEntry[]): void => {
    if (members.length > 0) groups.push({ key, heading, entries: members });
  };

  const inSection = (section: RecapSection): RecapEntry[] =>
    entries.filter((entry) => entry.section === section);

  push('bans', SECTION_HEADING.bans, inSection('bans'));
  push('cards', SECTION_HEADING.cards, inSection('cards'));

  // Rounds in ascending order, read off the entries rather than off `config.rounds`: a
  // tournament abandoned in round two has no round three, and a heading for one would be a
  // block with nothing under it.
  const rounds = inSection('round');
  const numbers = [...new Set(rounds.map((entry) => entry.round ?? 0))].sort((a, b) => a - b);
  for (const round of numbers) {
    push(
      `round-${round}`,
      roundHeading(round),
      rounds.filter((entry) => (entry.round ?? 0) === round),
    );
  }

  push('swaps', SECTION_HEADING.swaps, inSection('swaps'));
  push('roundRobin', SECTION_HEADING.roundRobin, inSection('roundRobin'));
  push('bracket', SECTION_HEADING.bracket, inSection('bracket'));

  return groups;
}

export function RecapList({
  doc,
  state,
  entryById,
  spriteMeta,
  backLabel,
  onBack,
}: RecapListProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  /*
    FOCUS ENTERS ON THE HEADING — §Interaction. Mount only: re-running it would drag focus
    back to the top while the host is reading down the night.
  */
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const entries = buildRecap(doc, state);

  /** A display name for a seat, falling back to the id rather than to an empty sentence. */
  const playerName = (playerId: string): string =>
    selectPlayerName(state, playerId) ?? playerId;

  /**
   * A species name, falling back to the id.
   *
   * Not a defensive flourish: Champions regulations rotate roughly every 2.5 months, so a
   * tournament filed before a rotation and opened after it can legitimately name species the
   * current snapshot no longer holds. An id on screen is honest; a blank is not.
   */
  const speciesName = (monId: string): string => entryById.get(monId)?.name ?? monId;

  /** Tier 3 only, exactly as the crosstable's caption is. */
  const showMetric = state.config.depth === 'draftBracketsAndLog';

  /** §11's table, one arm per `kind`. Composed as ONE string and rendered as a text child. */
  function lineFor(entry: RecapEntry): string {
    const first = entry.playerIds[0];
    const actor = first === undefined ? 'The host' : playerName(first);
    const mon = entry.monIds[0];

    switch (entry.kind) {
      case 'ban':
        return `${actor} banned ${speciesName(mon ?? '')}.`;
      case 'collision':
        return collisionLine(entry.playerIds.map(playerName), speciesName(mon ?? ''));
      case 'card':
        return `${actor} played ${entry.detail.value ?? 0}.`;
      case 'pick':
        return `${actor} picked ${speciesName(mon ?? '')}.`;
      case 'swap':
        return `${actor} swapped ${speciesName(mon ?? '')} for ${speciesName(entry.monIds[1] ?? '')}.`;
      case 'pass':
        return `${actor} passed.`;
      case 'match': {
        const loser = entry.playerIds[1];
        const games = gamesText(entry.detail.winnerGames ?? 0, entry.detail.loserGames ?? 0);
        // The games are unconditional here where the crosstable hides them at `bo1`, and
        // §11's row is why: a cell has three words to work with and a sentence does not.
        const line = `${actor} beat ${loser === undefined ? '' : playerName(loser)} ${games}.`;
        if (!showMetric) return line;
        return `${line} · ${entry.detail.metric ?? 0} ${metricLabel(state.config.matchMetric)}`;
      }
      case 'cut':
        return `The cut was taken at ${entry.detail.count ?? 0}.`;
      case 'override':
        return `The host ordered ${nameList(entry.playerIds.map(playerName))} by hand.`;
      case 'void':
        return voidLine(entry.detail.count ?? 0);
    }
  }

  /** D-22's mark, or `null` for a line that was never corrected and never corrected one. */
  function markFor(entry: RecapEntry): string | null {
    if (entry.correction === 'correctedLater') return CORRECTED_LATER;
    if (entry.correction === 'corrects') return CORRECTS_EARLIER;
    return null;
  }

  /**
   * The sprite, on ban and pick lines and nowhere else — §11.
   *
   * `showName` is false and the wrapper is hidden from assistive technology, because the
   * line beside it already names the species: the chip is the picture of a sentence that has
   * been said, not a second statement of it. No type hue, per §Color — no tournament surface
   * carries one, exactly as no board chip does.
   */
  function chipFor(entry: RecapEntry) {
    if (entry.kind !== 'ban' && entry.kind !== 'pick') return null;

    const monId = entry.monIds[0];
    const rosterEntry = monId === undefined ? undefined : entryById.get(monId);
    if (rosterEntry === undefined) return null;

    return (
      <span class="recap-list__chip" aria-hidden="true">
        <MonChip entry={rosterEntry} spriteMeta={spriteMeta} showName={false} />
      </span>
    );
  }

  return (
    <section class="recap-list" aria-labelledby={RECAP_HEADING_ID}>
      <div class="recap-list__head">
        <h2
          class="recap-list__heading"
          id={RECAP_HEADING_ID}
          ref={headingRef}
          // -1, so focus can be HANDED here on entry without the heading becoming a tab
          // stop. `BanReveal`'s headline carries the same attribute for the same reason.
          tabIndex={-1}
        >
          {RECAP_HEADING}
        </h2>

        <button type="button" class="recap-list__back" onClick={onBack}>
          {backLabel}
        </button>
      </div>

      {groupsFor(entries).map((group) => (
        <div class="recap-list__section" key={group.key}>
          <h3 class="recap-list__section-heading">{group.heading}</h3>

          <ul class="recap-list__entries">
            {group.entries.map((entry, index) => (
              /*
                Keyed by `seq` AND position. `seq` alone is not unique here: a reveal is one
                action carrying every player's bans, so the lines it yields all share its
                number — which is stated in `recap.ts`'s header rather than discovered by a
                duplicate-key warning.
              */
              <li class="recap-list__entry" key={`${entry.seq}-${index}`}>
                {chipFor(entry)}

                <span class="recap-list__line">{lineFor(entry)}</span>

                {markFor(entry) !== null && (
                  <span class="recap-list__mark">{markFor(entry)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
