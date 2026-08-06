import { useEffect, useRef, useState } from 'preact/hooks';

import { onOwnershipChange, ownershipState, type OwnershipState } from '../adapters/tab-lock';
import { announce } from './components/LiveRegion';

/**
 * Verbatim from the approved UI-SPEC copywriting table.
 *
 * The row was added to the spec after 01-09's takeover UI shipped, so the string existed
 * in the contract and nowhere in the source until now.
 */
export const TAKEOVER_CONFIRMED = 'You are now drafting on this tab.';

/**
 * Subscribe a component to the tab lock.
 *
 * A hook rather than a signal because the lock is an adapter and adapters do not import
 * the UI's reactivity. `onOwnershipChange` is a plain listener set, which is what lets
 * `tab-lock.ts` be tested with two instances and a fake channel and no renderer at all.
 *
 * The initial value is read synchronously from `ownershipState()` rather than defaulted
 * and corrected in an effect. A tab that boots as a secondary must render read-only on
 * its *first* paint: a frame of writable draft screen in a tab that cannot write is an
 * invitation to click something that will be silently discarded.
 *
 * ## Why the takeover announcement lives here and not in the banner
 *
 * On a successful takeover `ReadOnlyBanner` returns null, so the banner AND the button
 * that was just clicked both leave the DOM in the same commit. A component cannot
 * announce its own success from an effect it no longer has, and focus lands on `<body>`
 * because the focused element was removed — so a sighted host sees the whole draft become
 * live while a screen-reader user gets silence at the exact moment the tab's capabilities
 * changed. This hook outlives the transition, which makes it the only place that can
 * observe read-only becoming writable and still be mounted to say so.
 */
export function useOwnership(): OwnershipState {
  const [state, setState] = useState<OwnershipState>(ownershipState);

  // What the previous render observed, so the announcement fires on the TRANSITION rather
  // than on the condition. A tab that has always been the owner never says anything —
  // sole ownership is the ordinary case and announcing it would be noise on every boot.
  const wasReadOnly = useRef(state.readOnly);

  useEffect(() => {
    if (wasReadOnly.current && !state.readOnly) announce(TAKEOVER_CONFIRMED);
    wasReadOnly.current = state.readOnly;
  }, [state.readOnly]);

  useEffect(() => {
    // Re-read on subscribe. The lock is engaged in an effect too, and if it resolved
    // between this component's render and this line, the transition already fired and
    // there would be no second one to wait for.
    setState(ownershipState());
    return onOwnershipChange(setState);
  }, []);

  return state;
}
