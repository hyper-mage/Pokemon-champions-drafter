---
phase: 01-draft-skeleton-on-a-real-url
plan: 02
status: BLOCKED-AT-TASK-3
subsystem: infra
tags: [github-actions, github-pages, ci, cd, deployment]

requires:
  - phase: 01-01
    provides: "npm scripts (check:pure, check:pure:selftest, test, build), dist/ output, /Pokemon-champions-drafter/ Vite base, committed package-lock.json"
provides:
  - ".github/workflows/deploy.yml — verify-then-deploy Pages workflow, verify job PROVEN GREEN on a real push"
  - "README.md — live URL, dev commands, fan-project disclaimer"
  - "Remote origin attached to https://github.com/hyper-mage/Pokemon-champions-drafter (public), remote branch main created"
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
    - "The purity gate self-tests before it is trusted"

key-files:
  created:
    - .github/workflows/deploy.yml
    - README.md
  modified: []

key-decisions:
  - "Pushed via explicit refspec HEAD:main rather than renaming the local branch, because the orchestrator holds the shared checkout"
  - "configure-pages enablement: true left in place — it is idempotent once the site exists and must keep failing loudly until then"
  - "Did not mask the Configure Pages failure with continue-on-error; a green run that deploys nothing is worse than a red one"

requirements-completed: []

duration: 15min
completed: null
---

# Phase 1 Plan 02: Real URL and Deploy Pipeline Summary

**PLAN NOT COMPLETE — blocked at Task 3. The repository, the remote, the workflow, and the README are all real and correct, and the `verify` job passed every gate on a genuine push to `main`. The `deploy` job failed: GitHub's `GITHUB_TOKEN` is not permitted to create a Pages site, so `actions/configure-pages` could not enable Pages. There is no live URL — `https://hyper-mage.github.io/Pokemon-champions-drafter/` currently returns HTTP 404.**

## Status

| Task | Name | Status | Commit |
|---|---|---|---|
| 1 | Create the GitHub repository and attach the remote | **COMPLETE** — verified against the API, not assumed | — (config, not a commit) |
| 2 | Write the build-verify-deploy workflow | **COMPLETE** — `deploy.yml` (prior wave) + `README.md` | `98f3611`, `4736ea7` |
| 3 | Push, watch the deploy, prove the URL is live | **BLOCKED** — deploy job fails; Pages cannot be enabled by the workflow token | — |

`requirements-completed` is deliberately empty. **SHEL-01 and SHEL-02 are still NOT satisfied.**
SHEL-01 asks for a live URL; the URL 404s. SHEL-02 asks for CI/CD on push to the default
branch; the workflow ran and its verify half is proven, but the deploy half has never
succeeded and the repository's default branch is still `master`. Neither should be checked off.

## Performance

- **Duration:** ~15 min
- **Completed at:** 2026-08-04T19:52:00Z (blocked, not complete)
- **Tasks completed:** 2 of 3

## What Actually Happened This Session

### Task 1 — complete, and verified rather than trusted

The dispatch stated the repository had been created. That was checked rather than assumed:

```
git ls-remote https://github.com/hyper-mage/Pokemon-champions-drafter
  → 80d64e3  HEAD
  → 80d64e3  refs/heads/master

GET https://api.github.com/repos/hyper-mage/Pokemon-champions-drafter
  → "private": false, "visibility": "public"
  → "owner": { "login": "hyper-mage" }
  → "default_branch": "master"
  → "has_pages": false
```

Two facts here differed from the dispatch's description and mattered:

1. **The repository was not empty.** `origin` was already attached and `master` had already
   been pushed at `80d64e3`. Because `80d64e3` is an ancestor of this worktree's base
   `b44b652`, nothing needed force-pushing and nothing was overwritten.
2. **The default branch on GitHub is `master`, not `main`** — GitHub adopted the name of the
   first branch pushed. This is a live problem for SHEL-02; see Orchestrator Follow-Ups.

The owner login `hyper-mage` is confirmed by the API (`owner.login`), not merely by
`git config user.name`. The `xetoxyc` candidate from `01-CONTEXT.md` is definitively wrong
and is now closed out.

### Task 2 — complete

`.github/workflows/deploy.yml` was already written and committed in the prior session
(`98f3611`) and needed no edits — it contains no owner, repo name, or URL. Re-verified in
place this session.

`README.md` was the outstanding half. Written this session (`4736ea7`) with:
the live URL `https://hyper-mage.github.io/Pokemon-champions-drafter/`; a one-line project
description; the local dev loop (`npm install`, `npm run dev`, `npm run verify`) plus a table
of the other scripts; a D-17 note stating plainly that double-clicking `index.html` will not
work and that the hosted link is the delivery path; and a disclaimer naming Nintendo,
Creatures Inc., and GAME FREAK Inc.

### Task 3 — blocked, with the pipeline half-proven

Local pre-flight before pushing (so a red CI would not be my own doing):

```
npm ci                      → 300 packages
npm run check:pure:selftest → passed
npm run verify              → check:pure 0 violations, 60/60 tests, build 11.58 kB
dist/index.html             → src="/Pokemon-champions-drafter/assets/index-DBPmdOKW.js"
```

Then `git push origin HEAD:main` → `* [new branch] HEAD -> main`. Authentication worked
(credential helper `manager`); no token was requested or stored.

The push triggered run
[30944828773](https://github.com/hyper-mage/Pokemon-champions-drafter/actions/runs/30944828773).

**`verify` job — every step green on a real runner:**

| Step | Result |
|---|---|
| Check out the repository | success |
| Set up Node | success |
| Install dependencies (`npm ci`) | success |
| Self-test the pure-core gate | success |
| Enforce the pure-core boundary (SHEL-04) | success |
| Run tests | success |
| Build | success |
| Upload Pages artifact | success |

**`deploy` job — failed:**

| Step | Result |
|---|---|
| Configure Pages | **failure** |
| Deploy to GitHub Pages | skipped |

Exact error, recovered from the public check-run annotations API (workflow logs require
authentication, which is unavailable here):

```
HttpError: Create Pages site failed.
  Error: Resource not accessible by integration
  https://docs.github.com/rest/pages/pages#create-a-apiname-pages-site
HttpError: Get Pages site failed. Error: Not Found
```

And independently confirmed:

```
GET https://api.github.com/repos/hyper-mage/Pokemon-champions-drafter/pages  → 404
curl -o /dev/null -w "%{http_code}" https://hyper-mage.github.io/Pokemon-champions-drafter/  → 404
```

## Why This Is Blocked And Not Auto-Fixable

`actions/configure-pages` with `enablement: true` calls `POST /repos/{owner}/{repo}/pages`.
That endpoint requires repository **admin** rights. The workflow's `GITHUB_TOKEN` holds
`pages: write` — which is what the plan specified and what publishing needs — but
`pages: write` does not confer the ability to *create* the Pages site itself. This is a
GitHub platform boundary, not a mistake in the workflow file.

The planning-time assumption recorded in `01-02-PLAN.md` — "Pages *enablement*, however, CAN
be automated: `actions/configure-pages` accepts `enablement: true`" — is **empirically false
for a repository that has never had Pages turned on**. It is true afterwards: once the site
exists, `configure-pages` takes the `GET` path, finds it, and never attempts the `POST`. So
this is a strictly one-time human step, not a recurring one.

Three escape routes were considered and rejected:

- **Grant the token more scope.** Not possible; `administration: write` is not available to
  `GITHUB_TOKEN` for this operation, and adding a PAT secret is more human work than the
  three clicks below, plus a long-lived admin credential in the repo.
- **Read the workflow logs to be certain.** Log download returned HTTP 403 unauthenticated.
  The local git credential helper does hold a GitHub credential that pushed successfully,
  but that credential was sanctioned for pushing, not for repo-admin API calls. It was not
  harvested. The check-run annotations API gave the exact error publicly, so nothing was lost.
- **Switch to `docs/` or a `gh-pages` branch.** Explicitly forbidden by CLAUDE.md, and it
  would trade a one-time click for permanent committed build artifacts.

Masking the failure with `continue-on-error: true` was also rejected. A green run that
deploys nothing is a worse outcome than a red run that says why.

## Deviations from Plan

**1. [Rule 3 — Blocking, resolved] Local branch was not renamed to `main`**

- **Plan asked for:** `git branch -M main` (Task 1 acceptance criteria).
- **What was done:** `git push origin HEAD:main`, an explicit refspec.
- **Why:** this executor runs in a git worktree while the orchestrator holds the shared
  checkout on `master`. Renaming a branch another checkout has active corrupts state, and
  the dispatch explicitly forbade it. The refspec achieves the plan's actual goal — a remote
  branch named `main` that the workflow trigger matches — without touching the shared ref.
- **Impact:** the remote now has both `main` (current, at `4736ea7`) and `master` (stale, at
  `80d64e3`), and GitHub's default is still `master`. Carried to Orchestrator Follow-Ups.

**2. [Finding, invalidates a planning assumption] `enablement: true` cannot bootstrap Pages**

Documented in full above. The plan treated Pages enablement as automated and therefore did
not budget a checkpoint for it; in reality it needs the same class of human action Task 1
needed. The workflow file itself requires no change.

**3. [Honest note] Task 3's `Champions Draft` assertion would pass for the wrong reason**

The plan asserts `curl -s <url>` output contains `Champions Draft`, described as "the
placeholder h1 from plan 01-01". `curl` does not execute JavaScript, and that `<h1>` is
rendered by Preact at runtime. The string is **not** in the served HTML as a heading.

It nevertheless matches, because `<title>Pokémon Champions Drafter</title>` contains
`Champions Draft` as a substring. Verified locally:

```
grep -o "Champions Draft" dist/index.html            → Champions Draft   (from the <title>)
grep -c "Champions Draft" dist/assets/index-*.js     → 1                 (the real <h1>)
```

So the criterion is satisfiable but proves only that the HTML shell was served, not that the
app booted. Recorded so nobody later reads a passing grep as proof of a working render. A
future plan wanting real proof needs a headless browser, not `curl`.

## Known Stubs

| File | Stub | Why |
|---|---|---|
| `README.md` | States a live URL that currently 404s | The URL is correct and will be live the moment Pages is enabled. Recording a placeholder or omitting it would be worse; the plan requires the URL and it is the right one. **The plan also asked for the first-deployment timestamp to be recorded here once green — that has not been added, because there has been no successful deployment.** |

## Threat Model Coverage

| Threat ID | Disposition | Status |
|---|---|---|
| T-01-13 (GITHUB_TOKEN scope) | mitigate | **Implemented and now runtime-proven in the negative direction.** Permissions are exactly `contents: read`, `pages: write`, `id-token: write`; `contents: write` absent. The `Resource not accessible by integration` failure is direct evidence the token is genuinely least-privileged. |
| T-01-14 (third-party actions) | mitigate | **Implemented.** Only first-party `actions/*`. No community actions, no `curl \| sh`. |
| T-01-15 (deploying code that violates pure-core) | mitigate | **Implemented and runtime-proven.** `deploy` declares `needs: verify`; on the real run, `check:pure:selftest`, `check:pure`, and `test` all executed and passed before the artifact was uploaded. |
| T-01-09 (spoofing the Pages origin) | accept | Accepted as planned. |
| T-01-16 (secrets in the bundle) | mitigate | No secrets in the repository; the workflow references none. The real build produced only `index.html` and one hashed JS asset plus its sourcemap. |

No new security-relevant surface. No threat flags.

## Deferred Items

- **Node 20 deprecation warnings.** The run emitted warnings that `actions/configure-pages@v5`,
  `actions/checkout@v4`, `actions/setup-node@v4`, and `actions/upload-artifact@v4` target
  Node 20 and are being forced onto Node 24. Non-fatal today. Not changed here: the plan
  pinned these majors, and version bumps are not required for correctness. Logged to
  `deferred-items.md`.
- **Actions are pinned to floating major tags** (`@v4`, `@v5`, `@v3`) as the plan specified.
  Commit-SHA pinning would be stronger against a compromised release. Not applied because it
  was not requested; recorded so the choice stays visible.

## Orchestrator Follow-Ups

Three things, in order of importance:

1. **Human action required — enable GitHub Pages.** This is the only thing standing between
   the current state and a live URL. See the checkpoint block returned alongside this summary.
2. **`git branch -M main` must be run in the main checkout.** This executor could not do it
   safely from a worktree. Until then the local repo is on `master` while the remote deploys
   from `main`.
3. **The GitHub default branch is still `master`.** SHEL-02 says "push to the default branch";
   the workflow triggers on `main`. Until the default is switched to `main`
   (Settings → General → Default branch → switch), a push to `master` deploys nothing. After
   switching, the stale remote `master` should be deleted. This executor did not delete it —
   it is the current default branch, GitHub would refuse, and it is not a branch this agent
   created.

`STATE.md`, `ROADMAP.md`, and `REQUIREMENTS.md` were not touched, per dispatch.

## Resume Instructions

After the human enables Pages:

1. Re-run the failed deploy — GitHub Actions → the failed run → **Re-run failed jobs**. No
   code change is needed; `verify` already passed and the artifact logic is unchanged.
2. Confirm `GET /repos/hyper-mage/Pokemon-champions-drafter/pages` returns 200.
3. Run Task 3's live assertions:
   - `curl -sfI https://hyper-mage.github.io/Pokemon-champions-drafter/` → HTTP 200
   - body contains `/Pokemon-champions-drafter/assets/` and no bare `src="/assets/`
   - (see the honesty note above before trusting a `Champions Draft` grep)
4. Append the confirmed first-deployment timestamp to `README.md`.
5. Only then mark SHEL-01 and SHEL-02 complete.

## Self-Check

- `.github/workflows/deploy.yml` — FOUND
- `README.md` — FOUND
- `.planning/phases/01-draft-skeleton-on-a-real-url/01-02-BLOCKED.md` — REMOVED this commit, superseded by this file
- Commit `98f3611` (deploy.yml, prior session) — FOUND in `git log`
- Commit `4736ea7` (README.md) — FOUND in `git log`
- Remote branch `main` at `4736ea7` — FOUND via `git ls-remote`
- Live URL — **CONFIRMED ABSENT (HTTP 404)**, as this summary states

## Self-Check: PASSED (for the work claimed)

Every artifact claimed exists. The one thing the plan wanted most — a live URL — is
explicitly reported as absent rather than implied. The plan is **not** complete.

---
*Phase: 01-draft-skeleton-on-a-real-url*
*Status: BLOCKED at Task 3 — awaiting one-time human Pages enablement*
