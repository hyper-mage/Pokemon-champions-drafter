# 03-12 — Physical and human acceptance

**Plan:** `03-12-PLAN.md`
**Requirements:** CARD-02, CARD-07
**Tasks:** 3 checkpoints — 1 passed, 1 not run, 1 deferred by host decision
**Files changed:** none. This plan writes no source, by design.

## What this plan was for

`03-UI-SPEC` §DRFT-14 states its arc-minute arithmetic as **a prediction, not a result**, and
names the pass that would falsify it. happy-dom performs no layout and computes no font metrics,
so the automated suite structurally cannot answer the question. This plan is where the physical
answer is recorded.

## Task 1 — the three-metre pass: PASSED

**Screen tested: ~24" monitor at 1080p.** Host verified at three metres on 2026-08-19 and
reported a pass. Recorded as an overall pass rather than itemised per surface, which is how it
was reported — the five surfaces the plan names are the card digit, the played-row name, the hand
pip, the Mega marker, and the 8-player board height with no internal vertical scrollbar.

**This is the pessimistic case in the spec's own table.** At ~92ppi the arithmetic predicted:

| Surface | Size | Predicted at 3m on this screen |
|---------|------|-------------------------------|
| Card digit | 36px | ≈10mm → ~11 arcmin |
| Hand pip | 24px | ≈6.6mm → ~7.6 arcmin |
| Mega marker | 18px | ≈5mm → ~5.7 arcmin |

Comfortable reading wants roughly 16–20 arcmin; the acuity limit is about 5. The spec predicted
that on a 24" monitor **only the card digit would be comfortable, with the pips and marker
marginal** — readable, but not comfortably so.

A pass is therefore **consistent with the prediction rather than falsifying it**. What it
establishes is that all surfaces clear the readability bar on the harder of the two screens the
spec models. On a TV-sized shared screen (~51ppi: card digit ~20 arcmin, pips ~14, marker ~10)
they have substantially more headroom. No finding against `--text-heading` or `--text-body`, and
no font-size change is warranted.

**Not separately confirmed:** the fifth check is structural rather than legibility — whether the
8-player board shows all eight rows with no internal vertical scrollbar. It was not called out
separately in the host's report. Worth a glance on the next 8-player draft; it is cheap to
re-check and no evidence suggests a problem.

## Task 2 — the screen-reader pass: NOT RUN

**Not passed. Not attempted.** The host reports no screen reader configured and judged the check
unimportant at this stage. Recorded here as an open gap rather than a result, because an
unverified accessibility claim is worse than an absent one.

**What remains unsettled.** `src/ui/components/SplitPanes.tsx:146-167` carries an open question
from Phase 2: whether a polite announcement queued alongside a focus move is routinely preempted
by the newly focused control's own name. Four transitions would have answered it — the two
pane-expand transitions carried over from Phase 2, the schedule reorder (03-03), and the card
resolution that unmounts the card panel and hands focus to the pool grid (03-08).

**Why this is a documentation gap and not a functional risk.** The design deliberately does not
depend on the answer: every fact an announcement carries is also carried either by a focused
control's own name or by persistent on-screen text. `03-UI-SPEC` says as much, and states that a
preempted announcement is *a finding to record, not a blocker*.

**What is consequently NOT done.** `03-UI-SPEC` §Interaction & Accessibility requires the outcome
live in the `SchedulePreview`, `CardPanel` and `SplitPanes` doc blocks. Those doc blocks were
deliberately left untouched — writing an outcome there without having observed one would put a
fabricated result next to the code that depends on it, which is the exact failure mode the rule
exists to prevent.

**If picked up later:** Windows Narrator requires no install — `Ctrl` + `Win` + `Enter`.

## Task 3 — the playtest: DEFERRED TO BETA

Host's decision on 2026-08-19: run the playtest as part of a beta once the whole tool is
complete, rather than at the end of Phase 3.

The four questions remain open — whether playing last feels like an advantage (D-18), whether
players expect **high** to pick first rather than low (D-23), whether the struck-through
unplayable card is understood without explanation, and whether the resolved pick order stays
findable during picking.

**Deferring is cheap, and that is why it is reasonable.** Both mechanics most likely to change on
contact are one-line changes: the rotation lives in `selectCardPlayOrder`, and low-plays-first in
`resolvePickOrder`. Nothing in the contract hardcodes either, and the phase line reads its
sentence from the same place the resolver does. A change after the beta is a deliberate decision,
not a rewrite.

## Verification

`npm run verify` exits 0 — `check:pure` 0 violations across 18 core files, `check:nohtml` 0
across 67, typecheck clean, 1525 tests across 53 files, production build 123.40 kB (40.25 kB
gzipped), service-worker manifest 322 URLs. Nothing functional changed in this plan; the phase
closes green.

## Outstanding after this plan

Two items, both tracked in `.planning/STATE.md` → Deferred Items so they surface in
`/gsd-progress` and `/gsd-audit-uat`:

1. **The screen-reader pass (WR-02)** — not run. Carries the `SplitPanes.tsx:146-167` open
   question and three doc blocks that still want their outcome.
2. **The playtest (ROADMAP Notes)** — deferred to beta by host decision.

CARD-02 and CARD-07 were BUILT in 03-02 and 03-07 and are covered by automated tests; what this
plan adds is the physical acceptance the suite cannot give. Task 1 supplies it. Task 2 does not,
and that is stated rather than papered over.

## Self-Check: PASSED

Recorded honestly: one pass with its screen named and its result read against the spec's own
prediction, one check explicitly not run, one deferred by an explicit host decision. No result is
claimed that was not observed.
