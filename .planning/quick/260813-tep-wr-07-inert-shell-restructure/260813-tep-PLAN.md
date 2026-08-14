---
quick_id: 260813-tep
slug: wr-07-inert-shell-restructure
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [PERS-03, WR-07, T-02-15]
files_modified:
  - src/app.tsx
  - src/ui/app.css
  - src/ui/components/SplitPanes.css
  - tests/ui/read-only-shell.test.tsx
  - tests/ui/confirm-dialogs.test.tsx
  - tests/ui/multi-tab-handover.test.tsx
  - tests/ui/draft-panes.test.tsx
  - tests/ui/read-only-banner.test.tsx
  - tests/adapters/tab-lock.test.ts
  - tests/store-ownership.test.ts

must_haves:
  truths:
    - "A read-only secondary tab cannot reach `createTournament`: the landing screen and the config screen sit inside the one `inert` subtree, not beside it."
    - "The read-only banner's sentence still reaches the polite live region while the tab is read-only."
    - "`Take over drafting here` is still focusable and clickable in a read-only tab."
    - "Both confirm dialogs and the import confirm still render outside the `inert` subtree."
    - "The draft screen is still exactly one viewport tall, with the two panes scrolling inside it and no page scrollbar."
    - "Promotion routes the tab to the draft screen, so an adopted document is never held invisibly."
  artifacts:
    - path: "src/app.tsx"
      provides: "Fragment shell root; one `inert` gate around the screens; unconditional routing on adoption"
      contains: "setScreen({ name: 'draft' })"
    - path: "src/ui/app.css"
      provides: "Re-established one-viewport draft layout after the box tree changed"
      contains: "#app"
    - path: "tests/ui/read-only-shell.test.tsx"
      provides: "The two regression tests that are the point of the fix"
  key_links:
    - from: "src/app.tsx shell element"
      to: "readOnly"
      via: "inert attribute on the element carrying draft-shell/app-shell"
      pattern: "inert=\\{readOnly \\? true : undefined\\}"
    - from: "src/ui/app.css #app"
      to: ".draft-shell"
      via: "flex column that absorbs the banner's height so 100dvh still means one viewport"
      pattern: "min-height: 100dvh"
    - from: "tests/ui/read-only-shell.test.tsx"
      to: "the inert subtree"
      via: "containment assertions on the New tournament button, the takeover button, and the live region"
      pattern: "\\.contains\\("
---

<objective>
Close WR-07 / T-02-15 by making the read-only gate cover every screen instead of the draft
region alone, without pulling the live region, the read-only banner, or the dialogs into it.

Purpose: T-02-15 is the one open threat holding the Phase 2 security gate. Today `inert`
sits on `.draft-region`, so a secondary tab can walk the config screen, click `Start draft`,
build a different tournament, and write it over the owner's draft one autosave after
promotion. The host has twice declined to accept that risk.

Output: one `inert` gate around the screens, a shell layout that survives the new box tree,
unconditional routing on adoption, and two regression tests that fail if either half is
undone.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@src/app.tsx
@src/ui/app.css
@src/ui/components/SplitPanes.css
@src/ui/components/ReadOnlyBanner.tsx
@tests/ui/read-only-shell.test.tsx

The approved sequence is `.planning/phases/02-host-configured-draft-night/02-REVIEW.md`
lines 106-116 ("Recommended sequence, carried forward"), and the failing nine-step sequence
it closes is `.planning/phases/02-host-configured-draft-night/02-SECURITY.md` lines 131-159.
Read those two ranges before touching anything. Do not re-derive the fix and do not take
02-REVIEW.md's retracted option (`inert` on the whole root) or its narrow fallback
(`screen.name === 'landing'` plus an `isOwner()` gate on `handleStart`) — the fallback needs
a copy row that is not in the approved 02-UI-SPEC table.
</context>

<current_structure>
Facts already established, so nothing below needs a codebase hunt:

- `src/app.tsx:874-1101` returns one `<div class={screen.name === 'draft' ? 'draft-shell' : 'app-shell'}>`
  holding, in order: `LiveRegion`, `ReadOnlyBanner`, the landing screen, the config status
  line, the config screen, the draft `<h1 class="app-shell__title">`, `StorageBlocked`, the
  `<div class="draft-region" inert=…>` (line 948) wrapping `.sticky-head` plus `SplitPanes`,
  then `ImportConfirmDialog` and two `ConfirmDialog`s.
- `src/app.tsx:391-402` — `adoptWhateverIsNewer` ends at `setSaved(newer)` and never routes.
  It is `onPromote` and `onRemoteSave` both. It lives inside a `useEffect` with a
  deliberately empty dependency array; `setScreen` is a `useState` setter (`app.tsx:234`) and
  is stable, so the dependency list stays empty and its comment stays true.
- `src/ui/app.css:63-68` — `.draft-shell` is `display:flex; flex-direction:column;
  height:100dvh; padding:var(--space-4)`.
- `src/ui/app.css:75-78` — `.draft-shell > *, .draft-shell .sticky-head { flex: none; }`.
- `src/ui/app.css:80-95` — `.draft-shell > .draft-region { display:flex;
  flex-direction:column; flex:1; min-height:0; }`. This is the exception that beats the
  blanket `flex: none` above it on specificity, and it is the only reason the panes size.
- `src/ui/app.css:199-212` — `.draft-region { display: block; }` plus the doctrine comment:
  no containing-block-creating property may be declared on it, and there must be no `[inert]`
  rule anywhere.
- `src/ui/components/SplitPanes.css:29-36` cross-references that comment by name.
- `SplitPanes`' root element is `<div class="draft-panes">`; `.draft-panes` already declares
  `flex: 1; min-height: 0` in its own file.
- `.visually-hidden` (app.css:235) is `position: absolute`, so `LiveRegion` contributes no
  height wherever it is mounted.
- No dialog uses a portal — every dialog is a plain child of the returned tree.
</current_structure>

<tasks>

<task type="auto">
  <name>Task 1: One inert gate around the screens, and a shell layout that survives it</name>
  <files>src/app.tsx, src/ui/app.css, src/ui/components/SplitPanes.css</files>
  <action>
Restructure `App`'s return in `src/app.tsx` as a Fragment whose children are, in this exact
order: `LiveRegion`; `ReadOnlyBanner`; one `div` that carries BOTH the existing shell class
expression (`screen.name === 'draft' ? 'draft-shell' : 'app-shell'`) and
`inert={readOnly ? true : undefined}` and wraps every screen — landing, the config status
line, the config screen, the draft title, `StorageBlocked`, and the draft content; then
`ImportConfirmDialog` and the two `ConfirmDialog`s. `undefined` rather than `false` so Preact
removes the attribute outright, exactly as line 948 does today.

Delete the `<div class="draft-region">` wrapper entirely in the same change, so `.sticky-head`
and `SplitPanes` become direct children of the shell div and there is one gate rather than
two. Keep every existing screen-name guard and every existing prop untouched; this is a
re-parenting, not a rewrite of what renders.

The comment at `src/app.tsx:1055-1060` explains why the dialogs sit outside the gate, and
that reasoning is now load-bearing for a larger subtree. Rewrite it to describe the structure
that exists after this change — the dialogs, the banner and the live region are siblings of
the inert element, not children of it — and say why each of the three must be: `inert` strips
a subtree from the accessibility tree, so a banner inside it would silence its own
announcement, a takeover button inside it would be the hard lockout `tab-lock.ts`'s header
calls worse than the race, and a dialog inside it would render, trap focus, and refuse every
click.

In `adoptWhateverIsNewer` (`src/app.tsx:392-402`), add `setScreen({ name: 'draft' })` after
`setSaved(newer)`. Unconditional, both on promotion and on a remote save. Record in the
comment why the unconditional form is now safe and was not before: a secondary tab can no
longer have been composing anything on the config screen, because the config screen is inside
the gate.

Then re-establish the layout in `src/ui/app.css`. The box tree changed — the banner is no
longer inside the element that is one viewport tall — so patching selectors is not enough:

1. Add an `#app` rule: `display: flex; flex-direction: column; min-height: 100dvh`. This is
   the container that now absorbs the banner's height. Move the dynamic-viewport-unit
   rationale from the `.draft-shell` comment block to it, since that is where the unit now
   lives. Do NOT write the static viewport unit substring anywhere in this file, in a
   declaration or in a comment — the existing comment says it is a substring nobody should
   find here, and that still holds.
2. Change `.draft-shell` from `height: 100dvh` to `flex: 1; min-height: 0`. Keep its
   `display: flex`, `flex-direction: column` and `padding`.
3. Replace the `.draft-shell > .draft-region` rule with the equivalent exception for the
   element that now needs to grow: `.draft-shell > .draft-panes { flex: 1; min-height: 0; }`.
   It must out-specify `.draft-shell > *` on specificity rather than on source order — the
   whole point of the rule it replaces. Keep its comment's substance: the flex chain has to
   pass through to the panes or they do not scroll.
4. Delete the `.draft-region { display: block; }` rule and re-home its two doctrines onto the
   shell rules, because the element carrying `inert` is now `.draft-shell` / `.app-shell`:
   no containing-block-creating property may be declared on either, since `.sticky-head` is a
   `position: sticky` descendant; and there is still no `[inert]` rule anywhere, because the
   UI-SPEC gives read-only no colour signal at all.
5. Update the `.draft-region` cross-reference in `src/ui/components/SplitPanes.css:29-36` to
   name wherever that prohibition now lives.

No new dependency, no raw hex, and no raw px for anything `src/ui/tokens.css` covers. The
`100dvh` on `#app` is the same sanctioned viewport length `.draft-shell` carried before.
  </action>
  <verify>
    <automated>npm run typecheck &amp;&amp; npx vitest run tests/ui/draft-panes.test.tsx &amp;&amp; test "$(grep -rn 'draft-region' src/ | wc -l)" -eq 0</automated>
  </verify>
  <done>
`npm run typecheck` exits 0. `tests/ui/draft-panes.test.tsx` still passes, including its
assertion that the draft screen carries `.draft-shell` and not `.app-shell`. The token
`draft-region` appears nowhere under `src/`, in code or in a comment. `src/app.tsx` has
exactly one `inert=` expression, on the element that also carries the shell class, and
`LiveRegion`, `ReadOnlyBanner`, `ImportConfirmDialog` and both `ConfirmDialog`s are its
siblings. Tests that query `.draft-region` are expected to fail at this point; Task 2 fixes
them.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Regression tests for the gate, and an audit of every inert reference</name>
  <files>tests/ui/read-only-shell.test.tsx, tests/ui/confirm-dialogs.test.tsx, tests/ui/multi-tab-handover.test.tsx, tests/ui/draft-panes.test.tsx, tests/ui/read-only-banner.test.tsx, tests/adapters/tab-lock.test.ts, tests/store-ownership.test.ts</files>
  <behavior>
    - A read-only secondary tab sitting on the LANDING screen: the element carrying `inert`
      contains the `New tournament` button. This is the T-02-15 sequence's step 4, and it is
      the assertion the old structure could not make.
    - The same tab: the element carrying `inert` does NOT contain the
      `Take over drafting here` button, and does NOT contain the polite live region node.
    - The same tab: the polite live region's own text content is the read-only sentence, so
      the announcement reached it while the tab was read-only.
    - Exactly one element in the mounted tree carries `inert` at any time.
    - The existing two cases still hold on the draft screen: `inert` present while another
      tab drafts, absent after takeover, absent in a lone tab.
  </behavior>
  <action>
Extend `tests/ui/read-only-shell.test.tsx`. It already has the fixtures this needs — the fake
`BroadcastChannel` bus, `mountApp`, `seedSavedDraft`, `resumeSavedDraft` — so reuse them
rather than building a second harness.

Replace the `draftRegion()` helper with one that queries the element that now carries the
gate. Query it by the class the shell actually renders rather than by `[inert]`, so the tests
can assert the attribute's absence as well as its presence. Update the two existing cases to
use it. Its file header doc block describes `inert` "on the draft region" and must be
rewritten to describe the gate as it now is; keep the paragraph recording what the file
cannot prove — happy-dom parses `inert` but does not implement its focus or pointer
semantics — because that limit is unchanged and is why the browser check is a separate task.

Add the two new cases:

1. The T-02-15 regression. Mount a read-only secondary tab and stay on the landing screen —
   do not resume. Assert the shell element carries `inert`, and that it contains the
   `New tournament` button, which is the only route to the config screen and therefore to
   `createTournament`. Assert containment, not click behaviour: happy-dom would happily fire
   the handler, so a click assertion would prove the opposite of what it claims. State that
   in a comment, and name `02-SECURITY.md`'s step 4 so a future reader can find the sequence.
   Assert in the same test that the shell does NOT contain the `Take over drafting here`
   button, since a fix that gated the config screen by locking the tab out entirely would be
   the retracted answer wearing a passing test.

2. The announcement regression. In the same read-only state, assert the polite live region
   node — the `[role="status"][aria-live="polite"]` element — is not contained by the shell
   element, and that its own `textContent` is the `READ_ONLY_SENTENCE` exported by
   `ReadOnlyBanner`. Import the constant; do not retype the sentence. Assert on the live
   region node specifically and never on `host.textContent`, which contains the banner's own
   visible paragraph and would pass even with the region silenced.

`announce` is a module-level signal that outlives a render, so reset it in `beforeEach`
alongside the existing `localStorage.clear()`. The file already starts with
`// @vitest-environment happy-dom` on line 1; keep it there.

Then fix the two assertions elsewhere that used `.draft-region` as a proxy for "the draft
screen is rendered": `tests/ui/confirm-dialogs.test.tsx:511` and
`tests/ui/multi-tab-handover.test.tsx:272`. Both become a query for the draft shell, which
`tests/ui/draft-panes.test.tsx:247-248` already pins as present on the draft screen and
absent everywhere else.

Finally, audit every remaining mention of `inert` under `tests/` and correct only the ones
that describe the shell structure, which are prose in `tests/ui/draft-panes.test.tsx:181`,
`tests/ui/read-only-banner.test.tsx:159`, `tests/adapters/tab-lock.test.ts:791`, and the
`tests/store-ownership.test.ts` header. The mentions in `tests/ui/pool-filter.test.tsx`,
`tests/ui/ban-mode.test.tsx`, `tests/core/reduce.test.ts` and `tests/build/sw-behaviour.test.ts`
use "inert" as ordinary English about unrelated subjects — read them, confirm that, and leave
them alone. Record in the summary that they were checked and needed nothing.

Copy rules apply to test prose as much as anywhere: second person, present tense, no
exclamation marks, no emoji.
  </action>
  <verify>
    <automated>npm run verify</automated>
  </verify>
  <done>
`npm run verify` exits 0 — `check:pure` and `check:nohtml` at 0 violations, every test
passing, the build clean. The suite is at least 877 tests (up from 875) across 43 files. The
token `draft-region` appears nowhere under `tests/`. `package.json` and `package-lock.json`
are unchanged.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Confirm the gate and the one-viewport layout in a real browser</name>
  <files>none — verification only</files>
  <action>
Stop and hand the checklist below to the developer. Do not self-approve, and do not
substitute another automated check for it: happy-dom parses `inert` but implements neither
its focus nor its pointer semantics, and no test in this repository can observe layout.
Report the answer verbatim, and if any step fails, fix it before writing the summary.
  </action>
  <what-built>
`inert` now covers every screen instead of the draft region alone, the shell root is a
Fragment so the live region, the read-only banner and all three dialogs sit outside the gate,
the draft shell's one-viewport layout was rebuilt around the new box tree, and adoption now
routes to the draft screen. Two regression tests pin the structure. What tests cannot pin is
whether `inert` actually blocks focus and pointers, and whether the layout still holds — both
need a browser.
  </what-built>
  <how-to-verify>
1. Run `npm run dev` and open the app. Start or resume a draft. Confirm the draft screen is
   exactly one viewport tall: no page scrollbar, and both panes scrolling inside it.
2. Open a second tab on the same URL. It should show the read-only banner.
3. In that second tab, on the draft screen: click a pool cell and press Tab repeatedly.
   Nothing in the pool or the board should respond, and focus should never enter them.
4. Still in the second tab: `Take over drafting here` must be reachable by Tab and clickable.
   Do not click it yet.
5. Reload the second tab so it opens on the landing screen while the first tab still holds
   the lock. `New tournament` must be unclickable and unfocusable. This is the fix — before
   it, that button reached `Start draft` and built a competing tournament.
6. Confirm the draft screen in the second tab is still exactly one viewport tall with the
   banner above it — the banner must not push the board off the bottom.
7. Now click `Take over drafting here`. The tab should land on the draft screen showing the
   first tab's document, and the first tab should become read-only.
8. Confirm the banner looks right in both shells — full width above the capped landing and
   config screens, and above the full-bleed draft screen.

If you run a screen reader, confirm the read-only sentence is announced in the secondary tab.
If not, open devtools and confirm the `[aria-live="polite"]` node holds that sentence and has
no ancestor carrying `inert`.
  </how-to-verify>
  <resume-signal>Type "approved", or describe what failed and at which step.</resume-signal>
  <verify>
    <human-check>All eight steps confirmed in a browser, plus the live-region check.</human-check>
  </verify>
  <done>
The developer answered "approved", or every reported failure was fixed and re-confirmed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| secondary tab → shared `localStorage` (`champions-drafter:tournament`) | The origin's single durable record. Any tab can reach it; only the lock holder may write. |
| user input → `createTournament` | The phase's only new write path, and the one this plan puts behind the gate. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-15 | Elevation of privilege | `createTournament` via the config screen in a secondary tab | mitigate | Task 1 moves `inert` from `.draft-region` to the element wrapping every screen, so the landing and config screens are inside the gate. Task 2 pins it with a containment assertion on the `New tournament` button. Closes 02-SECURITY.md's step 4, which the rest of the nine-step sequence depends on. |
| T-Q-01 | Denial of service | `ReadOnlyBanner` / `LiveRegion` under a mis-scoped `inert` | mitigate | The gate is a sibling of both, never their ancestor. Task 2 asserts the live region is outside it and still carries the sentence, and that the takeover button is outside it. This is the fault 02-REVIEW.md retracted its own recommendation over. |
| T-Q-02 | Tampering | `adoptWhateverIsNewer` routing on every remote save | mitigate | Safe only because T-02-15 is closed in the same change: a secondary can no longer be composing on the config screen, so routing cannot discard work. Task 1 records that dependency in the comment so the two are never separated. |

No package-manager install in this plan, so there is no supply-chain row. `package.json` and
`package-lock.json` must be unchanged at the end.
</threat_model>

<verification>
- `npm run verify` exits 0.
- `grep -rn 'draft-region' src/ tests/` returns nothing.
- `src/app.tsx` contains exactly one `inert=` expression.
- Task 3's browser checkpoint is approved.
</verification>

<success_criteria>
- A read-only secondary tab cannot reach `createTournament` from any screen, proved by a test
  and confirmed in a browser.
- Announcements still reach the polite live region while read-only, and
  `Take over drafting here` is still operable.
- The draft screen remains exactly one viewport tall with two internally scrolling panes,
  with and without the read-only banner above it.
- Adoption routes to the draft screen, so no tab holds a document it does not render.
- T-02-15 can be re-dispositioned from `open` to `mitigate`, taking `threats_open` to 0.
</success_criteria>

<output>
Create `.planning/quick/260813-tep-wr-07-inert-shell-restructure/260813-tep-SUMMARY.md` when
done. Record: the final shell structure, the CSS rules that moved and why, which test files
were edited versus audited-and-left-alone, the new test count, and a note that
`.planning/phases/02-host-configured-draft-night/02-SECURITY.md` needs T-02-15 re-dispositioned
and `.planning/phases/02-host-configured-draft-night/02-REVIEW.md` needs WR-07 marked fixed.
</output>
