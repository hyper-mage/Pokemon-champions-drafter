import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import type { SpriteMeta } from '../../adapters/roster-source';
import { bannedEntries } from '../../core/bans';
import type { RosterEntry } from '../../core/roster/types';

import { BanChipList } from './BanChipList';
import { PoolGrid } from './PoolGrid';
import { TypeaheadField } from './TypeaheadField';

import './BlindEntry.css';

/**
 * The blind entry surface — BAN-04, BAN-05, D-04, D-16, `04-UI-SPEC` §5.
 *
 * **Full-screen. No top bar, no turn banner, no panes.** That is what satisfies BAN-05's
 * "full-screen interstitial, not an input mask" literally, because the ban entry is the
 * entire working area rather than a masked field inside a visible screen. A masked field
 * would leave the rest of a populated screen readable over the player's shoulder, which is
 * the exposure the requirement is actually about.
 *
 * ONE flow serves both the way this is really used at a table (D-04): the host as scribe,
 * reading names off a phone and typing them, and the hot-seat pass-the-device case. There
 * is no identity handshake to tap through, because a handshake this tool cannot verify buys
 * ceremony rather than secrecy.
 *
 * ## The selection lives here and dies here
 *
 * It is component state and deliberately not lifted into the fold. D-18 requires the
 * in-progress selection to die with the component, so nothing half-private survives a
 * restore and there is no stored state for a leak bug to live in. The screen above
 * unmounts this component on every exit, which is what makes that guarantee real.
 *
 * ## This module cannot reach the shared live region — assertion S1
 *
 * It imports nothing from `LiveRegion`, so a species name has no route to a channel that is
 * audible to the whole room and that persists in the accessibility tree after the render
 * that wrote it is gone. That is a static property of this file's imports rather than a
 * review item, and a grep is what checks it.
 *
 * **This is NOT "the entry surface gives no feedback", which is a wrong reading somebody
 * could act on.** A screen-reader user entering bans is told that every toggle registered,
 * through three channels that are scoped to their own focus rather than broadcast to the
 * room: the pool cell is a `<button aria-pressed>`, the ban field publishes
 * `aria-activedescendant` for the option being chosen, and the chip list is a navigable
 * list of the current selection. All three are the same channel the visible selection
 * already uses. `04-UI-SPEC` §"Selection feedback during entry, and why it is not a leak"
 * states the distinction in full.
 *
 * ## Species only — D-16
 *
 * One flat list of species ids and the ban-mode `PoolGrid` exactly as it ships. Mega-forme
 * bans stay a host tool on the config screen, which is what Phase 3's 76-cell surface was
 * built for, and it keeps the ritual explainable at the table in one sentence.
 *
 * ## No cells are closed here, and that is a secrecy decision rather than an omission
 *
 * `PoolGrid`'s own `banInert` prop block anticipates this surface and says the pressed set
 * and the closed set "do not coincide on the blind entry surface". Read carefully: the
 * closed set on this surface would have to be ANOTHER PLAYER'S bans, and those are the
 * exact thing the blind ritual is keeping secret — a struck-through cell would disclose one
 * to whoever is at the screen. So nothing is closed here, and `canApply` agrees: it refuses
 * a duplicate only WITHIN one submission, because two players naming the same species is a
 * legal collision under D-19 and is 04-11's subject. Do not wire `banInert` up.
 */

/** The one fact that must never be got wrong: whose bans these are. */
function headline(playerName: string): string {
  return `${playerName}'s bans`;
}

/**
 * `{k} of {m} chosen`, and a composer rather than an inline template for the reason every
 * copy constant in this codebase is one: it is asserted on exact equality, and a second
 * call site composing it slightly differently is how a contract stops being one.
 */
function progressLine(chosen: number, required: number): string {
  return `${chosen} of ${required} chosen`;
}

/**
 * The blocked reason, with the singular/plural helper S-5 requires for every interpolated
 * count. `Choose 1 more.` is not an edge case — it is reachable on the last selection of
 * every single entry, so it is the sentence a host reads most often.
 */
function chooseMorePhrase(remaining: number): string {
  return remaining === 1 ? 'Choose 1 more.' : `Choose ${remaining} more.`;
}

function lockLabel(playerName: string): string {
  return `Lock in ${playerName}'s bans`;
}

const HIDE_LABEL = 'Hide these bans';

/**
 * Byte-identical to the config screen's and the snake stage's ban field, and DELIBERATELY
 * not imported from either. Each holds its own module constants; a component reaching into
 * a screen for a string would couple two surfaces that are free to diverge, and the copy
 * contract lists this label under separate sections for exactly that reason.
 */
const BAN_FIELD_LABEL = 'Ban a Pokémon by name';
const BAN_FIELD_PLACEHOLDER = 'Name';
const BAN_FIELD_ID = 'blind-entry-ban';

/**
 * This surface's own prefix for the grid's control ids and radio-group names. Phase 3 made
 * the prop exist precisely because two grids can mount in one app: shared literal ids are a
 * duplicate-id bug and a merged-radio-group bug at the same time.
 */
const GRID_ID_PREFIX = 'blind-entry';

/** The reason the lock control points at while the allotment is short. */
const REASON_ID = 'blind-entry-lock-reason';

export interface BlindEntryProps {
  playerName: string;
  /** How many bans this player must choose. `config.bansPerPlayer`. */
  required: number;
  entries: readonly RosterEntry[];
  spriteMeta: SpriteMeta;
  /** Lock in. Called with exactly `required` ids. */
  onLockIn: (monIds: string[]) => void;
  /** `Hide these bans`, a tab-hide, a bfcache restore — one transition, three callers. */
  onDiscard: () => void;
}

export function BlindEntry({
  playerName,
  required,
  entries,
  spriteMeta,
  onLockIn,
  onDiscard,
}: BlindEntryProps) {
  const [chosen, setChosen] = useState<readonly string[]>([]);

  const headingRef = useRef<HTMLHeadingElement | null>(null);

  /*
    FOCUS GOES TO THE HEADING, NOT TO THE FIELD — `04-UI-SPEC` §Interaction.

    An auto-focused input has a screen reader read out the field ("Ban a Pokémon by name,
    edit text") and leaves the heading unspoken, and the one fact that must never be got
    wrong on this surface is WHICH PLAYER is being entered. The heading carries
    `tabIndex={-1}` so it can hold focus without becoming a tab stop; the ban field is the
    first tab stop after it, which is one key away for the host about to type.

    Mount only. Re-running it would drag focus back to the heading mid-selection.
  */
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const chosenIds = new Set(chosen);
  const complete = chosen.length === required;

  /*
    Name-sorted by `bannedEntries`, which is the same composer the config screen's chip list
    is fed from — `BanChipList`'s own doc block records that it does not sort, so a caller
    that handed it selection order would be the second ordering authority.
  */
  const chosenEntries = bannedEntries([...entries], chosen);

  /**
   * Add a species, idempotently — the ban field's path.
   *
   * Idempotent rather than a toggle, mirroring `ConfigScreen`'s `handleAddBan`: a name
   * typed into a search field is a request for that species to be banned, and having the
   * second search for a name already chosen silently REMOVE it is the surprise that shape
   * exists to avoid. The grid below toggles, because a pressed cell plainly offers to
   * unpress.
   */
  const addBan = useCallback((entry: RosterEntry) => {
    setChosen((current) => (current.includes(entry.id) ? current : [...current, entry.id]));
  }, []);

  /**
   * Toggle a species — the grid's path.
   *
   * At the allotment an unchosen cell does nothing. Capping here rather than letting the
   * selection run long is what keeps the copy contract honest: `04-UI-SPEC` §5 gives
   * exactly ONE blocked reason for this footer, `Choose {r} more.`, so an over-full
   * selection would be a state with no sentence for it. Removing a chip is the visible way
   * back and it is one tap, on a control that is already on screen naming the species it
   * removes.
   */
  const toggleBan = useCallback(
    (entry: RosterEntry) => {
      setChosen((current) => {
        if (current.includes(entry.id)) return current.filter((id) => id !== entry.id);
        if (current.length >= required) return current;
        return [...current, entry.id];
      });
    },
    [required],
  );

  const removeBan = useCallback((entry: RosterEntry) => {
    setChosen((current) => current.filter((id) => id !== entry.id));
  }, []);

  /*
    NO CONFIRM AND NO REVIEW STEP, and the omission looks like a gap, so here are the three
    reasons — `04-UI-SPEC` §5, strongest first:

    1. The selection is ALREADY fully visible on this screen. `BanChipList` renders every
       chosen species by name, directly above the grid. A review step would be a second
       rendering of one fact, and a second rendering of one fact is a second thing that can
       disagree with the first.
    2. D-03 makes undo the correction path, and it is mandatory precisely because the host
       will type the wrong Pokémon. A review step would be a second correction path
       competing with the one the phase already commits to.
    3. The host enters every player in a row, so every extra tap is paid once per player
       while the room waits.

    Locking does not confirm either. Phase 1 D-08's no-confirm posture holds: locking a ban
    is the same category of act as making a pick.
  */
  const handleLockIn = useCallback(() => {
    // The early return IS the refusal, so `aria-disabled` does not lie — the pool cell,
    // the card face and the pane controls all set the precedent. A marked control that
    // still fires is worse than one that was never marked.
    if (!complete) return;
    onLockIn([...chosen]);
  }, [chosen, complete, onLockIn]);

  /*
    `aria-disabled` ALONE, never native `disabled` — a natively disabled control is not
    focusable, so the reason hanging off it would be unreachable by keyboard, which is the
    one audience the reason exists for.

    Spread rather than an attribute with a conditional value, so both attributes are
    genuinely ABSENT at the allotment rather than set to a negative string (WR-04). Those
    are not the same thing to assistive technology, and this is `MonCard`'s `inertProps`
    shape one component over.
  */
  const blockedProps = complete
    ? {}
    : { 'aria-disabled': 'true' as const, 'aria-describedby': REASON_ID };

  return (
    <section class="blind-entry">
      <h1 class="blind-entry__headline" ref={headingRef} tabIndex={-1}>
        {headline(playerName)}
      </h1>

      <p class="blind-entry__progress">{progressLine(chosen.length, required)}</p>

      {/*
        THE HOST-AS-SCRIBE'S PRIMARY PATH, and it is above the grid for that reason: a host
        reading names off a phone types them, and typing beats hunting through 235 cells.
        The player who is browsing scrolls to the grid below. Both write one list.

        Results are never filtered by what is already chosen — the shipped field's own doc
        block gives the failure mode, which is that a name the host typed and cannot find
        reads as a broken search rather than as an answer.
      */}
      <TypeaheadField
        id={BAN_FIELD_ID}
        label={BAN_FIELD_LABEL}
        placeholder={BAN_FIELD_PLACEHOLDER}
        candidates={entries}
        onSelect={addBan}
      />

      {/* Absent from the DOM while nothing is chosen — the component decides that itself. */}
      <BanChipList
        banned={chosenEntries}
        onRemove={removeBan}
        listName={`${playerName}'s bans`}
      />

      <PoolGrid
        entries={entries}
        spriteMeta={spriteMeta}
        onPick={toggleBan}
        /*
          The pending selection as a PRESSED state, which is what ban mode means here. It
          also supplies the `{k} of 235 banned` count line and the capped scroll region,
          both from the shipped component — a second composer for that sentence would be a
          second sentence shape for one fact.
        */
        bannedIds={chosenIds}
        idPrefix={GRID_ID_PREFIX}
      />

      <div class="blind-entry__footer">
        <button
          type="button"
          class="blind-entry__lock"
          {...blockedProps}
          onClick={handleLockIn}
        >
          {lockLabel(playerName)}
        </button>

        {/*
          THE PANIC CONTROL, and it exists because it is free. D-18 already forces the
          discard-and-lock transition when the tab is hidden and when the page comes back
          from the back/forward cache, so this is one new label wired to a change-over that
          had to exist anyway. Refusing it would mean the tool handles the accidental
          exposure and not the deliberate one, which is the case a host can see coming.

          Always live, including at nothing chosen, and it does not confirm: a confirm on a
          panic control is a second second of exposure.
        */}
        <button type="button" class="blind-entry__hide" onClick={onDiscard}>
          {HIDE_LABEL}
        </button>

        {/*
          `role="status"` is a POLITE region scoped to this surface and it names no species,
          so it is not the channel S1 closes. `04-UI-SPEC` §The Live-Region Contract says
          the counted form may be spoken freely for exactly this reason.
        */}
        {!complete && (
          <p class="blind-entry__reason" id={REASON_ID} role="status">
            {chooseMorePhrase(required - chosen.length)}
          </p>
        )}
      </div>
    </section>
  );
}
