#!/usr/bin/env node
/**
 * check-pure-core-selftest.mjs
 *
 * Proves the purity gate rather than trusting it. Runs check-pure-core.mjs against two
 * fixture directories and asserts the exit codes and the reported tokens.
 *
 * Core mode (SHEL-04):
 *
 *   scripts/__fixtures__/pure    → exit 0  (comments, strings, templates, and regex
 *                                           literals mentioning forbidden tokens are
 *                                           stripped before matching)
 *   scripts/__fixtures__/impure  → exit 1  (real Date.now and localStorage accesses)
 *   src/core                     → exit 0  (the real core stays clean)
 *
 * Markup mode (T-01-04, --nohtml). Widening a gate's scope without widening its
 * self-test is how a gate becomes decorative, so the second mode is proved the same
 * way as the first:
 *
 *   --nohtml scripts/__fixtures__/pure    → exit 0  (the pure fixture NAMES innerHTML
 *                                                    in a block comment; a grep would
 *                                                    flag it and this must not)
 *   --nohtml scripts/__fixtures__/impure  → exit 1  (real innerHTML and outerHTML
 *                                                    assignments)
 *   --nohtml src                          → exit 0  (the real app renders text)
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

function runChecker(...checkerArguments) {
  const result = spawnSync(process.execPath, [checker, ...checkerArguments], {
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

// --- Markup mode (T-01-04) ---------------------------------------------------------

const markupPure = runChecker('--nohtml', 'scripts/__fixtures__/pure');
if (markupPure.status !== 0) {
  failures.push(
    `--nohtml pure fixture: expected exit 0, got ${markupPure.status}. The fixture names innerHTML in a comment; stripping is broken.\n${markupPure.output}`,
  );
}

const markupImpure = runChecker('--nohtml', 'scripts/__fixtures__/impure');
if (markupImpure.status !== 1) {
  failures.push(
    `--nohtml impure fixture: expected exit 1, got ${markupImpure.status}. The markup gate no longer catches a real raw-HTML sink.\n${markupImpure.output}`,
  );
}
if (!markupImpure.output.includes('innerHTML')) {
  failures.push('--nohtml impure fixture: output did not report innerHTML');
}
if (!markupImpure.output.includes('outerHTML')) {
  failures.push('--nohtml impure fixture: output did not report outerHTML');
}
// Markup mode must not drag the ambient-state list along with it, or every adapter
// and component in src/ would be a violation and the gate would have to be deleted.
if (markupImpure.output.includes('Date.now')) {
  failures.push('--nohtml impure fixture: reported Date.now; markup mode is checking the wrong list');
}

const markupSource = runChecker('--nohtml', 'src');
if (markupSource.status !== 0) {
  failures.push(`--nohtml src: expected exit 0, got ${markupSource.status}\n${markupSource.output}`);
}

// A typo'd flag must be fatal, not a silent fall back to core mode.
const unknownFlag = runChecker('--nohtlm', 'src');
if (unknownFlag.status !== 1) {
  failures.push(
    `unknown flag: expected exit 1, got ${unknownFlag.status}. A mistyped flag would silently run the wrong mode.`,
  );
}

if (failures.length > 0) {
  console.error('check:pure:selftest FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  'check:pure:selftest passed — both gates catch a real violation, neither false-positives on comments, strings, templates, or regex literals, and a mistyped flag is fatal',
);
