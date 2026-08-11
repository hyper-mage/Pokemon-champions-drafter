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
