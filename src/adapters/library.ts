/**
 * library.ts — the capped multi-tournament library. PERS-08, D-14 / D-15 / D-16.
 *
 * ## THE RULING: a separate key, and `persistence.ts` is not modified
 *
 * Two planning documents disagreed about where this lives, and the disagreement is
 * recorded here rather than left in a planning file the next reader will not open.
 * `05-UI-SPEC.md` §Pure-core boundary item 4 says the library's storage is
 * `src/adapters/persistence.ts`. `05-RESEARCH.md` §The Library, written a day later, says
 * a NEW module with its own key. RESEARCH governs mechanism and UI-SPEC governs copy,
 * layout and tokens, so the UI-SPEC line is read as a LAYER statement — this is adapter
 * work, not core work — rather than as a filename. Four reasons, each of which the
 * alternative costs:
 *
 * 1. **No migration at all.** An older install simply has no library key, which yields an
 *    empty library, which `05-UI-SPEC.md` §12 already specifies renders nothing. The
 *    question "what does an older record look like" is answered by making it not arise.
 * 2. **`generation` is untouched.** `persistence.ts`'s `loadIfNewer` compares that counter
 *    to stop a promoted read-only tab clobbering the owner's picks. Reshaping
 *    `PersistedRecord` to hold a list would put that check inside a restructure for zero
 *    benefit.
 * 3. **Two version surfaces stay independent** — the document's `schemaVersion` and this
 *    wrapper's own. Separate keys are what make them separable.
 * 4. **`tab-lock.ts` uses `BroadcastChannel`, not the `storage` event** (verified by
 *    reading it), so a new key produces no cross-tab side effects at all.
 *
 * `src/adapters/persistence.ts` is therefore modified nowhere in Phase 5.
 *
 * ## Why the download keeps being offered
 *
 * D-14 is a deliberate expansion beyond the one-slot design Phase 1 shipped, and its cost
 * is real rather than theoretical: Safari deletes script-written storage after seven days
 * idle, and that now takes the WHOLE library rather than one document. The JSON file
 * remains the system of record, which is why every filing path in the UI keeps offering
 * the download rather than treating a filed tournament as safe.
 */

import { isValidTournament } from '../core/import-guard';
import { migrate } from '../core/migrate';
import { type TournamentDoc } from '../core/model';
import { now } from './clock';

/** One key, one library. Namespaced alongside the live slot, never sharing it. */
const LIBRARY_KEY = 'champions-drafter:library';

/**
 * The wrapper's own version, deliberately independent of the document's `schemaVersion`.
 *
 * A document inside the library carries its own version and is migrated on read; this
 * number describes only the shape wrapping them. Keeping the two separable is reason 3 of
 * the ruling above — they answer different questions and would drift the moment either
 * changed for its own reasons.
 */
const LIBRARY_VERSION = 1;

const SUPPORTED_LIBRARY_VERSIONS: readonly number[] = [1];

/**
 * The library cap — 12 tournaments.
 *
 * D-16 asks that the number be defended against measured document size rather than chosen
 * because it sounds round. `05-UI-SPEC.md` §The Library Cap does that measurement; the
 * three defences are reproduced here rather than recomputed, because the eviction copy
 * interpolates this constant and the landing screen's height budget is sized against it.
 *
 * **1. Storage, measured.** A synthetic worst case — 8 players, 6 rounds, blind bans,
 * `draftBracketsAndLog` depth, a 96-id pool, a full 28-match round robin and a 7-match
 * bracket, 153 log entries — serialized to 21,572 characters, of which roughly 2,500 is
 * fixed and the rest is about 125 characters per log entry. At PROJECT.md's 500-action
 * upper bound that projects to about 65 KB. Budgeting 80 KB per entry gives a 23% margin,
 * and `12 × 80 KB + 80 KB live = 1.04 MB` against a conservative 5 MB localStorage budget
 * — 21% used, 4.8× headroom. Even if the per-entry figure is 2× low the library lands at
 * 42% of quota. `probeStorage` in `persistence.ts` remains the canary and becomes more
 * load-bearing rather than less: the cap designs for the common case and does not replace
 * the failure path.
 *
 * **2. Regulation rotation.** `roster.index.json` records M-A at 70 days and M-B at 77. A
 * group drafting fortnightly fills 12 slots in 24 weeks — roughly two and a half
 * regulations — so the first eviction fires on a night at least two regulations old, which
 * is the point at which D-24's "a filed M-B night stays an M-B night" is doing archaeology
 * rather than holding recent history.
 *
 * **3. The landing screen.** 12 rows is 1,212px against ~670px available, under two
 * screens. A cap of 24 would be three and a half.
 */
export const LIBRARY_CAP = 12;

/** One filed tournament. `filedAt` is a plain epoch number — never a `Date`. */
export interface LibraryEntry {
  filedAt: number;
  doc: TournamentDoc;
}

export type FileOutcome =
  | { kind: 'filed' }
  | { kind: 'evicted'; dropped: LibraryEntry }
  | { kind: 'quotaFailed' };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * One stored entry, validated and migrated, or `null`.
 *
 * The `isValidTournament` then `migrate` pair is the SAME pair `persistence.load` runs at
 * `persistence.ts:272-300`, not a second validator standing beside it. Both are needed and
 * in that order: `isValidTournament` is a predicate that calls `migrate` to decide its
 * answer and then throws the migrated document away, so validating alone would hand back a
 * document at the version it was written at and the store would refuse it one call later.
 *
 * `JSON.parse` above runs without a reviver, so the structural check inside
 * `isValidTournament` is the only thing between a poisoned library entry and the store —
 * including an object carrying `__proto__`, `constructor` or `prototype` as an own
 * property.
 */
function readEntry(value: unknown): LibraryEntry | null {
  if (!isPlainRecord(value)) return null;

  const filedAt = value['filedAt'];
  if (!Number.isSafeInteger(filedAt)) return null;

  const stored = value['doc'];
  if (!isValidTournament(stored)) return null;

  const migrated = migrate(stored);
  if (!migrated.ok) return null;

  // Rebuilt field by field rather than returned as parsed, so a wrapper carrying extra
  // keys cannot travel any further than this line. `view-prefs.ts:96-98`'s posture.
  return { filedAt: filedAt as number, doc: migrated.doc };
}

/**
 * Every readable filed tournament, newest first. Never throws.
 *
 * **A bad entry is dropped, not fatal**, and that is the one place this read path departs
 * from `view-prefs.ts`'s all-or-nothing posture. The naive shape — validate the wrapper,
 * fail the whole read — loses eleven nights to one hand-edited byte. One unreadable entry
 * costs exactly one entry.
 *
 * A failure of the WRAPPER itself is still total, because there is nothing to salvage: an
 * unparseable value, a non-object, or a version this build has never heard of yields an
 * empty library rather than a guess.
 */
export function listLibrary(): LibraryEntry[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LIBRARY_KEY);
  } catch {
    return [];
  }

  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!isPlainRecord(parsed)) return [];

  const version = parsed['version'];
  if (typeof version !== 'number') return [];
  if (!SUPPORTED_LIBRARY_VERSIONS.includes(version)) return [];

  const entries = parsed['entries'];
  if (!Array.isArray(entries)) return [];

  const readable: LibraryEntry[] = [];
  for (const candidate of entries) {
    const entry = readEntry(candidate);
    if (entry !== null) readable.push(entry);
  }

  // Newest first. Sorted on read rather than trusting the stored order, because a
  // hand-edited key is exactly the input this module assumes it might be handed.
  return readable.sort((a, b) => b.filedAt - a.filedAt);
}

/**
 * The entry the next filing would evict, or `null` below the cap. D-16.
 *
 * The caller needs this BEFORE it files, because D-16's whole contract is that the host is
 * told which tournament is about to go — and offered its download — while it still exists.
 */
export function oldestEntry(): LibraryEntry | null {
  const entries = listLibrary();
  if (entries.length < LIBRARY_CAP) return null;
  return entries[entries.length - 1] ?? null;
}

/**
 * File a tournament, evicting the oldest if the library is full.
 *
 * **The cap check precedes the write.** Discovering the cap by catching a
 * `QuotaExceededError` is exactly the failure D-16 rejects: it lands at the worst possible
 * moment, while the host is trying to save a night. The list handed to `setItem` is
 * already trimmed to the cap.
 *
 * **This module writes only the library.** RESEARCH's ordering rule — write the library
 * first, then touch the live slot — spans two `setItem` calls that can partially fail, and
 * library-then-live means a failure leaves the live document exactly where it was rather
 * than losing a night. The caller owning that sequence is 05-12; keeping the live write
 * out of here means the order is decided in one place instead of two.
 *
 * **A quota failure is not the saving-blocked signal.** `view-prefs.ts:102-121` states the
 * reasoning and it carries across with one addition: that signal means "this browser will
 * not save your draft" and fires the one banner in the app a host genuinely must read. A
 * library write that could not fit is a different event with a different next action —
 * name the file and offer the download — and spending the banner on it is how a real
 * warning gets trained out of a host's attention.
 */
export function fileTournament(doc: TournamentDoc): FileOutcome {
  const existing = listLibrary();

  // The cap check, before anything is written. Slicing to `LIBRARY_CAP - 1` also repairs a
  // hand-edited key holding more than the cap, rather than preserving the overflow.
  const atCap = existing.length >= LIBRARY_CAP;
  const dropped = atCap ? (existing[existing.length - 1] ?? null) : null;
  const kept = atCap ? existing.slice(0, LIBRARY_CAP - 1) : existing;

  const entry: LibraryEntry = { filedAt: now(), doc };
  const next = [entry, ...kept];

  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ version: LIBRARY_VERSION, entries: next }));
  } catch {
    // The single write did not land, so the stored library is byte-identical to what it
    // was before this call. Nothing to roll back and nothing to signal globally.
    return { kind: 'quotaFailed' };
  }

  if (dropped !== null) return { kind: 'evicted', dropped };
  return { kind: 'filed' };
}

/**
 * A filed document by its tournament id, or `null`.
 *
 * Routed through {@link listLibrary} so the entry is validated and migrated by exactly the
 * path every other read uses. An entry that would be dropped from the list is not
 * reachable here either — the caller gets `null` rather than a partially rebuilt document
 * that fails when something tries to fold it.
 */
export function openLibraryEntry(id: string): TournamentDoc | null {
  const found = listLibrary().find((entry) => entry.doc.id === id);
  return found === undefined ? null : found.doc;
}
