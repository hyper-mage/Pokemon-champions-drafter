import { Fragment } from 'preact';

import './SegmentedControl.css';

/**
 * A group of mutually exclusive options, as a segmented control.
 *
 * ## It is a real radio group, and that is a decision
 *
 * A fieldset with a legend, one visually-hidden radio input per option, and a styled
 * label bound to each by `for`/`id`. Grouping, arrow-key navigation between options, the
 * single tab stop into the group, and the `:checked` state all come from the platform
 * and cost nothing to maintain.
 *
 * It is NEVER a row of buttons carrying a hand-rolled checked state in ARIA. That shape
 * has to reimplement roving tabindex, arrow keys, Home/End and the group relationship,
 * and each of those is a place a bug hides in a way no visual review catches. This is
 * the first of six instances in this phase — display density, Mega capability, pool
 * size, ban mode, tournament depth, and one per dual-Mega row — so the cost of getting
 * it wrong is paid six times.
 *
 * ## Selected is not accent
 *
 * A selected option takes `--color-surface-raised` plus a `--border-w` border in
 * `--color-text` (UI-SPEC §Accent reserved for). Accent has exactly three uses and this
 * is not one of them. The native `:checked` state carries the same information without
 * colour, so the control satisfies "colour is never the only signal" structurally.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  legend: string;
  /**
   * Unique radio-group name. Required, not optional with a sensible default.
   *
   * Two controls sharing one name merge into a single radio group, so selecting an
   * option in either one deselects the other's. The dual-Mega block renders one control
   * per species, which makes a name derived per instance mandatory rather than merely
   * convenient — a default would produce exactly the merge this prop exists to prevent,
   * and it would look like a rendering glitch rather than a naming bug.
   */
  name: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** When true the legend is visually hidden but still read. */
  hideLegend?: boolean;
}

export function SegmentedControl<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  hideLegend = false,
}: SegmentedControlProps<T>) {
  const legendClass = ['segmented__legend', hideLegend ? 'visually-hidden' : '']
    .filter((token) => token !== '')
    .join(' ');

  return (
    <fieldset class="segmented">
      <legend class={legendClass}>{legend}</legend>

      <div class="segmented__options">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const isDisabled = option.disabled === true;

          // Both attributes, deliberately. `disabled` is what actually refuses the
          // click; `aria-disabled` is what survives the styling, since a natively
          // disabled control's state is reported inconsistently once a label is doing
          // the rendering. A caller that wants a visible suffix such as
          // `— Not yet available` puts it in `label`; this component does not
          // synthesize copy.
          return (
            <Fragment key={option.value}>
              <input
                class="segmented__input"
                type="radio"
                id={id}
                name={name}
                value={option.value}
                checked={option.value === value}
                disabled={isDisabled}
                aria-disabled={isDisabled ? 'true' : undefined}
                onChange={() => onChange(option.value)}
              />
              <label class="segmented__label" for={id}>
                {option.label}
              </label>
            </Fragment>
          );
        })}
      </div>
    </fieldset>
  );
}
