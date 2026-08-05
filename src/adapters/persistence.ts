/**
 * persistence.ts — PERS-01 autosave and the PERS-02 storage canary.
 *
 * Impure by design, and in `adapters/` for that reason. Nothing under `src/core` may
 * import this file, and `npm run check:pure` fails the build if anything tries: the
 * whole point of the core/adapters split is that the draft rules never know whether
 * storage exists, so that a browser refusing to save changes what the host is told and
 * nothing about what the draft does.
 *
 * ## Why localStorage, and not IndexedDB
 *
 * The tournament document is a few KB — a complete two-player draft is fourteen log
 * entries — against a ~5 MB per-origin cap. Size is not the deciding factor and neither
 * is the API. The deciding factor is teardown: **a write started in `pagehide` completes
 * synchronously**, whereas an IndexedDB write issued at the same moment can be lost
 * mid-flight when the tab goes away. The one place localStorage's synchronous API is
 * usually called a drawback is exactly where this application needs it.
 *
 * ## What this file does NOT solve, stated plainly
 *
 * Safari deletes **all** script-writable storage for an origin after seven days without
 * user interaction, and that applies to localStorage and IndexedDB equally — choosing a
 * different engine does not dodge it. A league that drafts on Sunday and plays out the
 * bracket over three weeks will come back to nothing. `navigator.storage.persist()` is
 * called below as the one available mitigation and its result is treated as advisory,
 * because it is. The durable answer is the JSON file export in plan 01-10; this file is
 * the convenience layer, and calling it a backup would be the wrong way round.
 */

import { computed, signal, type ReadonlySignal } from '@preact/signals';

import { SCHEMA_VERSION, type TournamentDoc } from '../core/model';
import { now } from './clock';
import { isOwner, notifySaved } from './tab-lock';

/** One key, one tournament. Namespaced so a future key cannot collide with this one. */
const STORAGE_KEY = 'champions-drafter:tournament';

/** Written, read back, compared and removed by the canary. Never read by anything else. */
const PROBE_KEY = 'champions-drafter:probe';

/**
 * Trailing debounce for autosave.
 *
 * Picking is a burst activity — the host transcribes names called out across a table —
 * and the document is tens of KB at most, so this is short enough that a pick is never
 * meaningfully unsaved and long enough that a flurry of them is one write rather than
 * six. The `pagehide` flush below covers the window this leaves open.
 */
const AUTOSAVE_DEBOUNCE_MS = 300;

export type StorageFailureReason =
  /** Reading the API itself threw — policy, an embedded webview, or a sandboxed frame. */
  | 'unavailable'
  /** The write was refused. Safari private mode has historically thrown on the first one. */
  | 'writeRejected'
  /** The quota is full, or is zero. */
  | 'quotaExceeded'
  /** The write reported success and the read back disagreed. */
  | 'readbackMismatch';

export type ProbeResult = { ok: true } | { ok: false; reason: StorageFailureReason };

/**
 * What a persisted key holds. Not the bare document, deliberately.
 *
 * `generation` is a monotonically increasing integer bumped on every successful write.
 * Nothing in this plan reads it; plan 01-09's ownership lock and any future clobber
 * detection do — a tab about to write a generation lower than the one already stored is
 * about to overwrite someone else's newer save. Recording it now costs one integer and
 * means no saved tournament needs migrating to gain it later.
 */
interface PersistedRecord {
  schemaVersion: number;
  generation: number;
  savedAt: number;
  doc: TournamentDoc;
}

const blocked = signal(false);

/**
 * True once a write has failed and stayed failed.
 *
 * A failure is surfaced rather than retried. Silently retrying is how a host discovers
 * at the end of a draft that none of it was ever saved, which is the exact failure the
 * canary exists to prevent at the start.
 */
export const savingBlocked: ReadonlySignal<boolean> = computed(() => blocked.value);

let generation = 0;
let persistenceRequested = false;

// ---------------------------------------------------------------------------
// The canary — PERS-02 / D-13
// ---------------------------------------------------------------------------

function classifyFailure(error: unknown): StorageFailureReason {
  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError') return 'quotaExceeded';
    if (error.name === 'SecurityError') return 'unavailable';
  }
  return 'writeRejected';
}

/**
 * Write a throwaway key, read it back, compare it, and delete it.
 *
 * Feature detection is not an acceptable substitute and the reason is specific rather
 * than stylistic: testing for the presence of the storage object returns **true** in
 * precisely the situations that matter — private browsing, disabled by policy, quota
 * exhausted, embedded webviews — because the object is there and only the write throws.
 * A detection that passes in every failing case is worse than none, because it is
 * trusted.
 *
 * A successful write whose read back disagrees is also a failure. Some environments
 * accept a write and discard it, which looks identical to success from the setter alone.
 */
export function probeStorage(): ProbeResult {
  const token = `probe-${SCHEMA_VERSION}-${now()}`;

  try {
    localStorage.setItem(PROBE_KEY, token);
    const readBack = localStorage.getItem(PROBE_KEY);
    localStorage.removeItem(PROBE_KEY);

    if (readBack !== token) return { ok: false, reason: 'readbackMismatch' };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: classifyFailure(error) };
  }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Serialize and store the document. Returns whether it landed.
 *
 * `JSON.stringify` is inside the try along with the write: the document is verified
 * JSON-serializable by test, but a future field that is not would otherwise throw here
 * and take the draft screen down with it, which is a strictly worse outcome than a
 * warning banner.
 *
 * ## The ownership gate — PERS-03 / T-01-06
 *
 * This is the enforcement point for the tab lock, and it is one line on purpose. The
 * read-only banner in a secondary tab is the *explanation*; this is the *guarantee*. A
 * tab that does not hold write ownership never reaches `setItem` for the tournament key,
 * so the last-writer-wins clobber is structurally unreachable rather than merely
 * discouraged.
 *
 * A refused write deliberately does NOT raise `savingBlocked`. That signal means "this
 * browser will not save your draft", and a read-only tab's problem is the opposite: the
 * draft is being saved, correctly, by the tab that owns it.
 */
export function save(doc: TournamentDoc): boolean {
  if (!isOwner()) return false;

  const record: PersistedRecord = {
    schemaVersion: SCHEMA_VERSION,
    generation: generation + 1,
    savedAt: now(),
    doc,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    blocked.value = true;
    return false;
  }

  generation = record.generation;
  blocked.value = false;

  // After the write, never before. A secondary told to re-read before the bytes landed
  // would read the previous generation and conclude it was already current, and the
  // nudge would be wasted precisely on the write it was announcing.
  notifySaved();

  return true;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a parsed value is safe to fold.
 *
 * Stored bytes are untrusted input. They can be truncated by a write that died with the
 * tab, hand-edited in devtools, or written by a different build. The bar here is not
 * "is this a valid tournament" — that is plan 01-10's import guard, which this will be
 * replaced by — it is "will `fold` survive being handed this". Everything checked below
 * is something the fold path dereferences without asking first: a log entry that is
 * `null` crashes on `.type`, and a config with no `players` array crashes in
 * `initialState`.
 *
 * A corrupt record must never half-load. Returning null loses the autosave; loading half
 * of it loses the draft and looks like it worked.
 */
function isRestorableDoc(value: unknown): value is TournamentDoc {
  if (!isPlainRecord(value)) return false;
  if (value['schemaVersion'] !== SCHEMA_VERSION) return false;

  const config = value['config'];
  if (!isPlainRecord(config)) return false;
  if (typeof config['rounds'] !== 'number') return false;
  if (!Array.isArray(config['players'])) return false;
  if (!config['players'].every((player) => isPlainRecord(player))) return false;

  if (!isPlainRecord(value['rng'])) return false;

  const log = value['log'];
  if (!Array.isArray(log)) return false;
  return log.every((entry) => isPlainRecord(entry) && typeof entry['type'] === 'string');
}

/**
 * The stored document, or null when there is nothing usable to restore.
 *
 * Null for every failure mode without distinguishing between them, because the caller's
 * response is the same in all of them: start a fresh tournament. An unrecognised
 * `schemaVersion` returns null rather than throwing — a document from a newer build is
 * not this build's business, and guessing at it is how a good save gets overwritten by
 * a bad interpretation of it.
 */
export function load(): TournamentDoc | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isPlainRecord(parsed)) return null;
  if (parsed['schemaVersion'] !== SCHEMA_VERSION) return null;
  if (!isRestorableDoc(parsed['doc'])) return null;

  // Continue the sequence rather than restarting it, so a reload cannot make this tab
  // look older than the record it just read.
  const storedGeneration = parsed['generation'];
  generation = Number.isSafeInteger(storedGeneration) ? (storedGeneration as number) : 0;

  return parsed['doc'];
}

/**
 * The stored document, but only when it is newer than anything this tab has written.
 *
 * This is the whole of the T-01-40 mitigation and it exists for exactly one caller: a tab
 * that is being promoted to write ownership. Consider the sequence the lock makes
 * possible — tab B opens read-only, tab A drafts ten more picks, then the host clicks
 * `Take over drafting here` in B. B's in-memory document is ten picks behind. Promoting
 * it without this call would let B's very next autosave overwrite A's work, which is
 * precisely the clobber the lock was built to prevent, arriving through the front door.
 *
 * `generation` is the comparison because it is the one field that is monotonic per write
 * — 01-07 recorded it on every save specifically so this check would not need a schema
 * migration to exist. `savedAt` would be the obvious alternative and is not usable: it
 * comes from two different tabs' clocks.
 *
 * Returns null when there is nothing newer, so the caller can leave a tab that is already
 * current exactly as it is.
 */
export function loadIfNewer(): TournamentDoc | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isPlainRecord(parsed)) return null;

  const storedGeneration = parsed['generation'];
  if (!Number.isSafeInteger(storedGeneration)) return null;
  if ((storedGeneration as number) <= generation) return null;

  // Re-read through `load` rather than trusting the parse above: the promoted tab is
  // about to adopt this document and fold it, and every shape check `load` makes is one
  // the fold path would otherwise dereference blind.
  return load();
}

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------

/**
 * The minimum the autosave needs from the store.
 *
 * Injected rather than imported so the dependency points the right way: `adapters/` sits
 * below the store, and an adapter reaching upward for the module that orchestrates it
 * would invert the layering the purity gate exists to protect.
 */
export interface AutosaveSource {
  subscribe: (listener: () => void) => () => void;
  getDoc: () => TournamentDoc | null;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: TournamentDoc | null = null;

function flush(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }

  const doc = pending;
  pending = null;
  if (doc === null) return;

  save(doc);
}

function schedule(doc: TournamentDoc): void {
  pending = doc;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Ask the browser to exempt this origin from eviction. Advisory, and treated as such.
 *
 * Persistent-mode origins are skipped by automatic eviction, which removes one of the
 * six ways a draft can evaporate. Chromium and Safari decide from engagement history
 * without prompting; Firefox prompts. The boolean it resolves with is deliberately not
 * stored, not rendered and not branched on: a host who was refused persistence is in
 * exactly the same position as one who was granted it and then hit Safari's seven-day
 * rule, and the honest advice in both cases is the same one the export panel already
 * gives. Called once, on the first pick, because that is the first moment the host has
 * anything to lose.
 */
function requestPersistence(): void {
  if (persistenceRequested) return;
  persistenceRequested = true;

  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // No StorageManager in this context. Nothing to do, and nothing to say about it.
  }
}

function hasAnyPick(doc: TournamentDoc): boolean {
  return doc.log.some((action) => action.type === 'draft/pickMade');
}

/**
 * Start saving on every change, and return the function that stops it.
 *
 * The `pagehide` listener is what makes this trustworthy rather than merely frequent: a
 * debounced write has an open window by construction, and the tab closing inside that
 * window is the common case, not the exotic one. `pagehide` is the correct event —
 * unlike its older sibling it fires when the page enters the back/forward cache and it
 * does not disqualify the page from that cache. `visibilitychange` to hidden is
 * registered alongside it because on mobile a backgrounded tab can be killed without
 * ever firing anything else.
 */
export function startAutosave(source: AutosaveSource): () => void {
  const unsubscribe = source.subscribe(() => {
    const doc = source.getDoc();
    if (doc === null) return;
    if (hasAnyPick(doc)) requestPersistence();
    schedule(doc);
  });

  const onPageHide = (): void => flush();
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };

  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    flush();
  };
}
