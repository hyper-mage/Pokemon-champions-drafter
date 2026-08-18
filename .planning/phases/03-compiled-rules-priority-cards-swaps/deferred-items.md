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

---

## 2. `Dual-Mega species` is still a `--text-label` `<p>`, not a `--text-heading` sub-section

**Found during:** 03-03 Task 2
**Owner:** **03-04** — the plan that adds the third sub-section (`Mega-forme bans`) to the
same group and therefore has to answer the same question
**Severity:** visual inconsistency inside one group, not a defect

03-UI-SPEC §1 says sub-sections inside `Mega rules` are `--text-heading` headings separated
by `--space-5`, and its table lists four of them: `Megas required per team`, `Round
schedule`, the dual-Mega rows, and `Mega-forme bans`. 03-03 built `Round schedule` to that
contract (`.config-screen__section` + `.config-screen__section-heading`). `Dual-Mega species`
predates the contract and is still `.config-screen__subheading` — a `<p>` at `--text-label`,
with a doc comment arguing that a heading "would be claiming a level the form does not
have". That argument is superseded by 03-UI-SPEC, but rewriting it is not 03-03's change to
make: the group gains its fourth sub-section in 03-04, which is the change that decides what
the group's internal type hierarchy is.

**What it is not.** Not a regression — the dual-Mega rows render exactly as they did before
03-03, and nothing about them changed. The inconsistency is that the group now shows two
sub-heading treatments.

**Suggested fix when 03-04 lands it:** move `Dual-Mega species` onto
`.config-screen__section` / `.config-screen__section-heading` in the same change that adds
`Mega-forme bans`, and rewrite `.config-screen__subheading`'s comment (or delete the rule) in
that change rather than leaving a stylesheet comment that states a superseded rule.
