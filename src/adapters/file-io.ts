/**
 * file-io.ts — PERS-04 and PERS-05: the tournament leaving and re-entering the browser.
 *
 * This is the durability guarantee, and `persistence.ts` is merely the convenience layer.
 * That ordering is not modesty about localStorage — it is CLAUDE.md's finding that Safari
 * deletes **all** script-writable storage for an origin after seven days without user
 * interaction, which hits localStorage and IndexedDB identically. A league that drafts on
 * Sunday and plays the bracket out over three weeks comes back to nothing. The file the
 * host downloaded is the only artifact that survives that, so it is the system of record.
 *
 * ## Why the fifteen-line version, and not the good API
 *
 * The File System Access API offers a real Save-As with overwrite-in-place, and it is
 * unavailable in Firefox and in every Safari including all of iOS. Building on it would
 * mean the durability guarantee works on roughly the browsers that need it least.
 * `Blob` + `URL.createObjectURL` + a synthetic `<a download>` works everywhere, needs no
 * dependency, and fits in this file. `showSaveFilePicker` is a permitted progressive
 * enhancement and is deliberately NOT built here: an enhancement that changes which file
 * the host overwrites is worth its own plan, not a feature-detect tacked onto the only
 * path that currently works.
 *
 * Impure by construction — it touches the DOM, object URLs and the clock — so it lives in
 * `adapters/` and `npm run check:pure` fails the build if `src/core` ever imports it.
 */

import { MAX_IMPORT_BYTES } from '../core/import-guard';
import type { TournamentDoc } from '../core/model';
import { now } from './clock';

/** What the host is offered when the id cannot supply anything filename-shaped. */
const FALLBACK_ID_SLUG = 'tournament';

export type FileReadRejectionReason =
  /** Past the guard's size gate. Deliberately refused WITHOUT reading the bytes. */
  | 'tooLarge'
  /** The browser could not read the file — removed, permission revoked, device gone. */
  | 'unreadable';

export type FileReadResult =
  | { ok: true; text: string; byteLength: number }
  | { ok: false; reason: FileReadRejectionReason };

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

/**
 * The id, reduced to characters that are safe in a filename on every platform.
 *
 * `doc.id` is a UUID for every tournament this build creates, so in the ordinary case
 * this changes nothing. It is not decoration: an IMPORTED document's id came out of an
 * untrusted file and is an arbitrary string, and this value is about to be handed to the
 * browser as a filename. Path separators, `..`, colons, control characters and
 * right-to-left overrides all have to lose here rather than in a download folder.
 * Browsers do sanitise the `download` attribute themselves; relying on that would be
 * trusting three vendors' behaviour to stay identical rather than spending one line.
 */
function idSlug(id: string): string {
  const cleaned = id
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);

  return cleaned.length > 0 ? cleaned : FALLBACK_ID_SLUG;
}

/** Local calendar date as `YYYY-MM-DD`. */
function isoDate(epochMs: number): string {
  const at = new Date(epochMs);

  // Local rather than `toISOString`, which is UTC: a host drafting at 6pm in UTC-8 would
  // otherwise find tomorrow's date on tonight's file, and the date on the file is there
  // to help them find it again.
  const year = at.getFullYear();
  const month = `${at.getMonth() + 1}`.padStart(2, '0');
  const day = `${at.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * `champions-draft-{YYYY-MM-DD}-{id}.json`.
 *
 * The date comes from the clock adapter and is passed down rather than read inside core,
 * and the id fragment disambiguates two tournaments drafted on the same day — which is
 * the normal case for a league night, not an edge case.
 */
export function tournamentFilename(doc: TournamentDoc, epochMs: number = now()): string {
  return `champions-draft-${isoDate(epochMs)}-${idSlug(doc.id)}.json`;
}

// ---------------------------------------------------------------------------
// Out
// ---------------------------------------------------------------------------

/**
 * Serialize `value` and hand it to the browser as a download.
 *
 * Indented output, deliberately. The file is the host's copy of their own tournament and
 * they may well open it; a few extra kilobytes against a 5 MB gate costs nothing, and a
 * readable file is one a human can sanity-check before mailing it to a friend.
 *
 * The object URL is revoked immediately after the click. The browser has already taken
 * its own reference to the blob by then, so the download completes; leaving it unrevoked
 * would pin the whole document in memory for the life of the tab.
 */
export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  });

  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    // Never rendered and never inserted into the tree — a detached anchor's click still
    // triggers the download, and nothing in the document shifts while it happens.
    anchor.rel = 'noopener';
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// In
// ---------------------------------------------------------------------------

/**
 * Read a chosen file as text, refusing an oversized one before reading it.
 *
 * The size check is here as well as in the guard, and that is not redundancy for its own
 * sake: `File.size` is metadata available before a single byte is read, so refusing here
 * means a 2 GB file is never brought into memory at all. The guard's own gate still runs,
 * because the guard has to be safe when called with text from anywhere.
 */
export async function readJsonFile(file: File): Promise<FileReadResult> {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, reason: 'tooLarge' };

  let text: string;
  try {
    text = await file.text();
  } catch {
    // The file was removed, unmounted, or permission was withdrawn between the picker
    // and the read. Nothing to repair and nothing to retry.
    return { ok: false, reason: 'unreadable' };
  }

  // `file.size` is the authoritative byte count. `text.length` counts UTF-16 code units
  // and would under-report a file full of astral characters, which is the wrong
  // direction to be wrong in for a size gate.
  return { ok: true, text, byteLength: file.size };
}
