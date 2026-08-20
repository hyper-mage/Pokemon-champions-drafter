---
quick_id: 260820-l4u
slug: close-phase-3-human-uat-pass-board-heigh
status: complete
date: 2026-08-20
commits: [775d275, f4de8bc, b495465, 558863e, 1cb78cb]
files_modified:
  - .planning/phases/03-compiled-rules-priority-cards-swaps/03-HUMAN-UAT.md
  - .planning/phases/03-compiled-rules-priority-cards-swaps/03-VERIFICATION.md
  - .planning/phases/03-compiled-rules-priority-cards-swaps/deferred-items.md
  - src/ui/components/SchedulePreview.tsx
  - src/ui/components/SplitPanes.tsx
  - .planning/STATE.md
---

# Quick Task 260820-l4u — Summary

Two of Phase 3's three outstanding `human_uat` items are settled. The `/gsd-audit-uat` sweep
now reports **1** item, down from 3, and the one it reports is the one genuinely outstanding
check.

## What was decided, and by whom

| Item | Outcome | Basis |
|------|---------|-------|
| UAT test 3 — 8-player board height, no internal scrollbar | **pass** | Host approval, 2026-08-20. Closes DRFT-14 assertion 12. |
| UAT test 1 — screen-reader pass on four focus-moving transitions | **descoped** | Host decision, 2026-08-20: *"it mostly works but I do not want this project to put anymore effort into screen reading."* |
| UAT test 2 — card-mechanic playtest with real players | **still pending** | Unchanged. Deferred to a beta session by host decision 2026-08-19. |

## The one judgement call worth flagging

The screen-reader item is recorded as **descoped, not passed**, everywhere it appears. The
host's "it mostly works" is an informal impression offered in passing, not the four-transition
walk the test specifies. 03-12 refused to record that check as passed when it had not been run,
and reversing that on weaker evidence would have been a step backwards. Descoped is the honest
label: the check was settled by a scope decision, and the record says so.

## Why source files changed for a documentation task

`npm run verify` is green (53 files, 1529 tests, build clean) and no behaviour changed. Two doc
blocks asserted an obligation that no longer exists, and CLAUDE.md treats comments as contracts:

- `SchedulePreview.tsx` — `## Screen-reader check still owed` → records the descope.
- `SplitPanes.tsx` — `UNRESOLVED ... Record the outcome here either way` → records the outcome.
- `CardPanel.tsx` — untouched; it never carried a screen-reader claim.

Both keep the reasoning that made the descope affordable, because it is still load-bearing:
every announced fact has a second carrier, so an announcement is never the only signal.
`SplitPanes.tsx` additionally names the one place that is already untrue — collapse-to-split
moves no focus, so its announcement IS the sole signal there — which is the boundary of the
descope and the thing that reopens it.

## A tool gap found along the way

`gsd-sdk query audit-uat` kept reporting all three items after they were marked
`resolved: true`. `parseVerificationFrontmatterItems` (`sdk/dist/query/uat.js:183`) emits every
entry under `human_verification:` whenever the file's `status:` is `human_needed`, copying
`test` / `expected` / `why_human` and reading no resolution field at all. Phase 1's report only
escapes this because its `status:` is `passed`.

Worked around in-repo rather than patched upstream: settled entries move to a sibling
`human_verification_resolved:` key, with a comment above both keys explaining why they must not
be merged back. The alternative — flipping `status:` to `passed` — would have hidden the
playtest, which is still genuinely outstanding.

`03-VERIFICATION.md` keeps `status: human_needed` for that reason.

## Follow-ups NOT done (from the same audit, not approved here)

- `REQUIREMENTS.md`: 19 Phase 2 IDs unchecked in the list but `Complete` in the table.
- `REQUIREMENTS.md`: EXPO-04 still carries wording 01-VERIFICATION proved unsatisfiable.
- `01-VERIFICATION.md`: body prose says `human_needed`; frontmatter says `passed`.
- `02-VERIFICATION.md`: recommends flipping 02-UAT tests 9 and 16 to pass — already done.
