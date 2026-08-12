import { useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * One tab stop over a set of buttons, with the arrow keys moving inside it.
 *
 * ## This is not a convenience
 *
 * Without it the pool grid is one tab stop per cell before a keyboard host reaches the
 * board pane, and the type toolbar is eighteen more in front of that. A shared screen
 * that takes two hundred key presses to cross is not usable from a keyboard at all, which
 * is why 02-UI-SPEC states the single tab stop as a contract rather than a nicety.
 *
 * ## The hook owns the RULE; it does not own the MEASUREMENT
 *
 * `columns` is injected rather than read off the DOM. happy-dom performs no layout and
 * does not resolve `repeat(auto-fill, …)`, so a hook that measured its own container
 * would ship its entire two-dimensional behaviour with no headless test — and the
 * two-dimensional behaviour is exactly the part that can be silently wrong. With the
 * measurement injected, a test passes `() => 4` and asserts the whole rule against twelve
 * buttons; a real consumer passes a function that measures whatever it likes.
 *
 * Omit it for a single-axis toolbar. The default `() => 1` is not a special case: at one
 * column the vertical rules collapse onto the horizontal ones exactly.
 *
 * ## The navigation rule, as arithmetic
 *
 * With `n = count` and `c = columns()`:
 *
 *   ArrowRight  ->  (i + 1) % n
 *   ArrowLeft   ->  (i - 1 + n) % n
 *   ArrowDown   ->  i + c when that is < n, otherwise i % c
 *   ArrowUp     ->  i - c when that is >= 0, otherwise the largest k < n with k % c === i % c
 *   Home        ->  0
 *   End         ->  n - 1
 *
 * Wraparound rather than clamping, chosen so this surface agrees with `TypeaheadField`,
 * which 02-07 built to wrap from the first option to the last. Two keyboard surfaces in
 * one phase disagreeing about what happens at the edge is worse than either choice.
 *
 * Those six keys and nothing else. Tab, Enter and Space reach the platform untouched:
 * Tab is what MAKES this one tab stop, and Enter and Space are native button activation.
 *
 * ## Two consumers, written for both from the start
 *
 * This toolbar today, and the pool grid's cells in a later plan. Nobody may narrow it to
 * one axis on the grounds that only one consumer exists yet — the second consumer is the
 * whole reason `columns` is a parameter.
 *
 * A hook rather than a component, following `use-ownership.ts`: the consumer owns its own
 * markup, its own container element and its own item elements, and only the rule is
 * shared. Kebab-case filename, matching that file.
 */

export interface RovingTabindexOptions {
  /**
   * How many focusable items are rendered right now. Shrinking clamps the active index.
   *
   * It must equal the number of DIRECT button children of the container. The hook cannot
   * verify that, so it fails closed instead: a move onto a position no element occupies is
   * refused rather than stored (see `focusItem`). Derive it from the same array you map,
   * as `FilterBar` does, rather than from a constant that happens to agree today.
   */
  count: number;
  /**
   * Columns in the rendered layout. Injected rather than measured — see above. Omit for a
   * single-axis toolbar.
   */
  columns?: () => number;
}

/**
 * `T` is the container's element type, defaulting to `HTMLElement`.
 *
 * The parameter exists for one concrete reason rather than for generality: Preact's
 * `RefObject<T>` holds a mutable `current`, so `RefObject<HTMLElement>` is NOT assignable
 * to the `Ref<HTMLDivElement>` a `<div>` declares, and a hook that returned the base type
 * would force every consumer to write a cast at its container. A cast at each call site is
 * a place the wrong element can be attached silently; a type parameter is not.
 *
 * `RovingTabindex` with no argument is exactly the shape the plan's interface pins.
 */
export interface RovingTabindex<T extends HTMLElement = HTMLElement> {
  /** Attach to the element that CONTAINS the items. Used to focus by position. */
  containerRef: RefObject<T>;
  activeIndex: number;
  /** `0` for the active item, `-1` for every other — the whole of the one-tab-stop rule. */
  tabIndexAt: (index: number) => 0 | -1;
  /** Attach to the container. Handles ArrowLeft/Right/Up/Down, Home, End. Nothing else. */
  onKeyDown: (event: KeyboardEvent) => void;
  /** Attach to every item. Keeps the active index in step with focus arriving by mouse. */
  onItemFocus: (index: number) => void;
  /**
   * Move the active item and focus it. For restoring focus when the set changes.
   *
   * A no-op when no item occupies `index`, deliberately: moving the tab stop onto a
   * position nothing renders takes the whole group out of the tab order.
   */
  focusItem: (index: number) => void;
}

/** The largest `k < n` sharing `index`'s column. Used only by the ArrowUp wrap. */
function lastInColumn(index: number, count: number, columns: number): number {
  let candidate = index % columns;
  while (candidate + columns < count) candidate += columns;
  return candidate;
}

const ONE_COLUMN = (): number => 1;

export function useRovingTabindex<T extends HTMLElement = HTMLElement>({
  count,
  columns = ONE_COLUMN,
}: RovingTabindexOptions): RovingTabindex<T> {
  const containerRef = useRef<T>(null);
  const [stored, setStored] = useState(0);

  // Clamped where it is READ, not corrected in an effect that runs a frame later. A
  // filtered grid can shrink between two key presses, and an index pointing past the end
  // must never be observable — the same "read synchronously rather than default and
  // correct" discipline `use-ownership.ts` states for the ownership state.
  const activeIndex = count === 0 ? 0 : Math.min(stored, count - 1);

  function itemAt(index: number): HTMLElement | null {
    // By POSITION among the container's DIRECT button children, which is what makes the
    // hook indifferent to what its consumer renders: eighteen filter pills here, and pool
    // cells in the later consumer, are both just buttons in order.
    //
    // `:scope >` rather than a descendant search, and the difference is not cosmetic. A
    // descendant search counts a button nested INSIDE an item — the pool grid's cells are
    // the declared second consumer, and a cell that ever grows a control of its own would
    // silently renumber the whole set, so every arrow key would land one item further off
    // than the last. Scoping to children makes the item set the same thing the consumer
    // laid out.
    return containerRef.current?.querySelectorAll<HTMLElement>(':scope > button')[index] ?? null;
  }

  function focusItem(index: number): void {
    const item = itemAt(index);

    // FAIL CLOSED. `setStored` used to run unconditionally, so a `count` larger than the
    // rendered set moved `activeIndex` onto a position no element occupies — and
    // `tabIndexAt` then returns -1 for EVERY rendered button, which drops the whole group
    // out of the tab order with no way back except a mouse click on one of the items. A
    // hook whose failure mode is "keyboard users cannot reach this toolbar at all" must
    // not have one that is reachable from a consumer miscounting by one.
    if (item === null) return;

    setStored(index);
    // Focusing before the re-render is deliberate. The target still carries tabindex="-1"
    // at this instant, and a negative tabindex refuses the TAB SEQUENCE, never a
    // programmatic focus call — so the first arrow key lands on the right item in the same
    // frame rather than one after it.
    item.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (count === 0) return;

    const span = Math.max(1, Math.floor(columns()));
    const index = activeIndex;
    let next: number;

    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % count;
        break;
      case 'ArrowLeft':
        next = (index - 1 + count) % count;
        break;
      case 'ArrowDown':
        next = index + span < count ? index + span : index % span;
        break;
      case 'ArrowUp':
        next = index - span >= 0 ? index - span : lastInColumn(index, count, span);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        // Every other key, Tab and Enter and Space included, returns having touched
        // neither the active index nor the event.
        return;
    }

    // Only on the six. Without it the pane scrolls underneath the host on every arrow key.
    event.preventDefault();
    focusItem(next);
  }

  return {
    containerRef,
    activeIndex,
    tabIndexAt: (index) => (index === activeIndex ? 0 : -1),
    onKeyDown,
    onItemFocus: setStored,
    focusItem,
  };
}
