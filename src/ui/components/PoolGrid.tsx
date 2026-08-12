import { useState } from 'preact/hooks';

import type { SpriteMeta } from '../../adapters/roster-source';
import { loadViewPrefs, saveViewPrefs, type Density } from '../../adapters/view-prefs';
import type { RosterEntry } from '../../core/roster/types';

import { announce } from './LiveRegion';
import { MonCard } from './MonCard';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

import './PoolGrid.css';

/**
 * The pool surface.
 *
 * D-06: this is the real component Phase 2 extends with search (DRFT-08), type and
 * Mega filters (DRFT-09) and the density toggle (DRFT-06) — not scaffolding to be
 * replaced. Those all narrow or restyle `entries`, which is why the count beneath the
 * heading is derived from what is actually rendered rather than from the snapshot
 * total: once a filter exists, `{n} available` must follow the filter.
 *
 * Ships without virtualization, deliberately. 235 cells is unremarkable and CLAUDE.md
 * rejects virtualization libraries by name at this scale. If profiling ever shows the
 * pool render exceeding 16ms, the one sanctioned escape hatch is exactly
 * `content-visibility: auto; contain-intrinsic-size: var(--cell-min) var(--cell-h);`
 * on the cell class in MonCard.css. Nothing else — and see MonCard's own doc block for
 * why it conflicts with the cell's min-height.
 *
 * ## Where the density lives
 *
 * On this component's state, seeded from browser storage, and on the pane root as a
 * `data-density` attribute. It is never in the tournament document (D-20): how big the
 * sprites are is a fact about a screen, not about a draft, and it must not travel through
 * a JSON export or a future sync layer.
 *
 * The attribute sits on the pool root rather than on the shell, and that placement is
 * the enforcement of D-24 ("density affects the pool only"). The board pane is not a
 * descendant of this element, so it cannot inherit the redeclared tokens — a density that
 * reached the board would have to be written into a second selector to get there.
 */
export interface PoolGridProps {
  entries: readonly RosterEntry[];
  spriteMeta: SpriteMeta;
  /**
   * What activating a cell does. On the draft screen that is picking; in ban mode the config
   * screen passes its ban toggle. The component never decides which.
   */
  onPick: (entry: RosterEntry) => void;
  /**
   * `null` on the draft screen. A set of banned ids puts the grid in ban mode: no heading,
   * the count line becomes `{n} of {total} banned`, and every cell reports a pressed state.
   *
   * ONE prop rather than a `mode` plus a set, so "ban mode with no ban data" and "draft mode
   * carrying ban data" are both unrepresentable — the same discipline 02-06 applies to
   * `MonChip`'s `showName`, where one derived local drives two things that must not drift.
   */
  bannedIds: ReadonlySet<string> | null;
}

/**
 * The three levels, in increasing order of detail.
 *
 * The visible label is also what the live region announces, so the two cannot drift into
 * saying different words for the same click.
 */
const DENSITY_OPTIONS: readonly SegmentedOption<Density>[] = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'standard', label: 'Standard' },
  { value: 'full', label: 'Full' },
];

function densityLabel(density: Density): string {
  return DENSITY_OPTIONS.find((option) => option.value === density)?.label ?? density;
}

/**
 * The ban grid's count line — 02-UI-SPEC §Copywriting Contract.
 *
 * Both numbers are derived from what is actually rendered: the total is the entry count this
 * component was handed, and the banned figure is set membership over those same entries. The
 * set's own size would be the wrong number, because a set can hold an id the roster no longer
 * carries; a roster figure typed as a literal would be worse still (D-17), because it dates
 * the moment the regulation rotates. Both follow a filter for free the day one exists.
 */
function banCountLine(banned: number, total: number): string {
  return `${banned} of ${total} banned`;
}

export function PoolGrid({ entries, spriteMeta, onPick, bannedIds }: PoolGridProps) {
  // Read synchronously on the first render, in a state initializer rather than an
  // effect. An effect runs after the first paint, so the host would watch the pool draw
  // itself at standard density and then jump to their actual choice on every reload.
  // Same reasoning as the storage canary in app.tsx, and the same shape.
  const [density, setDensity] = useState<Density>(() => loadViewPrefs().density);

  function handleDensityChange(next: Density): void {
    setDensity(next);

    // Re-read before writing so this never clobbers the pane preference stored beside
    // it. `loadViewPrefs` cannot throw and cannot return null, so there is nothing to
    // guard here.
    saveViewPrefs({ ...loadViewPrefs(), density: next });

    announce(`Display density: ${densityLabel(next)}.`);
  }

  const banMode = bannedIds !== null;

  // Set membership over what is RENDERED, the same shape `checkFeasibility` uses to reach
  // its legal count. Never the set's own size.
  const bannedCount =
    bannedIds === null
      ? 0
      : entries.reduce((total, entry) => (bannedIds.has(entry.id) ? total + 1 : total), 0);

  /*
    The density attribute, the density control and the grid are OUTSIDE the mode branch
    below, because they render identically in both. That is what "the ban grid reuses
    PoolGrid whole" means, and it is why the ban grid inherits the three density levels and
    the shared stored preference without a line of its own.

    The control's radio-group name is fixed rather than derived per instance, unlike the
    dual-Mega rows on the config screen. Two of these are never mounted at once — the ban
    grid is on the config screen and the pool is on the draft screen — and two that were
    would merge into one radio group, which is the failure `SegmentedControl`'s required
    name prop exists to make impossible.
  */
  const body = (
    <>
      <header class="pool__header">
        {/*
          No heading in ban mode, and this is not an omission. The copywriting contract gives
          `Pool` under the DRAFT screen only, and gives the ban grid exactly one string — its
          count line. A section needs an accessible name to earn its role, and inside the
          `Bans` fieldset the legend already supplies one, so the ban grid is a plain div
          rather than a landmark with an invented name.
        */}
        {!banMode && (
          <h2 class="pool__title" id="pool-heading">
            Pool
          </h2>
        )}

        <p class="pool__count">
          {banMode ? banCountLine(bannedCount, entries.length) : `${entries.length} available`}
        </p>

        <SegmentedControl
          legend="Display density"
          name="pool-density"
          options={DENSITY_OPTIONS}
          value={density}
          onChange={handleDensityChange}
        />
      </header>

      <div class="pool__grid">
        {entries.map((entry) => (
          <MonCard
            key={entry.id}
            entry={entry}
            spriteMeta={spriteMeta}
            density={density}
            onPick={onPick}
            banned={bannedIds === null ? null : bannedIds.has(entry.id)}
          />
        ))}
      </div>
    </>
  );

  return banMode ? (
    <div class="pool pool--ban" data-density={density}>
      {body}
    </div>
  ) : (
    <section class="pool" data-density={density} aria-labelledby="pool-heading">
      {body}
    </section>
  );
}
