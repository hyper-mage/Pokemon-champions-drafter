/**
 * View preferences — the failure modes, which are the whole of this module.
 *
 * The happy path is four lines of `JSON.stringify` and needs no defending. What needs
 * defending is that NOTHING here can throw, because every one of these calls sits on a
 * render path: a `loadViewPrefs` that throws in private mode is a blank draft screen,
 * and a `saveViewPrefs` that throws on a full quota is a density control that kills the
 * pool when you click it.
 *
 * Mocks, like `tests/adapters/persistence.test.ts` and for the same reason: a working
 * localStorage is the case that needs no test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { savingBlocked } from '../../src/adapters/persistence';
import { loadViewPrefs, saveViewPrefs, type ViewPrefs } from '../../src/adapters/view-prefs';

const VIEW_KEY = 'champions-drafter:view';

const DEFAULTS: ViewPrefs = { density: 'standard', pane: 'split' };

interface StorageStub extends Storage {
  readonly backing: Map<string, string>;
}

function makeStorage(overrides: Partial<Storage> = {}): StorageStub {
  const backing = new Map<string, string>();

  return {
    backing,
    get length() {
      return backing.size;
    },
    clear: () => backing.clear(),
    getItem: (key: string) => backing.get(key) ?? null,
    key: (index: number) => [...backing.keys()][index] ?? null,
    removeItem: (key: string) => {
      backing.delete(key);
    },
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    ...overrides,
  } as StorageStub;
}

function install(storage: Storage): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
}

let storage: StorageStub;

beforeEach(() => {
  storage = makeStorage();
  install(storage);
});

describe('saveViewPrefs / loadViewPrefs', () => {
  it('round trips every combination through one key', () => {
    const prefs: ViewPrefs = { density: 'full', pane: 'board' };

    saveViewPrefs(prefs);

    expect(storage.backing.has(VIEW_KEY)).toBe(true);
    expect(loadViewPrefs()).toEqual(prefs);
  });

  it('writes JSON that names the two fields, so a hand edit is possible', () => {
    saveViewPrefs({ density: 'minimal', pane: 'pool' });

    expect(JSON.parse(storage.backing.get(VIEW_KEY) ?? '')).toEqual({
      density: 'minimal',
      pane: 'pool',
    });
  });

  it('returns a fresh object each call, so a caller cannot poison the defaults', () => {
    const first = loadViewPrefs();
    first.density = 'full';

    expect(loadViewPrefs()).toEqual(DEFAULTS);
  });
});

describe('loadViewPrefs falls back to the defaults', () => {
  it('when the key is absent', () => {
    expect(loadViewPrefs()).toEqual(DEFAULTS);
  });

  it('when reading storage throws', () => {
    install(
      makeStorage({
        getItem: () => {
          throw new Error('SecurityError');
        },
      }),
    );

    expect(() => loadViewPrefs()).not.toThrow();
    expect(loadViewPrefs()).toEqual(DEFAULTS);
  });

  it('when the value is not JSON', () => {
    storage.backing.set(VIEW_KEY, '{');

    expect(loadViewPrefs()).toEqual(DEFAULTS);
  });

  it('when the value is JSON but not an object', () => {
    for (const value of ['"standard"', '42', 'null', 'true', '["full","split"]']) {
      storage.backing.set(VIEW_KEY, value);
      expect(loadViewPrefs(), value).toEqual(DEFAULTS);
    }
  });

  it('when both fields carry a value outside the declared unions', () => {
    // T-02-11. `enormous` must never reach a data-density attribute.
    storage.backing.set(VIEW_KEY, '{"density":"enormous","pane":"sideways"}');

    expect(loadViewPrefs()).toEqual({ density: 'standard', pane: 'split' });
  });

  it('when only one field is unrecognised, discarding the good one with it', () => {
    storage.backing.set(VIEW_KEY, '{"density":"full","pane":"sideways"}');
    expect(loadViewPrefs()).toEqual(DEFAULTS);

    storage.backing.set(VIEW_KEY, '{"density":"enormous","pane":"board"}');
    expect(loadViewPrefs()).toEqual(DEFAULTS);
  });

  it('when a field is missing entirely', () => {
    storage.backing.set(VIEW_KEY, '{"density":"full"}');

    expect(loadViewPrefs()).toEqual(DEFAULTS);
  });

  it('when a field is the right value at the wrong type', () => {
    storage.backing.set(VIEW_KEY, '{"density":["full"],"pane":"split"}');

    expect(loadViewPrefs()).toEqual(DEFAULTS);
  });

  it('and never carries an unexpected key through', () => {
    storage.backing.set(
      VIEW_KEY,
      '{"density":"full","pane":"board","adminMode":true}',
    );

    expect(loadViewPrefs()).toEqual({ density: 'full', pane: 'board' });
    expect(Object.keys(loadViewPrefs()).sort()).toEqual(['density', 'pane']);
  });
});

describe('saveViewPrefs never escalates a failed write', () => {
  it('swallows a throwing setItem', () => {
    install(
      makeStorage({
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      }),
    );

    expect(() => saveViewPrefs({ density: 'full', pane: 'split' })).not.toThrow();
  });

  it('does not raise the persistence warning signal', () => {
    // T-02-12. The saving-blocked banner means "this browser will not save your draft".
    // A failed write of a sprite size is not that, and borrowing the banner would train
    // a host to dismiss the one warning that matters.
    expect(savingBlocked.value).toBe(false);

    install(
      makeStorage({
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      }),
    );

    saveViewPrefs({ density: 'minimal', pane: 'pool' });

    expect(savingBlocked.value).toBe(false);
  });

  it('swallows a value that cannot be serialized', () => {
    const circular = { density: 'full', pane: 'split' } as unknown as ViewPrefs;
    (circular as unknown as Record<string, unknown>)['self'] = circular;

    expect(() => saveViewPrefs(circular)).not.toThrow();
  });

  it('does not write through a storage that reports success and discards', () => {
    // Not a failure this module tries to detect — recorded so the next reader knows the
    // omission is deliberate. persistence.ts probes for it because losing a draft is
    // unrecoverable; losing a density costs one click.
    const discarding = makeStorage({ setItem: vi.fn() });
    install(discarding);

    saveViewPrefs({ density: 'full', pane: 'board' });

    expect(loadViewPrefs()).toEqual(DEFAULTS);
  });
});
