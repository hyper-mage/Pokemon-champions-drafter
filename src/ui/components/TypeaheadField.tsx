import { useState } from 'preact/hooks';

import { matchesName, toSearchKey } from '../../core/search';

import type { PoolSubject } from './MonCard';

import './TypeaheadField.css';

/**
 * A combobox over the roster — 02-UI-SPEC §4, and the by-name half of D-10's two ban
 * surfaces.
 *
 * ## There is no house pattern for this, and that is why it is written out
 *
 * 02-PATTERNS records the search as finding no existing combobox, no listbox and no visible
 * text input under `src/ui/components/`. The markup below is therefore the specification's
 * rather than a neighbour's: a visually-hidden label bound by `for`/`id`, an input carrying
 * the combobox role and its expanded/controls/autocomplete state, and a list of option rows
 * the input points at one at a time.
 *
 * ## One predicate, shared with the pool filter
 *
 * Both the normalizer and the name predicate come from `src/core/search.ts`, whose own doc
 * block names this component as its second consumer. A second matcher written here would
 * drift, and the failure drift produces is a species the host can find in the ban field and
 * cannot find in the pool — which reads as the tool being broken rather than as two
 * functions disagreeing.
 *
 * The query is normalized ONCE per keystroke, at the call site below, never once per entry.
 * That instruction is in the predicate's own doc comment and this component is who it is
 * addressed to.
 *
 * ## Option activation is on press, not on click
 *
 * A click handler on an option fires AFTER the input's blur, by which time the list has
 * closed and the option has unmounted — so the handler never runs and the click silently
 * does nothing. This is the classic combobox defect and it is invisible in review. Handling
 * the press instead, and preventing its default so focus never leaves the input, is the fix.
 *
 * ## An empty query renders no list, and a reflexive Enter bans nothing
 *
 * The shared predicate returns true for an empty query by design — no query is the absence
 * of a filter, not a filter that excludes nothing — so an unguarded call would render the
 * entire roster the moment the field took focus. That is not what "type a name" means, so an
 * empty query yields no results at all.
 *
 * For the same reason Enter with no active option does nothing rather than taking the first
 * result: a host who finishes typing and presses Enter out of habit must not ban whichever
 * species happens to sort first. Selecting is a deliberate act, and the arrow keys are how it
 * is expressed.
 */

/**
 * The visible result cap — 02-UI-SPEC §4, with the rest reachable by narrowing the query.
 *
 * An uncapped list is the whole roster on a one-letter query — a list nobody can operate
 * with either a keyboard or a screen reader. D-17 also forbids a roster figure appearing
 * anywhere under `src/`, including in a comment, because it dates the moment the count
 * rotates.
 */
const MAX_RESULTS = 8;

/**
 * What this field searches over, in the singular, for the no-match line.
 *
 * `Pokémon` is the species banlist's subject and the default, so no existing call site
 * changed. The Mega-forme banlist passes `Mega forme`, which is the only other subject the
 * copywriting contract names. It is a NOUN and never a sentence: the sentence is composed
 * once, below, so the two surfaces cannot drift into two different shapes of the same line.
 */
const DEFAULT_SUBJECT = 'Pokémon';

/**
 * Verbatim from 02-UI-SPEC §Copywriting Contract → Config screen, and 03-UI-SPEC §3 for the
 * Mega-forme subject.
 *
 * A composer rather than an inline template, per S-5: the quoted query is the one piece of
 * host-authored text on this surface, and it reaches the DOM as a text child of a paragraph.
 */
function noMatchMessage(subject: string, query: string): string {
  return `No ${subject} matches "${query}".`;
}

export interface TypeaheadFieldProps<T extends PoolSubject> {
  /** Visually hidden. */
  label: string;
  placeholder: string;
  /**
   * What the host may still choose. The caller decides what belongs here.
   *
   * A WIDENING, not a second mode. `MegaForme` carries the `id` this component keys and
   * addresses options by and the `name` the shared predicate matches, which is everything
   * read here — so the Mega-forme banlist gets the same combobox rather than a second one
   * that can drift from it.
   */
  candidates: readonly T[];
  onSelect: (entry: T) => void;
  /**
   * The singular noun in the no-match line. Defaults to `Pokémon`.
   *
   * The whole sentence is NOT the prop, so the two surfaces cannot end up phrasing it
   * differently — only the noun varies, and the shape is one composer above.
   */
  subject?: string;
  /**
   * Whether an option may still be chosen, and when it may not, why — 04-UI-SPEC §6.
   *
   * OPTIONAL, with the default applied ONCE inside the component, exactly as {@link subject}
   * and `PoolGrid.megaInertReason` are. The default is a function rather than a null, so the
   * two places below call it unconditionally: a nullable callback would need an optional
   * call at each of them, which is two places to forget rather than one place to get right.
   *
   * `{ inert: true; reason: string }` rather than a bare string, so "inert with no reason"
   * is not expressible. That pair is the exact defect `PaneAvailability` was introduced to
   * close (WR-07), and it matters more here than there: the reason is the only thing that
   * distinguishes a species the host banned themselves from one another player just spent.
   *
   * RESULTS ARE NEVER SILENTLY FILTERED, and marking is not a slower way of removing.
   * Dropping an inert option from the list would make the no-match line false about a
   * species that plainly does match and is simply already gone — the failure
   * `ConfigScreen`'s `candidates` comment prevents by passing the full entry list, and the
   * one 03-UI-SPEC §9 spends a sentence on for the Mega-round pool. A name the host typed
   * that does not appear reads as a broken search, not as an answer.
   */
  optionState?: (entry: T) => { inert: true; reason: string } | null;
  /**
   * Unique prefix for the input, the listbox and every option id. Required, because the
   * input addresses an option by id and two fields on one page that shared a prefix would
   * address each other's options.
   */
  id: string;
}

/**
 * An inert option's whole label — 04-UI-SPEC §6.
 *
 * VISIBLE rather than an `aria-label`, and the separator is part of the string rather than an
 * `aria-hidden` sibling. Both follow from the option's accessible name being its own text
 * content: there is no sibling here for anything to be hidden from, which is the second half
 * of the rule `SplitPanes.tsx`'s `POOL_EXPAND_REASON` block records.
 *
 * The grid answers the same question with one rule line above the whole roster, and that is
 * the right trade there — a couple of hundred reason lines is noise. This list is at most
 * `MAX_RESULTS` long and carries no such line, so the per-option reason is the only thing
 * standing between a host and an option that refuses to be chosen for no stated cause.
 */
function inertOptionLabel(name: string, reason: string): string {
  return `${name} — ${reason}`;
}

export function TypeaheadField<T extends PoolSubject>({
  label,
  placeholder,
  candidates,
  onSelect,
  id,
  subject = DEFAULT_SUBJECT,
  optionState = () => null,
}: TypeaheadFieldProps<T>) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);

  const inputId = `${id}-input`;
  const listId = `${id}-listbox`;

  const key = toSearchKey(query);
  const results =
    key === ''
      ? []
      : candidates.filter((entry) => matchesName(entry, key)).slice(0, MAX_RESULTS);

  const open = !dismissed && results.length > 0;
  const showEmpty = !dismissed && query !== '' && results.length === 0;
  const active = activeIndex >= 0 ? results[activeIndex] : undefined;

  /*
    Derived from the ENTRY id, never from the array index. A re-render that reorders the
    results would otherwise leave the input pointing at a different species than the one the
    host walked to, and nothing on screen would look wrong.

    Entry ids are Showdown `toID` form — lowercase alphanumeric (`roster/types.ts`) — so they
    are valid HTML ids as they stand and need no escaping.
  */
  function optionId(entry: T): string {
    return `${id}-option-${entry.id}`;
  }

  function reset(): void {
    setQuery('');
    setActiveIndex(-1);
    setDismissed(false);
  }

  function select(entry: T): void {
    /*
      The early return IS the refusal, and it lives in the ONE function both the press and
      the Enter key route through. A guard at either call site would be a guard the other
      path could be added without, and this component's own doc block records that the click
      path is the one that silently does nothing when it is wrong.

      `CardFace` and `SplitPanes` set the precedent and state the reason: an `aria-disabled`
      control that still fires is worse than one that was never marked.

      `reset()` is deliberately NOT reached. A refused choice leaves the query and the list
      exactly as they were, so the host can walk to a neighbouring result rather than retype
      a name the field just rejected.
    */
    if (optionState(entry) !== null) return;

    onSelect(entry);
    reset();
  }

  function handleInput(event: Event): void {
    setQuery((event.currentTarget as HTMLInputElement).value);
    // A new query is a new list, so no option carries over into it.
    setActiveIndex(-1);
    setDismissed(false);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Closes the list and leaves the text. Clearing it here would throw away typing the
      // host may only have wanted to stop being interrupted about.
      setDismissed(true);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'Enter') {
      if (active === undefined) return;
      event.preventDefault();
      select(active);
      return;
    }

    if (results.length === 0 || dismissed) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % results.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(results.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div class="typeahead">
      <label class="visually-hidden" for={inputId}>
        {label}
      </label>

      <input
        class="typeahead__input"
        id={inputId}
        type="text"
        role="combobox"
        autocomplete="off"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active === undefined ? undefined : optionId(active)}
        placeholder={placeholder}
        value={query}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
      />

      {open && (
        <ul class="typeahead__list" id={listId} role="listbox">
          {results.map((entry, index) => {
            /*
              Asked per render, never remembered between them, so the option goes back to
              selectable in the same render that returns the species to the pool (WR-04).

              The attribute below is spread present-or-absent rather than assigned, for the
              reason `CardFace` records: a live option then carries no such prop at all,
              which is what makes Preact remove the attribute outright instead of rewriting
              it to a negative — and absent and negative are not the same thing to assistive
              technology.

              An inert option keeps its place in the walk. It is still a `role="option"`,
              still addressable by `aria-activedescendant`, and still reachable by the arrow
              keys, because the reason lives in its label and a label nobody can reach
              explains nothing.
            */
            const state = optionState(entry);

            return (
              <li
                key={entry.id}
                class={[
                  'typeahead__option',
                  index === activeIndex ? 'typeahead__option--active' : '',
                ]
                  .filter((token) => token !== '')
                  .join(' ')}
                id={optionId(entry)}
                role="option"
                aria-selected={index === activeIndex ? 'true' : 'false'}
                {...(state === null ? {} : { 'aria-disabled': 'true' as const })}
                onMouseDown={(event) => {
                  // See the doc block: preventing the default keeps focus on the input, so
                  // this handler runs at all. It runs for an inert option too — `select`
                  // refuses it there, rather than the list quietly not responding.
                  event.preventDefault();
                  select(entry);
                }}
              >
                {state === null ? entry.name : inertOptionLabel(entry.name, state.reason)}
              </li>
            );
          })}
        </ul>
      )}

      {/*
        Surface-local rather than routed through the global live region (S-8). That region
        belongs to the draft screen's transient messages, and a sentence that changes on
        every keystroke would flood it.
      */}
      {showEmpty && (
        <p class="typeahead__empty" role="status">
          {noMatchMessage(subject, query)}
        </p>
      )}
    </div>
  );
}
