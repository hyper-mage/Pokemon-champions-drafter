import type { RosterEntry } from '../../core/roster/types';

import './BanChipList.css';

/**
 * The banned species, as removable chips — 02-UI-SPEC §4.
 *
 * ## The chip IS the remove control
 *
 * One button per species rather than a label with a small × beside it. A separate remove
 * affordance inside a chip is a target smaller than `--target-min` in a list that can hold
 * two hundred of them, and there is nothing else a ban chip could usefully do when clicked.
 *
 * The accessible name CONTAINS the visible text — the species name — which is SC 2.5.3 Label
 * in Name, and it is why the label is not shortened to `Remove`. A host using voice control
 * says what they can read; a name that dropped the species would leave two hundred controls
 * all called the same thing.
 *
 * The × is U+00D7 MULTIPLICATION SIGN, the only glyph this phase needs (02-UI-SPEC §Design
 * System). No icon file, no icon font, no inline SVG. It is hidden from assistive technology
 * because the button's own name already says what the control does.
 *
 * ## This component does not sort
 *
 * `bannedEntries` already ordered the list by name, and a second sort here would be a second
 * thing that can disagree with the first. Keyed by `id` (CLAUDE.md §Identity), never by name
 * and never by position.
 *
 * ## Nothing renders while the list is empty
 *
 * Not an empty container and not a "no bans yet" line — 02-UI-SPEC §Empty and edge states.
 * A host who has banned nothing does not need to be told so twice by a form that already
 * shows them an empty ban field.
 */

export interface BanChipListProps {
  /** Already name-sorted by `bannedEntries`. This component does not sort. */
  banned: readonly RosterEntry[];
  onRemove: (entry: RosterEntry) => void;
}

export function BanChipList({ banned, onRemove }: BanChipListProps) {
  if (banned.length === 0) return null;

  return (
    <ul class="ban-chip-list">
      {banned.map((entry) => (
        <li key={entry.id} class="ban-chip-list__item">
          <button
            type="button"
            class="ban-chip"
            aria-label={`Remove ${entry.name} from the banlist`}
            onClick={() => onRemove(entry)}
          >
            <span class="ban-chip__name">{entry.name}</span>
            <span class="ban-chip__glyph" aria-hidden="true">
              ×
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
