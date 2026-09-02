# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Full Draft and Tournament

**Shipped:** 2026-09-02
**Phases:** 5 | **Plans:** 62 | **Tasks:** 118 | **Commits:** 584 | **Span:** 30 days

### What Was Built

- A static, offline-capable GitHub Pages site that runs an entire Pokémon Champions draft
  tournament: host config → one of three ban rituals → a compiled round schedule with priority
  cards and swaps → seeded bracket → recorded results → per-team export.
- A pure core (`src/core/`) over an append-only action log and a single serializable document,
  with undo, autosave, JSON import/export, a v1→v5 migration chain, and a two-tab write lock.
- A build-time roster pipeline pinned to `pokemon-showdown@0.11.11` plus its sha512, shipping two
  regulations (M-A 213 entries, M-B 235) with drift tripwires and a hostile-species fixture.
- 81 test files / 2759 tests, `tests/core/**` with zero mocks, plus three CI gates
  (`check:pure`, `check:pure:selftest`, `check:nohtml`) that fail the build on an architecture
  violation rather than leaving it to review.

### What Worked

- **Betting the architecture early and enforcing it mechanically.** The append-only log, the pure
  core, and typed round slots were all decided before Phase 1 shipped and none was retreated from
  across 62 plans. `check:pure` plus its self-test meant the boundary was a build failure, not a
  review comment — and `check:pure:selftest` in particular earned its keep by proving the checker
  still detects a violation rather than silently passing everything.
- **Compiling rules instead of validating picks.** The single highest-leverage decision. It let
  the runtime validator be *deleted*, made invalid teams unrepresentable, and turned swaps from a
  correctness problem into a filter over an existing predicate.
- **Vertical phase slices.** Every phase ended with something a group could actually do, so the
  success criterion was approached rather than deferred. Phase 2 already delivered a usable draft
  night; Phases 3–5 improved a working tool rather than assembling a non-working one.
- **Spiking the one untested assumption in Phase 1.** pokebase.app's handling of `@ Stone` was
  inference until the spike; it turned out to *interpret* the line, which validated a
  one-adapter-serves-both-targets design that the whole export path rests on.
- **Ordering constraints derived in research, then obeyed.** Compiler-before-swaps in particular:
  had swaps been built first they would have silently violated composition rules with the runtime
  checker already removed.

### What Was Inefficient

- **Documentation churn outweighed feature work.** 240 `docs` commits against 142 `feat`. Some is
  intrinsic to the method, but the v1.0 close alone had to reconcile four separate bookkeeping
  drifts (REQUIREMENTS.md checkboxes reading 73 against its own table's 92, STATE.md stuck at 4
  phases / 80%, and two tooling mismatches). Bookkeeping that is only checked at close will be
  wrong at close.
- **The SUMMARY frontmatter shape changed three times across phases** (`requirements-completed:`,
  then `requirements:`, then a `provides:`/`affects:` dependency graph with no requirement key at
  all). 22 of 62 summaries carry no requirement IDs, so `summary-extract` returns empty for them
  by construction. Nothing was lost — VERIFICATION.md files carry the authoritative mapping — but
  every requirement-coverage question had to be answered from the slower source.
- **Human verification was repeatedly deferred rather than scheduled.** Phase 3's UAT items sat
  open through Phases 4 and 5; Phase 4's blocking physical check was only cleared by batching it
  into Phase 5's gate. Batching was the right call once the debt existed, but the debt was
  avoidable.
- **Two tests are flaky under full-suite parallel load** (`sw-manifest`, `ban-list`) and were
  carried across three phases without being fixed, on the reasoning that neither fails the gate.
  That reasoning is only true until it is not.

### Patterns Established

- **Externally derived results are materialized into the log, never re-derived.** `pool/built`
  carries actual ids plus `rosterVersion` and `checksum`; the compiled schedule is stored because
  it may carry a host reorder `compile()` cannot reproduce. A document recording only *instructions*
  would reopen next regulation as a different tournament.
- **Origination is guarded by `canApply`; replay deliberately is not.** This is what lets a
  reordered schedule survive export and re-import.
- **`id` for every comparison, `name` for rendering only.** `Tauros-Paldea-Aqua`, `Mr. Rime`, and
  `Meowstic-M-Mega` (whose `battleOnly` target drops the `-M`) each punish string surgery.
- **Inert-with-a-reason instead of omitted.** A control that means nothing in the current state
  renders disabled with one precedence-ordered sentence, rather than disappearing and leaving the
  user to infer why.
- **Exhaustiveness as a compile error.** `const exhaustive: never` defaults mean a new action kind
  that forgets an undo announcement fails typecheck rather than shipping silent.
- **A shortfall in evidence is recorded as `status: partial`, not dropped.** Applied to BAN-07,
  EXPO-04, and the descoped screen-reader pass — all three are legible in the archive as decisions
  with reasons rather than as gaps someone forgot.

### Key Lessons

1. **Enforce architecture with a gate that has its own test.** `check:pure` was worth more than
   any review checklist, and `check:pure:selftest` is why it can be trusted — a silently broken
   checker passes everything.
2. **Reconcile bookkeeping at phase transitions, not at milestone close.** Every drift found at
   close was individually cheap and collectively a day's work. A `/gsd-audit-milestone` run this
   thorough should not be discovering that STATE.md is a phase behind.
3. **Freeze artifact frontmatter shape before the first phase ships.** Template drift across
   phases cost more than the richer format gained, because it silently broke the tooling that
   reads it.
4. **Schedule human verification into the phase that needs it, or accept it will slip to the end.**
   Three separate deferrals converged on Phase 5's gate. That worked, but only because someone
   noticed they could be batched.
5. **Spike the assumption the design rests on, in the first phase.** One spike on the pokebase
   `@ item` line de-risked every export decision that followed.
6. **A requirement can be defective rather than unmet.** EXPO-04 is unsatisfiable as written by
   *any* correct implementation. Recognising that and recording the achievable discriminating
   signal beat either building toward it or quietly marking it done.

### Cost Observations

- Model mix: not tracked this milestone — no per-session model accounting was captured.
- Sessions: not tracked. Plan and task counts (62 plans, 118 tasks) are the reliable volume measure.
- Execution timing: only 2 of 62 plans were timed (Phase 3 P01/P02, 70 min combined), so velocity
  figures in `STATE.md` are not meaningful. **Instrument this next milestone** — without it,
  "what was inefficient" stays qualitative.
- Parallelism: ~103 commits reference waves or worktrees. Wave-based parallel execution was used
  throughout; four of six Phase 3 worktrees forked from a pre-phase commit, which cost rework.
  Assert the base SHA when dispatching a worktree.
- Artifact volume: 62 plans + 62 summaries + 5 verifications + 6 reviews + 4 research documents +
  5 UI specs + 5 contexts + 4 UAT documents.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Commits | Key Change |
|-----------|--------|-------|---------|------------|
| v1.0 | 5 | 62 | 584 | Baseline. Wave-based parallel execution with worktrees; CI-enforced architecture gates from Phase 1. |

### Cumulative Quality

| Milestone | Test files | Tests | Failures | Runtime deps |
|-----------|-----------|-------|----------|--------------|
| v1.0 | 81 | 2759 | 0 | 2 (unchanged from Phase 1) |

### Top Lessons (Verified Across Milestones)

*Needs a second milestone before any lesson here is cross-validated. The v1.0 candidates most
likely to hold:*

1. A mechanically enforced boundary outperforms a reviewed one — and the enforcer needs its own
   test.
2. Bookkeeping checked only at close is wrong at close.
