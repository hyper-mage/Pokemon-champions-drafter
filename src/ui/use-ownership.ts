import { useEffect, useState } from 'preact/hooks';

import { onOwnershipChange, ownershipState, type OwnershipState } from '../adapters/tab-lock';

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
 */
export function useOwnership(): OwnershipState {
  const [state, setState] = useState<OwnershipState>(ownershipState);

  useEffect(() => {
    // Re-read on subscribe. The lock is engaged in an effect too, and if it resolved
    // between this component's render and this line, the transition already fired and
    // there would be no second one to wait for.
    setState(ownershipState());
    return onOwnershipChange(setState);
  }, []);

  return state;
}
