// @vitest-environment happy-dom

/**
 * The read-only banner — PERS-03 / D-12, UI-SPEC section 4(b).
 *
 * Asserted against a real DOM rather than by reading the JSX. The three things this
 * component can get wrong are all invisible to inspection: a sentence that is *nearly*
 * the contracted string, a button that changes label on the stale path when the spec
 * says it must not, and a click that does not actually move the lock.
 *
 * The banner is rendered from props, but the takeover test drives the real module-level
 * lock across a fake channel — because "the button calls a function" is not the claim
 * worth making. The claim worth making is "clicking this makes the tab writable".
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLAIM_WINDOW_MS,
  claimOwnership,
  createTabLock,
  disposeTabLock,
  isOwner,
  ownershipState,
  type LockChannel,
  type LockMessage,
  type OwnershipState,
} from '../../src/adapters/tab-lock';
import {
  READ_ONLY_SENTENCE,
  ReadOnlyBanner,
  STALE_SENTENCE,
  TAKEOVER_LABEL,
} from '../../src/ui/components/ReadOnlyBanner';

// ---------------------------------------------------------------------------
// Scaffolding
// ---------------------------------------------------------------------------

interface Port {
  handler: ((message: LockMessage) => void) | null;
  open: boolean;
}

/** A BroadcastChannel bus. Faithful on the one point that matters: no self-delivery. */
function makeBus() {
  const ports: Port[] = [];

  return {
    connect(): LockChannel {
      const port: Port = { handler: null, open: true };
      ports.push(port);

      return {
        postMessage(message: LockMessage): void {
          if (!port.open) return;
          for (const other of ports) {
            if (other === port || !other.open) continue;
            other.handler?.(message);
          }
        },
        listen(handler: (message: LockMessage) => void): void {
          port.handler = handler;
        },
        close(): void {
          port.open = false;
          port.handler = null;
        },
      };
    },
  };
}

const OWNER: OwnershipState = { status: 'owner', owner: true, readOnly: false, stale: false };
const SECONDARY: OwnershipState = {
  status: 'secondary',
  owner: false,
  readOnly: true,
  stale: false,
};
const SECONDARY_STALE: OwnershipState = { ...SECONDARY, stale: true };

let host: HTMLDivElement;

function draw(ownership: OwnershipState): void {
  act(() => {
    render(<ReadOnlyBanner ownership={ownership} />, host);
  });
}

function takeoverButton(): HTMLButtonElement | null {
  return host.querySelector('button');
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  disposeTabLock();
});

// ---------------------------------------------------------------------------

describe('the read-only banner', () => {
  it('renders nothing at all in the tab that owns the draft', () => {
    draw(OWNER);

    // Not hidden, not empty, not zero-height — absent. The owning tab is the ordinary
    // case and it must look exactly as it did before this feature existed.
    expect(host.innerHTML).toBe('');
  });

  it('names the situation and offers the takeover', () => {
    draw(SECONDARY);

    expect(host.textContent).toContain(READ_ONLY_SENTENCE);
    expect(takeoverButton()?.textContent).toBe(TAKEOVER_LABEL);
  });

  it('uses the contracted strings exactly', () => {
    // Pinned as literals, not as references to the exported constants: a test that
    // compares the constant to itself would pass just as happily after a typo. These
    // three strings come from the approved UI-SPEC copywriting table.
    expect(READ_ONLY_SENTENCE).toBe(
      'Another tab is drafting this tournament. This tab is read-only.',
    );
    expect(STALE_SENTENCE).toBe('The tab that was drafting has stopped responding.');
    expect(TAKEOVER_LABEL).toBe('Take over drafting here');
  });

  it('swaps ONLY the sentence when the lock goes stale', () => {
    draw(SECONDARY);
    const before = takeoverButton()?.textContent;
    expect(host.textContent).toContain(READ_ONLY_SENTENCE);

    draw(SECONDARY_STALE);

    // The sentence changes, because what is true has changed.
    expect(host.textContent).toContain(STALE_SENTENCE);
    expect(host.textContent).not.toContain(READ_ONLY_SENTENCE);

    // The label does not, because what the host can DO has not changed. There is exactly
    // one kind of takeover; relabelling here would imply a second, more forceful one.
    expect(takeoverButton()?.textContent).toBe(before);
    expect(takeoverButton()?.textContent).toBe(TAKEOVER_LABEL);
  });

  it('carries no colour signal, and is not dressed as a danger state', () => {
    draw(SECONDARY_STALE);

    // Read-only is not an error — another tab simply got there first. The UI-SPEC
    // reserves the destructive colour for two surfaces and this is neither, so the
    // non-colour signals (the sentence, and `inert` on the shell holding every screen)
    // are the whole of the signalling. Even in the stale state, the tempting one to redden.
    expect(host.innerHTML).not.toContain('danger');
  });

  it('takes ownership when the button is clicked, for real', () => {
    vi.useFakeTimers();

    try {
      const bus = makeBus();

      // Another tab is already drafting...
      const rival = createTabLock({ tabId: 'rival', channel: bus.connect() });
      rival.claim();
      vi.advanceTimersByTime(CLAIM_WINDOW_MS);

      // ...and this tab boots into it.
      claimOwnership({ channel: bus.connect() });
      vi.advanceTimersByTime(CLAIM_WINDOW_MS);

      expect(ownershipState().readOnly).toBe(true);
      expect(isOwner()).toBe(false);

      draw(ownershipState());
      act(() => {
        takeoverButton()?.click();
      });

      // The click moved the lock, not merely a flag: this tab may now write, and the tab
      // that was drafting has stood down. Both halves matter — a takeover that promoted
      // this tab without demoting the other would be two owners, which is the clobber.
      expect(isOwner()).toBe(true);
      expect(rival.isOwner()).toBe(false);
      expect(rival.state().readOnly).toBe(true);

      // ...and the banner leaves, because this tab is no longer a bystander.
      draw(ownershipState());
      expect(host.innerHTML).toBe('');

      rival.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
