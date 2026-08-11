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
