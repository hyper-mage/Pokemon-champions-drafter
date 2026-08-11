import { useCallback, useMemo, useState } from 'preact/hooks';

import { newId, newSeed } from '../../adapters/id';
import type { TournamentDepth } from '../../core/model';
import type { RosterEntry, RosterSnapshot } from '../../core/roster/types';
import { selectStartingOrder } from '../../core/selectors';
import { PlayerList, type PlayerDraft } from '../components/PlayerList';
import { SegmentedControl, type SegmentedOption } from '../components/SegmentedControl';

import './ConfigScreen.css';

/**
 * The config screen — D-02, 02-UI-SPEC §2.
 *
 * ## One scrolling form, not a wizard and not progressive reveal
 *
 * Player count invalidates pool size, the bans and the feasibility gate simultaneously,
 * so backtracking is the normal case here rather than the exception. A wizard makes the
 * normal case the expensive one: the host would answer the pool-size step, discover on
 * the feasibility step that six players do not fit, and walk back through every screen
 * between. Everything is visible at once and the pinned bar re-answers on every keystroke.
 *
 * ## Nothing here dispatches
 *
 * All of this is PRE-DOCUMENT form state. There is no tournament yet, so there is nothing
 * for an action to be appended to, and `dispatch` returns `draftNotStarted` until both
 * store signals exist. `dispatch` is reached exactly once from this screen — at
 * `Start draft`, through `createTournament` — and nothing else on it is an action. Stated
 * here so a later reader adding a "config changed" action knows the omission is a
 * decision. The rule flips the moment the draft starts: 02-CONTEXT records it as "config
 * changes made *before* the tournament exists are pre-document form state; everything
 * after is an action".
 *
 * ## Group order
 *
 * This plan builds groups 1 (`Players`) and 2 (`Tournament`). Plan 02-05 inserts
 * `Mega rules` and `Pool`, plan 02-07 inserts `Bans` — each at its declared position in
 * the 02-UI-SPEC table rather than appended, because the table's order is the reason the
 * pool readout is last: it is the only group whose readout reflects every group above it.
 */

/** How many blank rows a fresh config screen starts with. */
const INITIAL_PLAYERS = 4;

/**
 * Verbatim from 02-UI-SPEC §Copywriting Contract → Config screen.
 *
 * All three depth options are ENABLED, deliberately unlike ban mode where two are
 * disabled (D-12). ROADMAP criterion 1 says the host "enters … a tournament depth", and a
 * disabled depth would make that criterion unmeetable. What is not yet built is the
 * screens the deeper options lead to, and the note below the group says so rather than
 * the control pretending the choice does not exist.
 */
const DEPTH_OPTIONS: readonly SegmentedOption<TournamentDepth>[] = [
  { value: 'draftOnly', label: 'Draft only' },
  { value: 'draftAndBrackets', label: 'Draft and brackets' },
  { value: 'draftBracketsAndLog', label: 'Draft, brackets and match log' },
];

const DEPTH_NOTE =
  'Depth is recorded now. Round robin and brackets arrive with the tournament screens.';

export interface ConfigScreenProps {
  /** The loaded roster snapshot. Supplies the regulation the format label is prefilled from. */
  snapshot: RosterSnapshot;
  /** The draftable roster in display order. */
  entries: readonly RosterEntry[];
}

export function ConfigScreen({ snapshot }: ConfigScreenProps) {
  /**
   * Four rows, all blank.
   *
   * NOT prefilled with `Player 1`…`Player 4`. Blank is the honest starting state, the
   * feasibility gate already has a sentence for it (`Every player needs a name. Player
   * {i} is blank.`), and placeholder names would let a host start a draft in which
   * somebody is genuinely called `Player 3` by forgetting to type over it.
   *
   * Ids come from `newId()` at the impure edge, in a `useState` initializer so they are
   * drawn once rather than on every render. The `p1`/`p2` literals Phase 1 scaffolded with
   * are gone from the codebase.
   */
  const [players, setPlayers] = useState<PlayerDraft[]>(() =>
    Array.from({ length: INITIAL_PLAYERS }, () => ({ id: newId(), name: '' })),
  );

  const [formatLabel, setFormatLabel] = useState(`Champions ${snapshot.regulation}`);
  const [depth, setDepth] = useState<TournamentDepth>('draftOnly');

  /**
   * The starting order is rolled ON MOUNT, not on a click.
   *
   * The numbered list is therefore on screen from first paint, `Randomize order` always
   * RE-rolls something the host can already see, and `Start draft` never depends on a
   * prior click. That last part is the point: "no order yet" stops being a state to
   * validate against and becomes unrepresentable.
   *
   * Re-rolling draws a NEW seed rather than advancing a cursor. Two derivations sharing
   * one advancing stream is the collision `src/store.ts` warns about one phase early —
   * the pool draw and the order roll each own a seed and each consume it from cursor 0,
   * so re-rolling one cannot disturb the other.
   */
  const [orderSeed, setOrderSeed] = useState(() => newSeed());

  const order = useMemo(
    () =>
      selectStartingOrder(
        orderSeed,
        players.map((player) => player.id),
      ),
    [orderSeed, players],
  );

  const handleChangeName = useCallback((id: string, name: string) => {
    setPlayers((current) =>
      current.map((player) => (player.id === id ? { ...player, name } : player)),
    );
  }, []);

  const handleAdd = useCallback(() => {
    setPlayers((current) => [...current, { id: newId(), name: '' }]);
  }, []);

  // Plan 02-09 inserts a confirmation in front of both of these (D-36). Both are already
  // single call sites taking exactly the argument a dialog would carry through, so that
  // plan adds a dialog rather than reshaping this component or `PlayerList`.
  const handleRemove = useCallback((id: string) => {
    setPlayers((current) => current.filter((player) => player.id !== id));
  }, []);

  const handleRandomize = useCallback(() => {
    setOrderSeed(newSeed());
  }, []);

  return (
    <div class="config-screen">
      <h1 class="app-shell__title">Set up the tournament</h1>

      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Players</legend>

        <PlayerList
          players={players}
          order={order}
          onChangeName={handleChangeName}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onRandomize={handleRandomize}
        />
      </fieldset>

      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Tournament</legend>

        <div class="config-screen__field">
          <label class="config-screen__label" for="config-format-label">
            Format label
          </label>

          <input
            class="config-screen__input"
            id="config-format-label"
            type="text"
            value={formatLabel}
            autocomplete="off"
            onInput={(event) =>
              setFormatLabel((event.currentTarget as HTMLInputElement).value)
            }
          />
        </div>

        <SegmentedControl
          legend="Tournament depth"
          name="tournament-depth"
          options={DEPTH_OPTIONS}
          value={depth}
          onChange={setDepth}
        />

        <p class="config-screen__note">{DEPTH_NOTE}</p>
      </fieldset>
    </div>
  );
}
