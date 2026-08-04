#!/usr/bin/env node
/**
 * check-pure-core-selftest.mjs
 *
 * Proves the purity gate rather than trusting it. Runs check-pure-core.mjs against two
 * fixture directories and asserts the exit codes and the reported tokens:
 *
 *   scripts/__fixtures__/pure    → exit 0  (comments, strings, templates, and regex
 *                                           literals mentioning forbidden tokens are
 *                                           stripped before matching)
 *   scripts/__fixtures__/impure  → exit 1  (real Date.now and localStorage accesses)
 *   src/core                     → exit 0  (the real core stays clean)
 *
 * Kept as a standalone Node script, not a shell one-liner, because asserting a non-zero
 * exit code portably (`! node ...`) does not work under the cmd.exe shell npm uses on
 * Windows. CI can run this without vitest installed.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptsDirectory, '..');
const checker = join(scriptsDirectory, 'check-pure-core.mjs');

function runChecker(target) {
  const result = spawnSync(process.execPath, [checker, target], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

const failures = [];

const pure = runChecker('scripts/__fixtures__/pure');
if (pure.status !== 0) {
  failures.push(
    `pure fixture: expected exit 0, got ${pure.status}. Comment/string stripping is broken.\n${pure.output}`,
  );
}

const impure = runChecker('scripts/__fixtures__/impure');
if (impure.status !== 1) {
  failures.push(
    `impure fixture: expected exit 1, got ${impure.status}. The gate no longer catches real violations.\n${impure.output}`,
  );
}
if (!impure.output.includes('Date.now')) {
  failures.push('impure fixture: output did not report Date.now');
}
if (!impure.output.includes('localStorage')) {
  failures.push('impure fixture: output did not report localStorage');
}

const core = runChecker('src/core');
if (core.status !== 0) {
  failures.push(`src/core: expected exit 0, got ${core.status}\n${core.output}`);
}

if (failures.length > 0) {
  console.error('check:pure:selftest FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  'check:pure:selftest passed — the gate catches a real violation and does not false-positive on comments, strings, templates, or regex literals',
);
