import { toShowdownPaste, type PasteSlot } from '../../core/export/paste';
import type { DraftState, PlayerConfig } from '../../core/model';
import type { RosterEntry } from '../../core/roster/types';
import { selectSlotStone, selectTeams } from '../../core/selectors';
import { selectTournamentStage } from '../../core/tournament';
import { CHECKPOINT_HEADING, CheckpointPrompt } from '../components/CheckpointPrompt';
import { ExportPanel } from '../components/ExportPanel';

import './CompletedDraft.css';

/**
 * What the host sees when the draft is finished — EXPO-06 and PERS-06.
 *
 * It replaces the pool grid and nothing else. The top bar and the draft board stay
 * exactly where they were, which is a requirement rather than an oversight: a host who
 * realises on this screen that the last pick was wrong must still be able to unwind it,
 * and `Undo last move` lives in the top bar. A completed-draft screen that swapped out
 * the whole draft region would make the final pick the one pick in the tournament that
 * could not be taken back.
 *
 * The board is not re-rendered here either. `BoardGrid` is already on screen above this
 * component and remains the completed record; drawing a second copy of every team would
 * be the duplicate team panel D-06 explicitly rules out for this phase.
 *
 * ## Where the paste text comes from
 *
 * `toShowdownPaste` and nowhere else. This component maps a player's slots into the
 * shape that function takes and hands the result to `ExportPanel` as a finished string.
 * The format — species-only, blank-line separated, `Species @ Stone` for a Mega — is
 * settled in `src/core/export/paste.ts` and is not re-decided, re-derived or adjusted
 * here. Plan 01-08's spike confirmed one paste serves both Showdown and pokebase, so
 * there is one block per player and no target-specific variant.
 */

export interface CompletedDraftProps {
  /** In board order, so the panels and the board rows read down the page together. */
  players: readonly PlayerConfig[];
  /**
   * The folded document. Both the slot contents and the slot KINDS come from it.
   *
   * It replaced a `teams` prop in 03-06, and not for tidiness: the stone a slot exports
   * with is `selectSlotStone`'s answer, which reads the schedule and the picks off this
   * state. A separate `teams` prop would have been a second copy of the same fold, free to
   * name a different species from the one the stone was resolved for — and the export is
   * the last surface in the app, with nothing downstream to catch the disagreement.
   */
  state: DraftState;
  /**
   * The roster, for `selectSlotStone`. Ambient data the core RECEIVES rather than holds:
   * `DraftState` has no roster field and must not gain one.
   */
  entries: readonly RosterEntry[];
  /** The same roster as a lookup, for `toShowdownPaste`. One memo upstream feeds both. */
  entryById: ReadonlyMap<string, RosterEntry>;
  /** Whether the checkpoint milestone has been reached. */
  checkpointReached: boolean;
  checkpointDismissed: boolean;
  onDownload: () => void;
  onDismissCheckpoint: () => void;
  /**
   * Go to the tournament surfaces — the round robin, the cut and the bracket.
   *
   * The control that calls this renders only when `selectTournamentStage(state)` is not
   * `'notRunning'`, which is what makes a `draftOnly` night skip every bracket screen
   * entirely (ROADMAP criterion 1's first clause) without this file knowing what
   * `draftOnly` is. No log action is involved and none is wanted: the round robin exists
   * the moment the draft completes, because every pairing is derived.
   */
  onOpenTournament: () => void;
}

/**
 * Verbatim, and named so the test and the screen cannot drift apart.
 *
 * A verb and its object, per `CLAUDE.md` §Copy. Not `Continue` and not `Next`: what the
 * host is opening is the tournament, and the export panels they are leaving stay one
 * `Back to the draft` away.
 */
export const OPEN_TOURNAMENT = 'Go to the tournament';

/**
 * A player's slots in the shape `toShowdownPaste` accepts.
 *
 * ## The SLOT decides the stone, never the species — D-04
 *
 * `selectSlotStone` answers per slot index, and it answers from the compiled schedule: a
 * Mega round's slot carries its forme's `requiredItem`, and every other slot carries
 * `null`. So a Mega-CAPABLE species drafted into an open round occupies an untyped slot
 * and exports bare, which is the case that reads backwards if the stone is taken off the
 * species instead — and it would produce a paste claiming a Mega nobody drafted, with no
 * test of the species table able to see it.
 *
 * Nothing about the format is re-decided here. Phase 1 settled `PasteSlot.megaStone` for
 * exactly this caller, which is why `toShowdownPaste`'s signature did not change; and
 * `declaredStone` inside it re-derives the name from the entry's OWN copy, so every
 * character reaching text the host pastes into a third-party site originates in the
 * committed snapshot. A slot whose species has no matching forme yields `null` there and
 * exports bare with no special case, which is what makes the zero-legal-formes case
 * ordinary rather than an error (D-10).
 */
function toSlots(
  state: DraftState,
  entries: readonly RosterEntry[],
  playerId: string,
): (PasteSlot | null)[] {
  const slots = selectTeams(state)[playerId] ?? [];

  return slots.map((monId, slotIndex) =>
    monId === null
      ? null
      : { monId, megaStone: selectSlotStone(state, entries, playerId, slotIndex) },
  );
}

export function CompletedDraft({
  players,
  state,
  entries,
  entryById,
  checkpointReached,
  checkpointDismissed,
  onDownload,
  onDismissCheckpoint,
  onOpenTournament,
}: CompletedDraftProps) {
  /*
    The stage selector decides whether there is a tournament to go to, and this file does
    not second-guess it. `'notRunning'` is its answer for a `draftOnly` night and for a
    draft that is not finished — precisely the two cases with no surface to open — so the
    control appears exactly when one exists.
  */
  const hasTournament = selectTournamentStage(state) !== 'notRunning';

  return (
    <div class="completed-draft">
      {/*
        AN ADDED CONTROL, NOT A SCREEN SWAP. This component takes the pool grid's place and
        nothing else — the doc block above says why in terms that apply unchanged here, and
        a completed-draft screen that replaced the whole draft region to offer this would
        make the final pick the one pick in the tournament that could not be taken back.
      */}
      {hasTournament && (
        <button type="button" class="completed-draft__tournament" onClick={onOpenTournament}>
          {OPEN_TOURNAMENT}
        </button>
      )}

      <CheckpointPrompt
        // The DRAFT milestone names itself. 04-11 mounts the same component at the ban
        // reveal under its own heading, and neither caller inherits the other's by default.
        heading={CHECKPOINT_HEADING}
        reached={checkpointReached}
        dismissed={checkpointDismissed}
        onDownload={onDownload}
        onDismiss={onDismissCheckpoint}
      />

      {/*
        One ExportPanel per player, mapped. Never a combined block, even at two players —
        the blank line that separates records within a team is the same character
        sequence that would have to separate two teams, so a merged block could not be
        split back apart reliably by eye or by machine.
      */}
      {players.map((player) => (
        <ExportPanel
          key={player.id}
          playerName={player.name}
          paste={toShowdownPaste(toSlots(state, entries, player.id), entryById)}
        />
      ))}
    </div>
  );
}
