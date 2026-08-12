import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type { SpriteMeta } from '../../adapters/roster-source';
import { loadViewPrefs, saveViewPrefs, type Density } from '../../adapters/view-prefs';
import type { RosterEntry } from '../../core/roster/types';
import {
  compileFilters,
  hasActiveFilters,
  matchesFilters,
  NO_FILTERS,
  type PoolFilters,
} from '../../core/search';

import { FilterBar } from './FilterBar';
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
   *
   * `filtersCleared` is true only when this activation was a draft-mode pick that cleared
   * ACTIVE filters (D-35). It exists so `TurnBanner` can append `Filters cleared.` to the
   * turn announcement rather than a second `announce` overwriting whose turn it is — the
   * one fact a shared screen must never lose. A caller of arity 1, which is every existing
   * one including 02-07's ban toggle, is unaffected: TypeScript assigns a 1-argument
   * function to a 2-argument parameter, so no call site had to be edited for this.
   */
  onPick: (entry: RosterEntry, meta: { filtersCleared: boolean }) => void;
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

/*
 * --- The three filter empty states, 02-UI-SPEC §Empty and edge states ---
 *
 * Held as module constants and composers rather than written as JSX prose, per S-5: JSX
 * collapses the whitespace between text lines, and these sentences are contracts down to
 * the em dash and the pair of quotation marks around the worked example.
 *
 * They render in ban mode too, with the same copy. "The pool" reads correctly for the
 * config screen's grid as well, and inventing a second set of strings for a surface the
 * copywriting contract gives none would be the larger deviation.
 */
const EMPTY_HEADING = 'No Pokémon match';

function searchEmptyBody(query: string): string {
  return `Nothing in the pool matches "${query}". Try part of the name — "wash" finds Rotom-Wash — or clear the search.`;
}

const FILTERS_EMPTY_BODY = 'No Pokémon left in the pool has those types and Mega setting.';

function bothEmptyBody(query: string): string {
  return `Nothing in the pool matches "${query}" with those filters.`;
}

const CLEAR_SEARCH_LABEL = 'Clear the search';
const CLEAR_FILTERS_LABEL = 'Clear filters';
const CLEAR_BOTH_LABEL = 'Clear search and filters';

/**
 * How long the filter result waits before it is spoken.
 *
 * 02-UI-SPEC names this debounce as one of exactly two things in this phase that
 * legitimately live in the UI layer rather than in a selector — it is a timer, and a timer
 * is not a rule. Named here rather than written at the call site so the number is one
 * thing rather than one thing per usage.
 */
const ANNOUNCE_DEBOUNCE_MS = 300;

/** 02-UI-SPEC §Copywriting Contract → Live-region announcements. */
function filterAnnouncement(matching: number, total: number): string {
  return `${matching} of ${total} Pokémon match.`;
}

export function PoolGrid({ entries, spriteMeta, onPick, bannedIds }: PoolGridProps) {
  // Read synchronously on the first render, in a state initializer rather than an
  // effect. An effect runs after the first paint, so the host would watch the pool draw
  // itself at standard density and then jump to their actual choice on every reload.
  // Same reasoning as the storage canary in app.tsx, and the same shape.
  const [density, setDensity] = useState<Density>(() => loadViewPrefs().density);

  /*
    The filter state lives HERE, not in `src/app.tsx` beside `handlePick`.

    The ban grid on the config screen mounts this component whole — header, filter bar and
    density control — so lifting the state would give `ConfigScreen` a duplicate copy of it
    and a duplicate call to the predicates, which is the second call site 02-UI-SPEC §4
    forbids by name. Density already lives here for the same reason, so self-owned
    ephemeral view state is an established shape in this exact file rather than a new one.

    It is view state and only view state: no action, no dispatch, nothing in the log,
    nothing in `TournamentConfig`, nothing in `champions-drafter:view` (D-35). The single
    fact that has to leave this component is one boolean, and it leaves through the
    existing `onPick` call.
  */
  const [filters, setFilters] = useState<PoolFilters>(NO_FILTERS);

  // Two memos and no more. `compiled` normalizes the query ONCE per change; `visible` is
  // the whole filtered list in a single derivation keyed on every input, so one keystroke
  // produces one recomputation and one render rather than one per control.
  const compiled = useMemo(() => compileFilters(filters), [filters]);
  const visible = useMemo(
    () => entries.filter((entry) => matchesFilters(entry, compiled)),
    [entries, compiled],
  );

  const filtered = hasActiveFilters(filters);

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
  //
  // `visible` rather than `entries` since 02-08. 02-07 wrote that both numbers here
  // "follow a filter for free the day one exists, which is the property PoolGrid's own doc
  // block was written to preserve" — this is that day, and the copy did not change.
  const bannedCount =
    bannedIds === null
      ? 0
      : visible.reduce((total, entry) => (bannedIds.has(entry.id) ? total + 1 : total), 0);

  // ---------------------------------------------------------------------
  // The filter-result announcement, and the one it must never overwrite
  // ---------------------------------------------------------------------

  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpokenRef = useRef<string | null>(null);
  const isFirstRunRef = useRef(true);
  const previousFiltersRef = useRef<PoolFilters>(filters);
  const suppressNextRef = useRef(false);

  function cancelPendingAnnouncement(): void {
    if (pendingRef.current === null) return;
    clearTimeout(pendingRef.current);
    pendingRef.current = null;
  }

  /**
   * One click, two meanings, and only one of them commits a pick.
   *
   * Clearing is scoped to draft mode deliberately. The hazard D-35 names is "player 5
   * picks from player 4's leftover Fire only filter" — which is about a TURN passing on a
   * shared screen. Toggling a ban passes no turn, and a host banning twenty Fire species
   * would have the filter reset under them on every single click.
   *
   * THIS IS THE SENTENCE WORTH READING TWICE. Without the cancellation and the suppression
   * below, a pick clears the filters, the clear looks exactly like a filter change, and
   * 300ms later `{n} of {total} Pokémon match.` overwrites `Round 2 of 6 — Bo picks` on a
   * screen eight people are reading. The information that announcement would have carried
   * is delivered instead by the `Filters cleared.` suffix `TurnBanner` appends — which is
   * precisely why 02-UI-SPEC composes ONE string there rather than firing two from here.
   */
  function handleActivate(entry: RosterEntry): void {
    const filtersCleared = bannedIds === null && hasActiveFilters(filters);

    if (filtersCleared) {
      cancelPendingAnnouncement();
      // Cancelling is not enough on its own: clearing the filters is itself a filter
      // change, so the effect below is about to schedule a FRESH timer for the cleared
      // state. This suppresses that one. It is consumed by the very next effect run, and
      // that run is guaranteed because `filters` changed on this line.
      suppressNextRef.current = true;
      setFilters(NO_FILTERS);
    }

    onPick(entry, { filtersCleared });
  }

  /**
   * Speak the filter result, once the host has stopped changing it.
   *
   * ## The repeated announcement, handled at this call site rather than in `LiveRegion`
   *
   * Assistive technology announces a CHANGE to the region, so byte-identical consecutive
   * text is silent the second time — `announce`'s own doc block records this, and records
   * that it was left undone because "no surface in this phase repeats a message". This
   * surface does: selecting `Fire` and then swapping to `Water` can produce the same two
   * counts twice in a row, and the host would hear nothing the second time.
   *
   * So the clear-then-speak happens here. A macrotask boundary is enough — Preact's render
   * is scheduled on a microtask, so the empty value is committed to the DOM before the
   * zero-delay timeout fires, which is exactly what a same-tick clear cannot achieve.
   *
   * Making `announce` itself two-frame was rejected: it would turn every existing
   * synchronous `announce` assertion in 02-03's, 02-06's and 02-07's suites racy, and
   * `LiveRegion`'s limitation is correctly scoped to the surfaces that repeat. This one
   * does; the others still do not. `LiveRegion.tsx` is not modified.
   */
  useEffect(() => {
    // A filter change is the only thing this bar has news about. `entries` moving is a
    // pick or an undo, and the turn announcement already covers those — comparing by
    // reference is sound because filter state is replaced wholesale, never edited.
    const filtersChanged = previousFiltersRef.current !== filters;
    previousFiltersRef.current = filters;

    // Skip the mount. A ref rather than a comparison against `NO_FILTERS`, because a mount
    // is a mount whether or not the initial value happens to be neutral — and 02-07's ban
    // grid mounts this same component on a screen where nothing has been typed yet.
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }

    if (!filtersChanged) return;

    if (suppressNextRef.current) {
      suppressNextRef.current = false;
      return;
    }

    const next = filterAnnouncement(visible.length, entries.length);

    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;

      if (lastSpokenRef.current === next) {
        announce('');
        repeatRef.current = setTimeout(() => {
          repeatRef.current = null;
          announce(next);
        }, 0);
      } else {
        announce(next);
      }

      lastSpokenRef.current = next;
    }, ANNOUNCE_DEBOUNCE_MS);

    // Cleared on every re-run and on unmount, so at most one is ever pending.
    return cancelPendingAnnouncement;
  }, [visible.length, entries.length, filters]);

  // Unmount only. The repeat timer is separate from the debounce because cancelling a
  // pending debounce on a pick must not also cancel a clear-then-speak already in flight.
  useEffect(
    () => () => {
      if (repeatRef.current !== null) clearTimeout(repeatRef.current);
    },
    [],
  );

  /*
    Which of the three empty states applies, and what its action undoes.

    All three are wired now even though only the first is reachable before the type
    toolbar exists, so the next commit adds CONTROLS rather than a branch. Each action
    resets exactly the part of the state that the sentence blames.
  */
  const queryActive = filters.query !== '';
  const controlsActive = filters.types.length > 0 || filters.mega !== 'all';

  const empty =
    visible.length > 0 || !filtered
      ? null
      : queryActive && controlsActive
        ? {
            body: bothEmptyBody(filters.query),
            label: CLEAR_BOTH_LABEL,
            reset: () => setFilters(NO_FILTERS),
          }
        : queryActive
          ? {
              body: searchEmptyBody(filters.query),
              label: CLEAR_SEARCH_LABEL,
              reset: () => setFilters({ ...filters, query: '' }),
            }
          : {
              body: FILTERS_EMPTY_BODY,
              label: CLEAR_FILTERS_LABEL,
              reset: () => setFilters({ ...filters, types: [], matchAll: false, mega: 'all' }),
            };

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
          {banMode
            ? banCountLine(bannedCount, visible.length)
            : filtered
              ? `${visible.length} of ${entries.length} available`
              : `${visible.length} available`}
        </p>

        <SegmentedControl
          legend="Display density"
          name="pool-density"
          options={DENSITY_OPTIONS}
          value={density}
          onChange={handleDensityChange}
        />

        {/*
          Header row 2, in BOTH modes and outside the mode branch below — which is what
          "the ban grid reuses PoolGrid whole" means, and what makes D-10's "search and
          the type filters work in ban mode for free" literally true rather than a
          promise. In ban mode it sits above `.pool--ban`'s capped scroll region, never
          inside it, so it cannot scroll away from the grid it filters.
        */}
        <FilterBar value={filters} onChange={setFilters} density={density} />
      </header>

      {empty !== null ? (
        <div class="pool__empty">
          <h3 class="pool__empty-heading">{EMPTY_HEADING}</h3>
          <p class="pool__empty-body">{empty.body}</p>
          <button type="button" class="pool__empty-action" onClick={empty.reset}>
            {empty.label}
          </button>
        </div>
      ) : (
        <div class="pool__grid">
          {/*
            The entry id as the key, and no `content-visibility`. Both are load-bearing
            under a filter and neither is decoration.

            Preact's keyed reconciliation reuses the surviving nodes across a filter change
            and creates or destroys only the delta; an index key would rewrite every cell on
            every keystroke (02-RESEARCH §Keying). `content-visibility` is separately
            rejected in 02-RESEARCH §Is `content-visibility: auto` warranted? — it conflicts
            with 02-03's height → min-height change and needs `contain-intrinsic-size` to
            avoid scrollbar jitter on the density that scrolls most.
          */}
          {visible.map((entry) => (
            <MonCard
              key={entry.id}
              entry={entry}
              spriteMeta={spriteMeta}
              density={density}
              onPick={handleActivate}
              banned={bannedIds === null ? null : bannedIds.has(entry.id)}
            />
          ))}
        </div>
      )}
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
