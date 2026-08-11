/**
 * view-prefs.ts — how the pool is displayed, and which pane is expanded (D-20).
 *
 * Impure, and in `adapters/` for that reason. These are preferences about a screen, not
 * facts about a tournament: they must never enter the tournament document, never travel
 * through a JSON export, and never reach a future sync layer, because two people
 * drafting together are allowed to disagree about how big the sprites should be.
 *
 * ## Everything fails to the defaults, and nothing says so
 *
 * `loadViewPrefs` returns `{ density: 'standard', pane: 'split' }` for every failure
 * mode without distinguishing between them — key absent, storage unreadable, JSON
 * unparseable, value not an object, value carrying a level nobody has ever heard of.
 * It never throws and never returns null. The posture is `persistence.load`'s, for the
 * same reason it gives: the caller's response is identical in all of them. It is
 * stronger here, because a view preference must never block a render and must never
 * produce a warning that a host has to read and dismiss to get to their draft.
 *
 * ## No version field, no migration
 *
 * There is nothing to migrate from, and there never will be anything worth migrating: a
 * lost pane preference costs one click. `persistence.ts` carries a `schemaVersion` and a
 * `generation` because a tournament is forty minutes of work; this is two enum values.
 */

/** One key, one set of view preferences. Namespaced like `champions-drafter:tournament`. */
const VIEW_KEY = 'champions-drafter:view';

export type Density = 'minimal' | 'standard' | 'full';
export type PaneState = 'split' | 'pool' | 'board';

export interface ViewPrefs {
  density: Density;
  pane: PaneState;
}

const DENSITIES: readonly string[] = ['minimal', 'standard', 'full'];
const PANE_STATES: readonly string[] = ['split', 'pool', 'board'];

/** Standard density, both panes visible. D-31 for the density, D-18 for the panes. */
const DEFAULT_DENSITY: Density = 'standard';
const DEFAULT_PANE: PaneState = 'split';

/**
 * A fresh defaults object on every call.
 *
 * Never a shared frozen constant handed back to callers: this value goes into component
 * state, and a caller that mutates what it was given would silently change what every
 * later failure returns.
 */
function defaults(): ViewPrefs {
  return { density: DEFAULT_DENSITY, pane: DEFAULT_PANE };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The stored preferences, or the defaults.
 *
 * An unrecognised value in EITHER field discards BOTH rather than salvaging the good
 * one. One rule is easier to hold than two, there is no partial state to reason about,
 * and the case it gives up on — a hand-edited key with exactly one field corrupted — is
 * worth precisely one extra click to repair.
 *
 * This is also the whole of the T-02-11 mitigation. A value from outside the two declared
 * unions can never reach a `data-density` attribute or a component branch, so a string
 * typed into devtools cannot become a CSS selector.
 */
export function loadViewPrefs(): ViewPrefs {
  let raw: string | null;
  try {
    raw = localStorage.getItem(VIEW_KEY);
  } catch {
    return defaults();
  }

  if (raw === null) return defaults();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults();
  }

  if (!isPlainRecord(parsed)) return defaults();

  const density = parsed['density'];
  const pane = parsed['pane'];

  if (typeof density !== 'string' || !DENSITIES.includes(density)) return defaults();
  if (typeof pane !== 'string' || !PANE_STATES.includes(pane)) return defaults();

  // Rebuilt field by field rather than returned as parsed, so an object carrying extra
  // keys — or `__proto__` as an own property — cannot travel any further than this line.
  return { density: density as Density, pane: pane as PaneState };
}

/**
 * Store the preferences. Silent on failure, by design.
 *
 * `JSON.stringify` is inside the try along with the write, matching `persistence.save`:
 * the value is two strings today, and a future field that is not serializable would
 * otherwise throw out of a density click and take the pool down with it.
 *
 * It deliberately does NOT raise the persistence module's saving-blocked signal, and
 * that is the point of this note rather than an omission. That signal means "this
 * browser will not save your draft", it fires a banner, and it is the one warning in the
 * app a host genuinely must read. A quota-exceeded or policy-blocked write of a sprite
 * size is not that, and letting it borrow that banner is how a real warning gets trained
 * out of a host's attention.
 */
export function saveViewPrefs(prefs: ViewPrefs): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(prefs));
  } catch {
    // Nothing to do and nothing to say about it. The preference reverts to the default
    // on the next load, which is exactly what a host who cannot save anything expects.
  }
}
