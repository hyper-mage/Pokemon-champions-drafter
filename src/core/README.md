# `src/core/` — the pure core

Everything under this directory is a pure function of its arguments. Nothing here may
touch the DOM, the clock, randomness, the network, or storage; nothing here may import
from `src/adapters/` or `src/ui/`; and nothing here may import a renderer, including
`preact` and `@preact/signals`, because the core must stay renderer-agnostic. Ambient
values — timestamps, generated ids, random seeds, fetched bytes — are captured at the
impure edge and stamped onto the action before the reducer ever sees them, which is what
makes the tournament document replayable, undoable, testable without mocks, and ready for
a future sync layer as an integration rather than a rewrite.

This rule is not advisory. `npm run check:pure` fails the build on any violation, and
`npm run check:pure:selftest` proves the checker itself both catches a real violation and
does not false-positive on comments or string literals. See `scripts/check-pure-core.mjs`.
