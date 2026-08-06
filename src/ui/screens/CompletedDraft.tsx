import { toShowdownPaste, type PasteSlot } from '../../core/export/paste';
import type { PlayerConfig } from '../../core/model';
import type { RosterEntry } from '../../core/roster/types';
import { CheckpointPrompt } from '../components/CheckpointPrompt';
import { ExportPanel } from '../components/ExportPanel';

/**
 * What the host sees when the draft is finished — EXPO-06 and PERS-06.
 *
 * It replaces the pool grid and nothing else. The top bar and the draft board stay
 * exactly where they were, which is a requirement rather than an oversight: a host who
 * realises on this screen that the last pick was wrong must still be able to unwind it,
 * and `Undo last pick` lives in the top bar. A completed-draft screen that swapped out
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
  /** `selectTeams` output: player id to slot array, `null` for an unfilled slot. */
  teams: Record<string, (string | null)[]>;
  entryById: ReadonlyMap<string, RosterEntry>;
  /** Whether the checkpoint milestone has been reached. */
  checkpointReached: boolean;
  checkpointDismissed: boolean;
  onDownload: () => void;
  onDismissCheckpoint: () => void;
}

/**
 * A player's slots in the shape `toShowdownPaste` accepts.
 *
 * Phase 1 never produces a Mega-typed slot — there are no Mega rounds and no X-versus-Y
 * selection — so `megaStone` is deliberately not set. The plumbing exists and is
 * fixture-tested so that Phase 3 extends a tested function rather than reopening the
 * export format.
 */
function toSlots(slots: readonly (string | null)[]): (PasteSlot | null)[] {
  return slots.map((monId) => (monId === null ? null : { monId }));
}

export function CompletedDraft({
  players,
  teams,
  entryById,
  checkpointReached,
  checkpointDismissed,
  onDownload,
  onDismissCheckpoint,
}: CompletedDraftProps) {
  return (
    <div class="completed-draft">
      <CheckpointPrompt
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
          paste={toShowdownPaste(toSlots(teams[player.id] ?? []), entryById)}
        />
      ))}
    </div>
  );
}
