# Phase 4: Blind and Snake Bans - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-20
**Phase:** 4-blind-and-snake-bans
**Areas discussed:** Ban stage placement, Blind secrecy vs. the log, Bans-per-player + order source, Where revealed bans land, BAN-06 back-button guard, Duplicate-policy mechanics, RULE-08 post-reveal failure

**Areas offered but not selected:** The interstitial contract (handoff sequence, review-before-lock, panic-hide) — recorded as Claude's discretion.

---

## Ban stage placement

| Option | Description | Selected |
|--------|-------------|----------|
| Fourth screen | `Screen` union gains `{ name: 'bans' }`; doc created with empty log; pool drawn after reveal | |
| New DraftPhase inside draft | `selectPhase` gains `'bans'`; one screen, but every pool-reading component needs a "not yet" branch | |
| Pre-document flow on config | No doc until bans finish; smallest change, but a refresh mid-ban loses every submission | |
| **Owner's own formulation** | Config offers the mode; `hostBanlist` default behaves as it already does; player-ban modes go to a draft-style stage before the draft | ✓ |

**User's choice:** Free text — "the host is given an option in the initial config. If bans are allowed, then another set of options are opened that the host must pick with a default being host picks (like it was already) and that opens as option 1 (or as it was already), but if bans are made by players then it goes to option 2 in draft style but before the draft begins."
**Notes:** Reflected back and confirmed: `hostBanlist` unchanged, blind/snake render in the draft-style shell sequenced ahead of the draft, showing the full roster rather than a pool.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — one seam for all modes | Every mode routes config → ban stage → draft; one authority on pool build | |
| No — hostBanlist keeps today's path | Only blind/snake take the new route; zero regression on the verified Phase 2 path | ✓ |

**User's choice:** No — hostBanlist keeps today's path.

| Option | Description | Selected |
|--------|-------------|----------|
| Full undo, same stack | A ban is an action like any other; undo pops it | ✓ |
| Abandon-only during blind | Snake undoes normally; blind submissions not individually undoable pre-reveal | |
| No undo in the ban stage | Finish it or abandon the whole tournament | |

**User's choice:** Full undo, same stack.
**Notes:** Load-bearing rationale, and the reason the whole phase is shaped as it is — "as it is now, the host is entering all of this most of the time unless the users literally hot seat. The host will be grabbing banned mons from users outside of the program and then enter them in. Option 2 makes more sense for a new milestone where users are all inside a la fantasy football style. The host can accidentally pick the wrong mon so full undo is mandatory."

### Follow-up prompted by the host-as-scribe reframe

| Option | Description | Selected |
|--------|-------------|----------|
| Both, host-scribe default | One shielded flow; whoever holds the device types; no identity handshake | ✓ |
| Host-scribe only | No pass-the-device handshake at all; would be a documented narrowing of BAN-05 | |
| True pass-the-device only | Literal "Pass to Sam / I'm Sam / Lock and pass"; faithful but rare in practice | |

**User's choice:** Both, host-scribe default.

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing until the reveal | Progress only, no species names anywhere | ✓ |
| Host sees everything as scribe | Running list for typo checking, but on the shared screen | |
| Visible only inside the shield | Current player's own entries listed, gone when the shield drops | |

**User's choice:** Nothing until the reveal.

---

## Blind secrecy vs. the log

> Stated before asking: full undo (above) forces submissions into the log, since undo re-folds the log and an in-memory holding pen cannot be undone. The question was the *shape*, not the location.

| Option | Description | Selected |
|--------|-------------|----------|
| Plaintext | `bans/submitted` carries ids in the clear; the shield is the defence, not the file | ✓ |
| Obfuscated at rest | Encoded ids; speed bump only, and a second representation of a ban id | |
| Commit-then-reveal | Hash then plaintext; needs async `crypto.subtle`, and solves a problem host-as-scribe makes impossible | |

**User's choice:** Plaintext.

| Option | Description | Selected |
|--------|-------------|----------|
| Host triggers the reveal | Last submission lands on "N of N entered — Reveal bans", showing nothing | ✓ |
| Automatic on last submission | One fewer tap, but the last player sees the reveal alone | |

**User's choice:** Host triggers it.

| Option | Description | Selected |
|--------|-------------|----------|
| Autosave yes, checkpoint no | localStorage keeps running; the PERS-06 JSON checkpoint waits for the reveal | ✓ |
| Both, unchanged | Consistent with every other stage, but offers the host a file of unrevealed bans | |
| Neither until reveal | Strongest secrecy; contradicts PERS-01's "survives refresh and browser close" | |

**User's choice:** Autosave yes, checkpoint no.

---

## Bans-per-player + order source

| Option | Description | Selected |
|--------|-------------|----------|
| Host sets it at config | New `bansPerPlayer` field, schema 3→4; feasibility gate reads it | ✓ |
| Fixed at one each | No new field, no schema bump, single-pass snake | |
| Host sets it, derived default | Pre-filled suggestion; rejected shape per Phase 3 D-30 (second authority) | |

**User's choice:** Host sets it at config.

| Option | Description | Selected |
|--------|-------------|----------|
| Move `draft/started` before bans | DRFT-16's randomizer stays the single turn-order source for the night | ✓ |
| Ban stage carries its own order | Zero disturbance to shipped code, but two orders in one tournament | |
| Host arranges it manually | Reopens the thing DRFT-16 was added to close | |

**User's choice:** Move `draft/started` before bans.

| Option | Description | Selected |
|--------|-------------|----------|
| True serpentine | 1→2→3→4 then 4→3→2→1, repeating | ✓ |
| Straight rotation every pass | Simpler, but stacks first-mover advantage — and it's called "snake" | |
| One pass, N bans at once | Fewer handoffs, but strictly unfair with previous bans visible | |

**User's choice:** True serpentine.

---

## Where revealed bans land

| Option | Description | Selected |
|--------|-------------|----------|
| Attributed in the log | `{ playerId, monIds }[]`; feeds the reveal screen and Phase 5's recap | ✓ |
| Flat id list only | Smaller action, but the recap can never reconstruct who banned what | |
| Attributed only pre-reveal | Two representations of one fact in one log | |

**User's choice:** Attributed in the log.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, both apply | Host banlist coexists with player bans in every mode | ✓ |
| No, modes are exclusive | Cleaner story, but `megaFormeBans` puts a host ban surface on screen anyway | |

**User's choice:** Yes, both apply.

| Option | Description | Selected |
|--------|-------------|----------|
| Species only | Matches Phase 2 D-11; reuses the ban-mode `PoolGrid` as it ships | ✓ |
| Species and Mega formes | More expressive, but two target types and two predicates in the draw | |

**User's choice:** Species only.

---

## BAN-06 back-button guard

> Stated before asking: the app has no router — `Screen` is `useState` and nothing touches `history` — so "back" means leaving the page, and the return path is a bfcache restore.

| Option | Description | Selected |
|--------|-------------|----------|
| `pageshow` + `persisted` | Mirrors the working handler at `tab-lock.ts:624-636` | ✓ |
| Push history + `popstate` | Nicer in-app back, but introduces history management the app deliberately lacks | |
| Both, plus `visibilitychange` | Widest coverage; three interacting mechanisms is where the silent bug lives | |

**User's choice:** `pageshow` + persisted.

| Option | Description | Selected |
|--------|-------------|----------|
| Discard, return to locked | Mid-entry state dies with the component; nothing half-private survives | ✓ |
| Preserve behind the lock | Kinder to a stray back-press, but needs persistent private state | |

**User's choice:** Discard, return to locked.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, lock on hidden | Covers the host alt-tabbing to Discord and back | ✓ |
| No, bfcache restore only | Smallest surface, but the same leak by a different door | |

**User's choice:** Yes, lock on hidden.
**Notes:** Selected despite the first answer having rejected the "both plus `visibilitychange`" bundle — the distinction is that this adds one targeted handler with the same target state, not a third competing back-navigation mechanism.

---

## Duplicate-policy mechanics (BAN-07)

> Stated before asking: in snake mode previous bans are visible, so a collision is impossible by construction. The policy is blind-mode-only.

| Option | Description | Selected |
|--------|-------------|----------|
| All colliders re-ban blind | Symmetric treatment; reuses the entry flow | |
| Later in ban order loses | Makes a simultaneous mechanic depend on turn order | |
| Host resolves it | No mechanism to build, but hands a fairness call to a person with no rule | |
| **No re-ban at all** | Both bans recorded and attributed; species banned once; one ban spent for nothing | ✓ |

**User's choice:** Free text — "no re-bans. the list will show that x player banned mon as well as y player banned mon."
**Notes:** Makes the loop-termination question moot; user confirmed "no re-ban" to it directly.

### Follow-up — how to record the dropped branch

| Option | Description | Selected |
|--------|-------------|----------|
| Ship the control, disable re-ban | The Phase 2 D-12 move: `Re-ban — not yet available`, rendered disabled | ✓ |
| No control at all | Smallest surface, but adding re-ban later needs a new field plus a schema bump | |
| Build re-ban after all | Fully satisfies BAN-07; reverses the decision above | |

**User's choice:** Ship the control, disable re-ban.
**Notes:** Raised explicitly as a narrowing of BAN-07 and ROADMAP success criterion 4 before asking. Owner chose to proceed. BAN-07 must be recorded as partially satisfied.

| Option | Description | Selected |
|--------|-------------|----------|
| Named explicitly at reveal | "Sam and Ana both banned Garchomp", with the consequence stated | ✓ |
| Silently absorbed | Fewer bans than cast, with no explanation — reads as a bug | |

**User's choice:** Named explicitly.

---

## RULE-08 post-reveal failure

> Stated before asking: with `bansPerPlayer` in config the gate already knows the worst-case ban count, and a collision *wastes* a ban rather than removing an extra species — so post-reveal pool size is always ≥ the config-time worst case. Only the Mega-capability distribution is unpredictable.

| Option | Description | Selected |
|--------|-------------|----------|
| Fully pessimistic | Assume every player ban hits a Mega-capable species; rarely binding at 4–8 players | ✓ |
| Optimistic, RULE-08 is the real gate | Never over-blocks, but the group can complete the ritual and then be told no | |
| Warn at config, block at reveal | A warning the host can click past is a warning the host will click past | |

**User's choice:** Fully pessimistic.

| Option | Description | Selected |
|--------|-------------|----------|
| Block; abandon back to config | Architecturally honest — `TournamentConfig` never changes after creation | ✓ |
| Host voids specific bans | Salvages the session, but publicly overrules a named player | |
| Allow a config amendment | Most forgiving; breaks stated immutability and reaches migration, guard, compiler | |

**User's choice:** Block; abandon back to config.

| Option | Description | Selected |
|--------|-------------|----------|
| Separate "Start draft" tap | The group reads the reveal before the screen changes; nothing to un-draw | ✓ |
| Draw at the reveal | One fewer tap, but a failed RULE-08 check has to un-draw a pool | |

**User's choice:** Separate "Start draft" tap.

---

## Claude's Discretion

- The interstitial's exact contract — offered as a gray area, not selected for discussion.
- How snake mode displays previous bans on the shared screen.
- Whether the live region can leak a ban name to a screen reader during blind entry.
- Whether the reveal itself is undoable.
- Three-metre legibility (DRFT-14) for every new surface.
- The schema 3 → 4 migration details.

## Deferred Ideas

- **Everyone on their own device, fantasy-football style.** Raised by the owner while explaining
  the undo decision, and explicitly assigned to a new milestone. Would flip the host-as-scribe
  assumption this phase rests on.
- **The re-ban duplicate policy.** Descoped, with the config control shipped disabled so a later
  milestone enables it rather than adding it.
