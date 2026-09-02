import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import {
  loadRoster,
  readRosterFile,
  refreshRoster,
  type RosterBundle,
} from '../../adapters/roster-source';

import './RosterRefresh.css';

/**
 * The `Roster` group on the config screen — REFR-01, REFR-02, D-23, D-26, 05-UI-SPEC §2.
 *
 * ## It renders a result and computes nothing
 *
 * `FeasibilityBar.tsx:6-16` is the shipped statement of that rule and is not restated
 * here. The five outcomes come from `refreshRoster`'s `RefreshOutcome` union and from
 * `readRosterFile` answering `null`; this file maps each of them onto one sentence from
 * the copy table and owns no opinion about what a roster is. There is no request built
 * here, no URL, no parse, and no second validator — `roster-source.ts` holds all four,
 * and one validator with two entry points is exactly what T-05-31 turns on.
 *
 * ## Both controls live here, together, and that is D-26's whole content
 *
 * D-23 puts refresh beside the roster the tournament is being created against; D-25 gives
 * the staleness banner a next action. The two reconcile by ROUTING to this group rather
 * than by growing a second control somewhere else, so `StalenessBanner`'s landing variant
 * navigates here and moves focus to the button below. `focusOnMount` is that landing.
 *
 * ## A surface-owned status region, and deliberately not the global live region
 *
 * `FeasibilityBar.tsx:27-32` sanctions a surface-local `role="status"` for exactly this
 * case and forbids doing both: routing the same sentence through the global polite region
 * as well would have the two competing to describe one change.
 *
 * ## The contract has no sentence for a SUCCESSFUL import, and that is not an oversight
 *
 * 05-UI-SPEC §Copywriting → Roster group holds nine strings and its only import row is the
 * rejection. That follows from what a successful import actually does (05-04): the file is
 * adopted into the registry so `resolveSnapshot` stops answering `null` for the regulation
 * it names, and it deliberately does NOT become the default — so nothing a new tournament
 * is created against has changed, and there is nothing true to say here. The visible
 * consequence belongs to the surface that was blocked by the missing roster, which is the
 * drift notice in `app.tsx`. This region returns to idle and the caller is told instead.
 * Inventing a sentence would put a string on screen that no contract owns.
 *
 * A REFUSED import is a different matter, and `conflict` is the one sentence added beyond
 * the contract's nine (WR-07). `readRosterFile` now declines a file that would replace a
 * regulation this build already holds under a different checksum, and a refusal with no
 * sentence is the failure this component exists to prevent — the host presses the button,
 * nothing visible happens, and the roster they came to import is silently not there. It is
 * NOT the rejection sentence: the file is a roster this app can read.
 */

/** Verbatim from 05-UI-SPEC §Copywriting → Roster group. */
const HEADING = 'Roster';

/**
 * The two interpolating sentences are functions in this same file rather than inline JSX,
 * for `ReadOnlyBanner.tsx:42-51`'s reason: JSX collapses whitespace between text lines and
 * these are contracts down to the full stop.
 */
export function currentRosterLine(
  regulationLabel: string,
  entryCount: number,
  validUntil: string,
): string {
  return `${regulationLabel} — ${entryCount} Pokémon, valid until ${validUntil}.`;
}

export function updatedSentence(regulationLabel: string, validUntil: string): string {
  return `Updated to ${regulationLabel}, valid until ${validUntil}. New tournaments use it; tournaments already saved keep the roster they were played on.`;
}

export function alreadyCurrentSentence(regulationLabel: string): string {
  return `${regulationLabel} is the newest roster. Nothing to update.`;
}

export const CHECK_LABEL = 'Check for a new roster';
export const IMPORT_LABEL = 'Import roster JSON…';
export const CHECKING_SENTENCE = 'Checking for a new roster…';
export const FAILED_SENTENCE =
  'No network. Import a roster JSON file instead, or try again when you are online.';
export const IMPORT_REJECTED_SENTENCE =
  'That file is not a roster snapshot this app can read. Choose a roster JSON exported by this project.';

/**
 * The one sentence this file owns beyond 05-UI-SPEC §Copywriting's nine — see the doc
 * block, and WR-07 for why the outcome exists at all.
 *
 * It names the regulation because that is the whole content of the problem: the file and
 * the app disagree about what `M-B` contains, and a sentence that did not say which
 * regulation would leave the host guessing which of their files was refused. The next
 * action is the one REFR-02 is actually for.
 */
export function importConflictSentence(regulationLabel: string): string {
  return `That file is a different ${regulationLabel} roster from the one this app already has. Choose a roster for a regulation this app does not ship.`;
}

/**
 * What the result region is showing.
 *
 * Six variants and five sentences: `idle` renders no region at all, which is 05-UI-SPEC
 * §2's first refresh state. One variant is REPLACED by the next on every attempt rather
 * than accumulated, so two sentences can never be on screen at once — a host reading an
 * answer to the previous question is the failure this shape rules out structurally.
 */
type Result =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'alreadyCurrent'; label: string }
  | { kind: 'updated'; label: string; validUntil: string }
  | { kind: 'failed' }
  | { kind: 'rejected' }
  | { kind: 'conflict'; label: string };

function sentenceFor(result: Result): string | null {
  switch (result.kind) {
    case 'idle':
      return null;
    case 'checking':
      return CHECKING_SENTENCE;
    case 'alreadyCurrent':
      return alreadyCurrentSentence(result.label);
    case 'updated':
      return updatedSentence(result.label, result.validUntil);
    case 'failed':
      return FAILED_SENTENCE;
    case 'rejected':
      return IMPORT_REJECTED_SENTENCE;
    case 'conflict':
      return importConflictSentence(result.label);
  }
}

export interface RosterRefreshProps {
  /** The regulation the current line names — `snapshot.regulation`, never a manifest id. */
  regulationLabel: string;
  /** Draftable rows in the snapshot on screen. */
  entryCount: number;
  /** `YYYY-MM-DD`. The first day the snapshot is stale, not the last day it is current. */
  validUntil: string;
  /**
   * A NEWER DEFAULT was adopted from the origin. What a new tournament is created against
   * has changed; nothing about an open document has.
   */
  onRefreshed?: ((bundle: RosterBundle) => void) | undefined;
  /**
   * A roster FILE was read and adopted into the registry. Deliberately a different
   * callback from the one above, because 05-04 decided an imported roster does not become
   * the default — collapsing the two would silently re-point new tournaments at a roster
   * the host imported in order to read an old night.
   */
  onImported?: ((bundle: RosterBundle) => void) | undefined;
  /**
   * Take focus on mount. D-26 routes the landing-screen staleness banner here, and a route
   * that moved the screen without moving focus would leave a keyboard host at the top of a
   * long form with no idea which of its controls they had been sent for.
   */
  focusOnMount?: boolean;
}

export function RosterRefresh({
  regulationLabel,
  entryCount,
  validUntil,
  onRefreshed,
  onImported,
  focusOnMount = false,
}: RosterRefreshProps) {
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const checkRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (focusOnMount) checkRef.current?.focus();
  }, [focusOnMount]);

  const handleCheck = useCallback(() => {
    setResult({ kind: 'checking' });

    void refreshRoster().then((outcome) => {
      if (outcome.kind === 'failed') {
        setResult({ kind: 'failed' });
        return;
      }

      if (outcome.kind === 'alreadyCurrent') {
        setResult({ kind: 'alreadyCurrent', label: outcome.label });
        return;
      }

      setResult({ kind: 'updated', label: outcome.label, validUntil: outcome.validUntil });

      // The adapter has already registered the new regulation and made it the default, so
      // this resolves out of the registry rather than off the wire — which is why it is
      // asked by no argument at all rather than by the outcome's LABEL. That label is the
      // manifest's; the registry's second key is the SNAPSHOT's own `regulation`, and a
      // build where those two disagreed would silently answer `null` here.
      void loadRoster().then(
        (bundle) => onRefreshed?.(bundle),
        () => {
          // Unreachable while the adapter registers before it answers `updated`. The
          // sentence above stays on screen either way: the regulation really was adopted,
          // and reporting a problem the host cannot act on would be worse than silence.
        },
      );
    });
  }, [onRefreshed]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: Event) => {
      const input = event.currentTarget as HTMLInputElement;
      const file = input.files?.[0];

      // Cleared BEFORE the file is handed on, exactly as `LandingScreen` and `TopBar` do
      // and for the same reason: a file input does not fire `change` when the same path is
      // chosen twice running, so a host who fixes a bad file and re-picks it would
      // otherwise get silence — and silence after an error message reads as the app having
      // stopped.
      input.value = '';

      if (file === undefined) return;

      void readRosterFile(file).then((outcome) => {
        if (outcome.kind === 'rejected') {
          setResult({ kind: 'rejected' });
          return;
        }

        // A refusal, and a DIFFERENT one — the file is readable, it just is not one this
        // app may adopt under a label it already holds (WR-07). Nothing was registered,
        // so `onImported` is not called: the caller is told about adoptions only.
        if (outcome.kind === 'conflict') {
          setResult({ kind: 'conflict', label: outcome.regulation });
          return;
        }

        // Back to idle rather than to a sentence. See the doc block: the contract has no
        // string for this, because an imported roster changes nothing on this screen.
        setResult({ kind: 'idle' });
        onImported?.(outcome.bundle);
      });
    },
    [onImported],
  );

  const sentence = sentenceFor(result);

  return (
    <div class="roster-refresh">
      <h2 class="roster-refresh__heading">{HEADING}</h2>

      <p class="roster-refresh__current">
        {currentRosterLine(regulationLabel, entryCount, validUntil)}
      </p>

      <div class="roster-refresh__controls">
        {/*
          A plain button, not accent-filled. 05-UI-SPEC §2: the screen's primary action is
          `Start draft`, and a second filled button would put two primaries on one form.
        */}
        <button
          ref={checkRef}
          type="button"
          class="roster-refresh__action"
          onClick={handleCheck}
        >
          {CHECK_LABEL}
        </button>

        <button type="button" class="roster-refresh__action" onClick={openFilePicker}>
          {IMPORT_LABEL}
        </button>

        {/*
          Hidden rather than visually-hidden, for the reason `LandingScreen` and `TopBar`
          both record: a file input styled off-screen stays in the tab order, so a keyboard
          user would meet an unlabelled second control doing the same thing as the button
          beside it. `hidden` removes it from the tab cycle and from assistive technology
          while leaving `.click()` working, which is the whole reason this element exists.
        */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={handleFileChange}
        />
      </div>

      {/*
        Rendered only when there is something to say, so the idle state is an ABSENT region
        rather than an empty one — an empty status region is somewhere a screen reader can
        land and find nothing.
      */}
      {sentence !== null && (
        <p class="roster-refresh__result" role="status">
          {sentence}
        </p>
      )}
    </div>
  );
}
