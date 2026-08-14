---
status: diagnosed
trigger: "UAT test 16 — host reports: \"pass, but i don't see a disclosure anywhere\""
created: 2026-08-14T00:00:00Z
updated: 2026-08-14T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — the disclosure was correctly suppressed because the tournament the host
  was looking at during test 16 had an empty banlist. The UAT script itself guarantees this:
  test 8 ends by clearing the banlist, and test 14 starts a fresh tournament from a config form
  whose ban state initialises to `[]`. No step between test 8 and test 16 adds a ban.
test: (complete) Ran `tests/ui/ban-mode.test.tsx` at HEAD 09d3d72 — 16/16 pass, including four
  that render the full `<App/>`, reach the draft screen, and assert `details.top-bar__bans`.
expecting: (met) Passing tests prove the disclosure renders on the real draft screen whenever
  `config.bans` is non-empty, so absence can only mean zero bans.
next_action: NONE — diagnosis only (`goal: find_root_cause_only`). Hand to gap-closure. The
  product code needs no change; UAT test 16 needs its own setup step.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: During a draft, the `Bans (n)` disclosure expands to list the banned species by name. It contains no buttons — there is no way to add or remove a ban once the draft has started. The count matches what you set in config.
actual: "pass, but i don't see a disclosure anywhere" (verbatim, host)
errors: none reported
reproduction: Test 16 in .planning/phases/02-host-configured-draft-night/02-UAT.md. Start a draft and look for the disclosure on the draft screen.
started: Discovered during UAT of Phase 2, at commit 09d3d72.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: The disclosure does not render at all at HEAD (never built, or lost in the WR-07 restructure).
  evidence: Present at `src/ui/components/TopBar.tsx:209-218` — `<details class="top-bar__bans">` /
    `<summary>Bans ({bannedNames.length})</summary>` / `<ul>` / `<li>{name}</li>`. It is the only
    `<details>` in `src/`. `tests/ui/ban-mode.test.tsx:506-548` renders the full `<App/>`, resumes
    to the draft screen and finds it. 16/16 pass at HEAD.
  timestamp: 2026-08-14T00:00:00Z

- hypothesis: The WR-07 `inert` restructure moved TopBar into a subtree that hides it on the draft screen.
  evidence: `src/app.tsx:1000-1021` renders `<TopBar>` inside `.sticky-head` under the
    `screen.name === 'draft' && load.status === 'ready' && state !== null` gate — the normal draft
    screen. The four disclosure tests reach it through the real render tree after `claimOwnership()`,
    so the owner path is unobstructed. The read-only path is inert by design and test 15 passed.
  timestamp: 2026-08-14T00:00:00Z

- hypothesis: `bannedNames` is derived from the drawn POOL, which excludes banned species by
    construction, so it would always be empty (classic follow-the-indirection bug).
  evidence: `src/app.tsx:600-603` calls `bannedEntries(entries, state.config.bans)`, and `entries`
    at `src/app.tsx:301-304` is the FULL roster snapshot (`load.bundle.snapshot.entries` sorted by
    dex order) — not `availableEntries` (`src/app.tsx:470-475`), which is the pool. The derivation
    intersects the banlist with the whole roster, which is correct.
  timestamp: 2026-08-14T00:00:00Z

- hypothesis: It renders but is visually invisible / low-contrast, so the host walked past it.
  evidence: `src/ui/components/TopBar.css:95-109` gives `.top-bar__bans` the same hairline
    `--color-border-strong` outline, `--radius` and `--target-min` summary height as
    `.top-bar__button` beside it. It reads as a fifth button labelled `Bans (n)` in the same row.
    Not invisible. Also moot: at zero bans it is not in the DOM at all, so nothing was there to miss.
  timestamp: 2026-08-14T00:00:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-08-14T00:00:00Z
  checked: Worktree base
  found: HEAD was 80d64e3 (ancestor of target); reset --hard to 09d3d72 per protocol. Branch worktree-agent-a3f8dfe600033a069.
  implication: All file:line citations below are at 09d3d72.

- timestamp: 2026-08-14T00:00:00Z
  checked: .planning/debug/knowledge-base.md
  found: Does not exist — no prior resolved sessions.
  implication: No known-pattern shortcut available.

- timestamp: 2026-08-14T00:00:00Z
  checked: The render condition, `src/ui/components/TopBar.tsx:209`
  found: `{bannedNames.length > 0 && (<details class="top-bar__bans">…)}`. Gated ONLY on a
    non-empty banlist — not on ownership, not on a sub-screen, not on any feature flag.
    The comment at `:205-207` states the intent: "Not rendered at all when nothing is banned —
    02-UI-SPEC §Empty and edge states."
  implication: Zero bans is the single condition under which the disclosure is absent.

- timestamp: 2026-08-14T00:00:00Z
  checked: .planning/phases/02-host-configured-draft-night/02-UI-SPEC.md:1013
  found: "| Bans disclosure, no bans | not rendered. No `Bans (0)`. |"
  implication: Suppression at zero is the SPECIFIED behaviour, not an implementation accident.
    The implementation matches the spec exactly.

- timestamp: 2026-08-14T00:00:00Z
  checked: `npx vitest run tests/ui/ban-mode.test.tsx` at HEAD 09d3d72
  found: 16/16 pass. Four are the disclosure suite (`tests/ui/ban-mode.test.tsx:506-548`), each
    rendering the full `<App/>` via `reachDraft()` (`:481-500`) and querying
    `details.top-bar__bans` (`:502-504`). They pin `Bans (3)` with names in order, non-render at
    zero bans, dedupe/stale-id collapsing to `Bans (1)`, and zero buttons/inputs inside.
  implication: The disclosure genuinely renders on the real draft screen. Both branches of the
    `length > 0` gate are covered and correct. The defect is not in existence, rendering context,
    or visibility.

- timestamp: 2026-08-14T00:00:00Z
  checked: The banlist's lifetime across the UAT sequence
  found: (a) `src/ui/screens/ConfigScreen.tsx:283` — `const [bans, setBans] = useState<string[]>([])`.
    (b) `src/app.tsx:978-985` renders `<ConfigScreen>` behind `screen.name === 'config'`, so it
    UNMOUNTS on Start and a later `New tournament` mounts a fresh instance with `bans === []`.
    (c) Nothing persists `bans` outside the document — the only write is
    `src/ui/screens/ConfigScreen.tsx:695` (`bans: [...bans]`) into `TournamentConfig` at Start.
  implication: Every new tournament begins with zero bans unless the host re-adds them in that
    same config session.

- timestamp: 2026-08-14T00:00:00Z
  checked: The UAT script's own ordering, .planning/phases/02-host-configured-draft-night/02-UAT.md
  found: Test 8 (`:44-46`, result pass) ends by exercising `Clear the banlist` — which by
    `src/ui/confirm-copy.ts:170-177` removes every ban. Test 13 (`:66-68`, pass) abandons the draft
    and clears the saved tournament. Test 14 (`:70-72`, pass) starts a NEW draft. Tests 15 and 16
    add no bans. Test 16 (`:90-95`) carries no setup step of its own.
  implication: By the host's own passing runs, `state.config.bans` was `[]` at test 16 — twice over
    (cleared in test 8, then a fresh config in test 14). The disclosure was correctly absent.
    Test 16 as written can NEVER observe its own subject.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  Not a product defect. The `Bans (n)` disclosure is built, correct, specified and tested; it was
  absent because the tournament under test had an empty banlist, which is the specified behaviour
  (02-UI-SPEC.md:1013, implemented at src/ui/components/TopBar.tsx:209).

  The actual defect is in the UAT script. Test 16 (02-UAT.md:90-95) has no setup step and inherits
  whatever tournament tests 14-15 left behind. Two independent steps in the same script guarantee
  that tournament has zero bans: test 8 ends by confirming `Clear the banlist`, and test 14 starts
  a fresh tournament whose config form re-initialises `bans` to `[]`
  (src/ui/screens/ConfigScreen.tsx:283, remounted per src/app.tsx:978). So the host followed the
  script correctly and observed the correct behaviour — the script simply never arranged the
  precondition its expectation depends on ("The count matches what you set in config").
fix: |
  (Not applied — diagnose-only.) No src/ change is warranted. Rewrite UAT test 16 to carry its own
  setup: create a tournament with at least two bans, start it, then confirm `Bans (2)` appears in
  the top bar, expands to the two names, and holds no button. Optionally add a second assertion
  that a zero-ban draft shows no disclosure, which is the behaviour the host actually verified.
verification: |
  `npx vitest run tests/ui/ban-mode.test.tsx` — 16/16 pass at HEAD 09d3d72, covering both branches
  of the render gate through the full `<App/>` render tree.
files_changed: []
