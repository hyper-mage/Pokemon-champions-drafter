import type { BaseStats } from '../../core/roster/types';

import './StatBlock.css';

/**
 * Base stats on a pool card: the total always, the six behind `showAll`.
 *
 * The total is the figure a drafter compares at a glance and the six are what they check
 * once the total has caught their eye, which is why `full` keeps both (D-25's content
 * table is cumulative, D-30 gives the layout).
 *
 * The six are a description list of term-and-value pairs rather than a table or a row of
 * bare spans, so the label-to-value relationship is in the markup instead of being
 * inferred from proximity by a screen reader. Each pair is wrapped in a plain div —
 * explicitly permitted inside a description list — so a pair is one grid item and a
 * label can never be separated from its number by a column boundary.
 *
 * The total is computed here rather than selected from core. It is display arithmetic
 * over six numbers already in hand, not a game rule: nothing branches on it, nothing
 * persists it, and no draft outcome changes if it were wrong. A selector for it would be
 * a rule with no rule in it.
 */

export interface StatBlockProps {
  stats: BaseStats;
  showAll: boolean;
}

/**
 * Showdown's canonical order, laid out as two rows of three by the CSS grid.
 *
 * The order is not alphabetical and not a preference: it is the order every Pokemon tool
 * a drafter has ever used prints these in, so any other order reads as a bug.
 */
const STATS: readonly (readonly [label: string, key: keyof BaseStats])[] = [
  ['HP', 'hp'],
  ['Atk', 'atk'],
  ['Def', 'def'],
  ['SpA', 'spa'],
  ['SpD', 'spd'],
  ['Spe', 'spe'],
];

export function StatBlock({ stats, showAll }: StatBlockProps) {
  const total = stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe;

  return (
    <span class="stat-block">
      <span class="stat-block__total">
        <span class="stat-block__label">Total</span>
        <span class="stat-block__value">{total}</span>
      </span>

      {showAll && (
        <dl class="stat-block__grid">
          {STATS.map(([label, key]) => (
            <div class="stat-block__cell" key={key}>
              <dt class="stat-block__label">{label}</dt>
              <dd class="stat-block__value">{stats[key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </span>
  );
}
