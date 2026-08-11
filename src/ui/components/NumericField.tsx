import { useId } from 'preact/hooks';

import './NumericField.css';

/**
 * A labelled numeric input, free and unconstrained — D-06, 02-UI-SPEC §2.
 *
 * ## The field parses; it never decides
 *
 * D-06 refuses to narrow the host's number down to a permitted one, on the grounds that a
 * silent correction and a feasibility gate can disagree — and when they do, the host is
 * arguing with an input box about a rule neither of them stated. So this component has
 * exactly one job: turn what was typed into `number | null` and hand the ambiguity to
 * `src/core/feasibility.ts`, which is the single authority on what is satisfiable. Nothing
 * here rounds, floors, or narrows a value into range.
 *
 * The consequence, which is the point rather than a side effect: `48.5` and `-3` come back
 * from this field as themselves and reach the gate, which refuses them with a sentence
 * naming the field. A field that had quietly rewritten them would have produced a
 * configuration the host never chose and could not see.
 *
 * ## `min` and `max` are affordances, not enforcement
 *
 * Both are rendered as attributes so the native stepper knows its range and assistive
 * technology can report it. Neither prevents anything: HTML's `max` does not stop a larger
 * value being typed or pasted, it only marks the input `:invalid`. That is precisely why
 * `checkFeasibility` carries `megasExceedRounds` — at 2 players requiring 9 Megas each the
 * Mega-COUNT check passes (18 is far below the roster's 74), so nothing but an explicit
 * blocker catches it.
 *
 * ## The caller holds the raw string
 *
 * `value` is the text, not a number, and the caller holds both it and the parsed result.
 * A component that held the number would have to invent something to display while the
 * host is mid-edit — and "what is showing" and "what the gate is judging" would be two
 * facts that can disagree.
 */

/**
 * The raw input text as `number | null`.
 *
 * `null` for empty, whitespace-only, and anything that is not a finite number. That
 * nullability is the whole mechanism: an empty `<input type="number">` yields `NaN` if it
 * is read arithmetically, and every relational comparison with `NaN` is false — so
 * `N > legal` and `N < players × rounds` BOTH pass, the gate reports all-clear, and Start
 * enables on a configuration that cannot be drawn. `null` is a case TypeScript forces the
 * gate to handle. `NaN` is one it cannot see.
 *
 * Fractions and negatives are parsed and returned, not rejected. There is one authority on
 * what is satisfiable and it is not this function.
 */
export function parseNumericField(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;

  return value;
}

export interface NumericFieldProps {
  label: string;
  /** The raw string, held by the caller. The caller also holds the parsed value. */
  value: string;
  onInput: (raw: string) => void;
  /** Rendered under the field at --text-label / --color-text-muted. Optional. */
  helper?: string;
  min?: number;
  max?: number;
}

export function NumericField({ label, value, onInput, helper, min, max }: NumericFieldProps) {
  // Generated rather than derived from `label`, because two fields can share a label on
  // different screens and a slug of a sentence is a structure derived from a display
  // string — the thing CLAUDE.md's identity rule exists to prevent.
  const id = useId();
  const helperId = `${id}-helper`;

  return (
    <div class="numeric-field">
      <label class="numeric-field__label" for={id}>
        {label}
      </label>

      <input
        class="numeric-field__input"
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        autocomplete="off"
        aria-describedby={helper === undefined ? undefined : helperId}
        onInput={(event) => onInput((event.currentTarget as HTMLInputElement).value)}
      />

      {helper !== undefined && (
        <p class="numeric-field__helper" id={helperId}>
          {helper}
        </p>
      )}
    </div>
  );
}
