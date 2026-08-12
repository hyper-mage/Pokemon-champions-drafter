---
status: passed
phase: 02-host-configured-draft-night
verified: 2026-08-12
verifier: orchestrator (inline) — NOT the independent gsd-verifier agent, see "Gates that did not run"
requirements_total: 19
requirements_traced: 19
criteria_total: 5
criteria_evidenced: 5
tests: 847
test_files: 42
gates_not_run: [code-review, independent-verifier, secure-phase]
---

# Phase 2 Verification — Host-Configured Draft Night

**Goal:** A host sets up a real tournament for their group — names, format, pool size,
banlist — and 4–8 friends draft through it on one shared screen with everything they need
visible at once.

## Read this first: what kind of verification this is

This record was produced by the **execute-phase orchestrator inline**, not by an
independent `gsd-verifier` agent. That agent could not be spawned: the account hit a
session limit mid-gate. The distinction matters and is not a formality — the orchestrator
carried every executor's own claims in context while writing this, so it is structurally
more prone to accepting a claim it already heard than a cold reader would be.

What that means in practice:

- **Mechanical, objective checks were genuinely run** and are reproducible from the commands
  recorded below. Those results stand on their own.
- **Adversarial goal-backward reading did not happen.** Nobody asked "what would this phase
  look like if it were subtly wrong" with fresh eyes.

Treat the evidence below as sound and the *coverage* as narrower than a full verification.

## Requirement traceability — 19/19

Every id in the phase's requirement list is claimed by at least one plan's SUMMARY
frontmatter, with no strays.

| Requirement | Claimed by |
|---|---|
| RULE-07 | 02-01, 02-04, 02-05 |
| DRFT-01 | 02-04 |
| DRFT-02 | 02-01, 02-05 |
| DRFT-03 | 02-01, 02-05 |
| DRFT-05 | 02-03 |
| DRFT-06 | 02-03 |
| DRFT-07 | 02-06 |
| DRFT-08 | 02-01, 02-08 |
| DRFT-09 | 02-01, 02-08 |
| DRFT-10 | 02-06 |
| DRFT-11 | 02-06 |
| DRFT-12 | 02-06 |
| DRFT-13 | 02-06, 02-07 |
| DRFT-14 | 02-03, 02-06 |
| DRFT-15 | 02-05 |
| DRFT-16 | 02-04 |
| BAN-01 | 02-07 |
| BAN-02 | 02-07 |
| BAN-08 | 02-01, 02-07 |

The multi-claims are all **core + surface** pairs — a pure predicate in 02-01 and the screen
that renders it in 02-05/07/08. That is the healthy shape. The failure mode this project has
hit before is the opposite: a core-only plan claiming an id and hiding an unbuilt surface.
No id here is claimed only by a plan that touches no UI file.

02-02 claims nothing, deliberately — its schema widening is foundational and its ids are
delivered as surfaces by 02-04, 02-05 and 02-07. Claiming them there would have recorded
built surfaces that did not exist.

## Success criteria — 5/5 evidenced

### 1. Host configures and starts; pool auto-sizes with an override

- Dual-Mega `X`/`Y`/`Either` in `ConfigScreen.tsx` and `core/model.ts`.
- `orderSeed` in `store.ts`, `ConfigScreen.tsx` — rolled on mount, so Start never depends on
  a prior click and "no order yet" is unrepresentable.
- `poolSizeForPreset` (`core/feasibility.ts`) and `poolOverride` (`ConfigScreen.tsx`).
- The override is `string | null`: while `null` the field follows the preset, so no stale
  typed number can be fallen back to.

### 2. Banned Pokémon never appear in the pool — **traced end to end**

This is the criterion most likely to be satisfied in appearance only, so it was traced
rather than accepted:

- `core/draw.ts:45` only *claims* "bans already removed by the caller" — a comment, not
  evidence.
- The single call site is `ConfigScreen.tsx:517`, and its `candidates` argument is
  `drawCandidates` = `entries.filter((entry) => !bannedIdSet.has(entry.id))`
  (`ConfigScreen.tsx:397-400`). The ban removal is real and precedes the draw.
- `tests/ui/ban-list.test.tsx:490-491` closes the loop on the started document:
  `config.bans` contains `rotomwash`, and `poolIds` filtered for `rotomwash` has length 0.

### 3. Start is disabled with a stated reason

- `FeasibilityBar.tsx` uses `aria-disabled` **without** native `disabled`, deliberately, so
  the control stays in the tab order and its handler returns early; documented against a
  future "fix".
- The reason element is its own polite status region.
- Backed by `core/feasibility.ts`'s corrected 10-case precedence, including the `NaN` case
  that a naive gate misses (`NaN > 235` and `NaN < 48` are both false).

### 4. Find by name, narrow by type and Mega, read at three densities

- `core/search.ts` exports `toSearchKey`, `matchesName`, `matchesTypes`, `matchesMega`.
- `adapters/view-prefs.ts` carries exactly `minimal` | `standard` | `full`.
- Legibility (DRFT-14) was verified physically — see the caveat under "Partial" below.

### 5. Turn, board, teams visible at once; every destructive action confirms

- `TurnBanner.tsx`, `BoardGrid.tsx`, `TeamStrip.tsx`, `ConfirmDialog.tsx` all present.
- `confirm-copy.ts` carries 7 copy sets — the six from 02-06 plus `Clear the banlist` from
  02-07, closing the gap 02-06 recorded rather than papered over.

## Automated gates

| Gate | Result |
|---|---|
| `npm run test` | 847 passed, 42 files |
| `npm run check:pure` | 0 violations, 15 files under `src/core` |
| `npm run check:nohtml` | 0 violations, 59 files under `src` |
| `npm run typecheck` + `vite build` | clean |
| Service worker manifest | 322 URLs (312 sprites, 6 data), 951.3 kB precached |
| Runtime dependency count | 2 (`preact`, `@preact/signals`) — unchanged |
| Schema drift | none detected |
| Cross-phase regression | Phase 1 core and adapter suites run in the same 847 — no regression |

## Partial — the D-23 physical check

DRFT-14's three-metre legibility pass was run and approved by the host on 2026-08-12, but
**blanket rather than per-assertion**. The consequence is recorded in full in
`02-06-SUMMARY.md` and repeated here because it is easy to misread:

The pass-1 unrecognisable-sprite list is blank because it was **never itemised**, not
because every sprite was nameable. D-21 (which removes MonChip's visible name in `split`)
therefore still has no evidence for or against it. Anyone revisiting D-21 must re-run pass 1
and write the list down.

## Gates that did not run

These are outstanding. None was skipped by choice.

1. **Code review** — the `gsd-code-reviewer` agent terminated on an account session limit
   (resets 2:50pm America/Chicago) before producing output. No `02-REVIEW.md` exists, and
   no partial was fabricated. Advisory by contract; it never blocked execution.
   Resume: `/gsd-code-review 2`
   Scope note for whoever runs it: 89 files was past the 50-file warning threshold, so the
   intended scope was narrowed to the 37 `.ts`/`.tsx` sources. **19 CSS files and 33 test
   files were excluded** and remain unreviewed.

2. **Independent verification** — the `gsd-verifier` agent could not be spawned for the same
   reason. This document is the orchestrator's inline substitute; see the opening section.
   Resume: re-run verification once quota resets.

3. **Security** — `workflow.security_enforcement` is `true` and no `02-SECURITY.md` exists.
   Resume: `/gsd-secure-phase 2`

## Known deferrals — recorded, not discovered here

Carried from the plans' own summaries, all with rationale on record:

- **Plural copy defect, two sites.** `feasibility.ts` renders "after 1 bans";
  `FeasibilityBar` renders "1 other problems also block the start." Deliberately left for
  one combined amendment rather than fixing one and creating an undocumented inconsistency.
  Both are pinned by exact-string assertions, so the fix touches tests too.
- **Pool-grid keyboard navigation and focus-after-a-pick are unbuilt.** Not merely wiring:
  "focus the cell that now occupies that position" conflicts with D-35, because a pick
  clears the filters and the grid repopulates in the same commit. That is a design question.
  `use-roving-tabindex` ships generalised for the future consumer.
- **No route back from the config screen to the landing screen.** Worst when the roster fails
  to load; that sentence names a reload, which is the only reason it is survivable.
- **`LiveRegion.tsx`'s doc block is stale** — it claims no surface in this phase repeats a
  message, which the filter bar now does.
- **D-17 doc-comment mentions of 235/74** in nine Phase 1 files. Not hardcoded constants, so
  the rule holds; logged in `deferred-items.md`.
- **No CI walk of the real browser.** The landing→board flow is asserted at component level
  in every relevant test file, but nothing drives a browser end to end.

## Verdict

The phase's goal is met and every success criterion has code and test evidence behind it.
The mechanical gates are green and reproducible.

Two independent review passes did not run, and this document is not a substitute for them.
Re-run both before treating Phase 2 as closed.
