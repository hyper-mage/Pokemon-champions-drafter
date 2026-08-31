# Deferred items — phase 05

Out-of-scope discoveries logged rather than fixed, per the executor's scope boundary.

## `tests/build/sw-manifest.test.ts` — "sorts the manifest so the output is reproducible" is flaky

Found during 05-10. The case builds a `dist/` fixture on disk and times out at vitest's
5000ms default under parallel load on Windows; run on its own it finishes in ~3s and the
whole file passes. Three consecutive `npm run verify` runs during 05-10 exited 0 and one
exited 1 on this single case.

Not caused by 05-10 — that plan touches no build script, and `git diff --stat` over
`scripts/` is empty for it. The fix is a per-case `testTimeout` on the filesystem-heavy
cases in that file, or moving the fixture build into `beforeAll`. It belongs to whoever
owns the build tests, not to a UI plan.
