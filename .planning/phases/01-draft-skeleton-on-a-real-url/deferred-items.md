# Deferred Items — Phase 01

Out-of-scope discoveries logged during execution. Not fixed, deliberately.

## From plan 01-02 (deploy pipeline)

- **Node 20 deprecation warnings on GitHub Actions runners.** Run 30944828773 emitted:
  `Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced
  to run on Node.js 24: actions/configure-pages@v5, actions/checkout@v4,
  actions/setup-node@v4, actions/upload-artifact@v4.`
  Non-fatal — the runner already forces Node 24. Not changed because 01-02-PLAN.md pinned
  these action majors and a bump is not required for correctness. Revisit if GitHub turns
  the warning into a hard failure.

- **Actions pinned to floating major tags rather than commit SHAs.** `@v4`/`@v5`/`@v3` will
  silently pick up new releases. SHA pinning is strictly stronger against a compromised
  action release. Not applied because the plan's stated T-01-14 mitigation was
  "first-party `actions/*` only" and SHA pins were not requested.

- **Remote branch `master` is stale and is still GitHub's default branch.** Created by the
  first push before the `main` convention was settled. It sits at `80d64e3` and deploys
  nothing, since the workflow triggers on `main`. Should be deleted after the default branch
  is switched to `main`. Not done here: GitHub refuses to delete the default branch, and it
  is not a branch this executor created.

- **No `.gitattributes`.** Carried forward from 01-01. Every `git add` on Windows emits CRLF
  conversion warnings. Cosmetic; a fix would touch every file in the repo.
