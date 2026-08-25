---
phase: 04-blind-and-snake-bans
reviewed: 2026-08-25T22:26:39Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - src/adapters/ban-shield.ts
  - src/app.tsx
  - src/core/actions.ts
  - src/core/feasibility.ts
  - src/core/import-guard.ts
  - src/core/migrate.ts
  - src/core/model.ts
  - src/core/reduce.ts
  - src/core/selectors.ts
  - src/core/undo.ts
  - src/store.ts
  - src/ui/components/BanBoard.css
  - src/ui/components/BanBoard.tsx
  - src/ui/components/BanChipList.tsx
  - src/ui/components/BanReveal.css
  - src/ui/components/BanReveal.tsx
  - src/ui/components/BlindEntry.css
  - src/ui/components/BlindEntry.tsx
  - src/ui/components/BlindLocked.css
  - src/ui/components/BlindLocked.tsx
  - src/ui/components/BoardGrid.css
  - src/ui/components/CheckpointPrompt.tsx
  - src/ui/components/MonCard.css
  - src/ui/components/MonCard.tsx
  - src/ui/components/PoolGrid.css
  - src/ui/components/PoolGrid.tsx
  - src/ui/components/SplitPanes.tsx
  - src/ui/components/TopBar.tsx
  - src/ui/components/TurnBanner.tsx
  - src/ui/components/TypeaheadField.tsx
  - src/ui/confirm-copy.ts
  - src/ui/screens/BanStageScreen.css
  - src/ui/screens/BanStageScreen.tsx
  - src/ui/screens/CompletedDraft.tsx
  - src/ui/screens/ConfigScreen.css
  - src/ui/screens/ConfigScreen.tsx
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-08-25T22:26:39Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

This phase built blind and snake ban modes for a hot-seat draft tool. The review focused
on the stated dominant risk — information disclosure — and on the append-only document
contract. Both hold up well:

- Every consumer of `selectAllBanIds` is either `drawPoolForBanStage` (which must see the
  whole banned set to exclude it from the draw) or the `'reveal'` arm of `BanStageScreen`
  (where full disclosure is the point). Every surface that renders a ban count or a ban
  list before the reveal — `TopBar`'s disclosure, the snake pool/board — goes through
  `selectPublicBanIds`, and no second computation or `config.bans`-only shortcut was found
  anywhere in the reviewed files.
- `BanBoard`'s discriminated union is mounted correctly at both call sites (`BlindLocked`
  uses `mode="blind"`, the snake arm of `BanStageScreen` uses `mode="public"`); no caller
  mixes them up. The `@ts-expect-error` directives in the test suite guarding this are
  confirmed load-bearing — `tsc --noEmit` reports an error on any unused
  `@ts-expect-error` directive, and the repo state records a clean `tsc` run, so these
  directives are provably suppressing real type errors rather than sitting unused.
- The action/reducer/undo/migration/import-guard layer for the three new action types
  (`bans/placed`, `bans/submitted`, `bans/revealed`) is internally consistent:
  `canApply` backstops match the UI's own upstream constraints, structural guards and
  `canApply` cleanly divide "shape" from "state" questions, undo's confirm/no-confirm
  split (`ALWAYS_CONFIRM_KINDS`) matches the copy in `confirm-copy.ts`, and
  `MAX_BANS_PER_PLAYER` is a single imported constant shared by `import-guard.ts`,
  `feasibility.ts` and `ConfigScreen.tsx`.

Two real defects were found, both about the blind entry surface's actual rendered
behaviour rather than about secrecy. Neither leaks a species name or a player's ban.

## Warnings

### WR-01: The blind entry surface is not actually full-screen — it renders inside `.app-shell`'s 1200px, padded, centred column

**File:** `src/app.tsx:2105-2119`, `src/ui/components/BlindEntry.css:31-44`, `src/ui/screens/BanStageScreen.tsx:744-755`

**Issue:** `04-UI-SPEC` §3's shell table gives the blind entry surface its own row, explicitly distinct from both shells the rest of the app uses:

| Mode | Shell |
|------|-------|
| `snake` | `.draft-shell` |
| `blind`, locked | `.app-shell` |
| `blind`, entry | **own full-screen surface** |
| `blind`, reveal | `.app-shell` |

§5 restates it as the literal reading of BAN-05: "Full-screen. No top bar, no turn banner,
no panes… the ban entry is the entire working area, not a masked field inside a visible
screen." `BlindEntry.css:38-40` repeats the same claim in its own comment: "The surface IS
the screen (BAN-05), so it fills the viewport rather than sitting in it as a panel."

None of that is true of the shipped wiring. `app.tsx:2105-2119` picks exactly two shell
classes for the whole `bans` screen:

```tsx
class={
  screen.name === 'draft' ||
  (screen.name === 'bans' && state?.config.banMode === 'snake')
    ? 'draft-shell'
    : 'app-shell'
}
```

For any non-snake ban stage this is unconditionally `'app-shell'`. `BanStageScreen.tsx:744-755`
renders `<BlindEntry .../>` directly inside the `'blindLocked'` branch with no separate
wrapper, so it mounts as a normal child of that same `.app-shell` div — the one that
`app.css:73-78` caps at `max-width: 1200px; margin-inline: auto; padding: var(--space-4)`.
`BlindEntry.css` sets `min-height: 100vh` on `.blind-entry` itself but declares no `width`,
no `max-width: none`, and no positioning that could escape the ancestor's cap. There is no
selector anywhere in the CSS (`grep -rn "blind-entry" src/ui/**/*.css` returns only
`BlindEntry.css` itself) that overrides `.app-shell`'s constraint for this case, and no
test asserts the shell class for the entering state either (only the snake case is
asserted, in `tests/ui/read-only-shell.test.tsx:515-529`).

Because `entering` is `BanStageScreen`'s own component state (kept there deliberately for
D-18), `app.tsx` has no way to know the stage is currently in the entry sub-state, so it
cannot special-case the wrapper class today even if it wanted to — the binary
`draft-shell`/`app-shell` choice has no third option.

**Why it matters here:** this is the phase's own "most important screen" by the spec's own
words, and the literal BAN-05 requirement is "full-screen interstitial, not an input mask."
As shipped, the entry surface is a centred column with the same ~1200px cap and the same
padding as the landing and config screens, plus its own inner `--space-3` padding stacked
on top — on any monitor wider than about 1250px there will be visible empty margin on both
sides showing the page background, and the `min-height: 100vh` on a child nested inside a
padded, non-height-constrained ancestor also pushes the whole `.app-shell` taller than one
viewport (100vh of content plus the ancestor's own top+bottom padding), producing an
unintended page scroll on a surface the spec says should not have panes or scroll geometry
of its own. Nothing is disclosed by this — the surrounding chrome is still correctly
absent — but it is a confirmed, shipped deviation from an explicit, reviewed design
contract, not a matter of degree.

**Fix:** either render `BlindEntry` as a sibling of the `.app-shell`/`.draft-shell` wrapper
(mirroring how `ImportConfirmDialog` and the `ConfirmDialog`s already render outside it),
or give `.blind-entry` its own full-bleed treatment that breaks out of the ancestor (e.g.
`position: fixed; inset: 0; overflow-y: auto;`, with its own padding replacing the
inherited one). The former is more consistent with the rest of the codebase's pattern of
one wrapper per shell state and does not require exposing `entering` outside
`BanStageScreen` — `app.tsx` can render `BanStageScreen` unwrapped when
`screen.name === 'bans'` and let `BanStageScreen` itself decide, per arm, which shell
(if any) surrounds its content.

### WR-02: `ban-shield.ts`'s sentinel history entry assumes `history.back()` resolves before the next `installBanShield()` call, and nothing guards against the browser's asynchronous `popstate`

**File:** `src/adapters/ban-shield.ts:95-169`

**Issue:** The shield's own doc block (`ban-shield.ts:41-58`) states the invariant precisely: "While this is installed the current history entry is the sentinel; once torn down, it is not." Teardown (`ban-shield.ts:157-168`) removes every listener and then, if the sentinel is still current, calls `window.history.back()` to consume it (`:167`). `pushState` fires no event and is effectively synchronous, but `history.back()` and its resulting `popstate` are **not** — per the HTML history-traversal algorithm, the actual navigation and its `popstate` dispatch happen in a browser task queued after the call returns, not synchronously with it. `04-11-SUMMARY.md`'s own "what the automated tests do NOT establish" section acknowledges this directly: "No real Back button is ever pressed… happy-dom's traversal is also synchronous, where a real browser queues a task" and "Nothing here proves the browser's own Back gesture reaches the listener."

Concretely: when a lock-in, a hide, an alt-tab, or a bfcache restore unmounts the entry
surface, teardown fires `window.history.back()` (`:167`) to consume the sentinel it pushed
on install (`:135-141`). If the host then immediately re-enters the *next* player's bans
before that pending `back()` has actually completed in the browser, the new
`installBanShield()` call (`:95-169`) reads `window.history.state` (`:135`), still sees the
outgoing sentinel (the async back-navigation has not landed yet), and — per the documented
"adopt rather than stack" rule — skips pushing a fresh entry, assuming it is reusing the
same protected history slot. When the earlier, still-pending `back()` call finally resolves,
it fires a `popstate` into the **new** player's now-installed listener (`onPopState` at
`:114-120` is unconditional and calls `onLock()` for any `popstate` while installed), which
discards that new player's in-progress entry exactly as if the host had pressed Back —
even though nobody did.

**Why it matters here:** this is precisely the class of defect the phase treats as
critical (BAN-05/BAN-06), and the mechanism that would trigger it — a self-inflicted,
delayed `popstate` crossing into the next installation — is not exercised by any test in
the suite, by the team's own account. In practice the window is bounded by ordinary human
reaction time (the host must click "Enter {name}'s bans" again after the previous unmount,
and browsers typically resolve a same-document `history.back()` well within tens of
milliseconds), so this is unlikely to be hit by hand at the table. It becomes far more
reachable if any future change removes the human pause between two entries (an
auto-advance, a scripted/automated demo, or a very fast double-tap immediately after
"Lock in"), and the mitigation the codebase already relies on elsewhere for exactly this
kind of asymmetry (`04-11-SUMMARY.md`'s own "proved able to fail by mutation" standard) was
not applied to this specific interaction, because it requires a real browser's task queue
rather than happy-dom's synchronous one to manifest.

**Fix:** make teardown's consumption independently verifiable rather than relying on
`window.history.state` reflecting the *result* of a `back()` call that has not necessarily
completed — for example, have `install()` stamp each sentinel with a fresh, unique token
(instead of the fixed `{ blindBanEntry: true }` literal) and have teardown/adoption compare
against the token it itself pushed, so a lingering async `back()` from a previous
installation cannot be mistaken for the current one's sentinel by a subsequent
`installBanShield()` call. Alternatively (and more simply), guard `onPopState` so it only
locks when the shield's own listener set is still the one that was installed for the
*current* `entering` seat, e.g. by having `BanStageScreen` pass a per-entry identity into
`installBanShield` and ignoring a `popstate` that arrives after teardown has already run
for that identity — though the object-identity check in the current design already covers
that half; what is missing is a guard against a stale back() being *misread as belonging to
the new installation* on the way in.

## Info

### IN-01: `04-UI-SPEC` §1's blocked-string deviation and other recorded gaps are consistent, but one comment/behaviour pair is subtly inaccurate and worth correcting at the source

**File:** `src/ui/components/BlindEntry.css:38-40`

**Issue:** The stylesheet's own comment claims "The surface IS the screen (BAN-05), so it
fills the viewport rather than sitting in it as a panel" (see WR-01 above for why this is
not what happens once `.blind-entry` is nested inside `.app-shell`). `CLAUDE.md`'s own
convention states plainly that "a stale contract comment is worse than no comment, because
the next reader trusts it." This comment will mislead the next contributor who reads only
this file and does not check the composition root.

**Fix:** covered by WR-01's fix — once the surface actually escapes `.app-shell`, this
comment becomes true; until then, it should be corrected or qualified in the same change
that fixes the containment, per the project's own convention on superseded contract
comments.

---

_Reviewed: 2026-08-25T22:26:39Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
