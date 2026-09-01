---
phase: 05-full-tournament-brackets-standings-archive
plan: 14
subsystem: core+ui
tags: [recap, action-log, corrections, blind-ban-secrecy, focus-management, accent-reservation]

# Dependency graph
requires:
  - phase: 05-08
    provides: TOURNAMENT_MATCH_RECORDED / RESULTS_VOIDED / CUT_TAKEN / TIEBREAK_ORDERED / REOPENED, their guards, and the pinned matchId shape
  - phase: 05-13
    provides: the bracket stage, FinishedNotice, and the un-accented reopen button that left this plan's accent slot free
  - phase: 04-11
    provides: selectPublicBanIds, selectAttributedBans, selectBanCollisions — the reveal's secrecy contract this surface re-honours
  - phase: 03-06
    provides: CompletedDraft and its narrow-replacement posture, inherited verbatim
provides:
  - buildRecap(doc, state) — a pure, doc-taking fold of the whole log into typed chronological entries
  - RecapEntry / RecapSection / RecapKind / RecapCorrection — the contract RecapList consumes
  - RecapList — the six sections, the ten lines and the two correction marks
  - RecapAccess — the one prop bag carrying doc + roster + sprite metadata to both entry points
  - RECAP_ACTION_ID — the focus seam the recap returns to on exit
affects: [05-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A pure core module may take TournamentDoc rather than DraftState when the fold has discarded what it needs — undo.ts's precedent, now with a second instance"
    - "A recap entry carries ids and a small numeric bag; the component owns every contract string"
    - "One nullable prop bag rather than N props, so a control with no data and data with no control are both unrepresentable"
    - "A stylesheet describes the property its own acceptance gate searches for rather than naming it"
    - "The section of a derived event is read off the event that caused it (a void follows its causedBySeq's match)"

key-files:
  created:
    - src/core/recap.ts
    - src/ui/components/RecapList.tsx
    - src/ui/components/RecapList.css
    - tests/core/recap.test.ts
    - tests/ui/recap.test.tsx
  modified:
    - src/ui/screens/TournamentScreen.tsx
    - src/ui/screens/TournamentScreen.css
    - src/ui/screens/CompletedDraft.tsx
    - src/ui/screens/CompletedDraft.css
    - src/app.tsx
    - tests/ui/completed-draft.test.tsx
    - tests/ui/cut-control.test.tsx
    - tests/ui/finished-reopen.test.tsx
    - tests/ui/tournament-screen.test.tsx

key-decisions:
  - "buildRecap takes the record and the fold together: the log supplies the superseded results D-09 drops, the fold supplies the two ban selectors D-21 requires"
  - "The ban section branches on banMode in selectPublicBanIds' own order and arms, so a hand-edited snake record carrying a reveal is read the same way by both functions"
  - "A host banlist predates the log, so its entries carry NO_LOG_SEQ (-1) rather than a borrowed seq; ordering is ascending rather than strictly increasing because one reveal yields many lines"
  - "A match id naming neither stage is skipped, not defaulted: a line with no section has nowhere to render"
  - "A void lands in the section of the match its causedBySeq names exactly, rather than beside a plausible neighbour"
  - "tournament/reopened emits no line, written as a decision with its reason rather than left as an absence"
  - "RecapAccess is one required nullable prop bag on both entry points, so app.tsx cannot silently forget it and leave PERS-09 unreachable"
  - "The bracket-stage gate is bracket.championId rather than selectTournamentLocked, so reopening a night does not hide the account of it"
  - "Recap lines are whole composed strings at --text-body, which is what makes the Preact-escaping mitigation true and what §11's line table asks for"

patterns-established:
  - "A content-level secrecy assertion (search every field of every entry for the id) rather than a section-count one, because a count passes against a fixture with nothing to leak"
  - "Inverting a research pitfall's warning sign into an assertion: three matches with two corrections must yield five lines"

requirements-completed: [PERS-09, PERS-08]

# Metrics
duration: ~50min
completed: 2026-09-01
---

# Phase 5 Plan 14: The Draft Recap Summary

**The night reads back in the order it happened — bans, cards, every pick, the swaps, the
results and the corrections — folded straight out of the action log by a pure module that takes
the whole record rather than the fold, because the fold is exactly what threw the corrections
away.**

## Worktree Base

`BASE_ON_ARRIVAL` was `93f20ad7de20976de91742d02463214f31974db1` (`docs(03): create phase plan`)
— several phases stale, the ninth consecutive occurrence measured in this repository. **The reset
to the dispatch base `0f7b189` was needed and was performed** before any file was read. All five
content greps (waves 4, 6 and 7) passed after the reset.

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-09-01
- **Tasks:** 3 of 3, each committed the moment its tests passed
- **Files:** 14 (5 created, 9 modified)
- **Tests:** 2687 passing, up 43 from 2644 on arrival

## Accomplishments

**Task 1 — the draft half, and the ban section that reads the reveal.** `src/core/recap.ts` is a
pure, doc-taking fold. Its header carries the four things the plan asked for: why the signature is
what it is, D-21's secrecy rule, D-22's marked-not-struck rule, and the naming prohibition
`check-pure-core` enforces. The ban section branches on `config.banMode` in `selectPublicBanIds`'
own order and reads `selectAttributedBans` / `selectBanCollisions` — never a sealed allotment and
never a `bans/submitted` entry — so a blind night abandoned before its reveal produces no `Bans`
section at all. Cards, picks, swaps and passes each emit one entry per log entry behind their
`is…Action` guard.

**Task 2 — the corrections the fold threw away.** Match entries come from `doc.log`, so a match
recorded three times yields three lines where the fold holds one. The marks are decided by
grouping on `matchId` and comparing `seq` — never array position — and 05-RESEARCH Pitfall 8's
warning sign is inverted into an assertion: three matches carrying two corrections must yield
five `roundRobin` entries. A void counts the match results among its `targetSeqs` by walking the
recordings, which dedupes and excludes the cut `seq` a void routinely carries beside them.

**Task 3 — six sections, ten lines, no strike-through.** `RecapList` maps typed entries onto
§11's table and decides nothing. Every line is one composed string rendered as a Preact text
child, which is what makes T-05-79's mitigation true rather than intended. Corrections are marked
with words; the stylesheet describes the property its own gate searches for rather than naming it,
on `FinishedNotice.css`'s precedent. `View the draft recap` takes the bracket stage's reserved
accent — the slot 05-13 deliberately left free — and `CompletedDraft` carries the same control at
`draftOnly` depth on the exact inverse of its `Go to the tournament` gate, so PERS-09 is reachable
at every depth with exactly one entry point per surface.

## Deviations from Plan

### Auto-fixed / clarified

**1. [Rule 3 - Blocking] `src/app.tsx` and four existing UI test files were modified.**

- **Found during:** Task 3
- **Issue:** The recap needs the whole record, the roster and the sprite metadata. None of the
  three reaches `TournamentScreen` or `CompletedDraft` today, and `src/app.tsx` is not in the
  plan's `files_modified`. Without it the surface cannot be wired at all.
- **Fix:** One nullable prop bag — `recap: RecapAccess | null` — on both screens, on
  `MonChip.swap`'s and `PoolGrid.roundRestriction`'s stated precedent. `app.tsx` gains
  `tournamentDoc` from the store and one memo. The four existing test files that render either
  screen directly gained `recap={null}`, which is one line each and no fixture synthesis. 05-13
  modified two of the same files for the same class of reason.
- **Files modified:** `src/app.tsx`, `tests/ui/completed-draft.test.tsx`,
  `tests/ui/cut-control.test.tsx`, `tests/ui/finished-reopen.test.tsx`,
  `tests/ui/tournament-screen.test.tsx`
- **Commit:** `aaef076`

**2. [Rule 3 - Blocking] `src/ui/screens/CompletedDraft.css` was modified.**

- **Found during:** Task 3
- **Issue:** The `draftOnly` entry point needs a class, and the file is not in `files_modified`.
- **Fix:** `.completed-draft__recap` added to the existing rule's selector list rather than
  duplicated — the two controls are the same control at two depths and are never on screen
  together.
- **Commit:** `aaef076`

### Gate expressions evaluated rather than obeyed literally

**3. `grep -rn "buildRecap" src/ | grep -vc "src/core/recap.ts"` returns 4, not 1.**

The criterion's stated intent is "one consumer", and that is satisfied exactly: there is one
consumer module and one call site.

```
grep -rl "buildRecap" src/ | grep -vc "src/core/recap.ts"   → 1   (one module)
grep -rn "buildRecap(" src/ | grep -v "src/core/recap.ts"   → 1   (one call site, line 239)
```

The line count reads 4 because `RecapList.tsx`'s doc blocks name the function three times while
explaining why it takes the record rather than the fold — which is the argument most worth keeping
in that file. This is the same class of defect 05-13 hit with `color-danger`: a gate that counts
lines is tripped by prose that describes the thing correctly. Nothing was deleted.

**4. The ordering contract is ascending `seq`, not strictly increasing.**

The plan's behaviour bullet says "strictly ascending `seq` order". That is unachievable in one
case and the module header says so: a `bans/revealed` is ONE action carrying every player's bans,
so the lines it yields all share its `seq`. Everywhere else one action yields one line and the
order is strict, which is what the test named for the criterion asserts, on a snake fixture where
every entry has its own action. Entries sharing a `seq` keep the order their source action lists
them in. A second test pins the tie case, and `RecapList` keys on `seq` **and** position for it.

**5. Recap lines are whole strings at `--text-body`; actor names are not set at `--text-heading`.**

§Typography lists "recap actor names" among the surfaces where a player name is set at
`--text-heading`. Every other entry in that list is a row, cell or slot where the name *is* the
content. Here the name is a word inside a sentence, and honouring the row rule would put 24px type
in the middle of an 18px line. §11's own table gives each kind as a complete sentence, and the
threat register's T-05-79 mitigation is "every line is composed as a string and rendered as a
Preact text child" — which a per-word split would weaken. The line renders whole, at `--text-body`.
Flagged rather than resolved: if the intent was genuinely a two-size line, this is the one thing in
the plan to look at first.

**6. The void line inherits the copy table's bare plural.**

`{n} matches were voided by a correction.` reads "1 match were voided…" at one. This is
`ResultsGrid.remainingLine`'s shipped wart (`All 1 match are recorded.`) and `FeasibilityBar`'s,
and this file follows their stated posture rather than fixing it locally: the copy table is the
thing to amend, and a third surface quietly disagreeing about the verb is worse than three
surfaces agreeing about a wart. The singular goes through the shared `matches` helper and the
plural spells the noun out, so the contract sentence stays a contiguous run for its gate.

## Authentication Gates

None.

## Known Stubs

None. Every section, line and mark renders from real data; there is no placeholder, no hardcoded
empty collection reaching a surface, and no component receiving mock props.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change. The
one new trust boundary — `doc.log` read raw rather than through the fold — is T-05-76 through
T-05-81 in the plan's own register, and every disposition is implemented:

| Threat | Implemented as |
|--------|----------------|
| T-05-76 | mode-branched ban source + content-level absence test; `banSubmissions` and `BANS_SUBMITTED` both grep 0 |
| T-05-77 | `is…Action` guard at every arm; malformed and unknown entries each have a test |
| T-05-78 | doc-taking signature; `state.matchResults` greps 0; Pitfall 8's sign inverted into an assertion |
| T-05-79 | whole-string lines as text children; `check:nohtml` clean across `src/` |
| T-05-80 | marks are words; no `<s>`/`<del>`/`<strike>` and no `text-decoration` anywhere in the pair |
| T-05-81 | no copy, share or print affordance; the prohibition is described in the doc block, not named |

## Verification

| Check | Result |
|-------|--------|
| `npm run verify` | passes — `check:pure`, `check:nohtml`, 2687 tests in 81 files, build + SW manifest (322 URLs) |
| `npm run check:pure` | 0 violations in 21 files under `src/core` |
| `git diff --stat package.json` | empty |
| `git diff --stat src/adapters/` | empty |
| `npx vitest run tests/core/` | passes |
| Task 1 greps | `buildRecap` decl 1, doc-taking signature 1, `banSubmissions` 0, `BANS_SUBMITTED` 0, ban selectors 7, `document` 0 |
| Task 2 greps | `state.matchResults` 0, correction marks 3, `TOURNAMENT_REOPENED` 1 |
| Task 3 greps | `Draft recap` 1, `Corrected later` 1, `Corrects an earlier result` 1, `It was banned once.` 1, void sentence 1, CSS strike tokens 0, `<s>`/`<del>`/`<strike>` 0, export affordances 0, CSS hex 0 |
| Native `disabled=` introduced | 0 across all three touched components |
| `ResultsGrid` dual mount | preserved (2 occurrences in `TournamentScreen.tsx`) |
| `node_modules` reparse point | none created; the directory present holds only Vite's `.vite` / `.vite-temp` caches and zero packages |

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `dbe8f4a` | `feat(05-14): fold the draft half of the night into a recap` |
| 2 | `68d00e8` | `feat(05-14): show the corrections the fold threw away` |
| 3 | `aaef076` | `feat(05-14): render the night back, corrections included` |

## Self-Check: PASSED

Files claimed as created, checked on disk:

```
FOUND: src/core/recap.ts
FOUND: src/ui/components/RecapList.tsx
FOUND: src/ui/components/RecapList.css
FOUND: tests/core/recap.test.ts
FOUND: tests/ui/recap.test.tsx
FOUND: .planning/phases/05-full-tournament-brackets-standings-archive/05-14-SUMMARY.md
```

Commits claimed, checked in the log:

```
FOUND: dbe8f4a  feat(05-14): fold the draft half of the night into a recap
FOUND: 68d00e8  feat(05-14): show the corrections the fold threw away
FOUND: aaef076  feat(05-14): render the night back, corrections included
```

Nothing missing.
