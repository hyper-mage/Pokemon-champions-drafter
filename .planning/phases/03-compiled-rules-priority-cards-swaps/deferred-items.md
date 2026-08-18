# Phase 03 — Deferred Items

Out-of-scope discoveries logged during execution. Nothing here was fixed; each entry
records what was found, who owns it, and the evidence that it is not this phase's doing.

---

## 1. `tests/ui/ban-list.test.tsx` times out under full-suite parallel load

**Found during:** 03-01 Task 1 verification
**Owner:** unassigned — a Phase 2 test, not a Phase 3 surface
**Severity:** flaky gate, not a product defect

`bans reaching the feasibility gate > survives 187 bans at eight players and Exact, and dies
on the 188th` exceeds vitest's default 5000 ms `testTimeout` when `npm run verify` runs the
whole suite in parallel. The test performs 188 sequential ban clicks, each one a full
re-render of the 235-cell ban grid plus a feasibility recomputation; it takes ~4.2 s in
isolation on this machine, so it sits just under the limit with no headroom.

**Proof it predates this phase.** `src/` was checked out at `e663518` (the last commit before
03-01 began) with the current `tests/` in place, and the full suite was run. The same test
failed with the same `Test timed out in 5000ms`. It also passes when
`tests/ui/ban-list.test.tsx` is run alone, at every commit tried. Nothing in 03-01 touches
the ban path: the ConfigScreen change is four fields inside `handleStart`, a `useCallback`
body this test never invokes, and `copyConfig`'s two new `.map()` calls run only on `fold`,
which this test never reaches.

**What it is not.** Not a regression, not a correctness bug, and not something a Phase 3 plan
should paper over by widening a Phase 2 assertion.

**Suggested fix when someone owns it:** give this one test an explicit timeout argument, or
set `testTimeout` in `vite.config.ts`'s `test` block. Do not reduce the ban count — 187/188 is
the measured worst-case boundary from `02-RESEARCH §Worst-case ban starvation` and is the
whole point of the test.
