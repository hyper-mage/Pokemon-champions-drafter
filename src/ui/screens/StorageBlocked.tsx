import { Dialog } from '../components/Dialog';

/**
 * The D-13 blocking screen — PERS-02.
 *
 * It appears before the draft renders, when the canary has proved that this browser
 * will not keep anything. PITFALLS Pitfall 1 puts the reason for the timing in one
 * sentence: detecting private mode *before* forty minutes of work is the whole game.
 * Discovering it afterwards is not a warning, it is a post-mortem.
 *
 * Acknowledgement is required. There is no close control and Escape does nothing,
 * because the one failure mode this screen cannot afford is being dismissed by reflex
 * and then not remembered.
 *
 * The copy blames the browser, which is accurate, and it names the next action rather
 * than only the problem. `Continue without saving` is a real option and is worded as
 * one: the draft runs perfectly well unsaved, and telling the host to go find a
 * different browser instead of telling them how to survive this one would be worse
 * advice.
 */

/**
 * Verbatim from the approved UI-SPEC copywriting table, as one string rather than JSX
 * prose. Whitespace between JSX text lines collapses, which usually produces the right
 * result and cannot be relied on to produce this exact one — and this sentence is a
 * contract, down to the em dash.
 */
const BODY_COPY =
  'Storage is unavailable or restricted here — private browsing, a browser policy, or a full disk can all cause it. The draft will run normally, but closing this tab will lose it. Download the tournament JSON as you go and re-import it to carry on.';

export interface StorageBlockedProps {
  onAcknowledge: () => void;
}

export function StorageBlocked({ onAcknowledge }: StorageBlockedProps) {
  return (
    <Dialog
      heading="This browser will not save your draft"
      dismissible={false}
      tone="danger"
      actions={
        <button
          type="button"
          class="dialog__action dialog__action--primary"
          onClick={onAcknowledge}
        >
          Continue without saving
        </button>
      }
    >
      <p>{BODY_COPY}</p>
    </Dialog>
  );
}
