---
phase: 01-draft-skeleton-on-a-real-url
plan: 02
status: BLOCKED-AT-CHECKPOINT
subsystem: infra
tags: [github-actions, github-pages, ci, cd, deployment]

requires:
  - phase: 01-01
    provides: "npm scripts (check:pure, check:pure:selftest, test, build), dist/ output, /Pokemon-champions-drafter/ Vite base, committed package-lock.json"
provides:
  - ".github/workflows/deploy.yml — verify-then-deploy Pages workflow (written, never executed)"
affects: [01-04, 01-05, 01-11]

tech-stack:
  added:
    - "actions/checkout@v4"
    - "actions/setup-node@v4"
    - "actions/upload-pages-artifact@v3"
    - "actions/configure-pages@v5"
    - "actions/deploy-pages@v4"
  patterns:
    - "Deploy job gated behind a verify job via needs:, so a red gate cannot reach the live URL"
    - "Pages enablement automated via actions/configure-pages enablement: true rather than a manual Settings click"
    - "The purity gate self-tests before it is trusted"

key-files:
  created:
    - .github/workflows/deploy.yml
  modified: []

key-decisions:
  - "Individual npm run steps in CI rather than the single npm run verify, so a failure names its own gate in the Actions log"
  - "npm ci, never npm ci --omit=dev — vite.config.ts imports defineConfig from vitest/config"
  - "First-party actions/* only, pinned to major version tags as the plan specified"
  - "concurrency cancel-in-progress: false — cancelling a half-finished Pages deploy risks a partial artifact on the CDN"

patterns-established:
  - "Pattern: CI runs check:pure:selftest before check:pure, so a silently-broken gate fails loudly instead of passing everything"

requirements-completed: []

duration: 12min
completed: null
---

# Phase 1 Plan 02: Real URL and Deploy Pipeline Summary

**PLAN NOT COMPLETE — blocked at Task 1, a `gate="blocking"` human checkpoint. The deploy workflow is written, YAML-validated, and committed; the GitHub repository it deploys to does not exist yet, so nothing has been pushed, no workflow run exists, and there is no live URL.**

## Status: BLOCKED

| Task | Name | Status | Commit |
|---|---|---|---|
| 1 | Create the GitHub repository and attach the remote | **BLOCKED — human checkpoint** | — |
| 2 | Write the build-verify-deploy workflow | **PARTIAL** — `deploy.yml` done, `README.md` blocked on Task 1 | `98f3611` |
| 3 | Push, watch the deploy, prove the URL is live | **NOT STARTED** — depends on Tasks 1 and 2 | — |

`requirements-completed` is deliberately empty. **SHEL-01 and SHEL-02 are NOT satisfied.**
SHEL-02 asks for CI/CD from GitHub Actions on push to the default branch; a workflow file
that has never run on a repository that does not exist proves nothing. SHEL-01 asks for a
live URL; there is none. Neither requirement should be checked off from this summary.

## Performance

- **Duration:** 12 min (blocked, not complete)
- **Started:** 2026-08-04T18:45:07Z
- **Blocked at:** 2026-08-04T18:56:45Z
- **Tasks completed:** 1 of 3 (plus half of Task 2)
- **Files created:** 1 (plus this summary)

## What Was Actually Built

`.github/workflows/deploy.yml` — 86 lines, two jobs.

**`verify` job (ubuntu-latest):**

| Step | Command / action |
|---|---|
| Check out | `actions/checkout@v4` |
| Set up Node | `actions/setup-node@v4`, `node-version: '24'`, `cache: npm` |
| Install | `npm ci` |
| Self-test the gate | `npm run check:pure:selftest` |
| Enforce purity (SHEL-04) | `npm run check:pure` |
| Test | `npm run test` |
| Build | `npm run build` (typechecks both tsconfigs, then `vite build`) |
| Upload | `actions/upload-pages-artifact@v3`, `path: dist` |

**`deploy` job:** `needs: verify`, `environment: github-pages`,
`actions/configure-pages@v5` with `enablement: true`, then `actions/deploy-pages@v4`.

Trigger is `push: branches: [main]` plus `workflow_dispatch`. Concurrency group `pages`
with `cancel-in-progress: false`. Top-level permissions are exactly
`contents: read`, `pages: write`, `id-token: write`.

## Verification Evidence

The workflow was validated as far as it can be without a repository to run it on.

```
python -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"  → YAML OK
  top-level keys: name, on, concurrency, permissions, jobs
  jobs: verify, deploy
  deploy.needs: verify
  permissions: {contents: read, pages: write, id-token: write}
  verify step order: checkout → setup-node → npm ci → check:pure:selftest
                   → check:pure → test → build → upload-pages-artifact
```

Plan acceptance greps against `.github/workflows/deploy.yml`:

| Assertion | Result |
|---|---|
| contains `actions/configure-pages` | pass |
| contains `enablement: true` | pass |
| contains `actions/upload-pages-artifact` | pass |
| contains `actions/deploy-pages` | pass |
| contains `npm run check:pure` | pass |
| contains `npm run test` | pass |
| contains `pages: write` | pass |
| contains `id-token: write` | pass |
| contains `branches: [main]` | pass |
| does NOT contain `contents: write` | pass (0 matches) |
| `check:pure` and `test` both before `build` | pass (step order above) |

**Not verified, and cannot be until the checkpoint clears:** that the workflow actually
runs green, that `configure-pages` enablement succeeds against a real repository, that
the Pages artifact deploys, and that the live URL returns 200 with the correct
`/Pokemon-champions-drafter/assets/` prefix. Task 3 exists precisely to prove those, and
Task 3 has not run. Nothing in this summary should be read as evidence that the pipeline
works — only that it is syntactically valid and structurally correct.

## Why Task 1 Is Genuinely Blocked

Re-verified in this worktree rather than trusted from the plan text:

```
git remote -v        → (empty; no remote configured)
command -v gh        → gh NOT installed
```

There is no `gh` CLI and no API token, so there is no credentialed path to create a
GitHub repository. This is the rare genuine `checkpoint:human-action`. Per the checkpoint
protocol, human-action gates stop even under auto-advance — and here it is not a policy
choice but a physical one: no credential exists.

**The owner login is also not inferable, and guessing it would be actively harmful.**
Two conflicting candidates are present in the repository:

- `git config user.name` and the commit history author → **`hyper-mage`**
- `01-CONTEXT.md` line 110 cites the author's own reference site as
  `https://xetoxyc.github.io/gothic-remake-lockpicker/` → **`xetoxyc`**

Writing the wrong one into README.md would produce a URL that satisfies the plan's
`grep`-based verify while 404ing for every human who clicks it — the exact class of
failure Pitfall 2(b) warns about. The owner login must come from the human.

## Deviations from Plan

**1. [Sequencing] Task 2's workflow half executed before Task 1 cleared**

- **What:** The plan orders Task 1 (repo creation) before Task 2 (workflow + README).
  Task 2's workflow half was executed first.
- **Why:** `.github/workflows/deploy.yml` contains no repository name, no owner login,
  and no URL. Its content is fully determined by the plan text and is invariant to every
  possible answer the human gives at the checkpoint. Writing it early is not guessing
  past the gate — it cannot be invalidated by the gate's outcome. Returning with zero
  commits would have discarded work that will be needed verbatim regardless.
- **What was NOT done early:** `README.md`. Its live URL depends on the owner login, so
  it was left entirely unwritten rather than stubbed with a placeholder. A placeholder
  owner would have satisfied the plan's automated grep while being wrong.
- **Impact:** None on correctness. The resuming agent picks up at Task 1 with the
  workflow already in place.

**2. [Decision, deviating from a carry-forward note] CI runs individual npm scripts, not `npm run verify`**

- **Carry-forward from 01-01 said:** "Prefer `npm run verify` in CI."
- **What was done instead:** separate `check:pure:selftest`, `check:pure`, `test`, and
  `build` steps, matching the plan's explicit `<action>` step list.
- **Why:** three reasons, in order of weight. (a) The plan's acceptance criteria require
  the literal string `npm run check:pure` in the verify job — `npm run verify` would not
  contain it. (b) The plan's step list is a strict superset of `verify`: it adds
  `check:pure:selftest`, which `verify` does not run, and that step is the one that
  proves the SHEL-04 gate has not silently stopped detecting anything. (c) Separate steps
  make the Actions log name its own failure; a single `verify` step reports only that
  "verify" failed.
- **Net effect:** the deploy is gated on strictly more than the carry-forward note asked
  for, which is what that note was actually after.

**3. [Note, not a change] `npm ci` without `--omit=dev`, as carried forward**

01-01 flagged that `vite.config.ts` imports `defineConfig` from `vitest/config`, a
devDependency. Confirmed by reading `vite.config.ts` line 2 in this worktree. The
workflow uses plain `npm ci` and carries an inline comment explaining why, so a future
"optimisation" to `--omit=dev` has to argue with the comment first.

## Known Stubs

| File | Stub | Why |
|---|---|---|
| `README.md` | **Does not exist** | Blocked on the owner login from Task 1. Deliberately not stubbed — a placeholder URL would pass the plan's grep and fail every human. |

## Threat Model Coverage

| Threat ID | Disposition | Status |
|---|---|---|
| T-01-13 (GITHUB_TOKEN scope) | mitigate | **Implemented, unproven at runtime.** Top-level permissions are `contents: read`, `pages: write`, `id-token: write`. Negative assertion `contents: write` → 0 matches. |
| T-01-14 (third-party actions) | mitigate | **Implemented.** Only `actions/checkout`, `actions/setup-node`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`. No community actions, no `curl \| sh`. |
| T-01-15 (deploying code that violates pure-core) | mitigate | **Implemented, unproven at runtime.** `deploy` declares `needs: verify`; verify runs selftest, check:pure, and test before the artifact is uploaded. |
| T-01-09 (spoofing the Pages origin) | accept | Accepted as planned. |
| T-01-16 (secrets in the bundle) | mitigate | No secrets exist in the repository and the workflow references none. Not yet observable in a real build. |

No new security-relevant surface beyond the register. No threat flags.

### Hardening not applied

Actions are pinned to floating major-version tags (`@v4`, `@v5`, `@v3`), as the plan
specified. Commit-SHA pinning would be strictly stronger against a compromised action
release. Not applied because the plan's stated T-01-14 mitigation is "first-party
`actions/*` only" and SHA pins were not requested. Recorded here so the choice is
visible rather than silently inherited.

## Orchestrator Follow-Ups

- **Do NOT mark SHEL-01 or SHEL-02 complete.** `requirements-completed` is empty on
  purpose. Both need Task 3's live-URL evidence.
- **Do NOT count this plan as complete** in ROADMAP progress. It is blocked at Task 1.
- `STATE.md` and `ROADMAP.md` were not touched, per dispatch.
- `package.json` and all 01-03-owned paths were not touched. This plan needed no
  package.json change.

## Resume Instructions

A resuming agent needs, from the human:

1. The GitHub **owner login**, and
2. Confirmation the public repo `Pokemon-champions-drafter` exists (exact name — the
   Vite `base` is hard-wired to `/Pokemon-champions-drafter/`).

Then, in order:

1. `git remote add origin <url>` and `git branch -M main` (Task 1 remainder).
2. Write `README.md` (Task 2 remainder): live URL
   `https://{owner}.github.io/Pokemon-champions-drafter/`, one-line project description,
   local dev commands (`npm install`, `npm run dev`, `npm run verify`), a fan-project
   disclaimer naming Nintendo / Creatures / GAME FREAK, and a D-17 note that
   double-clicking `index.html` is not the delivery path.
3. Push to `main`, then Task 3: poll the URL for HTTP 200, assert the body contains
   `Champions Draft`, and assert asset URLs carry the `/Pokemon-champions-drafter/`
   prefix and never a bare `/assets/`. Record the confirmed URL in README.md.

The workflow file needs no further edits — it is owner- and repo-name-agnostic.

## Self-Check

- `.github/workflows/deploy.yml` — FOUND
- Commit `98f3611` — FOUND in `git log`
- `README.md` — INTENTIONALLY ABSENT (blocked; see Known Stubs)

## Self-Check: PASSED (for the work claimed)

Every artifact this summary claims to have created exists, and the one it says is missing
is missing on purpose. The plan as a whole is **not** complete.

---
*Phase: 01-draft-skeleton-on-a-real-url*
*Status: BLOCKED at Task 1 — awaiting human repository creation*
