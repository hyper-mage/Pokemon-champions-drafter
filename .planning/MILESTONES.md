# Milestones

## v1.0 Full Draft and Tournament (Shipped: 2026-09-02)

**Phases completed:** 5 phases, 62 plans, 118 tasks
**Timeline:** 2026-08-03 → 2026-09-02 (30 days, 584 commits)
**Verify gate at close:** 81 test files, 2759 tests, 0 failures; typecheck clean; build clean; service worker manifest 322 URLs / 1090 kB
**Code:** 40,662 LOC under `src/`, 52,942 LOC under `tests/`
**Requirements:** 92 of 94 Complete, 1 Partial, 1 Pending (see Known Gaps)

**Delivered:** A group of friends opens one public URL and runs an entire Pokémon Champions
draft tournament inside it — host config, three ban rituals, a compiled round schedule,
priority cards, swaps, a seeded bracket, recorded results, and exports to Showdown and
pokebase — with no install, no account, no server, and no spreadsheet.

**Key accomplishments:**

- **The delivery model, proven end to end in Phase 1.** A deployed GitHub Pages site running
  offline behind a hand-written 75-line cache-first service worker, on a committed Champions
  roster snapshot with forme/Mega/cosmetic/battle-only classification settled, over an
  append-only action log with a pure reducer and undo, autosaving through an abrupt browser
  close — and a species-only paste verified against the real `pokemon-showdown@0.11.11` parser
  rather than assumed.

- **A draft night 4–8 friends actually run on one shared screen (Phase 2).** Host config with
  named players, pool auto-sizing over a seeded two-stage draw, a host banlist that is one list
  behind two surfaces rather than two that agree, the whole players × rounds board beside the
  pool, and a feasibility gate that names the field blocking `Start draft` instead of reporting
  all-clear on an unsatisfiable tournament.

- **The project's strongest idea, installed (Phase 3).** Composition requirements compile into
  a typed round schedule through a pure, total `compile()`; the schedule is materialized into
  the log so it survives export and re-import including a host reordering the compiler would
  never emit; priority cards bid for turn order over that visible schedule; and swaps can only
  take what the target slot's type allows.

- **Hidden information on a shared screen (Phase 4).** Three ban rituals — host banlist, snake,
  and blind pass-the-device. The blind arm is structurally incapable of leaking: its component's
  props carry no species names at all, so a browser Back, an alt-tab, or a tap on `Hide these
  bans` all land in the same place with nothing kept.

- **The night runs past the draft (Phase 5).** Round robin producing a table that names the link
  deciding each row, a host override recorded as an act with its players' names on it, a seeded
  top-N cut that previews its own byes, a single-elim bracket whose byes fall out of the seed
  recursion rather than out of placement code, and match corrections that state how many later
  results they will take with them before the host presses anything.

- **The architecture held its own rules.** `npm run check:pure`, `check:pure:selftest` and
  `check:nohtml` fail CI on a purity or `innerHTML` violation; `tests/core/**` runs with zero
  mocks as the observable payoff; a v1→v5 migration chain matches `SCHEMA_VERSION = 5`; and the
  roster-refresh path ships two real regulations (M-A, 213 entries; M-B, 235) so an archived
  tournament stays readable after the roster rotates.

**Known Gaps:**

- **BAN-07 — Partial by owner decision D-19.** The config field `duplicateBanPolicy` is written
  by `ConfigScreen.tsx`, validated at `import-guard.ts`, and migrated by `migrate.ts`, but read
  by no reducer. `bothApply` is hardcoded in `reduce.ts` `BANS_PLACED`; the `Re-ban` arm ships
  disabled in the UI. Documented as deliberate at `model.ts:330-343`.
- **EXPO-04 — Pending; requirement-text defect, not a code gap.** The literal text *"imports into
  play.pokemonshowdown.com and passes its team validator"* is unsatisfiable by any species-only
  paste — Showdown's validator reports four inherent problems per Pokémon (no ability, no moves,
  0 stat points) regardless of implementation correctness. The achievable, discriminating signal
  (no `transforms in-battle` error) is verified programmatically in `docs/export-verification.md`.
  Recommended action next milestone is a reword, not a closure phase.

**Known deferred items at close: 1** (see STATE.md → Deferred Items). Phase 3's card-mechanic
playtest with real players — D-18 rotation advantage, D-23 low-plays-first, struck-through card
comprehension, pick-order findability — deferred to beta by explicit host decision 2026-08-19,
re-confirmed 2026-08-20, to be run once the whole tool is complete rather than at the end of
Phase 3. This is the sole item behind Phase 3's `human_needed` verification status.

**Open tech debt carried forward:** 24 warnings and 16 info findings across Phases 1–3, all
disclosed rather than discovered at close; Phases 4 and 5 carry none. Notable: `WR-09` (heartbeat
during the claim window is uncounted, allowing a narrow dual-ownership write window), `WR-10` (a
bfcache-restored secondary tab loses its stale watch permanently), and two tests flaky under
full-suite parallel load (`tests/build/sw-manifest.test.ts`, `tests/ui/ban-list.test.tsx` —
neither failed in the audit-time run). Screen-reader verification was DESCOPED by host decision
2026-08-20.

**Archived:**

- `.planning/milestones/v1.0-ROADMAP.md`
- `.planning/milestones/v1.0-REQUIREMENTS.md`
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

---
