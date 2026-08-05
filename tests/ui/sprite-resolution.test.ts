/**
 * Sprite resolution — the one trap that silently breaks every cell in the pool.
 *
 * `RosterEntry.spriteId` is a derived SLUG (`abomasnow`). The committed sprite files
 * are named by PokeAPI numeric id (`460.png`). Plan 01-04 kept them decoupled on
 * purpose, so an upstream PokeAPI id change cannot rewrite the roster checksum — which
 * means the obvious `sprites/${entry.spriteId}.png` resolves for ZERO of the 235
 * draftable entries, not for "most" of them.
 *
 * A mistake of that shape produces 235 broken images and no error anywhere in the
 * build, so it is pinned here against the real committed data and the real files on
 * disk rather than left to code review.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import committedSnapshot from '../../public/data/roster.mb.json';
import committedSpriteMeta from '../../public/data/sprite-meta.json';
import type { SpriteMeta } from '../../src/adapters/roster-source';
import type { MegaForme, RosterEntry, RosterSnapshot } from '../../src/core/roster/types';
import { resolveSpriteFile } from '../../src/ui/components/MonCard';

const snapshot = committedSnapshot as unknown as RosterSnapshot;
const spriteMeta = committedSpriteMeta as unknown as SpriteMeta;

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const spriteDirectory = join(repositoryRoot, 'public', 'sprites');

const PLACEHOLDER_FILE = '_placeholder.png';

/** `resolveSpriteFile` takes a full entry, so a Mega forme is adapted to that shape. */
function asEntry(mega: MegaForme): RosterEntry {
  return {
    id: mega.id,
    name: mega.name,
    num: 0,
    types: mega.types,
    baseStats: mega.baseStats,
    baseSpeciesId: mega.id,
    forme: mega.forme,
    megaCapable: false,
    megaFormes: [],
    spriteId: mega.spriteId,
    spriteMissing: false,
  };
}

describe('sprite resolution', () => {
  it('resolves every draftable entry to a sprite file that exists on disk', () => {
    const unresolved: string[] = [];

    for (const entry of snapshot.entries) {
      const file = resolveSpriteFile(entry, spriteMeta);
      if (!existsSync(join(spriteDirectory, file))) {
        unresolved.push(`${entry.id} -> ${file}`);
      }
    }

    expect(unresolved).toEqual([]);
    expect(snapshot.entries.length).toBe(snapshot.counts.draftable);
  });

  it('resolves every Mega forme to a sprite file that exists on disk', () => {
    const megaFormes = snapshot.entries.flatMap((entry) => entry.megaFormes);
    const unresolved: string[] = [];

    for (const mega of megaFormes) {
      const file = resolveSpriteFile(asEntry(mega), spriteMeta);
      if (!existsSync(join(spriteDirectory, file))) {
        unresolved.push(`${mega.id} -> ${file}`);
      }
    }

    expect(megaFormes.length).toBe(snapshot.counts.megaFormes);
    expect(unresolved).toEqual([]);
  });

  it('never resolves a real entry to the placeholder while the inventory is complete', () => {
    // Plan 01-04 measured zero gaps across both regulations. If upstream art ever
    // lags a new regulation this will fail, and that failure is the signal to check
    // that the placeholder path is what changed — not to delete the assertion.
    const placeheld = snapshot.entries.filter(
      (entry) => resolveSpriteFile(entry, spriteMeta) === PLACEHOLDER_FILE,
    );

    expect(placeheld).toEqual([]);
    expect(existsSync(join(spriteDirectory, PLACEHOLDER_FILE))).toBe(true);
  });

  it('confirms the slug-as-filename trap really is total, not partial', () => {
    // The whole reason this file exists. If this ever stops being zero, the two id
    // spaces have converged by accident and the comment above is misleading.
    const slugFilesThatExist = snapshot.entries.filter(
      (entry) => entry.spriteId !== null && existsSync(join(spriteDirectory, `${entry.spriteId}.png`)),
    );

    expect(slugFilesThatExist).toEqual([]);
  });

  it('falls back to the placeholder rather than guessing when a row is unmapped', () => {
    const unmapped: RosterEntry = {
      id: 'notarealpokemon',
      name: 'Not A Real Pokemon',
      num: 0,
      types: ['Normal'],
      baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
      baseSpeciesId: 'notarealpokemon',
      forme: null,
      megaCapable: false,
      megaFormes: [],
      spriteId: 'notarealpokemon',
      spriteMissing: false,
    };

    expect(resolveSpriteFile(unmapped, spriteMeta)).toBe(PLACEHOLDER_FILE);
  });

  it('honours the build-time spriteMissing flag without consulting the map', () => {
    const known = snapshot.entries[0];
    expect(known).toBeDefined();
    if (known === undefined) return;

    // Same row, flag flipped: the runtime must not fire a request the build already
    // knows would 404 (D-05), even though the map does have an answer for it.
    expect(resolveSpriteFile(known, spriteMeta)).not.toBe(PLACEHOLDER_FILE);
    expect(resolveSpriteFile({ ...known, spriteMissing: true }, spriteMeta)).toBe(
      PLACEHOLDER_FILE,
    );
  });

  it('maps the species that break naive sprite code', () => {
    // Meowstic-F: PokeAPI spells the suffix out where Showdown abbreviates it.
    // Meganium-Mega: one of the Megas Champions added, so it is only in the
    // extended PokeAPI id range and cannot be derived from a National Dex number.
    const expected: Record<string, string> = {
      meowsticf: '10025.png',
      meganium: '154.png',
      meganiummega: '10282.png',
      rotomwash: '10009.png',
      taurospaldeacombat: '10250.png',
    };

    for (const [id, file] of Object.entries(expected)) {
      expect(spriteMeta.byRosterId[id]?.file, `byRosterId[${id}]`).toBe(file);
    }
  });

  it('renders at the measured native size, with no outlier to special-case', () => {
    expect(spriteMeta.nativeWidth).toBe(96);
    expect(spriteMeta.nativeHeight).toBe(96);
  });
});
