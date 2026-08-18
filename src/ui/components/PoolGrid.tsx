import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type { SpriteMeta } from '../../adapters/roster-source';
import { loadViewPrefs, saveViewPrefs, type Density } from '../../adapters/view-prefs';
import {
  compileFilters,
  hasActiveFilters,
  matchesFilters,
  NO_FILTERS,
  type PoolFilters,
} from '../../core/search';

import { FilterBar } from './FilterBar';
import { announce } from './LiveRegion';
import { MonCard, type PoolSubject } from './MonCard';
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
export interface PoolGridProps<T extends PoolSubject> {
  /**
   * The rows to render. Draftable entries on the draft screen and in the species ban grid;
   * Mega formes in the Mega-forme ban grid.
   *
   * A WIDENING, not a second mode. Every surface below — the cell, the filters, the sprite
   * lookup, the keyed reconciliation — reads only fields both shapes carry, so a forme grid
   * costs no branch here. It DOES mean a dual-Mega species contributes two rows and the
   * count line says so; that is what per-forme banning means (03-UI-SPEC).
   */
  entries: readonly T[];
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
  onPick: (entry: T, meta: { filtersCleared: boolean }) => void;
  /**
   * `null` on the draft screen. A set of banned ids puts the grid in ban mode: no heading,
   * the count line becomes `{n} of {total} banned`, and every cell reports a pressed state.
   *
   * ONE prop rather than a `mode` plus a set, so "ban mode with no ban data" and "draft mode
   * carrying ban data" are both unrepresentable — the same discipline 02-06 applies to
   * `MonChip`'s `showName`, where one derived local drives two things that must not drift.
   */
  bannedIds: ReadonlySet<string> | null;
  /**
   * What the ban count line counts, in the plural. Omitted means bare `{n} of {total} banned`.
   *
   * Only the NOUN varies — `Mega formes` is the one value 03-UI-SPEC §3 adds — because the
   * line itself is composed once, so the species grid and the forme grid cannot drift into
   * two shapes of one sentence. Ignored outside ban mode, where there is no count to name.
   */
  banSubject?: string;
  /**
   * Prefix for this grid's own control ids and radio-group names. Defaults to `pool`.
   *
   * 03-04 mounts a SECOND grid on the config screen, directly above the species ban grid, so
   * the fixed literals two of these components used to share are now a duplicate-id bug and
   * a merged-radio-group bug on one screen. `FilterBar`'s own prop documents both failures.
   * The default keeps every shipped id exactly as it was; only the new grid passes one.
   */
  idPrefix?: string;
  /**
   * Forwarded to `FilterBar`. `null` leaves the Mega-capability control live.
   *
   * This component is the only mounter of `FilterBar`, so a caller that needs the control
   * inert can only reach it through here. It is a pass-through and nothing else: no
   * behaviour on this component depends on it, and in particular it does not imply ban mode.
   *
   * OPTIONAL, defaulting to `null`, and the default is load-bearing rather than a
   * convenience: `FilterBar` treats any non-null value as a reason, so an omitted prop
   * arriving as `undefined` would read as "inert with the reason `undefined`". The default
   * is applied here, once, so that value can never reach the control.
   */
  megaInertReason?: string | null;
  /**
   * The restriction the CURRENT ROUND imposes, or `null` when the round admits the whole
   * pool — RULE-03, D-16.
   *
   * ONE prop carrying the kind, the round number and the ids, for the reason `bannedIds`
   * above is one prop rather than a mode plus a set: "a Mega round with no eligibility
   * data" and "an open round carrying some" are both unrepresentable. Everything this
   * component does with it — the sentence beside the count, the forced `of` count form,
   * the inert reason on the Mega control and the two round-specific empty states — needs
   * all three fields, and a caller that could supply two of them would be a caller that
   * could render `Round undefined is a Mega round`.
   *
   * The component decides nothing. It renders the restriction it is handed and composes
   * the copy for it; which ids a round admits is `selectRoundEligibleIds`' answer, because
   * a UI component may not own a game rule.
   */
  roundRestriction?: MegaRoundRestriction | null;
}

/**
 * A Mega round's own restriction, as the pool surface needs it.
 *
 * `kind` is a literal rather than `RoundKind`, and that is the point: an `'open'` round has
 * no ids to carry, so the type admits only the case that exists. A later round kind with a
 * restriction of its own widens this into a union and the copy switch becomes exhaustive.
 */
export interface MegaRoundRestriction {
  kind: 'mega';
  /** 1-based, and rendered — `Round 1`, never `Round 0`. */
  round: number;
  /** Pool ids this round admits, already minus picked ids. */
  ids: ReadonlySet<string>;
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
function banCountLine(banned: number, total: number, subject: string | undefined): string {
  const noun = subject === undefined ? '' : `${subject} `;
  return `${banned} of ${total} ${noun}banned`;
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

/*
 * --- A Mega round, 03-UI-SPEC §9 ---
 *
 * Composers rather than JSX prose, per S-5 and for the reason the block above gives: these
 * sentences are contracts down to the em dash, and JSX collapses the whitespace between
 * text lines.
 *
 * The inert reason EXCLUDES the `— ` separator, because `FilterBar` renders that as markup
 * beside the copy. The copy constant, the prop and the test assertion stay one value.
 */
function megaRoundRestrictionLine(round: number): string {
  return `Round ${round} is a Mega round — only Pokémon that can still Mega are shown.`;
}

function megaRoundInertReason(round: number): string {
  return `Round ${round} is a Mega round`;
}

function megaSearchEmptyBody(round: number, query: string): string {
  return `Nothing in round ${round}'s Mega-only pool matches "${query}".`;
}

const MEGA_FILTERS_EMPTY_BODY =
  'No Pokémon that can still Mega is left in the pool with those types.';

const MEGA_OFFER_EMPTY_HEADING = 'No Pokémon can Mega here';

function megaOfferEmptyBody(round: number): string {
  return `Round ${round} is a Mega round, and nothing left in the pool can still Mega. Undo a pick to return one, or start a new tournament.`;
}

/**
 * What the pool renders in place of the grid, and what its action undoes.
 *
 * `action` is `null` for exactly one state: a Mega round whose offer is empty on its own.
 * There is no filter to clear there, and a button that cleared nothing would be a button
 * that widened the offer if anyone ever "fixed" it — which is the post-pick validator this
 * phase exists to remove, arriving as a courtesy.
 */
interface EmptyState {
  heading: string;
  body: string;
  action: { label: string; reset: () => void } | null;
}

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

export function PoolGrid<T extends PoolSubject>({
  entries,
  spriteMeta,
  onPick,
  bannedIds,
  banSubject,
  idPrefix = 'pool',
  megaInertReason = null,
  roundRestriction = null,
}: PoolGridProps<T>) {
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

  /*
    The round's restriction is composed HERE, out of the prop, and is deliberately NOT held
    in `filters` state.

    That placement is the whole guarantee. `Clear filters`, the empty-state reset buttons
    and D-35's clear-on-pick all reset the state to `NO_FILTERS`, so a restriction living
    in it would be switched off by any of the three — and a pick that "cleared filters"
    would silently widen a Mega round's offer, which is the post-pick validator this phase
    exists to remove wearing a friendlier name. Re-applied on every compile from the prop,
    it cannot be cleared by anything this component does.

    `hasActiveFilters` reads the STATE, which never carries it, so `Clear filters` also
    never appears on account of a rule. `search.ts` excludes the field from that function
    besides, so the two halves agree rather than one covering for the other.
  */
  const restrictTo = roundRestriction === null ? null : roundRestriction.ids;

  // Two memos and no more. `compiled` normalizes the query ONCE per change; `visible` is
  // the whole filtered list in a single derivation keyed on every input, so one keystroke
  // produces one recomputation and one render rather than one per control.
  const compiled = useMemo(
    () => compileFilters({ ...filters, restrictTo }),
    [filters, restrictTo],
  );
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

    // Same reason as `handleActivate`, and on BOTH screens: density moves neither
    // `entries` nor `visible` nor `filters`, so nothing else cancels a filter result the
    // host set going a moment before they reached for this control.
    cancelPendingAnnouncement();
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
  function handleActivate(entry: T): void {
    const filtersCleared = bannedIds === null && hasActiveFilters(filters);

    // UNCONDITIONAL, and the ban grid is why. Every activation produces an announcement of
    // its own — `Round 2 of 6 — Bo picks` on the draft screen, `Pikachu banned. 1 ban.` on
    // the config screen — and a filter result 300ms behind it would overwrite the one the
    // host's click just earned.
    //
    // In DRAFT mode a second mechanism used to cover the unfiltered case: a pick moves
    // `entries.length`, the effect below re-runs, and the previous run's cleanup cancels
    // the timer. In BAN mode none of the effect's three dependencies moves — `entries` is
    // the whole roster prop, `visible` derives from it and `compiled`, and `filters` is
    // untouched — so the effect does not re-run and the pending timer survives to swallow
    // the ban confirmation, which is the only feedback a screen-reader user gets that the
    // click registered.
    cancelPendingAnnouncement();

    if (filtersCleared) {
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
    Which empty state applies, and what its action undoes.

    Each action resets exactly the part of the state that the sentence blames — and no
    action resets the ROUND's restriction, because that is not the host's to reset.

    The restricted branch takes the two variants 03-UI-SPEC §9 specifies plus the
    empty-offer state, and reuses the unrestricted `both` sentence when a query and a
    control are active together. The spec gives no third restricted variant, and the
    round-specific sentence would be FALSE in that case: `Nothing in round 1's Mega-only
    pool matches "gar"` is a lie when Garchomp matches the query, can Mega, and was
    excluded by a type pill. Existing true copy beats invented copy.
  */
  const queryActive = filters.query !== '';
  const controlsActive = filters.types.length > 0 || filters.mega !== 'all';
  const restricted = roundRestriction !== null;

  function chooseEmptyState(): EmptyState | null {
    if (visible.length > 0) return null;

    // The restriction alone emptied the offer. Reachable only from an imported or
    // hand-edited document — the RULE-09 gate is the guarantee for documents this build
    // creates — and the offer is NEVER widened to fill it.
    if (!filtered) {
      if (roundRestriction === null) return null;
      return {
        heading: MEGA_OFFER_EMPTY_HEADING,
        body: megaOfferEmptyBody(roundRestriction.round),
        action: null,
      };
    }

    if (queryActive && controlsActive) {
      return {
        heading: EMPTY_HEADING,
        body: bothEmptyBody(filters.query),
        action: { label: CLEAR_BOTH_LABEL, reset: () => setFilters(NO_FILTERS) },
      };
    }

    if (queryActive) {
      return {
        heading: EMPTY_HEADING,
        body:
          roundRestriction === null
            ? searchEmptyBody(filters.query)
            : megaSearchEmptyBody(roundRestriction.round, filters.query),
        action: {
          label: CLEAR_SEARCH_LABEL,
          reset: () => setFilters({ ...filters, query: '' }),
        },
      };
    }

    return {
      heading: EMPTY_HEADING,
      body: restricted ? MEGA_FILTERS_EMPTY_BODY : FILTERS_EMPTY_BODY,
      action: {
        label: CLEAR_FILTERS_LABEL,
        reset: () => setFilters({ ...filters, types: [], matchAll: false, mega: 'all' }),
      },
    };
  }

  const empty = chooseEmptyState();

  /*
    The density attribute, the density control and the grid are OUTSIDE the mode branch
    below, because they render identically in both. That is what "the ban grid reuses
    PoolGrid whole" means, and it is why the ban grid inherits the three density levels and
    the shared stored preference without a line of its own.

    The control's radio-group name is derived from `idPrefix` rather than fixed, and that
    changed in 03-04. It rested on "two of these are never mounted at once — the ban grid is
    on the config screen and the pool is on the draft screen", which the Mega-forme ban grid
    falsified: two ARE mounted at once, one above the other, and two segmented controls
    sharing a name merge into one radio group. That is the exact failure `SegmentedControl`'s
    required `name` prop exists to make impossible, so the prop is now given a distinct
    value rather than the same literal twice.
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

        {/*
          The `of` form is forced while a round restriction is in force, even with no user
          filter active, because the pool IS filtered — 03-UI-SPEC §9. `{total}` is the
          whole leftover pool, which is the number that makes the restriction legible: a
          host reading `74 of 213 available` beside the sentence below knows why the grid
          is short. Narrowing the `entries` prop upstream instead would have left `{total}`
          equal to `{n}` and the forced form saying nothing.
        */}
        <p class="pool__count">
          {banMode
            ? banCountLine(bannedCount, visible.length, banSubject)
            : filtered || restricted
              ? `${visible.length} of ${entries.length} available`
              : `${visible.length} available`}
        </p>

        {/*
          Beside the count, at --text-body in --color-text rather than the muted label the
          count uses. Not a styling slip: this is current STATE — the rule in force right
          now — where the count is meta about the grid. It is what stops a short pool
          reading as a broken render.
        */}
        {roundRestriction !== null && (
          <p class="pool__restriction">{megaRoundRestrictionLine(roundRestriction.round)}</p>
        )}

        <SegmentedControl
          legend="Display density"
          name={`${idPrefix}-density`}
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
        {/*
          Two disjoint callers by construction, resolved to one value here rather than in
          `FilterBar`. The config screen's Mega-forme ban grid passes a literal reason and
          never a round restriction; a Mega round passes a restriction and never a literal.
          `FilterBar` therefore keeps exactly one reason prop and one code path, and WR-04's
          shed-the-ARIA behaviour is inherited rather than re-implemented for a second
          caller — the round ending makes `roundRestriction` null, which makes this null,
          which removes the attribute rather than setting it to `'false'`.
        */}
        <FilterBar
          value={filters}
          onChange={setFilters}
          density={density}
          idPrefix={idPrefix}
          megaInertReason={
            megaInertReason ??
            (roundRestriction === null ? null : megaRoundInertReason(roundRestriction.round))
          }
        />
      </header>

      {empty !== null ? (
        <div class="pool__empty">
          <h3 class="pool__empty-heading">{empty.heading}</h3>
          <p class="pool__empty-body">{empty.body}</p>
          {empty.action !== null && (
            <button type="button" class="pool__empty-action" onClick={empty.action.reset}>
              {empty.action.label}
            </button>
          )}
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
