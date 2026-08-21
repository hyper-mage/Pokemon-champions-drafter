/**
 * model.ts — the shape of the tournament document and the state folded from it.
 *
 * Two objects live here and they are not the same thing:
 *
 *   TournamentDoc  is what gets persisted, exported, imported and (one day) synced.
 *                  It is config plus an append-only log, and nothing else. It is the
 *                  source of truth.
 *
 *   DraftState     is what `fold` produces by replaying that log. It is a cache of the
 *                  log, thrown away and rebuilt on every load. Nothing derived lives
 *                  here either — the available pool, the teams, whose turn it is and
 *                  whether the draft is finished are all computed in selectors.ts.
 *
 * Every field below is JSON-serializable: no Date, no Map, no Set, no class instance,
 * no function, no meaningful `undefined`. Timestamps are epoch integers and every
 * entity is keyed by a stable string id rather than an array position. That is
 * ARCHITECTURE sync rules 1 and 2, and it is what makes `JSON.stringify(doc)` complete
 * and correct by construction rather than by remembering to keep a serializer updated.
 */

import type { Action, RoundSpec } from './actions';

/**
 * Bumped only when a change makes an older document unreadable.
 *
 * Version 2 widened `TournamentConfig` with the fields the host authors on the config
 * screen: pool size, the banlist, the ban mode, how many Megas a team must carry, the
 * per-species dual-Mega choices, and how deep the tournament runs.
 *
 * Version 3 widens it again with the four things Phase 3 makes a host decision: the
 * composition rule list the round schedule compiles from, the Mega-forme ban list, the
 * swap budget each player spends, and the number of swap rounds that follow the draft.
 * Every one of them has a lossless default derivable from a version 2 document — and
 * `rules` has something better than a default, since a version 2 document is already
 * carrying the true answer in `megasRequiredPerTeam` — so a draft saved by Phase 1 or
 * Phase 2 is upgraded rather than refused.
 *
 * Version 4 widens it a third time, with the two things Phase 4's ban stage makes a host
 * decision: how many bans each player gets, and what happens when two players ban the
 * same Pokémon. Both have a lossless default rather than a derivation, and the reason is
 * narrower than it looks: a version 3 document was necessarily `hostBanlist`, because
 * `blind` and `snake` shipped disabled on the config screen, so "zero player bans, and
 * the duplicate question never arose" is the TRUE answer for every document that exists
 * at version 3 rather than a guess standing in for one. `migrate.ts` states the same
 * thing beside the defaults themselves.
 *
 * `migrate.ts` owns that upgrade step and is the only module that knows how to perform
 * it. Nothing else compares a document's version against this constant: `store.ts`,
 * `adapters/persistence.ts` and `import-guard.ts` all route through `migrate` instead,
 * so there is one answer to "can this build read this document" rather than three that
 * can drift apart.
 */
export const SCHEMA_VERSION = 4;

export interface PlayerConfig {
  id: string;
  name: string;
}

/**
 * How Pokémon leave the pool before the first pick.
 *
 * A string-literal union rather than a boolean pair or an enum, and every member carries
 * its own comment, because these exact strings are written into a saved document and read
 * back by a later build. That makes them closer to an API than to a label: renaming one
 * breaks every tournament already on disk.
 */
export type BanMode =
  /** The host names the bans up front and everyone can see them. Phase 2 runs only this. */
  | 'hostBanlist'
  /**
   * Every player submits bans privately and they are revealed together. Phase 4 builds
   * it; Phase 2 renders the option disabled (D-12), so the control's shape is settled
   * now rather than rearranged around a late arrival.
   */
  | 'blind'
  /** Players take turns banning in snake order. Phase 4, disabled in Phase 2 (D-12). */
  | 'snake';

/**
 * What happens when two players ban the same Pokémon.
 *
 * A string-literal union for exactly {@link BanMode}'s reason, and it matters more here
 * than there: these strings are written into a saved document by a build that does not
 * yet read them back, so the first build that DOES read one will be reading a string
 * chosen now. Renaming a member later breaks every tournament already on disk.
 */
export type DuplicateBanPolicy =
  /**
   * Both bans stand and the duplicate is simply spent. The only policy Phase 4 implements
   * (D-19), and the default every migrated and every newly created document carries.
   */
  | 'bothApply'
  /**
   * The later player bans again. RESERVED — declared so the value is bounded from the
   * first document that could contain it, and so the config screen's disabled
   * `Re-ban — Not yet available` option has something to name. Nothing reads it (D-19).
   */
  | 'reBan';

/**
 * How far past the last pick the tournament runs.
 *
 * Phase 2 only records this. Phase 5 is what consumes it, and recording it early is what
 * keeps a host from having to re-declare the shape of their night halfway through it.
 */
export type TournamentDepth =
  /** Draft six, export the teams, done. */
  | 'draftOnly'
  /** Draft, then play out a single-elimination bracket. */
  | 'draftAndBrackets'
  /** Draft, bracket, and a match log with standings behind it. */
  | 'draftBracketsAndLog';

/** Which forme a dual-Mega species may become. */
export type DualMegaForme =
  /** Only the X forme is available to whoever drafts this species. */
  | 'x'
  /** Only the Y forme. */
  | 'y'
  /** Either — the player decides when they export. This is what an absent entry means. */
  | 'either';

/**
 * A host's ruling on one species that has more than one Mega forme.
 *
 * An ARRAY of `{ speciesId, forme }` rather than a `Record<speciesId, forme>`, for two
 * reasons that are both structural:
 *
 *   1. ARCHITECTURE sync rule 14 forbids deriving anything order-sensitive from
 *      `Object.keys()`, and a record invites exactly that when the choices are rendered.
 *   2. A record's key count is unbounded, which makes it an unbounded allocation the
 *      import guard would have to bound with a bespoke check. An array is bounded by the
 *      same `copyStringArray`-shaped rule every other list in this document already uses.
 *
 * The list is advisory, never authoritative. Rows are derived from `megaFormes.length > 1`
 * on the roster snapshot and never from this list (D-03), so an ABSENT entry means
 * `'either'` and a STALE entry left behind by a regulation rotation is simply ignored
 * rather than resurrecting a species the roster no longer offers.
 */
export interface DualMegaChoice {
  speciesId: string;
  forme: DualMegaForme;
}

/**
 * One composition requirement the round schedule compiles from.
 *
 * A union of exactly one member today (D-01), written as a union rather than as a bare
 * interface so that a second kind arrives as a NEW MEMBER rather than as a new shape
 * (D-02) — the same reason `BanMode` above is a union of three strings. Persisted, so
 * `kind`'s spelling is an API rather than a label.
 *
 * ## What compiles, and what a pick guard would be for (D-03)
 *
 * A rule compiles iff the admissible set for slot `i` is a function of `(roster, config)`
 * alone and not of what occupies slots `j ≠ i`. `{ kind: 'mega', count }` satisfies that:
 * whether a Pokémon may fill a Mega round depends only on the roster snapshot and the
 * host's forme bans, never on the five Pokémon beside it.
 *
 * Three classes of rule do not satisfy it and therefore cannot compile into a round
 * schedule at all:
 *
 *   - **relational** — "no two Pokémon of the same type on a team": slot 4's admissible
 *     set depends on what is already in slots 1–3.
 *   - **aggregate** — "team base-stat total at most 3000": admissibility depends on a
 *     running total across every filled slot.
 *   - **cross-team** — "every type represented somewhere in the tournament": admissibility
 *     depends on other players' teams.
 *
 * Enforcing any of them needs a runtime **pick guard**: a pure
 * `guardPick(state, entries, action): GuardResult` that the impure edge would consult
 * alongside the round-eligibility selector. It is explicitly NOT a new arm in `canApply`,
 * because `DraftState` holds no roster — `canApply` cannot see a Pokémon's types or base
 * stats, so it cannot answer a question about them.
 *
 * **Nothing implements a pick guard.** The name exists here so a reader stops looking for
 * it, and so the extension point has one agreed shape if a later milestone ever wants one.
 *
 * One limit below is a CONFIG-SHAPE limit rather than a rule-class limit, and is worth
 * separating: `CompositionRule[]` is tournament-wide, so "2 Megas for Sam, 1 for everyone
 * else" is out of vocabulary because the list is not keyed by player — not because a
 * per-player Mega count fails the compilation criterion. It would compile fine.
 */
export type CompositionRule = { kind: 'mega'; count: number };

/**
 * Everything decided before the first action and never changed afterwards.
 *
 * `rosterVersion` and `rosterChecksum` pin which snapshot the tournament was created
 * against. Champions regulations rotate roughly every 2.5 months, so a document
 * reopened after a rotation must be able to say which roster it means.
 *
 * The six fields below `rosterChecksum` arrived with schema version 2 and are what the
 * host authors on the config screen. The four below them arrived with version 3 and are
 * authored on the same screen.
 */
export interface TournamentConfig {
  formatLabel: string;
  players: PlayerConfig[];
  rounds: number;
  rosterVersion: string;
  rosterChecksum: string;
  /** How many Pokémon the drawn pool holds. Recovered from `pool/built` when migrating. */
  poolSize: number;
  /** Roster ids the host removed before the draw. Ids, never display names. */
  bans: string[];
  banMode: BanMode;
  /** Minimum Mega-capable Pokémon each team must end up with. `0` means no requirement. */
  megasRequiredPerTeam: number;
  dualMegaChoices: DualMegaChoice[];
  depth: TournamentDepth;
  /**
   * What the round schedule compiles from. Exactly one `{ kind: 'mega', count }` entry
   * today, and `megasRequiredPerTeam` is the same fact in the shape the host types.
   */
  rules: CompositionRule[];
  /**
   * Mega FORME ids the host removed — `megaFormes[].id` from the roster snapshot, never
   * a `RosterEntry.id` and never derived by string surgery on a name (D-09). Banning
   * `charizardmegax` leaves Charizard draftable with only its Y forme available.
   */
  megaFormeBans: string[];
  /**
   * SWAP-01. How many swaps each player gets for the whole tournament. ONE budget spent
   * at either of two moments — mid-draft or in a swap round — rather than two separate
   * allowances that would let a player who saved theirs mid-draft outspend one who did
   * not (D-29). `0` means no swaps.
   */
  swapBudget: number;
  /**
   * SWAP-03. Dedicated swap rounds after the pick rounds, each one full pass over every
   * player. Default `0`, which means the draft ends with the last pick. Judged by the
   * feasibility gate rather than clamped by the control that sets it (D-30) — the gate is
   * the only authority on what is satisfiable.
   */
  swapRounds: number;
  /**
   * BAN-03/BAN-04, D-10. How many bans each player gets in the `blind` and `snake` ban
   * stages. `0` means the players ban nothing, which is what `hostBanlist` is and what
   * every document migrated up from schema 3 carries.
   *
   * The bound is owned by `MAX_BANS_PER_PLAYER` in `import-guard.ts`, and the feasibility
   * gate reads THAT constant rather than restating the number. The invariant is argued at
   * `feasibility.ts:60-67` and it is not stylistic: this value is multiplied by the player
   * count and reaches `drawPool`, so a gate that accepted a number the guard refuses would
   * be a build creating documents it will not re-open.
   *
   * The `>= 1` requirement at `blind` and `snake` is the gate's question rather than this
   * type's. `0` is legitimate at `hostBanlist`, so all the type can say is "a non-negative
   * integer" — satisfiability is decided where the ban mode is also known.
   */
  bansPerPlayer: number;
  /**
   * BAN-07, D-19/D-20. What happens when two players ban the same Pokémon.
   *
   * STORED AND READ BY NOTHING in Phase 4, deliberately, and it is exactly the posture
   * `depth` documents above. Only `'bothApply'` is implemented, `'reBan'` is a reserved
   * value the config screen renders disabled, and D-20 makes the control inert in `snake`
   * regardless. Recording it now costs one field and means no saved tournament needs
   * migrating for it when a later milestone starts reading it.
   *
   * Its value is bounded against `DUPLICATE_BAN_POLICIES` in `import-guard.ts` even though
   * nothing reads it, because a stored value outside the union becomes live the moment
   * something does.
   */
  duplicateBanPolicy: DuplicateBanPolicy;
}

/**
 * Randomness as state (SHEL-07). The seed is drawn once at the impure edge when the
 * tournament is created and then never again; `cursor` records how far the pure
 * generator has been advanced. Same seed plus same log means identical state on every
 * machine and after every reload.
 */
export interface RngState {
  seed: number;
  cursor: number;
}

export interface TournamentDoc {
  schemaVersion: number;
  /** Generated at the edge with `newId()`. Never inside a reducer. */
  id: string;
  /** Epoch milliseconds, stamped at the edge. */
  createdAt: number;
  config: TournamentConfig;
  rng: RngState;
  /** Append-only. Corrections are compensating actions, never edits or deletions. */
  log: Action[];
}

/**
 * One recorded pick.
 *
 * `round` is 1-based, matching the `R1`…`R6` board headers and the `Round {r} of 6`
 * banner copy. `pickIndex` is the 0-based position in the whole draft, so it doubles
 * as the count of picks that preceded it. `seq` is the sequence number of the action
 * that recorded it, which is what `draft/pickUndone` targets — an array index would
 * not survive a retraction earlier in the log.
 */
export interface DraftPick {
  playerId: string;
  monId: string;
  round: number;
  pickIndex: number;
  seq: number;
}

/**
 * One priority card, played face up.
 *
 * `seq` carries the same justification `DraftPick.seq` does: it is the sequence number of
 * the action that recorded the play, which is what a compensating action targets, and an
 * array index would not survive a retraction earlier in the log. Here it does a second job
 * that is load-bearing rather than incidental — it IS the tiebreak. `resolvePickOrder`
 * orders on `(value, seq)`, and because `seq` is unique log-wide by construction
 * (`store.ts` allocates `max(seq) + 1`) that comparator is total and needs no third clause.
 *
 * `round` is stamped at the edge for the reason `PickMadePayload.round` is: the round must
 * not be re-derived from position after an undo.
 *
 * The hand a player still holds is NOT here and must never be. It is `1..config.rounds`
 * minus the values that player has played, which `selectHand` computes — a stored hand
 * would be a second copy of a fact the log already asserts, free to disagree with it after
 * an undo (CARD-01, CARD-06, D-06).
 */
export interface CardPlay {
  playerId: string;
  value: number;
  round: number;
  /** The seq of the action that recorded it — what the tiebreak and a retraction target. */
  seq: number;
}

/**
 * One round's pick order, materialized when the last card of that round lands.
 *
 * ARCHITECTURE Pattern 5, and the same argument `pool/built` and `draft/started` carry: the
 * resolved order is the outcome of a rule, and a document that recorded only the plays would
 * re-derive it on every load under whatever comparator the current build happens to ship.
 * `selectors.ts` predicted this shape one phase early, and D-19 is what makes it a written
 * fact rather than a computation: the order lands in the log the instant it is decided, so a
 * refresh mid-round shows the same order the room just watched being decided.
 */
export interface ResolvedOrder {
  round: number;
  order: string[];
}

/**
 * The fold of the log. Only facts the log asserted; never anything computable.
 *
 * `poolIds` and `order` are materialized results, not derivations (ARCHITECTURE
 * Pattern 5): the pool was resolved against a roster snapshot and the order was rolled
 * from the seed, and both were written into the log so a replay reads what happened
 * rather than recomputing it against a roster that may since have rotated.
 */
export interface DraftState {
  config: TournamentConfig;
  poolIds: string[];
  /** Regulation label recorded by `pool/built`; null until the pool is built. */
  rosterVersion: string | null;
  rosterChecksum: string | null;
  /** Player ids in pick order, recorded by `draft/started`. Empty until then. */
  order: string[];
  picks: DraftPick[];
  /**
   * The compiled round schedule, recorded by `schedule/compiled`. `[]` until that action
   * lands (03-02), and an EMPTY schedule folds as all-open rather than as an error —
   * which is exactly what a migrated schema-2 document has, because `migrateV2ToV3`
   * performs no log surgery and so writes no `schedule/compiled` into an old log.
   */
  schedule: RoundSpec[];
  /**
   * Every priority card played so far, in log order, recorded by `cards/played`.
   *
   * An ARRAY rather than a `Record<playerId, number[]>`, and the reason is the same one
   * {@link DualMegaChoice} gives: sync rule 14 forbids deriving anything order-sensitive
   * from a key set, and the tiebreak this list feeds is nothing but order. A record would
   * also lose the interleaving between players, which is precisely what D-22 resolves on.
   */
  cardsPlayed: CardPlay[];
  /**
   * The rounds whose pick order has been decided, recorded by `order/resolved`. `[]` until
   * the first round's last card lands, and `[]` forever for a migrated schema-2 document,
   * which dealt no cards and ran strict alternation instead.
   */
  resolvedOrders: ResolvedOrder[];
  /**
   * Every swap that actually took effect, in log order, recorded by `swap/made`.
   *
   * ## Why this exists at all, when "nothing derived is stored"
   *
   * It is not derived — it is the only surviving trace of the event. `apply(SWAP_MADE)`
   * REPLACES a pick in place rather than appending one, which is what returns the outgoing
   * species to the pool and what keeps the turn where it was. The consequence is that after
   * the fold `picks` looks exactly as it would have if the player had drafted the incoming
   * species in the first place, so the swap is unrecoverable from `picks` and the budget it
   * spent would be unrecoverable with it.
   *
   * `selectSwapsRemaining` counts these; nothing stores a remaining count. That is the part
   * rule 3 is about — a stored `swapsLeft` would be free to disagree with the log after an
   * undo, and this array cannot, because undo removes the entry and re-folds.
   *
   * An ARRAY rather than a `Record<playerId, number>` for {@link CardPlay}'s reason: 03-11
   * advances a swap round by counting the moves recorded for that `swapRound`, which is
   * order- and identity-sensitive, and sync rule 14 forbids deriving either from a key set.
   */
  swaps: SwapRecord[];
  /**
   * Every pass recorded in a dedicated swap round, in log order, from `swap/passed`.
   *
   * ## Why it is a sibling of {@link DraftState.swaps} and not folded into it
   *
   * A swap and a pass are both MOVES — the swap round's clock counts them together, which
   * is what lets a round step past somebody who chose nothing. But they are not the same
   * event and a shared array would have to say which, through a null `inMonId` or a `kind`
   * discriminant, and every reader would then have to filter before it could count.
   * `selectSwapsRemaining` in particular counts `swaps` and must never see a pass: a pass
   * costs no budget, and one forgotten filter would spend an allowance for a non-event.
   *
   * Two arrays, one `+` at the single place the clock is derived, and neither reader can
   * make that mistake.
   *
   * Nothing derived is stored here either. Which player is on the clock, whether the round
   * is finished and whether the tournament is complete are all computed from these entries
   * on every read — see `selectSwapRoundPosition` and `selectIsTournamentComplete`.
   */
  passes: SwapPass[];
  /**
   * Every snake ban placed so far, in log order, recorded by `bans/placed`. `[]` outside
   * a `snake` tournament, and `[]` until the first ban lands inside one.
   *
   * An ARRAY rather than a `Record<playerId, string[]>`, for exactly the reason
   * {@link CardPlay} gives: sync rule 14 forbids deriving anything order-sensitive from a
   * key set, and the ban stage's turn is nothing BUT order. Whose turn it is, which pass
   * is current and how many bans each player has left are all read off this list's
   * length and its serpentine position — a record would lose the interleaving between
   * players that the whole derivation runs on.
   */
  banPlacements: BanPlacement[];
  /**
   * Every blind submission, in log order, recorded by `bans/submitted`. `[]` outside a
   * `blind` tournament.
   *
   * A sibling array of {@link DraftState.banPlacements} rather than a shared list with a
   * discriminant, on `swaps`/`passes`' precedent above: a snake ban and a blind submission
   * are not the same event — one is a species, the other is a whole allotment — and a
   * shared array would make every reader filter before it could count.
   */
  banSubmissions: BanSubmission[];
  /**
   * The reveal, recorded by `bans/revealed`. `null` until it lands.
   *
   * `null` and `[]` are DIFFERENT answers here, and only one of them is reachable. `null`
   * is "the reveal has not happened", which is what the blind stage renders its shield and
   * its entry surface for; `[]` would be "the reveal happened and nobody had banned
   * anything", which `canApply`'s `bansNotComplete` makes unreachable in any document this
   * build originates. A field initialised to `[]` would open every new tournament on the
   * reveal screen.
   *
   * Materialized rather than derived from {@link DraftState.banSubmissions}, for the
   * reason `BansRevealedPayload`'s own doc block gives: the reveal is a host act at a
   * point in the log, and a build that re-derived it would be free to disagree about which
   * submissions were in it after an undo.
   */
  bansRevealed: { playerId: string; monIds: string[] }[] | null;
}

/**
 * One snake ban, as the fold remembers it — BAN-03.
 *
 * `pass` is 1-based and CARRIED rather than derived from this array's position, for
 * {@link DraftPick}'s reason applied one level along: an undo that removes a ban ahead of
 * this one must not renumber what remains, or every ban after it moves into a different
 * `Pass {n}` column on the board.
 *
 * `seq` is the sequence number of the action that recorded it, taken off the envelope
 * rather than off an array length, so a log with gaps stays addressable.
 */
export interface BanPlacement {
  playerId: string;
  monId: string;
  /** 1-based, matching the ban board's `Pass {n}` column headers. */
  pass: number;
  seq: number;
}

/**
 * One player's whole blind allotment, as the fold remembers it — BAN-04.
 *
 * `monIds` is the WHOLE allotment in one record rather than one record per ban, which is
 * what makes an undo removable as one act (D-05). The count is not stored beside it:
 * `monIds.length` is the count, and `config.bansPerPlayer` is what it should equal.
 */
export interface BanSubmission {
  playerId: string;
  monIds: string[];
  seq: number;
}

/**
 * One swap, as the fold remembers it.
 *
 * `seq` carries the same justification {@link DraftPick}'s does — it is the sequence number
 * of the action that recorded the swap, which is what a compensating action would target —
 * and it is deliberately NOT the seq of the pick that was replaced. That pick keeps its own,
 * because it is still the same slot-filling event.
 *
 * Both ids are kept. `outMonId` is what an undo announcement names as returning to the slot
 * and `inMonId` is what returns to the pool, and a record holding only one of them would
 * make that sentence unwritable without re-reading the log.
 */
export interface SwapRecord {
  playerId: string;
  /** 1-based pick round whose slot was replaced. */
  round: number;
  outMonId: string;
  inMonId: string;
  /** `0` for a mid-draft spend; 1-based for a dedicated swap round (03-11). */
  swapRound: number;
  seq: number;
}

/**
 * One pass, as the fold remembers it — SWAP-07.
 *
 * Three fields and no slot, because a pass names no slot. `seq` carries {@link SwapRecord}'s
 * justification: it is the sequence number of the action that recorded the pass, taken off
 * the envelope rather than off an array length, so a log with gaps stays addressable.
 */
export interface SwapPass {
  playerId: string;
  /** 1-based dedicated swap round. There is no mid-draft pass, so this is never `0`. */
  swapRound: number;
  seq: number;
}

/**
 * Deep copy of config, so folded state can never alias the caller's object.
 *
 * Every array is copied ELEMENT BY ELEMENT, and that is not stylistic. TypeScript checks
 * this function for a field it forgot — the return is an explicit object literal typed
 * `TournamentConfig`, so `strict` errors on an omission — but it cannot see a shallow
 * copy: `bans: config.bans` type-checks and quietly shares one array between the caller
 * and the folded state. `initialState` runs this on every `fold`, and `fold` runs on
 * every undo, so a shared array shows up as undoing a pick changing the banlist.
 */
function copyConfig(config: TournamentConfig): TournamentConfig {
  return {
    formatLabel: config.formatLabel,
    players: config.players.map((player) => ({ id: player.id, name: player.name })),
    rounds: config.rounds,
    rosterVersion: config.rosterVersion,
    rosterChecksum: config.rosterChecksum,
    poolSize: config.poolSize,
    bans: config.bans.map((id) => id),
    banMode: config.banMode,
    megasRequiredPerTeam: config.megasRequiredPerTeam,
    dualMegaChoices: config.dualMegaChoices.map((choice) => ({
      speciesId: choice.speciesId,
      forme: choice.forme,
    })),
    depth: config.depth,
    rules: config.rules.map((rule) => ({ kind: rule.kind, count: rule.count })),
    megaFormeBans: config.megaFormeBans.map((id) => id),
    swapBudget: config.swapBudget,
    swapRounds: config.swapRounds,
    // Both version 4 fields are scalars, so they are named rather than spread. A spread
    // would be shorter and would defeat the whole reason this function is written out: the
    // compiler's omission check only works against an explicit literal.
    bansPerPlayer: config.bansPerPlayer,
    duplicateBanPolicy: config.duplicateBanPolicy,
  };
}

/** The state a document is in before a single action has been applied. */
export function initialState(config: TournamentConfig): DraftState {
  return {
    config: copyConfig(config),
    poolIds: [],
    rosterVersion: null,
    rosterChecksum: null,
    order: [],
    picks: [],
    schedule: [],
    cardsPlayed: [],
    resolvedOrders: [],
    swaps: [],
    passes: [],
    banPlacements: [],
    banSubmissions: [],
    // `null`, not `[]`. See the field's own doc block: the two are different answers and
    // only `null` means "the reveal has not happened".
    bansRevealed: null,
  };
}
