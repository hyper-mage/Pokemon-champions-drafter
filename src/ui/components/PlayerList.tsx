import './PlayerList.css';

/**
 * The `Players` group's contents — 02-UI-SPEC §2 group 1.
 *
 * There is no analog for this anywhere in the repository: before this plan no surface
 * under `src/` held a text `<input>`, and none held an add/remove row pattern. 02-UI-SPEC
 * §2 is therefore the specification of record rather than a description of something that
 * already existed, and this component follows it literally.
 *
 * It owns no state. Names, the roster of rows and the resolved order all arrive as props,
 * and every change goes back out as a callback — which is what keeps `ConfigScreen` the
 * one place that knows the config screen is pre-document form state, and keeps this
 * component from being the second place that could dispatch.
 *
 * ## The rows are not a list element, and that is on purpose
 *
 * Each row is already announced by its own visually-hidden `Player {i} name` label, so
 * list semantics would add "list, 4 items" in front of information the labels already
 * carry. The numbered starting order below IS an `<ol>`, because there the ordinal is the
 * information.
 */

export interface PlayerDraft {
  /** Generated at the edge with `newId()`. Never `p1`. */
  id: string;
  name: string;
}

export interface PlayerListProps {
  players: readonly PlayerDraft[];
  /** Player ids in the resolved starting order. Never names — CLAUDE.md §Identity. */
  order: readonly string[];
  onChangeName: (id: string, name: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRandomize: () => void;
}

/**
 * What to call a row that has no name yet.
 *
 * A blank row still needs a remove button, and `Remove ` with nothing after it is a button
 * whose accessible name is a verb with no object. The positional fallback is the same one
 * the visually-hidden label uses, so the two agree on screen and in the accessibility tree.
 */
function rowLabel(player: PlayerDraft, index: number): string {
  const typed = player.name.trim();
  return typed === '' ? `Player ${index + 1}` : typed;
}

export function PlayerList({
  players,
  order,
  onChangeName,
  onAdd,
  onRemove,
  onRandomize,
}: PlayerListProps) {
  return (
    <div class="player-list">
      <div class="player-list__rows">
        {players.map((player, index) => {
          const inputId = `player-name-${player.id}`;

          return (
            <div class="player-list__row" key={player.id}>
              <label class="visually-hidden" for={inputId}>
                Player {index + 1} name
              </label>

              <input
                class="player-list__name"
                id={inputId}
                type="text"
                value={player.name}
                placeholder="Name"
                autocomplete="off"
                onInput={(event) =>
                  onChangeName(player.id, (event.currentTarget as HTMLInputElement).value)
                }
              />

              {/*
                Plan 02-09 puts a confirmation in front of this (D-36). It inserts itself
                in the CALLER's handler, which is why removal is reported as an id and
                nothing here decides what removal means.
              */}
              <button
                type="button"
                class="player-list__remove"
                onClick={() => onRemove(player.id)}
              >
                Remove {rowLabel(player, index)}
              </button>
            </div>
          );
        })}
      </div>

      <div class="player-list__actions">
        <button type="button" class="player-list__button" onClick={onAdd}>
          Add a player
        </button>

        {/*
          The label does not change on a second press. The numbered list below is the
          feedback, and a button that renamed itself to `Randomize again` would be telling
          the host about the button rather than about the order.
        */}
        <button type="button" class="player-list__button" onClick={onRandomize}>
          Randomize order
        </button>
      </div>

      <h2 class="player-list__order-heading">Starting order</h2>

      {/*
        An ordered list because the ordinal IS the information here — this is the one
        place on the config screen where position means something.
      */}
      <ol class="player-list__order">
        {order.map((playerId) => {
          const index = players.findIndex((player) => player.id === playerId);
          const player = players[index];
          if (player === undefined) return null;

          return <li key={playerId}>{rowLabel(player, index)}</li>;
        })}
      </ol>
    </div>
  );
}
