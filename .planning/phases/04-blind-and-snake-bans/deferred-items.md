# Deferred Items — Phase 4

Out-of-scope discoveries logged during execution rather than fixed, per the scope boundary
(only issues directly caused by the current task's changes are auto-fixed).

## `tests/build/sw-manifest.test.ts` is flaky under full-suite load

**Found during:** the follow-up fixes for WR-01 and WR-02 (commits `a603e55`, `032e4fa`).

**Symptom:** `excludes sw.js, .nojekyll and sourcemaps` intermittently fails with
`Test timed out in 5000ms`, measured at 5368 ms and 6993 ms on two consecutive full runs, and
passing on three others. It passes every time the file is run on its own.

**Cause:** every case in that file spawns `scripts/build-sw-manifest.mjs` through
`execFileSync`, so each one pays a real Node cold start. Under the full suite's parallel load
on Windows that lands either side of vitest's 5000 ms default. Nothing in either fix touches
the service worker, the manifest script, or anything that file imports.

**Not fixed here** because it is a pre-existing failure in an unrelated file. The precedent for
the fix already exists in this phase's own history — commit `4c2aa39`,
`test(04-08): give the 188-ban gate test an explicit timeout` — so the likely answer is an
explicit `testTimeout` on that file's cases or on the whole describe, sized against a cold
subprocess rather than against a pure-function test.

`npm run verify` exits 0 at `032e4fa`.
