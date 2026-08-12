// @vitest-environment happy-dom

/**
 * The top-bar file controls and the replace-draft confirmation — UI-SPEC section 4(d).
 *
 * Asserted against a real DOM rather than by reading the JSX, because every failure this
 * plan can plausibly ship is invisible to inspection: three ASCII periods where the
 * contract says one U+2026 ellipsis, a file input that fires once and then goes quiet
 * because its value was never reset, a destructive button that got the label `OK`, or a
 * confirm dialog that says "1 picks".
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLAIM_WINDOW_MS,
  claimOwnership,
  createTabLock,
  disposeTabLock,
  requestTakeover,
  type LockChannel,
  type LockMessage,
} from '../../src/adapters/tab-lock';
import {
  IMPORT_CONFIRM_HEADING,
  ImportConfirmDialog,
  importConfirmBody,
  KEEP_LABEL,
  REPLACE_LABEL,
} from '../../src/ui/components/ImportConfirmDialog';
import { announce, LiveRegion } from '../../src/ui/components/LiveRegion';
import { TopBar } from '../../src/ui/components/TopBar';
import { TAKEOVER_CONFIRMED, useOwnership } from '../../src/ui/use-ownership';

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);

  // The live region is a module-level signal that outlives any render, so a message left
  // by one test is still there for the next one. Without this reset the "stays silent"
  // test below reads the PREVIOUS test's announcement and passes or fails on it — which
  // is exactly how it failed when first written.
  announce('');
});

afterEach(() => {
  render(null, host);
  host.remove();
  disposeTabLock();
});

function buttonLabelled(label: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === label,
  );
}

function fileInput(): HTMLInputElement | null {
  return host.querySelector('input[type="file"]');
}

/** Drive a real `change` on the file input with a file attached. */
function chooseFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

// ---------------------------------------------------------------------------

describe('the top bar file controls', () => {
  const noop = () => undefined;

  function drawTopBar(overrides: Partial<Parameters<typeof TopBar>[0]> = {}): void {
    act(() => {
      render(
        <TopBar
          onDownload={noop}
          onImportFile={noop}
          importError={null}
          onRequestUndo={noop}
          onRequestAbandon={noop}
          {...overrides}
        />,
        host,
      );
    });
  }

  it('offers all three controls, labelled exactly as contracted', () => {
    drawTopBar();

    expect(buttonLabelled('Undo last pick')).toBeDefined();
    expect(buttonLabelled('Download JSON')).toBeDefined();
    expect(buttonLabelled('Import JSON…')).toBeDefined();
  });

  it('uses a real U+2026 ellipsis on the import button, not three periods', () => {
    drawTopBar();

    // The contract calls the ellipsis load-bearing: it is the convention that says
    // "this opens a picker rather than acting immediately". Three periods look identical
    // at a glance and would pass any test written with `toContain('Import JSON')`.
    const label = buttonLabelled('Import JSON…')?.textContent ?? '';
    expect(label.codePointAt(label.length - 1)).toBe(0x2026);
    expect(label).not.toContain('...');
  });

  it('never labels a control OK, Submit, Yes or Cancel', () => {
    drawTopBar({ importError: 'anything' });

    for (const button of Array.from(host.querySelectorAll('button'))) {
      expect(['OK', 'Submit', 'Yes', 'Cancel']).not.toContain(button.textContent);
    }
  });

  it('downloads on click, with no confirmation step', () => {
    const onDownload = vi.fn();
    drawTopBar({ onDownload });

    act(() => {
      buttonLabelled('Download JSON')?.click();
    });

    expect(onDownload).toHaveBeenCalledTimes(1);
    // Non-destructive, so nothing may stand between the click and the file.
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('hides the file input from the tab order but keeps it reachable by the button', () => {
    drawTopBar();
    const input = fileInput();

    expect(input).not.toBeNull();
    // `hidden`, not off-screen: a visually-hidden file input stays tabbable, and a
    // keyboard user would meet an unlabelled duplicate of the button beside it.
    expect(input?.hidden).toBe(true);
    expect(input?.getAttribute('accept')).toBe('application/json,.json');
  });

  it('opens the picker when the import button is clicked', () => {
    drawTopBar();
    const input = fileInput();
    const clicked = vi.fn();
    input?.addEventListener('click', clicked);

    act(() => {
      buttonLabelled('Import JSON…')?.click();
    });

    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('hands the chosen file over and clears the input so the same file can be re-picked', () => {
    const onImportFile = vi.fn();
    drawTopBar({ onImportFile });

    const input = fileInput();
    expect(input).not.toBeNull();
    if (input === null) return;

    chooseFile(input, new File(['{}'], 'draft.json', { type: 'application/json' }));

    expect(onImportFile).toHaveBeenCalledTimes(1);
    expect(onImportFile.mock.calls[0]?.[0]).toBeInstanceOf(File);

    // The reset is the whole point. A file input fires no `change` when the same path is
    // chosen twice running, so a host who corrects a bad file and re-picks it would get
    // silence — which, arriving after an error message, reads as a broken app.
    expect(input.value).toBe('');
  });

  it('renders an import failure politely, and clears it when it is gone', () => {
    const message = 'That file is not a Champions Drafter tournament.';
    drawTopBar({ importError: message });

    const status = host.querySelector('[role="status"]');
    expect(status?.textContent).toBe(message);

    // A refused import destroyed nothing, so the message must not be dressed as danger.
    expect(host.innerHTML).not.toContain('danger');

    drawTopBar({ importError: null });
    expect(host.querySelector('[role="status"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('the replace-draft confirmation', () => {
  function drawDialog(
    pickCount: number,
    handlers: { confirm?: () => void; cancel?: () => void },
    playerCount = 2,
  ) {
    act(() => {
      render(
        <ImportConfirmDialog
          pickCount={pickCount}
          playerCount={playerCount}
          onConfirm={handlers.confirm ?? (() => undefined)}
          onCancel={handlers.cancel ?? (() => undefined)}
        />,
        host,
      );
    });
  }

  it('uses the contracted strings exactly', () => {
    // Pinned as literals rather than compared to the exported constants, which would pass
    // just as happily after a typo.
    expect(IMPORT_CONFIRM_HEADING).toBe('Replace the current draft?');
    expect(REPLACE_LABEL).toBe('Replace draft');
    expect(KEEP_LABEL).toBe('Keep current draft');
  });

  it('names the verb and its object on both buttons', () => {
    drawDialog(4, {});

    expect(buttonLabelled(REPLACE_LABEL)).toBeDefined();
    expect(buttonLabelled(KEEP_LABEL)).toBeDefined();

    for (const button of Array.from(host.querySelectorAll('button'))) {
      expect(['OK', 'Submit', 'Yes', 'Cancel']).not.toContain(button.textContent);
    }
  });

  it('interrupts as an alertdialog and quotes what is about to be lost', () => {
    drawDialog(7, {});

    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(host.textContent).toContain(IMPORT_CONFIRM_HEADING);
    expect(host.textContent).toContain('7 picks');
    // 02-UI-SPEC §11 replaced the Phase 1 sentence. It names the same stakes and points
    // at the same remedy, but it puts the remedy in the imperative: download it first.
    expect(host.textContent).toContain(
      'Download the current tournament JSON first if you want to keep it.',
    );
  });

  it('says "1 pick", not "1 picks"', () => {
    // Reachable: the dialog shows whenever the draft has at least one pick. The UI-SPEC
    // writes the slot as `{n} picks`, and rendering that literally is a visible grammar
    // error in the one dialog that destroys work.
    //
    // THE BODY STRING CHANGED IN 02-06. 02-UI-SPEC §11 gives every confirm's body
    // literally and overrides the Component inventory row that said this one was
    // unchanged; the composer also gained a player count, and both counts pluralise. The
    // contract and its assertion move together, or the next reader trusts the wrong one.
    drawDialog(1, {}, 3);

    expect(host.textContent).toContain('— 1 pick across 3 players.');
    expect(host.textContent).not.toContain('1 picks');
    expect(importConfirmBody(1, 2)).toBe(
      'This replaces the current draft — 1 pick across 2 players. Download the current tournament JSON first if you want to keep it.',
    );
    expect(importConfirmBody(2, 1)).toBe(
      'This replaces the current draft — 2 picks across 1 player. Download the current tournament JSON first if you want to keep it.',
    );
  });

  it('routes each button to its own outcome', () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    drawDialog(3, { confirm, cancel });

    act(() => {
      buttonLabelled(REPLACE_LABEL)?.click();
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();

    act(() => {
      buttonLabelled(KEEP_LABEL)?.click();
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('treats a reflexive Escape as keeping the draft, never as replacing it', () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    drawDialog(5, { confirm, cancel });

    act(() => {
      host
        .querySelector('.dialog-backdrop')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('dresses only the destructive button in the danger colour', () => {
    drawDialog(6, {});

    const replace = buttonLabelled(REPLACE_LABEL);
    const keep = buttonLabelled(KEEP_LABEL);

    // The class moved to `ConfirmDialog` in 02-06, which is now the only component that
    // renders `Dialog` for a confirmation. The rule it names is the same rule.
    expect(replace?.className).toContain('confirm-dialog__confirm--danger');
    expect(keep?.className).not.toContain('confirm-dialog__confirm--danger');
  });
});

// ---------------------------------------------------------------------------
// The carried-forward gap: the takeover announcement
// ---------------------------------------------------------------------------

describe('takeover confirmation', () => {
  interface Port {
    handler: ((message: LockMessage) => void) | null;
    open: boolean;
  }

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

  /** A component that does nothing but subscribe, beside the app's one live region. */
  function Shell() {
    const ownership = useOwnership();
    return (
      <>
        <LiveRegion />
        <span data-testid="status">{ownership.readOnly ? 'read-only' : 'writable'}</span>
      </>
    );
  }

  function liveText(): string {
    return host.querySelector('[role="status"]')?.textContent ?? '';
  }

  it('uses the contracted string', () => {
    expect(TAKEOVER_CONFIRMED).toBe('You are now drafting on this tab.');
  });

  it('announces the takeover that unmounts the banner that would have announced it', () => {
    vi.useFakeTimers();

    try {
      const bus = makeBus();

      const rival = createTabLock({ tabId: 'rival', channel: bus.connect() });
      rival.claim();
      vi.advanceTimersByTime(CLAIM_WINDOW_MS);

      claimOwnership({ channel: bus.connect() });
      vi.advanceTimersByTime(CLAIM_WINDOW_MS);

      act(() => {
        render(<Shell />, host);
      });

      expect(host.querySelector('[data-testid="status"]')?.textContent).toBe('read-only');
      // Nothing said yet — being a secondary is the state the tab booted into, and the
      // banner already says so on screen.
      expect(liveText()).not.toBe(TAKEOVER_CONFIRMED);

      act(() => {
        rival.dispose();
        // The real click path — the same entry point `ReadOnlyBanner`'s button calls.
        // That banner and its button both leave the DOM on this transition, which is
        // exactly why the banner cannot be the thing that speaks.
        requestTakeover();
      });

      expect(host.querySelector('[data-testid="status"]')?.textContent).toBe('writable');
      expect(liveText()).toBe(TAKEOVER_CONFIRMED);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays silent in a tab that was never read-only', () => {
    vi.useFakeTimers();

    try {
      const bus = makeBus();
      claimOwnership({ channel: bus.connect() });
      vi.advanceTimersByTime(CLAIM_WINDOW_MS);

      act(() => {
        render(<Shell />, host);
      });

      // Sole ownership is the ordinary case. Announcing it on every boot would be noise,
      // and noise in the one region that carries undo and copy results is expensive.
      expect(liveText()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});
