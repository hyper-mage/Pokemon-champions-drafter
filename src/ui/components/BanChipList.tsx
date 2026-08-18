import type { PoolSubject } from './MonCard';

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

/**
 * Which list a chip removes from, named so the accessible name stays one construction.
 *
 * The species banlist is `banlist` and the Mega-forme banlist is `Mega-forme banlist`, which
 * are the two strings 02-UI-SPEC §4 and 03-UI-SPEC §3 give. Only the NOUN PHRASE varies — the
 * sentence around it is composed once below, so two surfaces cannot end up naming their chips
 * in two different shapes.
 */
const DEFAULT_LIST_NAME = 'banlist';

export interface BanChipListProps<T extends PoolSubject> {
  /**
   * Already name-sorted by `bannedEntries` or `bannedMegaFormes`. This component does not sort.
   *
   * A WIDENING, not a second mode: a chip reads `id` and `name`, and `MegaForme` carries both.
   */
  banned: readonly T[];
  onRemove: (entry: T) => void;
  /** The list named in every chip's accessible name. Defaults to `banlist`. */
  listName?: string;
}

export function BanChipList<T extends PoolSubject>({
  banned,
  onRemove,
  listName = DEFAULT_LIST_NAME,
}: BanChipListProps<T>) {
  if (banned.length === 0) return null;

  return (
    <ul class="ban-chip-list">
      {banned.map((entry) => (
        <li key={entry.id} class="ban-chip-list__item">
          <button
            type="button"
            class="ban-chip"
            aria-label={`Remove ${entry.name} from the ${listName}`}
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
