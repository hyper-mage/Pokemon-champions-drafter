---
phase: 01-draft-skeleton-on-a-real-url
plan: 01
subsystem: infra
tags: [vite, typescript, preact, preact-signals, vitest, github-pages, ci]
status: in-progress
---

# Phase 1 Plan 01: Project Scaffold and Pure-Core Gate Summary

**IN PROGRESS — Task 1 recorded, Tasks 2 and 3 pending.**

## Package Legitimacy Verdict (Task 1)

The plan's Task 1 was a `gate="blocking-human"` checkpoint that had to clear before
`npm install` ran for the first time. No `RESEARCH.md` Package Legitimacy Audit table
exists for this project, so all seven packages were treated as `[ASSUMED]` under the
fallback policy.

**Verdict: APPROVED by the user. No package was flagged as suspicious. Installation proceeds.**

| Package | Pin | Version exists | Resolved repository | Weekly downloads |
|---|---|---|---|---|
| `preact` | `10.29.8` | yes | `git+https://github.com/preactjs/preact.git` | 28,243,525 |
| `@preact/signals` | `2.10.1` | yes | `https://github.com/preactjs/signals` | 1,831,983 |
| `vite` | `8.2.0` | yes | `git+https://github.com/vitejs/vite.git` | 161,655,606 |
| `@preact/preset-vite` | `2.10.6` | yes | `git+https://github.com/preactjs/preset-vite.git` | 485,935 |
| `typescript` | `~5.9` (5.9.3 latest patch) | yes | `git+https://github.com/microsoft/TypeScript.git` | 260,894,933 |
| `vitest` | unpinned (4.1.10 current) | yes | `git+https://github.com/vitest-dev/vitest.git` | 88,317,116 |
| `pokemon-showdown` | `0.11.11` | yes | `git+https://github.com/smogon/pokemon-showdown.git` | 1,006 |

Every repository URL resolves to the expected canonical GitHub org. No name-similar
substitutions or typosquat candidates were found.

### Honest caveats about how this verification was performed

- **Verification was performed against the npm registry API by the orchestrator, not by
  a human opening npmjs.com page by page.** The plan's `how-to-verify` text asked for the
  latter; what actually happened was a programmatic registry query whose results were
  presented to the user, who approved on that basis. This is recorded plainly rather than
  described as a manual page-by-page human audit, because it was not one.
- **`pokemon-showdown` has 1,006 weekly downloads** — three to five orders of magnitude
  below every other package in the table. That is expected for a game server distributed
  primarily as a repository rather than as a library dependency, but the low number means
  the download signal carries no weight here. Its legitimacy rests entirely on the
  `smogon/pokemon-showdown` repository match. It is a devDependency only, is installed in
  plan 01-03 rather than this one, and is never bundled.
- **`typescript`'s `dist-tags.latest` is `7.0.2`** — the native Go rewrite. This confirms
  the CLAUDE.md research note and is precisely why the plan pins `~5.9`. TypeScript must
  not be floated to `latest` in this project.

## Task Commits

1. **Task 1: Package legitimacy verification** — (this commit) (docs)
