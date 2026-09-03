---
id: SEED-001
status: dormant
planted: 2026-09-02
planted_during: v1.0 complete, pre-v1.1
trigger_when: any milestone considering multiplayer, multi-device, sync, or revisiting the "Real-time multiplayer across devices" Out of Scope entry
scope: large — one new deployed component, a sequencer change, and an authority model
---

# SEED-001: Players join the host's draft from their own devices

Fantasy-football shape: the host's screen stays the shared draft board everyone watches, and
each player also has the draft open on their own phone or laptop. Still no accounts, still no
install, still costs nobody anything.

## Why This Matters

**The delivery premise is the product.** Whatever this becomes, it has to preserve the thing that
already works: someone sends a link, everyone opens it, nobody signs up, nobody downloads, nobody
pays. That is the constraint, not the feature.

**It makes one thing genuinely better, not just more convenient.** Blind bans were Phase 4's
hardest UX problem — `BAN-05` and `BAN-06` exist entirely because everyone can see one screen, so
secrecy had to be built out of a full-screen pass-the-device interstitial that a back button
cannot resurrect. On personal devices, a blind ban is just private. The hard problem stops being a
problem. That is the strongest argument here; "people don't have to pass a laptop around" is the
weaker one.

**The architecture was built for exactly this and has not been spent.** `CLAUDE.md` states the
seam outright: *"adding sync means `dispatch` gains a `broadcast(action)` and a sibling
`receive(remoteAction)`, and nothing else in the codebase changes."* Actions already carry `seq`,
`at` and `actorId`. The log is append-only, the fold is deterministic, and nothing derived is
stored. This is the payoff the purity rule was bought for — if it turns out to be a rewrite
anyway, that is worth knowing, because it means the constraint was not doing its job.

**It is the natural next milestone.** v1.0 proved the tool runs a real tournament. The obvious
next question a group asks after one draft night is "why am I reading picks off your screen?"

## The Constraint This Collides With

`PROJECT.md` → Out of Scope currently reads:

> **Real-time multiplayer across devices** — Requires a hosted backend, which breaks the
> zero-service constraint. Hot-seat covers the actual use case (friends on a call or in a room).
> Data model is kept sync-ready so this stays possible later.

That exclusion had three reasons: **cost**, **account friction**, and **rewrite risk**. All three
are now answerable (see below). What is *not* answerable is that the author would be running one
piece of infrastructure that did not exist before. That is a real change in the project's posture
and should be decided deliberately, not slid into.

**Mitigation that makes it survivable:** the relay is additive and the app degrades to exactly
what it is today. If the relay is down, misconfigured, or abandoned in three years, the GitHub
Pages link still opens and still runs a full hot-seat tournament offline. Sync is an enhancement
layer, never a dependency. `SHEL-03` (works with no network after first load) stays true and
should be treated as the acceptance test for that.

## Transport Options

Researched 2026-09-02. The two numbers that decide it are in the table.

| Option | Cost at this scale | Accounts | New runtime deps | Verdict |
|---|---|---|---|---|
| **A. Cloudflare Worker + Durable Object relay** | $0 — free tier is ~3M req/month; a draft is ~500 actions | Author only, once | **0** — `WebSocket` and `fetch` are browser built-ins | ✅ **Recommended** |
| B. WebRTC peer-to-peer | $0 until it fails; TURN is the part that costs money | None | 1–2 (signaling lib) | ❌ **Rejected — see below** |
| C. Free-tier BaaS (Supabase / Firebase realtime) | $0 at this scale | Author only | 1 SDK, and a large one | ⚠️ Works, but heavier |
| D. Stay hot-seat | $0 | None | 0 | The status quo, and always the fallback |

**Why B is rejected despite being the ideologically pure answer.** WebRTC with no server you run
sounds like the perfect fit for this project, and it is a trap. Without a TURN relay, peer
connections fail for roughly **20–30% of users**, and the specific thing that breaks them is
carrier-grade NAT on mobile networks — which is precisely "four friends on their phones." A
connection that works on your home Wi-Fi and fails on 5G is worse than no feature, because it
fails at the table in front of everyone. TURN fixes it and TURN is the part with a bill attached,
so the "no server" route quietly reintroduces the cost it was chosen to avoid. It also needs a
signaling library, which would be runtime dependency #3 against a hard two-dependency constraint.

**Why A wins.** A Durable Object is the right primitive because a draft room is exactly one small
piece of strongly-consistent per-room state, which is the one thing KV and similar cannot give
you. The free tier has existed since April 2025. Incoming WebSocket messages bill at 20:1 and
outgoing are free, so a 500-action draft is a rounding error against ~3M requests/month — even a
hundred tournaments a month stays free by orders of magnitude. Players still only ever open a URL.

**Keep the relay dumb.** It should fan out opaque action envelopes to a room and assign sequence
numbers. It should not know what a Pokémon is, what a ban is, or what a legal pick looks like.
Roughly 50 lines. Every rule stays in the pure core where it is already tested with zero mocks,
and the server has no product logic to drift out of sync with the client.

**Also worth prototyping:** plain HTTP polling against the same Durable Object instead of
WebSockets. A draft is turn-based with one action every ~30 seconds, so a 2-second poll is
indistinguishable from live and removes connection lifecycle, reconnect and hibernation entirely.
Try this first — it may simply be enough, and it is much less to get wrong.

## The Genuinely Hard Parts

The transport is the easy half. These are the parts that need real design, and none of them are
about networking:

1. **`seq` allocation breaks.** Today it is `max(seq) + 1`, computed locally, and the convention
   is documented in `CLAUDE.md`. With two devices submitting at once, both allocate the same
   number. There must be exactly one sequencer, and the relay is the natural place: it assigns
   `seq` on accept and echoes the stamped envelope back. **This is the deepest change in the
   whole idea** and should be designed before anything else. Note the existing convention already
   permits gaps, which helps.

2. **Authority — who may do what.** Today whichever tab holds the write lock may dispatch
   anything. With N devices you need "this device may act only as this player, and only when it
   is that player's turn." That is a `canApply` extension keyed on `actorId`, which keeps it pure
   and testable. Related: the existing `BroadcastChannel` tab-ownership lock (`PERS-03`) becomes
   a different problem — it currently answers "which tab drafts", and the new question is "which
   device is which player."

3. **Undo.** `log.pop()` plus a re-fold assumes a single writer, and undo is already the
   deliberate second write path. With N writers, whose action gets popped? Two defensible answers:
   host-only undo, which matches the current mental model and is much simpler; or undo-your-own-
   last-action. Pick one on purpose.

4. **Threat model — state it and then stop.** These are friends running a game night. A player's
   device could submit a pick out of turn; other clients reject it on fold because `canApply` is
   the same pure function everywhere. That is sufficient. Do not build authentication, do not
   build anti-cheat, do not build rate limiting beyond whatever the platform gives free. Write
   the threat model down explicitly so the next reader knows the omission is a decision.

5. **Reconnect and late join are easy — exploit that.** The log is the truth, a full tournament is
   350–500 actions, and re-folding is sub-millisecond. So the entire sync protocol can be "send me
   the whole log" with no deltas, no CRDTs, no operational transform. A phone that slept through
   three picks just asks again. Resist anything cleverer.

6. **Room identity without accounts.** Host creates a draft, gets a link plus a QR code, friends
   open it and claim a name from the host's player list. The room code lives in the URL. No
   accounts anywhere, and the QR matters because the realistic scenario is people in a room.

## Fantasy-Football Patterns Worth Stealing

- **Big board plus your own device.** This is the actual fantasy draft shape and it is the right
  one — the host's screen stays the shared source of truth everyone looks up at, and the personal
  device is for your own actions and private information.
- **A pick queue.** "If it gets to me, take Garchomp." Cheap to build, genuinely useful, and it
  works offline on your own device because it is purely local intent until you commit it.
- **"You're on the clock" on your own device.** Solves the real hot-seat annoyance of someone
  missing that it is their turn.

Explicitly **not** worth stealing, and both already rejected on purpose in `PROJECT.md`:

- **Hard pick timers with autopick.** Already Out of Scope as "actively hostile in a hot-seat
  voice-call context where the social clock already works." Own devices do not change that.
- **Draft chat.** They are on a voice call or in the same room.

One thing to leave alone: priority cards were deliberately made **open and sequential** after the
original blind design produced ties in 98.5% of rounds. Personal devices make hidden simultaneous
play newly possible, which is exactly why this needs saying — do not quietly undo that decision
because the transport now permits it. Run the deferred playtest first.

## Scope Estimate

**Large.** One new deployed component, a sequencer change that touches the log's core invariant,
and an authority model that touches `canApply`. Not a rewrite — the seam is already there and
this seed is partly a test of whether that claim was true.

Suggested shape if it becomes a milestone:

1. Prove the seam on a throwaway spike: two browsers, one shared log, relay assigns `seq`. Answer
   "was the architecture claim real?" before planning anything else.
2. Sequencer + `receive(remoteAction)` + full-log resync.
3. Authority model — `actorId` in `canApply`, plus the undo decision.
4. Join flow — room code, QR, name claim.
5. Move blind bans onto personal devices and delete the interstitial workaround, or keep it as the
   offline fallback.

**Do step 1 as a spike before committing.** Phase 1's pokebase spike is the precedent: it turned
the one load-bearing assumption from inference into fact for very little effort, and this seed
rests on an equally load-bearing assumption.

## Breadcrumbs

- `CLAUDE.md` → Architecture → "One write path" — the sync seam, stated explicitly
- `src/store.ts` → `dispatch` — the only place that stamps an envelope and appends
- `src/core/` → `canApply` — where the authority check belongs
- `PROJECT.md` → Out of Scope → "Real-time multiplayer across devices" — the entry this revisits
- `PROJECT.md` → Key Decisions → "Hot-seat on one screen, no networking" and "Serializable
  single-object tournament state" — scored ✓ Good at v1.0, both directly implicated here
- `PERS-03` / the `BroadcastChannel` tab-ownership lock — becomes device ownership
- `BAN-05`, `BAN-06` and Phase 4's pass-the-device interstitial — the workaround this could retire
- `MILESTONES.md` → Known Gaps → `BAN-07` re-ban arm — a duplicate-ban collision is much easier to
  explain when each player has their own screen; worth resolving in the same milestone

## References

- [Cloudflare — Durable Objects free tier (2025-04-07)](https://developers.cloudflare.com/changelog/2025-04-07-durable-objects-free-tier/)
- [Cloudflare — Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare — Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Why WebRTC calls fail on mobile networks (CGNAT)](https://www.expressturn.com/blog/webrtc-calls-fail-on-mobile-networks)
- [TURN in WebRTC: when you need it and what it costs](https://bloggeek.me/webrtcglossary/turn/)

## Notes

Planted at the v1.0 close from the author's own framing: *"scaling the app so that multiple users
can access the host's draft from their own devices, kinda like a fantasy football setup"* — while
keeping it minimal, and keeping what the app is now, where it opens in the browser and nobody has
to make an account, download anything, and it costs nothing for everyone.

Cost and NAT figures researched 2026-09-02. **Re-verify free-tier terms before committing to a
vendor** — that is the one number in this document with an expiry date.
