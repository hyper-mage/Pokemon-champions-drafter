# Deferred items — Phase 2

Out-of-scope discoveries logged during execution. Not fixed, by the scope rule: only issues
directly caused by the current task's changes are auto-fixed.

## D1 — nine pre-existing roster figures in `src/` doc comments

**Found during:** 02-01, verifying the plan's acceptance criterion
`grep -Erc "\b235\b|\b74\b" src/ --include=*.ts --include=*.tsx` returns 0 for every file.

The criterion already failed on the base commit `bc95fdd`, before this plan touched anything.
Nine Phase 1 files mention the figure in prose:

| File | Line |
|------|------|
| `src/adapters/roster-source.ts` | 39, 137 |
| `src/core/import-guard.ts` | 112 |
| `src/core/roster/transform.ts` | 36 |
| `src/ui/components/MonCard.tsx` | 32 |
| `src/ui/components/PoolGrid.tsx` | 17 |
| `src/ui/components/TopBar.tsx` | 13, 19 |
| `src/ui/sprite-src.ts` | 12 |

Every one is a doc comment explaining *why* a decision was made ("235 cells is unremarkable",
"resolves for zero of the 235 entries"). None is a hardcoded constant, so D-17's actual rule —
no constant encodes a player ceiling or a roster count — holds. The three modules 02-01 adds
carry zero occurrences, which is the part of the criterion that was in scope.

**Decision needed:** either narrow the criterion to "no roster figure reaches a runtime value"
(which the code already satisfies), or rewrite the nine comments to name the roster
symbolically. Rewriting nine unrelated Phase 1 files inside a Phase 2 plan would put unreviewed
churn into a wave that other worktrees are merging against.

## D2 — the config screen has no way back to the landing screen

**Found during:** 02-04, wiring the `Screen` router.

Once a host clicks `New tournament` there is no control that returns them to the landing
screen, so `Resume saved draft` and `Import JSON…` are unreachable without a page reload.
The dead end is worst when the roster fails: the config branch renders
`The roster did not load. Reload the page — if it keeps failing, the site may be mid-deploy.`
and nothing else, and that sentence naming a reload is the only reason this is survivable
rather than a trap.

**Not fixed here** because 02-UI-SPEC §2 gives the config screen five groups and a pinned
bar, and no back control anywhere. Inventing one would be a surface the contract does not
describe, on a screen three later plans are still adding groups to.

**Decision needed:** whether the config screen gets a `Back to the start` secondary action
beside `Start draft`, or whether the reload is considered sufficient. Plan 02-09 owns the
config screen's confirmations and is the natural home for it — leaving a half-typed config
does want a confirm, which is exactly that plan's shape.

## D3 — WR-04: the reason names completion as the unlock, and at completion the pane stops holding the pool

**Found during:** 02-12, triaging `02-REVIEW.md`.

The pool's expand control is labelled `Expand the pool` and explains that it is
`Available once the draft is complete`. It is — and at 12 of 12 picks `src/app.tsx` swaps that
pane's contents from `PoolGrid` to `CompletedDraft`. The reviewer's probe against the real app
printed:

```
pool pane holds .pool grid?  false
pool pane scroll text:       "Draft complete — save a copy? Download the tournament JSON so you can…"
```

So the control becomes available at the instant it stops expanding the pool and starts
expanding the export panels, and the collapsed strip then offers `Show the pool` for the same
non-pool content. The mislabelling of `Expand the pool` / `Show the pool` predates 02-09; what
is new is the sentence that makes the contradiction explicit and puts it on screen for the
whole draft.

**Not fixed here** for two concrete reasons. First, the string is quoted verbatim in the
`expected:` text of test 9 in `02-UAT.md`, which sits at `result: pending` awaiting a human
re-run — changing it now would invalidate that test's expected text mid-flight, and plan 02-12
is barred from editing that document. Second, the reviewer offers two fixes and the smaller one
(change the reason to something like `Available once every team is full`) still leaves the
`Expand the pool` / `Show the pool` labels naming content the pane no longer holds. That is a
pre-existing mislabelling, and resolving it needs a decision about whether pane labels follow
pane contents — a decision that reaches `src/app.tsx`, which plans 02-09, 02-11 and 02-12 have
each deliberately not touched.

**Decision needed:** after the UAT re-run closes tests 9 and 16, either change the reason
string in all four places that carry it — `SplitPanes.tsx`, `draft-panes.test.tsx`,
02-UI-SPEC's availability row and its copy table — plus UAT test 9, or make the pane labels
follow the pane's contents and move the `buttonNamed(…)` lookups with them.

## D4 — WR-06: the inert label measures 4.04:1, and the fix is a token, not a rule

**Found during:** 02-12, Task 1.

`opacity: 0.45` on `--color-text` `#e8edf2` over `--color-bg` `#0f1216` composites to
`rgb(113 117 121)`, which is **4.04:1**. The label is `--text-label`, 600 weight at 14px, which
is not large text, so the AA threshold is 4.5:1. The button's hairline border lands at
**1.76:1**. The focus ring survives at **3.32:1**, so the tab stop is still findable.
`.pane__reason` is a sibling rather than a child, so the explanation itself is outside the
dimmed subtree and measures **7.65:1**.

**Not fixed here.** WCAG 1.4.3 exempts inactive components and `aria-disabled="true"` is a
defensible claim to that exemption. The identical `opacity: 0.45` recipe is already established
at `FeasibilityBar.css:41` and `TopBar.css:80`, so changing this one call site would fork a
convention rather than fix one, and would leave the two older controls at the same ratio.

**Decision needed:** whether to add a dedicated muted-ink token to `src/ui/tokens.css` and
apply it at all three call sites in one change, or to accept the exemption project-wide and
record that acceptance once rather than per component. Note that plan 02-12 already recorded in
`SplitPanes.css` that `.pane__reason` sits deliberately outside the dimmed subtree at 7.65:1,
so the explanation is unaffected either way.

## D5 — IN-01: `reasonId` is a document-global id derived only from `key`

**Found during:** 02-12, triaging `02-REVIEW.md`.

`` `${key}-expand-reason` `` in `SplitPanes.tsx` yields the fixed string `pool-expand-reason`.
It is unique today only because `SplitPanes` is mounted once. 02-UI-SPEC's own availability
table contemplates the config screen's ban-grid section as a second consumer of this control,
and two instances would emit duplicate ids with every `aria-describedby` resolving to the
first.

**Not fixed here.** The reviewer rates it INFO and explicitly says it is not worth changing
before a second instance exists, and `Dialog.tsx` already establishes `useId()` as this repo's
answer — so the fix is known rather than open, and writing it now would add a hook to a
component with one mount to solve a collision that cannot occur.

**Decision needed:** derive the prefix from a per-instance id at the point a second
`SplitPanes` is introduced. Phase 4's ban ritual is the first plausible caller.

---

This list is the remainder, not the whole of the phase's review output. CR-01, WR-07, WR-08 and
IN-02 were closed in plan 02-11; WR-01, WR-02, WR-03 and WR-05 were closed in plan 02-12.
