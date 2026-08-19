# Deferred Items — Phase 03

Discoveries logged out of scope of the plan that found them, per the executor's scope
boundary rule. Nothing here was fixed.

## Two tests time out at vitest's default 5000ms under parallel load (found during 03-08)

**Files:** `tests/ui/ban-list.test.tsx` ("survives 187 bans at eight players and Exact, and
dies on the 188th"), `tests/build/sw-manifest.test.ts` (two cases).

**Symptom:** `Error: Test timed out in 5000ms`. Never an assertion failure.

**Evidence it is time and not correctness:**

- Both files pass in isolation (`npx vitest run tests/ui/ban-list.test.tsx` → 17 passed).
- The whole suite passes at `--testTimeout=30000`: 50 files, 1324 tests, 0 failures.
- The ban-list case was measured at 8362ms in one full run — it drives 187 real bans
  through a real DOM, and `sw-manifest` shells out to `scripts/build-sw-manifest.mjs`
  per case.
- Neither file touches anything 03-08 changed. `ConfigScreen` renders no `TurnBanner`,
  no `SplitPanes` and no card surface, and nothing calls `selectPhase` on that path.

**Why it was not fixed here:** the fix is either a per-test timeout or a global
`testTimeout` in `vitest.config.ts`, and both change shared test configuration for a
pre-existing environmental sensitivity rather than for anything this plan introduced.
That is a decision about the project's test settings, not a bug in the phase.

**Suggested resolution:** raise `testTimeout` in `vitest.config.ts` to 15000, or mark the
two known-slow cases with an explicit per-test timeout so a genuine hang elsewhere is
still caught quickly.
