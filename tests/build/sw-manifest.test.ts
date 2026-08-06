/**
 * SHEL-03 — `scripts/build-sw-manifest.mjs` against real directories on disk.
 *
 * The script is run as a subprocess with its cwd pointed at a synthetic `dist/`,
 * so what is tested is the thing the build actually invokes rather than an
 * imported copy of its internals.
 *
 * The load-bearing case is `version tracks content`. Vite content-hashes the
 * filenames it emits, but every file under `public/` — both roster snapshots and
 * all 312 sprites — keeps its name forever. If the cache version were derived
 * from the URL list alone, regenerating the roster would leave the version
 * unchanged, the cache name unchanged, and returning visitors pinned to the old
 * data with no recovery path. That is the failure this file exists to prevent.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve('scripts/build-sw-manifest.mjs');
const SW_SOURCE = resolve('public/sw.js');
const BASE = '/Pokemon-champions-drafter/';

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    rmSync(created.pop() as string, { recursive: true, force: true });
  }
});

interface DistOptions {
  sprites?: number;
  spriteBody?: string;
  indexHtml?: string;
  extra?: Record<string, string>;
  swBody?: string;
}

function makeDist(options: DistOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'sw-manifest-'));
  created.push(root);

  const dist = join(root, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  mkdirSync(join(dist, 'data'), { recursive: true });
  mkdirSync(join(dist, 'sprites'), { recursive: true });

  writeFileSync(join(dist, 'sw.js'), options.swBody ?? readFileSync(SW_SOURCE, 'utf8'));
  writeFileSync(
    join(dist, 'index.html'),
    options.indexHtml ?? `<script type="module" src="${BASE}assets/index-abc123.js"></script>`,
  );
  writeFileSync(join(dist, '.nojekyll'), '');
  writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(join(dist, 'assets', 'index-abc123.js.map'), '{"version":3}');
  writeFileSync(join(dist, 'data', 'roster.mb.json'), '{"entries":[]}');

  const spriteBody = options.spriteBody ?? 'png';
  const spriteCount = options.sprites ?? 320;
  for (let i = 0; i < spriteCount; i += 1) {
    writeFileSync(join(dist, 'sprites', `${i}.png`), `${spriteBody}${i}`);
  }

  for (const [rel, body] of Object.entries(options.extra ?? {})) {
    writeFileSync(join(dist, rel), body);
  }

  return root;
}

function run(cwd: string): { status: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stderr?: string; stdout?: string };
    return { status: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

function readManifest(root: string): { version: string; urls: string[] } {
  const injected = readFileSync(join(root, 'dist', 'sw.js'), 'utf8');
  const version = /champions-drafter-|CACHE_PREFIX \+ VERSION/.test(injected)
    ? (/const VERSION = '([^']+)'/.exec(injected)?.[1] ?? '')
    : '';
  const urls = JSON.parse(/const PRECACHE = (\[.*?\]);/s.exec(injected)?.[1] ?? '[]') as string[];
  return { version, urls };
}

describe('manifest contents', () => {
  it('injects both tokens and covers every runtime asset', () => {
    const root = makeDist();
    const result = run(root);
    expect(result.status).toBe(0);

    const injected = readFileSync(join(root, 'dist', 'sw.js'), 'utf8');
    expect(injected).not.toContain('__SW_VERSION__');
    expect(injected).not.toContain('__PRECACHE_MANIFEST__');

    const { urls, version } = readManifest(root);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(urls).toContain(`${BASE}index.html`);
    expect(urls).toContain(`${BASE}assets/index-abc123.js`);
    expect(urls).toContain(`${BASE}data/roster.mb.json`);
    expect(urls).toContain(`${BASE}sprites/0.png`);
    expect(urls.filter((u) => u.includes('/sprites/'))).toHaveLength(320);
  });

  it('includes the bare directory URL as its own cache key', () => {
    // A visitor types the directory URL; the browser requests it verbatim, and
    // it is a different cache key from index.html despite the identical bytes.
    const root = makeDist();
    run(root);
    expect(readManifest(root).urls).toContain(BASE);
  });

  it('excludes sw.js, .nojekyll and sourcemaps', () => {
    const root = makeDist();
    run(root);
    const { urls } = readManifest(root);

    // Caching the worker itself is the one way to make a stale worker permanent.
    expect(urls.some((u) => u.endsWith('/sw.js'))).toBe(false);
    expect(urls.some((u) => u.includes('nojekyll'))).toBe(false);
    expect(urls.some((u) => u.endsWith('.map'))).toBe(false);
  });

  it('sorts the manifest so the output is reproducible', () => {
    const root = makeDist();
    run(root);
    const { urls } = readManifest(root);
    expect(urls).toEqual([...urls].sort());
  });
});

describe('cache version', () => {
  it('is unchanged when the build is unchanged', () => {
    const first = makeDist();
    run(first);
    const second = makeDist();
    run(second);

    expect(readManifest(first).version).toBe(readManifest(second).version);
  });

  it('changes when a stable-named public asset changes content', () => {
    // The whole point. `sprites/0.png` has the same name in both builds, so a
    // URL-list hash would call these two builds identical and strand every
    // returning visitor on the old sprites.
    const before = makeDist({ spriteBody: 'png' });
    run(before);
    const after = makeDist({ spriteBody: 'redrawn' });
    run(after);

    expect(readManifest(before).urls).toEqual(readManifest(after).urls);
    expect(readManifest(before).version).not.toBe(readManifest(after).version);
  });

  it('changes when a hashed asset filename changes', () => {
    const before = makeDist();
    run(before);
    const after = makeDist({
      indexHtml: `<script type="module" src="${BASE}assets/index-zzz999.js"></script>`,
      extra: { 'assets/index-zzz999.js': 'console.log(1)' },
    });
    run(after);

    expect(readManifest(before).version).not.toBe(readManifest(after).version);
  });
});

describe('tripwires', () => {
  it('exits non-zero when the manifest is smaller than 300 entries', () => {
    // Stands in for `public/sprites/` not reaching `dist/`, which would ship a
    // worker reporting offline-ready while the pool renders broken images.
    const root = makeDist({ sprites: 10 });
    const result = run(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/expected at least 300/);
  });

  it('exits non-zero when the Vite base path no longer matches', () => {
    const root = makeDist({ indexHtml: '<script type="module" src="/assets/index.js"></script>' });
    const result = run(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/base path/i);
  });

  it('exits non-zero when the tokens were already substituted', () => {
    // Guards a double-run, and a public/sw.js that lost its tokens in an edit.
    const root = makeDist({ swBody: 'const PRECACHE = ["already done"];' });
    const result = run(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/__SW_VERSION__/);
  });

  it('exits non-zero rather than guessing at a path needing encoding', () => {
    const root = makeDist({ extra: { 'sprites/needs encoding.png': 'x' } });
    const result = run(root);

    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/percent-encoding/);
  });
});
