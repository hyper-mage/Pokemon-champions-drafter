/**
 * actions.ts — the vocabulary of the log.
 *
 * Actions are events, not setters: `draft/pickMade { playerId, monId }`, never
 * `state/setTeams { ... }`. A setter-shaped log is a log that means nothing when read
 * back, and it is unrebasable if sync is ever added (ARCHITECTURE sync rule 7).
 *
 * The creators below return the PAYLOAD only. They do not stamp `seq`, `at` or
 * `actorId` — `dispatch` does that at the impure edge, because a creator that reached
 * for a clock would be an ambient read inside the core and `npm run check:pure` would
 * fail the build for it. That split is the point, not an inconvenience.
 *
 * Phase 1's four types all existed from day one, including `draft/pickUndone`, which
 * nothing dispatched until plan 01-07. Sync rule 15 requires the compensating action type
 * to exist and be reducible now, so that popping the log stays a local-only optimization
 * rather than a design the log cannot express. `schedule/compiled` is the fifth, added in
 * Phase 3, and it lands in the same five places every type here does: constant, payload
 * interface, `Intent` member, creator, structural guard — plus `buildLogEntry`'s arm in
 * `import-guard.ts`, which is the sixth and the one a round trip fails silently without.
 *
 * `cards/played` and `order/resolved` are the sixth and seventh, and they land in the same
 * six places apiece. They are also the phase's clearest illustration of why the split
 * between a structural guard and `canApply` is worth keeping: a guard can say `value` is an
 * integer, and only `canApply` can say it is a card that player still holds.
 *
 * `swap/made` is the eighth, and it extends that illustration by one rung: a guard can say
 * `inMonId` is a string, `canApply` can say it is still in the pool, and NEITHER can say it
 * satisfies the target slot's predicate — that is a fact about a roster entry, and no
 * roster is in reach of either. The constraint is enforced by the OFFER instead
 * (`selectSwapTargets`), which is the same posture picks already take.
 *
 * `swap/passed` is the ninth, and it is the one type here that records somebody doing
 * NOTHING. See {@link SwapPassedPayload} for why that is an action rather than an absence.
 *
 * `bans/placed`, `bans/submitted` and `bans/revealed` are the tenth, eleventh and twelfth,
 * and they attach TOGETHER for the reason the two swap types did: they are one vocabulary
 * with two dialects. `bans/placed` is the snake stage speaking in the open, one ban at a
 * time; `bans/submitted` and `bans/revealed` are the blind stage speaking in private and
 * then all at once. Splitting them across two changes would have meant editing all six
 * landing sites twice.
 *
 * ## The `tournament/*` family — the thirteenth through the seventeenth
 *
 * Five types, attached together for the reason the ban trio was: they are one vocabulary,
 * and splitting them across five changes would have meant editing every landing site five
 * times. In file order:
 *
 *   {@link TOURNAMENT_MATCH_RECORDED}    one match, winner and games and metric at once.
 *   {@link TOURNAMENT_RESULTS_VOIDED}    what a correction clears, named by `seq`.
 *   {@link TOURNAMENT_CUT_TAKEN}         the seeded cut, materialized.
 *   {@link TOURNAMENT_TIEBREAK_ORDERED}  the host's order for a block nothing could split.
 *   {@link TOURNAMENT_REOPENED}          un-finishing a finished tournament.
 *
 * ## The landing sites, counted, because this is where the count matters
 *
 * The paragraphs above say "six places" and then "all six landing sites". Stated exactly,
 * for a family of five where an omission multiplies by five, there are SEVEN:
 *
 *   1. the exported constant, here;
 *   2. the payload interface;
 *   3. the `Intent` union member — and the `…Action` alias beside it;
 *   4. the creator;
 *   5. the structural guard, `is…Action`;
 *   6. `buildLogEntry`'s arm in `import-guard.ts`;
 *   7. `apply`'s arm AND `canApply`'s arm in `reduce.ts`.
 *
 * Sites 6 and 7 fail differently and that difference is worth knowing before starting. A
 * missing `buildLogEntry` arm drops the payload SILENTLY on a round trip — it works in
 * memory, it works in autosave, and the field is gone the moment a host shares the file
 * (`import-guard.ts`'s `bans/placed` arm records the shipped instance). A missing
 * `undoAnnouncement` arm, by contrast, is a compile error, because `UndoRemoval.kind`'s
 * `default` assigns to a `const exhaustive: never`. Only one of the two tells you.
 */

export const POOL_BUILT = 'pool/built';
export const SCHEDULE_COMPILED = 'schedule/compiled';
export const DRAFT_STARTED = 'draft/started';
export const DRAFT_PICK_MADE = 'draft/pickMade';
export const DRAFT_PICK_UNDONE = 'draft/pickUndone';
export const CARDS_PLAYED = 'cards/played';
export const ORDER_RESOLVED = 'order/resolved';
export const SWAP_MADE = 'swap/made';
export const SWAP_PASSED = 'swap/passed';
export const BANS_PLACED = 'bans/placed';
export const BANS_SUBMITTED = 'bans/submitted';
export const BANS_REVEALED = 'bans/revealed';
export const TOURNAMENT_MATCH_RECORDED = 'tournament/matchRecorded';
export const TOURNAMENT_RESULTS_VOIDED = 'tournament/resultsVoided';
export const TOURNAMENT_CUT_TAKEN = 'tournament/cutTaken';
export const TOURNAMENT_TIEBREAK_ORDERED = 'tournament/tiebreakOrdered';
export const TOURNAMENT_REOPENED = 'tournament/reopened';

/**
 * What `dispatch` adds to every intent.
 *
 * `seq` is a monotonic integer so ordering is explicit rather than implied by array
 * position; `at` is epoch milliseconds; `actorId` is `'host'` today and a device or
 * player id under sync. Adding any of these later would mean migrating every saved
 * tournament, which is why they are here before there is anything to migrate.
 */
export interface ActionEnvelope {
  seq: number;
  at: number;
  actorId: string;
}

/**
 * The pool, materialized. Replay reads these ids; it never re-derives them.
 *
 * ## It is not always the FIRST action, and after D-11 it is sometimes the last
 *
 * A `hostBanlist` document opens with this one, which is what Phase 2 and Phase 3 both
 * assumed everywhere. A `blind` or `snake` document does not: it compiles the schedule,
 * resolves the order, runs the ban stage, reveals, and draws the pool AFTERWARDS, because
 * the reveal is what decides which species the draw may contain (D-23). See
 * {@link DraftStartedPayload} for the two orderings side by side.
 *
 * ## Why `seed` lives here and not in `RngState`
 *
 * This is ARCHITECTURE Pattern 5 — a materialized result carrying its own provenance —
 * and it is the same reason this payload already carries `rosterVersion` and `checksum`.
 * `doc.rng` is a single `{ seed, cursor }`, and **nothing in this build advances it**:
 * `rng.cursor` is `0` when a tournament is created and `0` for the rest of its life. Phase
 * 3's priority-card tie-break, which an earlier version of this comment reserved the
 * generator for, breaks ties on `(value, seq)` and consumes no randomness at all (D-22).
 * The field stays because it is the provenance argument's home for any future consumer
 * that does need a seeded derivation — and putting the pool draw's seed there would make
 * two unrelated consumers share one number and one cursor.
 *
 * Keeping it on the action also makes a re-roll expressible without contradicting
 * anything: a Phase 3 re-roll emits a NEW `pool/built` with a new seed and a new id list,
 * and no config field has to be rewritten to explain it. A seed stored in config would
 * have to be, and then the log and the config would disagree about which draw produced
 * the pool on screen.
 *
 * `megaCapableCount` is the number of Mega-capable entries in `ids` at the moment the pool
 * was drawn (D-09). It is recorded rather than recomputed because the roster it was
 * measured against rotates roughly every 2.5 months; Phase 3's RULE-09 gate reads it.
 */
export interface PoolBuiltPayload {
  type: typeof POOL_BUILT;
  ids: string[];
  rosterVersion: string;
  checksum: string;
  /** The pool seed that produced `ids`. `0` when no draw was rolled. */
  seed: number;
  /** How many of `ids` can Mega Evolve, measured against `rosterVersion`. */
  megaCapableCount: number;
}

/**
 * What a round's pool is filtered by (D-07).
 *
 * A TAG, never a resolved id list. The round says what it wants and the eligibility
 * selector answers it against the roster the document is pinned to; a materialized id
 * list would freeze one regulation's answer into a document that outlives it.
 *
 * A string-literal union with a comment per member, for the same reason {@link
 * ../model.BanMode} is one: these exact strings are written into a saved document and
 * read back by a later build, which makes them closer to an API than to a label.
 * Renaming one breaks every tournament already on disk.
 */
export type RoundKind =
  /** The slot only accepts a Pokémon that can Mega Evolve under this document's rules. */
  | 'mega'
  /** The slot accepts anything still in the pool. The default, and what an empty schedule folds as. */
  | 'open';

/**
 * One round of the compiled schedule.
 *
 * `index` is 1-based, matching `DraftPick.round` and the `R1`…`R6` board headers, and it
 * is CARRIED rather than taken from array position: a schedule read back from a file is
 * an array whose order a hand-edit can change without the reader noticing. 03-02's
 * structural guard pins `rounds[i].index === i + 1` so the two can never disagree
 * silently.
 */
export interface RoundSpec {
  index: number;
  kind: RoundKind;
}

/**
 * The schedule the host approved, after any RULE-06 reorder. Written once, at Start.
 *
 * ## Why this is materialized, against "nothing derived is stored"
 *
 * Three arguments, strongest first.
 *
 * 1. **The schedule is not derived.** It carries a host decision `compile()` cannot
 *    reproduce: `compile(rules, rounds)` yields one canonical order, and RULE-06 lets the
 *    host permute it. A document recording only `rules` would recompute the canonical order
 *    on every load, and the reorder would silently not survive a reload. The reorder is an
 *    external input, and Pattern 5 exists for exactly that class.
 * 2. **A compiler change or a roster rotation would retype slots in a FINISHED draft.**
 *    D-08 reads a slot's type from schedule position, so a v1.1 compiler that emitted Mega
 *    rounds last would reinterpret a completed team. `pool/built` above carries resolved
 *    `ids` for the same reason.
 * 3. **The reducer and the selectors need it in `DraftState`,** and the only route into
 *    `DraftState` is through the fold.
 *
 * ## There is no reorder action, and there is deliberately no second schedule
 *
 * The reorder is config-time (D-13) and therefore pre-document form state, exactly like the
 * banlist: only the RESOLVED result reaches the log. There is one schedule for the life of
 * a document — `canApply` refuses a second — which is what makes "a slot's type cannot
 * change under a pick already made" true by construction rather than by a check. A
 * mid-draft reorder is CONTEXT `<deferred>` and would need an action of its own, which this
 * build does not have.
 */
export interface ScheduleCompiledPayload {
  type: typeof SCHEDULE_COMPILED;
  /** `length === config.rounds`, `index` contiguous from 1. */
  rounds: RoundSpec[];
}

/**
 * The starting order, materialized from the seed at creation time.
 *
 * ## Where it sits in the log depends on the ban mode (D-11)
 *
 * A `hostBanlist` document writes `pool/built` → `schedule/compiled` → `draft/started`,
 * which is the order Phase 2 and Phase 3 verified and the only order those two phases
 * could produce. A `blind` or `snake` document writes `schedule/compiled` →
 * `draft/started` → the ban actions → `bans/revealed` → **`pool/built` last**, because the
 * ban stage's serpentine reads `state.order` and the pool cannot be drawn until the reveal
 * has decided what may be in it (D-23).
 *
 * So this action does NOT always follow the pool, and nothing may assume it does.
 * `canApply` states the same split, conditioned on `config.banMode` rather than deleted,
 * so the host-banlist rule is byte-for-byte the one it has always been.
 */
export interface DraftStartedPayload {
  type: typeof DRAFT_STARTED;
  order: string[];
  /** The order seed that produced `order`. Same provenance argument as `pool/built`. */
  seed: number;
}

export interface PickMadePayload {
  type: typeof DRAFT_PICK_MADE;
  playerId: string;
  monId: string;
  /** 1-based, matching the board headers and the banner copy. */
  round: number;
  /** 0-based position in the whole draft. */
  pickIndex: number;
}

/** Retracts the pick recorded by the action whose `seq` is `targetSeq`. */
export interface PickUndonePayload {
  type: typeof DRAFT_PICK_UNDONE;
  targetSeq: number;
}

/**
 * One player commits one priority card, face up — CARD-01, CARD-03.
 *
 * ## One action per card, and why not one per round (D-19)
 *
 * The obvious shape is a single `cards/round` carrying every player's value at once, with
 * the panel holding the partial round in component state until the last player commits.
 * That is one action instead of eight, and it is wrong for a reason the hot seat makes
 * concrete: the tab is shared, and a refresh, a reload after a crash, or an accidental
 * back-navigation mid-bidding would lose every card already down and make the room replay
 * a round they had already watched. Landing each play as it happens makes the shared screen
 * a rendering of the log rather than of a component, and there is nothing to lose.
 *
 * It also makes the undo D-20 asks for expressible: one card can be walked back without
 * inventing a partial-round representation for what is left.
 *
 * `value` is `1..config.rounds`. The RANGE is not checked by the structural guard below —
 * a guard types an action in isolation and cannot see the config — so `canApply` refuses an
 * out-of-range value as `malformedPayload`.
 *
 * `round` is stamped at the edge from `selectCurrentRound`, for the reason
 * {@link PickMadePayload}'s is: the round must not be re-derived from log position after an
 * undo has removed something ahead of it.
 */
export interface CardsPlayedPayload {
  type: typeof CARDS_PLAYED;
  playerId: string;
  /** 1..config.rounds. */
  value: number;
  /** 1-based, stamped at the edge from `selectCurrentRound`. */
  round: number;
}

/**
 * The round's pick order, materialized the instant the last card lands — D-19, D-22.
 *
 * The other half of the argument above. `resolvePickOrder` derives this from the plays, so
 * a document could in principle record only the plays — and then every future build would
 * re-derive the order under whatever comparator it happened to ship, silently reinterpreting
 * a round the room has already played. `pool/built` carries resolved ids for exactly this
 * reason, and ARCHITECTURE Pattern 5 is the general case.
 *
 * Emitted automatically rather than by a host click: D-17 makes "every card down but no
 * order yet" a state the screen never has to render, and the alternative costs a click per
 * round for nothing.
 */
export interface OrderResolvedPayload {
  type: typeof ORDER_RESOLVED;
  round: number;
  order: string[];
}

/**
 * One filled slot, replaced — SWAP-02, SWAP-05, D-25, D-26.
 *
 * ## It replaces; it never fills a new slot
 *
 * `apply` maps over `picks` and rewrites one entry rather than appending a second. Both
 * halves of that argument are in `reduce.ts` above the arm, because getting it wrong fails
 * SILENTLY on the board — `selectTeams` renders the right team either way.
 *
 * ## Why `outMonId` is carried at all
 *
 * The same reason {@link PickUndonePayload} carries `targetSeq`: the action is
 * SELF-DESCRIBING. `playerId` and `round` alone would name a slot and let whatever happens
 * to be sitting in it be replaced, so a hand-edited or reordered log could swap out a
 * species nobody chose. Requiring all three to agree means a log that disagrees with itself
 * folds to a no-op rather than to a different swap (T-03-38).
 *
 * ## Why `swapRound` is here before anything reads it
 *
 * `0` for a mid-draft spend, 1-based for a dedicated swap round. The dedicated case is
 * 03-11's, and the field has to exist NOW because `buildLogEntry` rebuilds payloads field
 * by field: a field added later is a field every document written before then does not
 * carry, and one omitted from the guard is dropped silently on every round trip.
 */
export interface SwapMadePayload {
  type: typeof SWAP_MADE;
  playerId: string;
  /** 1-based; identifies the slot, and therefore its predicate, via `selectSlotKind`. */
  round: number;
  /** Self-describing, so a disagreeing log folds to a no-op rather than swapping the wrong slot. */
  outMonId: string;
  inMonId: string;
  /** `0` for a mid-draft spend; 1-based for a dedicated swap round (03-11). */
  swapRound: number;
}

/**
 * One player declining their turn in a dedicated swap round — SWAP-07.
 *
 * ## Why doing nothing is an ACTION and not an absence
 *
 * This is the only type in this file that records a non-event, and both reasons it has to
 * are structural rather than stylistic.
 *
 * A swap round advances by COUNTING the moves recorded for it: position is
 * `count(swap/made) + count(swap/passed)` for that `swapRound`, which is why both types
 * carry the field. Without a recorded pass there is nothing to count, so the round could
 * never step past a player who chose not to swap — the clock would sit on them forever, and
 * the only way out would be a "skip" that mutates something outside the log.
 *
 * Undo needs the same distinction from the other side. "Has not gone yet" and "went, and
 * chose nothing" are the same fold if a pass leaves no trace, so `Undo last move` could not
 * tell whether there was anything to walk back — and a host who passed by mistake at the
 * end of the last swap round would find the tournament simply finished.
 *
 * There is deliberately no mid-draft pass. Declining to spend a mid-draft swap is not an
 * event: the turn ends with a pick either way (D-25), and nothing waits on it. So
 * `swapRound` is 1-based here where {@link SwapMadePayload}'s is 0-based, and the import
 * guard bounds the two differently for exactly that reason.
 *
 * No `round` field, because a pass names no slot. That is the whole of what it says.
 */
export interface SwapPassedPayload {
  type: typeof SWAP_PASSED;
  playerId: string;
  /** 1-based. A pass belongs to a dedicated round; there is no mid-draft pass. */
  swapRound: number;
}

/**
 * One snake ban, placed in the open — BAN-03, D-12, D-20.
 *
 * `pass` is 1-based and stamped at the edge from the serpentine selector, for the reason
 * {@link PickMadePayload}'s `round` is: the pass must not be re-derived from log position
 * after an undo has removed something ahead of it. A ban board that renumbered its columns
 * when an earlier ban was walked back would move every ban after it into the wrong pass.
 *
 * There is deliberately no duplicate-policy field here, and none on either sibling below.
 * What happens when two players ban the same species is `config.duplicateBanPolicy` (D-10)
 * — decided before the first action and never changed afterwards, which is exactly what
 * `model.ts` says config is for. A copy on the payload would be a second answer to the
 * same question, free to disagree with the first halfway through a stage.
 */
export interface BansPlacedPayload {
  type: typeof BANS_PLACED;
  playerId: string;
  monId: string;
  /** 1-based, matching the ban board's `Pass {n}` column headers. */
  pass: number;
}

/**
 * One player's whole blind allotment, sealed — BAN-04, D-05, D-06.
 *
 * ## The WHOLE allotment, and why that is the opposite of `cards/played`
 *
 * {@link CardsPlayedPayload} carries one card because a round is many separate acts and
 * each one should be able to land as it happens. A blind submission is the reverse: the
 * lock-in is ONE act, and D-05 forbids re-displaying a submission once it is removed. So
 * an undo has to remove exactly one player's entry and nothing finer. Per-ban actions
 * would make `Undo last move` remove one invisible ban out of two invisible bans, and the
 * sentence announcing it could not name what came back without leaking what was banned.
 *
 * ## Plaintext, deliberately
 *
 * D-06: the defence is the screen shield, not the file. A commit-then-reveal hash scheme
 * was considered and rejected — `crypto.subtle` is async, would have to live in an adapter,
 * and would leave this pure reducer unable to verify its own log. The host typed every ban
 * off Discord and already knows them.
 */
export interface BansSubmittedPayload {
  type: typeof BANS_SUBMITTED;
  playerId: string;
  monIds: string[];
}

/**
 * The reveal, attributed — BAN-04, D-08, D-13.
 *
 * ## Why this is materialized, when the submissions already say it
 *
 * It IS derivable from `bans/submitted`, and that is the same objection
 * {@link ScheduleCompiledPayload} answers above. The answer is the same: the reveal is a
 * HOST ACT at a point in the log, not a computation over one. A build that re-derived it
 * would be free to disagree about which submissions were in the reveal the room actually
 * watched — after an undo removed one, most obviously — and ARCHITECTURE Pattern 5 exists
 * for exactly that class.
 *
 * Attribution rather than a flat set, per D-13. A flat set would render the banlist and
 * lose who banned what, which is the entire content of the reveal screen and the only way
 * a collision can be shown as a collision.
 */
export interface BansRevealedPayload {
  type: typeof BANS_REVEALED;
  bans: { playerId: string; monIds: string[] }[];
}

/**
 * One match, recorded whole — TOUR-05, D-05.
 *
 * ## ONE action carrying every fact about the match
 *
 * D-05, and the alternative it rejects is the one that looks tidier: winner now, number
 * later. A match is then reachable in a half-recorded state, and the standings' second
 * tiebreak link would sometimes read a result that has a winner and no metric — partly
 * blind, on the one screen whose whole job is stating why one player is above another.
 * One action means that state does not exist rather than being handled.
 *
 * ## `matchId` is INDEX-based, and it must stay that way
 *
 * `rr:{i}:{j}` with `i < j`, both 0-based indices into `config.players`, or
 * `br:{round}:{slot}`, both 1-based. `import-guard.buildPlayers` bounds a player id only
 * as a non-empty UNIQUE STRING, so an imported document can carry ids containing a colon
 * — at which point `rr:${a.id}:${b.id}` makes the players (`a:b`, `c`) and (`a`, `b:c`)
 * produce the same key, two different matches collapse onto one, and the corruption is
 * silent because it lands in the fold rather than at the import boundary. `MATCH_ID_PATTERN`
 * in `import-guard.ts` refuses anything that is not two runs of digits.
 *
 * The PARTICIPANTS stay player ids, on `winnerId` and `loserId`, where `CLAUDE.md`'s
 * identity rule applies and where no concatenation happens.
 *
 * ## `loserId` is carried, never derived
 *
 * It is what makes D-10's "did the participants change" comparison possible for a bracket
 * slot whose participants are THEMSELVES derived from earlier results. Deriving the loser
 * would mean asking the bracket who else was in that match — and after a correction the
 * bracket answers with the new pairing, which is the very thing being compared against.
 *
 * ## Two game fields rather than one
 *
 * `Won 2–1` renders straight off the payload with no arithmetic, and a future TOUR-11
 * per-game log REPLACES the pair rather than reinterpreting a single number. A lone
 * `games: 3` would have to be decoded against the stage format at every reader.
 *
 * The RANGES are bounded in `import-guard.ts` (`winnerGames` 1–2, `loserGames` 0–1)
 * because they bound an allocation-shaped payload from an untrusted file. Whether the pair
 * is legal for THIS stage's format is a fact about the config, so it is `canApply`'s
 * `gamesNotForFormat` — the same split `cards/played` illustrates at the top of this file.
 *
 * `metric` is scored by `config.matchMetric` and is REQUIRED rather than optional: it is
 * `0` at `draftAndBrackets`, where nothing reads it (D-01, D-02), and an optional field
 * would make "not recorded" and "recorded as zero" indistinguishable in the one place the
 * standings sort on. Its bound is `MAX_MATCH_METRIC`.
 */
export interface MatchRecordedPayload {
  type: typeof TOURNAMENT_MATCH_RECORDED;
  /** `rr:{i}:{j}` or `br:{round}:{slot}` — indices, never player ids. */
  matchId: string;
  /** A `PlayerConfig.id`, never a display name. */
  winnerId: string;
  /** A `PlayerConfig.id`. CARRIED, never derived — see the doc block. */
  loserId: string;
  /** Games the winner took: `1` at a `bo1` stage, `2` at a `bo3` one. */
  winnerGames: number;
  /** Games the loser took: `0` at `bo1`, `0` or `1` at `bo3`. */
  loserGames: number;
  /** Scored by `config.matchMetric`, `0 … MAX_MATCH_METRIC`. `0` where nothing reads it. */
  metric: number;
}

/**
 * What a correction clears — D-10's explicit clearing action.
 *
 * The compensating shape {@link PickUndonePayload} established, widened to a list because
 * one correction can invalidate a whole path through the bracket. `seq` targeting rather
 * than `matchId` targeting is what lets ONE field name a match result, the cut, or both.
 *
 * ## Why an explicit clear, and not "ignore results whose participants no longer match"
 *
 * D-10's case, which looks like over-engineering until it is played out: correct a
 * semi-final, record a new final, then correct the semi-final BACK. A purely derived fold
 * finds the original final's participants matching again and RESURRECTS it — an outcome
 * nothing on screen predicted and nobody asked for. The void removes it; re-recording is a
 * fresh act by a host who meant it.
 *
 * ## Why this is a second action rather than a `voids` field on the record
 *
 * A single `tournament/matchRecorded { voids: number[] }` would be atomic by construction
 * and would need neither `causedBySeq` nor a pairing arm in `removalIndices`. D-10's words
 * are "ALSO appends an explicit clearing action naming the matches voided", which is
 * specific enough that reading it as a payload field would be an override rather than an
 * interpretation. The atomicity cost is nil in practice: both dispatches are synchronous
 * inside one event handler and autosave is a trailing debounce, so no partial correction
 * can reach storage.
 *
 * ## `causedBySeq`
 *
 * The `seq` of the `tournament/matchRecorded` this void accompanies. It exists so
 * `removalIndices` can pair the two EXACTLY rather than by searching for a plausible
 * neighbour — which is the concern `triggeringCardIndex` records about its own search. It
 * is what makes D-10's "undo puts the whole correction back in one step" true rather than
 * intended.
 */
export interface ResultsVoidedPayload {
  type: typeof TOURNAMENT_RESULTS_VOIDED;
  /** Log `seq` values to clear — match results, the cut, or both. Never an array index. */
  targetSeqs: number[];
  /** The `seq` of the `tournament/matchRecorded` this void accompanies. */
  causedBySeq: number;
}

/**
 * The seeded cut from the round robin into the bracket — TOUR-09, D-06.
 *
 * ## Why this is materialized, against "nothing derived is stored"
 *
 * The argument {@link BansRevealedPayload} makes, in a setting where the cost of getting
 * it wrong is a bracket that disagrees with itself. The seeds ARE derivable from the
 * standings — `selectSeeding` is exactly `selectStandings().map(row => row.playerId)` —
 * and that is not the question. The cut is a HOST ACT at a point in the log, taken against
 * the table that was on screen at that moment, and ARCHITECTURE Pattern 5 exists for that
 * class.
 *
 * D-11 is what makes it load-bearing rather than merely principled: a round-robin
 * correction after the cut invalidates the cut, unconditionally, because the standings
 * order IS the seeding order. A document that stored only a cut SIZE would silently
 * re-seed itself from the changed standings and produce a bracket the room never played —
 * with nothing on screen to say it had happened. Recording the seeds means a correction
 * has to VOID the cut explicitly, in the log, where the recap can show it.
 *
 * `seeds` is seed order, index `0` being the top seed, so it is order-sensitive and an
 * array is the only honest shape.
 *
 * The cut SIZE is `seeds.length` and is deliberately **not** a second field. Two fields
 * would be two authorities on one number, free to disagree in a hand-edited file, and the
 * bracket would have no way to say which one the room played.
 */
export interface CutTakenPayload {
  type: typeof TOURNAMENT_CUT_TAKEN;
  /** Seed order, top seed first. The cut size is `seeds.length` and is not stored twice. */
  seeds: string[];
}

/**
 * The host's order for a block the automatic chain could not split — TOUR-08, D-13.
 *
 * `playerIds` is the block, best first. It names the PLAYERS rather than assigning seed
 * numbers for D-13's reason: typed numbers invite collisions and gaps, and — the part that
 * matters here — a number carries no record of which players it was chosen for, so a
 * numbered override could not self-invalidate at all. Naming the players IS the
 * invalidation mechanism: `selectStandings` matches an override to a block by SET
 * EQUALITY, so a correction that changes the block's membership makes the override stop
 * matching on its own.
 *
 * That is also why this type is deliberately absent from a void's `targetSeqs`. Voiding it
 * explicitly would be a second mechanism for one fact, and two mechanisms for one fact
 * disagree eventually.
 */
export interface TiebreakOrderedPayload {
  type: typeof TOURNAMENT_TIEBREAK_ORDERED;
  /** The tied block in the host's chosen order, best first. */
  playerIds: string[];
}

/**
 * Un-finishing a finished tournament — D-17.
 *
 * The envelope is the whole payload, and that is the point: locked is a FOLD — a final
 * with a recorded result and no reopen after it — rather than a flag something sets. So
 * reopening has nothing to carry beyond the `seq` every action already has, which is the
 * number `selectTournamentLocked` compares the final's `seq` against.
 *
 * Undoable like everything else (D-12), and undoing it needs no inverse: removing the
 * entry and re-folding leaves `lastReopenSeq` at whatever the remaining log implies.
 */
export interface ReopenedPayload {
  type: typeof TOURNAMENT_REOPENED;
}

export type Intent =
  | PoolBuiltPayload
  | ScheduleCompiledPayload
  | DraftStartedPayload
  | PickMadePayload
  | PickUndonePayload
  | CardsPlayedPayload
  | OrderResolvedPayload
  | SwapMadePayload
  | SwapPassedPayload
  | BansPlacedPayload
  | BansSubmittedPayload
  | BansRevealedPayload
  | MatchRecordedPayload
  | ResultsVoidedPayload
  | CutTakenPayload
  | TiebreakOrderedPayload
  | ReopenedPayload;

export type PoolBuiltAction = PoolBuiltPayload & ActionEnvelope;
export type ScheduleCompiledAction = ScheduleCompiledPayload & ActionEnvelope;
export type DraftStartedAction = DraftStartedPayload & ActionEnvelope;
export type PickMadeAction = PickMadePayload & ActionEnvelope;
export type PickUndoneAction = PickUndonePayload & ActionEnvelope;
export type CardsPlayedAction = CardsPlayedPayload & ActionEnvelope;
export type OrderResolvedAction = OrderResolvedPayload & ActionEnvelope;
export type SwapMadeAction = SwapMadePayload & ActionEnvelope;
export type SwapPassedAction = SwapPassedPayload & ActionEnvelope;
export type BansPlacedAction = BansPlacedPayload & ActionEnvelope;
export type BansSubmittedAction = BansSubmittedPayload & ActionEnvelope;
export type BansRevealedAction = BansRevealedPayload & ActionEnvelope;
export type MatchRecordedAction = MatchRecordedPayload & ActionEnvelope;
export type ResultsVoidedAction = ResultsVoidedPayload & ActionEnvelope;
export type CutTakenAction = CutTakenPayload & ActionEnvelope;
export type TiebreakOrderedAction = TiebreakOrderedPayload & ActionEnvelope;
export type ReopenedAction = ReopenedPayload & ActionEnvelope;

/** A stamped action this build understands. */
export type Action = Intent & ActionEnvelope;

/**
 * A stamped action this build may not understand.
 *
 * A document written by a newer client can carry types that did not exist when this
 * bundle was built. `apply` must fold such a log without crashing (sync rule 11), so
 * it accepts this wider type and ignores what it cannot interpret.
 */
export interface UnknownAction extends ActionEnvelope {
  type: string;
}

export type AnyAction = Action | UnknownAction;

// ---------------------------------------------------------------------------
// Creators — payload only, never the envelope
// ---------------------------------------------------------------------------

/**
 * `seed` and `megaCapableCount` are arguments rather than something this function works
 * out, and that is the purity split rather than an inconvenience: drawing a seed is an
 * ambient read, and counting Mega-capable entries needs the roster snapshot, which lives
 * outside the core. Both are resolved at the edge and handed in already decided.
 */
export function poolBuilt(
  ids: readonly string[],
  rosterVersion: string,
  checksum: string,
  seed: number,
  megaCapableCount: number,
): PoolBuiltPayload {
  return { type: POOL_BUILT, ids: [...ids], rosterVersion, checksum, seed, megaCapableCount };
}

/**
 * A fresh array of FRESH RECORDS, never the caller's objects.
 *
 * The config screen holds its reorder preview in component state and re-renders it on every
 * drag; a payload that aliased that array would let a later render mutate a log entry that
 * has already been written. Copying element by element here is the same rule `copyConfig`
 * states for the document.
 */
export function scheduleCompiled(rounds: readonly RoundSpec[]): ScheduleCompiledPayload {
  return {
    type: SCHEDULE_COMPILED,
    rounds: rounds.map((spec) => ({ index: spec.index, kind: spec.kind })),
  };
}

export function draftStarted(order: readonly string[], seed: number): DraftStartedPayload {
  return { type: DRAFT_STARTED, order: [...order], seed };
}

export function pickMade(pick: {
  playerId: string;
  monId: string;
  round: number;
  pickIndex: number;
}): PickMadePayload {
  return {
    type: DRAFT_PICK_MADE,
    playerId: pick.playerId,
    monId: pick.monId,
    round: pick.round,
    pickIndex: pick.pickIndex,
  };
}

export function pickUndone(targetSeq: number): PickUndonePayload {
  return { type: DRAFT_PICK_UNDONE, targetSeq };
}

export function cardsPlayed(play: {
  playerId: string;
  value: number;
  round: number;
}): CardsPlayedPayload {
  return {
    type: CARDS_PLAYED,
    playerId: play.playerId,
    value: play.value,
    round: play.round,
  };
}

/**
 * A fresh array, never the caller's — the same rule {@link scheduleCompiled} states.
 *
 * The caller's array comes from `resolvePickOrder`, which already returns a fresh one
 * today. Copying anyway costs nothing and means a later caller that hands over
 * `state.resolvedOrders[i].order` cannot alias a log entry into the fold it came from.
 */
export function orderResolved(round: number, order: readonly string[]): OrderResolvedPayload {
  return { type: ORDER_RESOLVED, round, order: [...order] };
}

/**
 * Every field named explicitly, `swapRound` included.
 *
 * A spread of the caller's object would type-check and would silently carry whatever else
 * that object held into a log entry — which is the rule every creator in this file already
 * follows, and the one place it matters most is the payload with a field no consumer reads
 * yet.
 */
export function swapMade(swap: {
  playerId: string;
  round: number;
  outMonId: string;
  inMonId: string;
  swapRound: number;
}): SwapMadePayload {
  return {
    type: SWAP_MADE,
    playerId: swap.playerId,
    round: swap.round,
    outMonId: swap.outMonId,
    inMonId: swap.inMonId,
    swapRound: swap.swapRound,
  };
}

/**
 * A pass, which is two fields and no more.
 *
 * Named rather than spread for {@link swapMade}'s reason, and the smaller payload makes the
 * rule easier to break rather than harder: a caller holding a `{ playerId, round,
 * swapRound }` object would spread a PICK round into a pass that has no concept of one.
 */
export function swapPassed(pass: { playerId: string; swapRound: number }): SwapPassedPayload {
  return { type: SWAP_PASSED, playerId: pass.playerId, swapRound: pass.swapRound };
}

/**
 * `pass` is an argument rather than something this function works out.
 *
 * The serpentine position is a fact about the STATE, and the whole purity split is that
 * the state is resolved at the edge and handed in already decided — the same reason
 * {@link poolBuilt}'s `seed` and {@link cardsPlayed}'s `round` are arguments.
 */
export function bansPlaced(playerId: string, monId: string, pass: number): BansPlacedPayload {
  return { type: BANS_PLACED, playerId, monId, pass };
}

/**
 * A fresh array, never the caller's — the same rule {@link scheduleCompiled} states.
 *
 * The blind entry surface holds its in-progress selection in component state and
 * re-renders it on every keystroke. A payload that aliased that array would let a later
 * render mutate a log entry that has already been written, which for a sealed submission
 * means the reveal showing a ban nobody submitted.
 */
export function bansSubmitted(playerId: string, monIds: readonly string[]): BansSubmittedPayload {
  return { type: BANS_SUBMITTED, playerId, monIds: [...monIds] };
}

/**
 * BOTH levels copied: the outer records and every inner `monIds`.
 *
 * One level is the mistake this is written out to prevent. `bans.map((entry) => entry)`
 * and a bare outer copy both type-check, and both leave every record's `monIds` shared
 * with whatever built it — which here is a selector over the submissions, one render away
 * from being rebuilt. Each record is a FRESH object with each field named, on
 * {@link swapMade}'s rule: a spread would carry whatever else the caller's record happened
 * to hold into a log entry. Each `monIds` is copied element by element, which is
 * `copyConfig`'s idiom for the same hazard one layer down.
 */
export function bansRevealed(
  bans: readonly { playerId: string; monIds: readonly string[] }[],
): BansRevealedPayload {
  return {
    type: BANS_REVEALED,
    bans: bans.map((entry) => ({
      playerId: entry.playerId,
      monIds: entry.monIds.map((id) => id),
    })),
  };
}

/**
 * Six arguments, each named into the returned object, and never a spread.
 *
 * `loserId` is an ARGUMENT rather than something this function works out. The purity split
 * again — who else was in the match is a fact about the STATE, resolved at the edge and
 * handed in already decided, exactly as {@link poolBuilt}'s `seed` and
 * {@link cardsPlayed}'s `round` are. Deriving it here would also be wrong on its own
 * terms: see {@link MatchRecordedPayload} for why a bracket cannot be asked who the loser
 * was during the very correction that changes the answer.
 */
export function matchRecorded(
  matchId: string,
  winnerId: string,
  loserId: string,
  winnerGames: number,
  loserGames: number,
  metric: number,
): MatchRecordedPayload {
  return {
    type: TOURNAMENT_MATCH_RECORDED,
    matchId,
    winnerId,
    loserId,
    winnerGames,
    loserGames,
    metric,
  };
}

/**
 * A fresh array, never the caller's — the rule {@link bansSubmitted} states.
 *
 * The caller here is `selectVoidCascade`'s `targetSeqs`, which is rebuilt on every render
 * of the record dialog because the button's own label interpolates its length. A payload
 * that aliased it would let the next render rewrite a log entry that has already been
 * written — and for a void that means clearing results nobody chose to clear.
 */
export function resultsVoided(
  targetSeqs: readonly number[],
  causedBySeq: number,
): ResultsVoidedPayload {
  return { type: TOURNAMENT_RESULTS_VOIDED, targetSeqs: targetSeqs.map((seq) => seq), causedBySeq };
}

/**
 * A fresh array, for {@link bansSubmitted}'s reason applied to seed order.
 *
 * `seeds` arrives as a slice of `selectSeeding`, which is rebuilt from the standings on
 * every render of the cut control. Aliasing it would let a later correction reorder a cut
 * already in the log — silently, and in exactly the direction D-11 exists to prevent.
 */
export function cutTaken(seeds: readonly string[]): CutTakenPayload {
  return { type: TOURNAMENT_CUT_TAKEN, seeds: seeds.map((id) => id) };
}

/**
 * A fresh array. The override surface holds the in-progress order in component state and
 * rebuilds it on every up/down press, so this is the same hazard {@link bansSubmitted}
 * names, with the ORDER rather than the membership as the thing that would be rewritten.
 */
export function tiebreakOrdered(playerIds: readonly string[]): TiebreakOrderedPayload {
  return { type: TOURNAMENT_TIEBREAK_ORDERED, playerIds: playerIds.map((id) => id) };
}

/** Envelope-only. See {@link ReopenedPayload} for why there is nothing to carry. */
export function reopened(): ReopenedPayload {
  return { type: TOURNAMENT_REOPENED };
}

// ---------------------------------------------------------------------------
// Payload guards
//
// The discriminant alone is not enough. An imported document (plan 01-10) is
// untrusted input, and a log entry that says `draft/pickMade` while carrying no
// `monId` must fold to "ignored", not to a pick of `undefined`.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function isPoolBuiltAction(action: AnyAction): action is PoolBuiltAction {
  if (action.type !== POOL_BUILT || !isRecord(action)) return false;
  return (
    isStringArray(action['ids']) &&
    typeof action['rosterVersion'] === 'string' &&
    typeof action['checksum'] === 'string' &&
    isSafeInteger(action['seed']) &&
    isSafeInteger(action['megaCapableCount'])
  );
}

const ROUND_KINDS: readonly RoundKind[] = ['mega', 'open'];

/**
 * Structurally typed, and positionally pinned.
 *
 * `rounds[i].index === i + 1` is checked rather than assumed, so a hand-edited file cannot
 * produce a schedule whose carried index and array position disagree — the two are read by
 * different call sites (`selectRoundKind` indexes; the reorder preview renders `index`), and
 * a disagreement between them is invisible until a Mega round appears in the wrong column.
 *
 * `kind` is checked against the union for the reason the union's own comment gives: these
 * strings are an API. A file declaring `kind: 'legendary'` would fold to a round this build
 * has no pool filter, no swap predicate and no export rule for.
 */
export function isScheduleCompiledAction(action: AnyAction): action is ScheduleCompiledAction {
  if (action.type !== SCHEDULE_COMPILED || !isRecord(action)) return false;

  const rounds = action['rounds'];
  if (!Array.isArray(rounds)) return false;

  return rounds.every((spec, position) => {
    if (!isRecord(spec)) return false;
    if (!isSafeInteger(spec['index']) || spec['index'] !== position + 1) return false;
    return ROUND_KINDS.some((kind) => kind === spec['kind']);
  });
}

export function isDraftStartedAction(action: AnyAction): action is DraftStartedAction {
  if (action.type !== DRAFT_STARTED || !isRecord(action)) return false;
  return isStringArray(action['order']) && isSafeInteger(action['seed']);
}

export function isPickMadeAction(action: AnyAction): action is PickMadeAction {
  if (action.type !== DRAFT_PICK_MADE || !isRecord(action)) return false;
  return (
    typeof action['playerId'] === 'string' &&
    typeof action['monId'] === 'string' &&
    isSafeInteger(action['round']) &&
    isSafeInteger(action['pickIndex'])
  );
}

export function isPickUndoneAction(action: AnyAction): action is PickUndoneAction {
  if (action.type !== DRAFT_PICK_UNDONE || !isRecord(action)) return false;
  return isSafeInteger(action['targetSeq']);
}

/**
 * Types only — and the omission is the design rather than an oversight.
 *
 * Whether `value` is in `1..config.rounds`, whether that card is still in the player's hand,
 * and whether this player is the one on the card clock are all questions about the STATE,
 * and this function sees one action in isolation. They live in `canApply`, which sees both.
 * A guard that reached for the config would be a second authority on the same rules, free
 * to disagree with the first.
 */
export function isCardsPlayedAction(action: AnyAction): action is CardsPlayedAction {
  if (action.type !== CARDS_PLAYED || !isRecord(action)) return false;
  return (
    typeof action['playerId'] === 'string' &&
    isSafeInteger(action['value']) &&
    isSafeInteger(action['round'])
  );
}

export function isOrderResolvedAction(action: AnyAction): action is OrderResolvedAction {
  if (action.type !== ORDER_RESOLVED || !isRecord(action)) return false;
  return isSafeInteger(action['round']) && isStringArray(action['order']);
}

/**
 * Types only — and `swapRound` is checked even though nothing reads it until 03-11.
 *
 * The omissions are the design, exactly as they are for {@link isCardsPlayedAction}.
 * Whether the slot actually holds `outMonId`, whether `inMonId` is still in the pool, and
 * whether this player is on the clock are all questions about the STATE, which this
 * function does not see; they live in `canApply`. Whether `inMonId` satisfies the slot's
 * predicate is a question about the ROSTER, which neither of them sees — see the arm in
 * `reduce.ts` for why that is stated rather than fixed.
 *
 * A payload missing `swapRound` is refused rather than defaulted to `0`. Defaulting would
 * make an imported swap-round swap fold as a mid-draft one, which is a different event.
 */
export function isSwapMadeAction(action: AnyAction): action is SwapMadeAction {
  if (action.type !== SWAP_MADE || !isRecord(action)) return false;
  return (
    typeof action['playerId'] === 'string' &&
    typeof action['outMonId'] === 'string' &&
    typeof action['inMonId'] === 'string' &&
    isSafeInteger(action['round']) &&
    isSafeInteger(action['swapRound'])
  );
}

/**
 * Types only, and `swapRound` is not optional here either.
 *
 * The 1-based constraint is deliberately NOT checked. This function types one entry in
 * isolation, and "which swap rounds this tournament has" is a fact about the config —
 * `canApply` asks it, and `buildLogEntry` bounds it for the allocation reason. A guard that
 * reached for the config would be a second authority on the same rule.
 */
export function isSwapPassedAction(action: AnyAction): action is SwapPassedAction {
  if (action.type !== SWAP_PASSED || !isRecord(action)) return false;
  return typeof action['playerId'] === 'string' && isSafeInteger(action['swapRound']);
}

/**
 * Types only, exactly as {@link isCardsPlayedAction}'s doc block sets out.
 *
 * Whether `monId` names a species on the roster and whether `pass` is inside
 * `1..config.bansPerPlayer` are the two questions this deliberately does not ask. The
 * first has no answer available to ANY function in this file — no roster is in reach of
 * either a guard or `canApply`, which is the `swap/made` lesson at the top of the file —
 * and the second is a fact about the config, which `canApply` sees and this does not.
 */
export function isBansPlacedAction(action: AnyAction): action is BansPlacedAction {
  if (action.type !== BANS_PLACED || !isRecord(action)) return false;
  return (
    typeof action['playerId'] === 'string' &&
    typeof action['monId'] === 'string' &&
    isSafeInteger(action['pass'])
  );
}

/**
 * Types only, and the LENGTH is the omission that matters.
 *
 * `monIds.length === config.bansPerPlayer` is `canApply`'s `wrongBanCount` and duplicates
 * inside `monIds` are its `duplicateBanIds`. Both are questions about the state, and a
 * guard that reached for the config would be a second authority on the same rules, free to
 * disagree with the first. `tests/core/import-guard.test.ts` pins the wrong-length case as
 * ACCEPTED here, because that is the assertion a later reader is most likely to "fix".
 */
export function isBansSubmittedAction(action: AnyAction): action is BansSubmittedAction {
  if (action.type !== BANS_SUBMITTED || !isRecord(action)) return false;
  return typeof action['playerId'] === 'string' && isStringArray(action['monIds']);
}

/**
 * A nested array of records, typed record by record.
 *
 * The shape {@link isScheduleCompiledAction} takes, minus the positional pin: a reveal's
 * records carry no index, so there is no carried-versus-position disagreement to catch.
 * What there IS to catch is a record whose `monIds` is not an array of strings, which
 * would otherwise fold into a reveal the screen renders as `undefined`.
 *
 * Whether these player ids are the document's configured players is referential integrity,
 * and no structural guard in this file does any — every entry is typed in isolation.
 */
export function isBansRevealedAction(action: AnyAction): action is BansRevealedAction {
  if (action.type !== BANS_REVEALED || !isRecord(action)) return false;

  const bans = action['bans'];
  if (!Array.isArray(bans)) return false;

  return bans.every((ban) => {
    if (!isRecord(ban)) return false;
    return typeof ban['playerId'] === 'string' && isStringArray(ban['monIds']);
  });
}

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => isSafeInteger(item));
}

/**
 * Types only, and this is the one where the temptation to do more is real.
 *
 * A GUARD ASKS NOTHING ABOUT `config` OR THE FOLD. Whether `winnerGames: 2` is legal is a
 * question about the stage's format; whether `matchId` names a pairing this player list
 * has, whether the winner and loser are that match's participants, and whether the
 * tournament is even running are all questions about the STATE. This function sees one
 * action in isolation. Every one of them lives in `canApply`, which sees both — and a
 * guard that reached for the config would be a second authority on the same rules, free
 * to disagree with the first.
 *
 * The `matchId` SHAPE is not checked here either, and that is the same rule rather than an
 * exception to it: it is checked in `buildLogEntry` against `MATCH_ID_PATTERN`, which is
 * the untrusted-input boundary, and refused as `unknownMatch` by `canApply`, which is the
 * origination one. Both of those have somewhere to put the answer; this function does not.
 */
export function isMatchRecordedAction(action: AnyAction): action is MatchRecordedAction {
  if (action.type !== TOURNAMENT_MATCH_RECORDED || !isRecord(action)) return false;
  return (
    typeof action['matchId'] === 'string' &&
    typeof action['winnerId'] === 'string' &&
    typeof action['loserId'] === 'string' &&
    isSafeInteger(action['winnerGames']) &&
    isSafeInteger(action['loserGames']) &&
    isSafeInteger(action['metric'])
  );
}

/**
 * Types only, and `causedBySeq` is not optional.
 *
 * A payload missing it is refused rather than defaulted, on {@link isSwapMadeAction}'s
 * precedent: a default would make an imported correction fold as a bare void, and
 * `removalIndices` would then take the void back on its own and leave the correction it
 * accompanied standing — which is a half-undone correction nothing on screen describes.
 */
export function isResultsVoidedAction(action: AnyAction): action is ResultsVoidedAction {
  if (action.type !== TOURNAMENT_RESULTS_VOIDED || !isRecord(action)) return false;
  return isIntegerArray(action['targetSeqs']) && isSafeInteger(action['causedBySeq']);
}

/**
 * Types only. Whether `seeds` are the document's configured players is referential
 * integrity, and no structural guard in this file does any; whether the size is inside
 * `2 … playerCount` and whether the line splits an unresolved tie block are both facts
 * about the state, which `canApply` sees and this does not.
 */
export function isCutTakenAction(action: AnyAction): action is CutTakenAction {
  if (action.type !== TOURNAMENT_CUT_TAKEN || !isRecord(action)) return false;
  return isStringArray(action['seeds']);
}

/** Types only. Whether these players are actually a tied block is `canApply`'s question. */
export function isTiebreakOrderedAction(action: AnyAction): action is TiebreakOrderedAction {
  if (action.type !== TOURNAMENT_TIEBREAK_ORDERED || !isRecord(action)) return false;
  return isStringArray(action['playerIds']);
}

/**
 * The discriminant IS the whole guard, because the envelope is the whole payload.
 *
 * Written out as a function rather than left to a bare `type` comparison at the call
 * sites, so that `apply`, `canApply` and `isUndoable` all ask the same question in the
 * same words — and so a later field on {@link ReopenedPayload} has one place to be checked.
 */
export function isReopenedAction(action: AnyAction): action is ReopenedAction {
  return action.type === TOURNAMENT_REOPENED && isRecord(action);
}
