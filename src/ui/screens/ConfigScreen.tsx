import { useCallback, useMemo, useState } from 'preact/hooks';

import { todayIso } from '../../adapters/clock';
import { newId, newSeed } from '../../adapters/id';
import type { RosterBundle, SpriteMeta } from '../../adapters/roster-source';
import { bannedEntries } from '../../core/bans';
import { compile } from '../../core/compile';
import { drawPool } from '../../core/draw';
import {
  checkFeasibility,
  poolSizeForPreset,
  type PoolPreset,
} from '../../core/feasibility';
import { MAX_BANS_PER_PLAYER } from '../../core/import-guard';
import { V4_CONFIG_DEFAULTS } from '../../core/migrate';
import { bannedMegaFormes, choiceFor, isMegaEligible, megaFormeRows } from '../../core/mega';
import type { RoundSpec } from '../../core/actions';
import type {
  BanMode,
  CompositionRule,
  DualMegaChoice,
  DualMegaForme,
  DuplicateBanPolicy,
  MatchMetric,
  StageFormat,
  TournamentConfig,
  TournamentDepth,
} from '../../core/model';
import type { MegaForme, RosterEntry, RosterSnapshot } from '../../core/roster/types';
import { selectStartingOrder } from '../../core/selectors';
import { createBanStage, createTournament } from '../../store';
import {
  CLEAR_BANLIST_CONFIRM,
  CLEAR_MEGA_FORME_BANLIST_CONFIRM,
  matches,
  REMOVE_PLAYER_CONFIRM,
  REROLL_ORDER_CONFIRM,
  REROLL_POOL_CONFIRM,
} from '../confirm-copy';
import { BanChipList } from '../components/BanChipList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FeasibilityBar } from '../components/FeasibilityBar';
import { announce } from '../components/LiveRegion';
import { NumericField, parseNumericField } from '../components/NumericField';
import { PlayerList, type PlayerDraft } from '../components/PlayerList';
import { PoolGrid } from '../components/PoolGrid';
import { RosterRefresh } from '../components/RosterRefresh';
import { SchedulePreview, type MoveDirection } from '../components/SchedulePreview';
import {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from '../components/SegmentedControl';
import { StalenessBanner } from '../components/StalenessBanner';
import { TypeaheadField } from '../components/TypeaheadField';

import './ConfigScreen.css';

/**
 * The config screen — D-02, 02-UI-SPEC §2.
 *
 * ## One scrolling form, not a wizard and not progressive reveal
 *
 * Player count invalidates pool size, the bans and the feasibility gate simultaneously,
 * so backtracking is the normal case here rather than the exception. A wizard makes the
 * normal case the expensive one: the host would answer the pool-size step, discover on
 * the feasibility step that six players do not fit, and walk back through every screen
 * between. Everything is visible at once and the pinned bar re-answers on every keystroke.
 *
 * ## Nothing here dispatches
 *
 * All of this is PRE-DOCUMENT form state. There is no tournament yet, so there is nothing
 * for an action to be appended to, and `dispatch` returns `draftNotStarted` until both
 * store signals exist. `dispatch` is reached exactly once from this screen — at
 * `Start draft`, through `createTournament` — and nothing else on it is an action. Stated
 * here so a later reader adding a "config changed" action knows the omission is a
 * decision. The rule flips the moment the draft starts: 02-CONTEXT records it as "config
 * changes made *before* the tournament exists are pre-document form state; everything
 * after is an action".
 *
 * The BANLIST is the field that most looks like it wants an action and most does not. It
 * is edited from two surfaces, it changes the gate's arithmetic on every click, and it is
 * the one config value a host will be tempted to revise mid-draft — but it is still pre-
 * document form state, written once at Start through `createTournament`. The action
 * vocabulary in `actions.ts` has no ban member at all, and adding one would be a Phase 3
 * schema decision rather than a convenience.
 *
 * ## Group order
 *
 * Groups 1 (`Players`), 2 (`Tournament`), 3 (`Mega rules`), 4 (`Bans`), 5 (`Swaps`) and
 * 6 (`Pool`) — each at its declared position in the 03-UI-SPEC §1 table rather than
 * appended, because the table's order is the reason the pool readout is last: it is the
 * only group whose readout reflects every group above it.
 *
 * `Swaps` is inserted at 5 rather than added at the end, and the insertion point is the
 * decision. D-32 couples the swap-round count to the pool size — a swap round over a pool
 * that is exactly its minimum is a round in which nothing is left to take — so the host has
 * to have answered both swap questions before the pool readout below them means anything.
 *
 * `Mega rules` is the one group with SUB-SECTIONS, and their order is the 03-UI-SPEC §1
 * table's: `Megas required per team`, then `Round schedule`, then `Dual-Mega species`, then
 * `Mega-forme bans`. The schedule sits directly under the field because it is that field's
 * visible consequence — a host who types 2 sees which two rounds it made, in the same
 * glance — and the forme bans read last because they are the longest thing in the group and
 * everything above them is a sentence or a list.
 *
 * All four take ONE treatment: `.config-screen__section` with an `<h2>` at `--text-heading`,
 * which is 03-UI-SPEC §1's contract. `Dual-Mega species` was a `--text-label` `<p>` until
 * this group gained its fourth sub-section, on the argument that a heading "would be
 * claiming a level the form does not have". With four of them the group plainly has the
 * level, and two treatments inside one group is the thing a host actually notices.
 */

/**
 * Six rounds, six picks, one team of six — DRFT-04, and D-06 declines to make it a host
 * decision.
 *
 * "Compiled" in RULE-02 means the rounds get TYPED, not that there is a different number
 * of them: a shorter team exports a paste Showdown accepts and a Champions match does not.
 * So this stays one constant in one place rather than a `6` scattered through the
 * derivations that read it — the schedule's length, the card count and the slot-array
 * length all read `config.rounds`, and no derivation anywhere may hardcode the literal.
 *
 * Host-selectable team size is DEFERRED rather than forgotten (03-CONTEXT `<deferred>`);
 * it is worth revisiting only if a group actually asks for quick three-pick drafts.
 */
const ROUNDS = 6;

/** How many blank rows a fresh config screen starts with. */
const INITIAL_PLAYERS = 4;

/**
 * Verbatim from 02-UI-SPEC §Copywriting Contract → Config screen.
 *
 * All three depth options are ENABLED, deliberately unlike ban mode where two are
 * disabled (D-12). ROADMAP criterion 1 says the host "enters … a tournament depth", and a
 * disabled depth would make that criterion unmeetable.
 *
 * Phase 2 shipped this block saying the screens the deeper options lead to were not built
 * yet, and pointed at a single note that said so. THIS PHASE IS THOSE SCREENS, so both
 * halves of that sentence stopped being true and are corrected here rather than left for
 * the next reader to trust — 05-UI-SPEC §Amendments: a stale contract comment is worse than
 * no comment. What replaces the promise is {@link DEPTH_NOTES}, one sentence per option,
 * because D-01 makes the difference between the two deeper tiers a SPECIFIC one — the
 * numeric field and the editable history — and one sentence cannot state three outcomes.
 */
const DEPTH_OPTIONS: readonly SegmentedOption<TournamentDepth>[] = [
  { value: 'draftOnly', label: 'Draft only' },
  { value: 'draftAndBrackets', label: 'Draft and brackets' },
  { value: 'draftBracketsAndLog', label: 'Draft, brackets and match log' },
];

/**
 * The note under the depth control — 05-UI-SPEC §Amendment 2, one per option.
 *
 * Module constants rather than inline JSX prose, for `ReadOnlyBanner.tsx:42-51`'s stated
 * reason: JSX collapses whitespace between text lines and these are contracts down to the
 * full stop. Keyed by {@link TournamentDepth} rather than a switch, so a member added to
 * the union fails the build here instead of rendering an empty note.
 */
const DEPTH_NOTES: Readonly<Record<TournamentDepth, string>> = {
  draftOnly: 'The night ends when the draft ends.',
  draftAndBrackets:
    'After the draft: a round robin, a cut you choose, and a single-elimination bracket. Winners only — no scores.',
  draftBracketsAndLog:
    'Everything in Draft and brackets, plus one number per match that breaks ties in the standings.',
};

/**
 * The three depth tiers that run matches after the draft — D-01.
 *
 * `draftOnly` is the one tier with nothing after the draft, so it is the one the round-robin
 * size line and both format controls are absent or inert at. Derived from the depth rather
 * than from a second piece of state, so the two cannot disagree.
 */
function hasMatches(value: TournamentDepth): boolean {
  return value !== 'draftOnly';
}

/**
 * `A round robin at {p} players is {n} matches.` — 05-UI-SPEC §Copywriting → Config screen.
 *
 * A PLAIN FACT and not a warning: it is not routed through `FeasibilityBar` and takes no
 * warning styling. `feasibility.ts` is the single authority on what is satisfiable, and a
 * round robin of any size is satisfiable — this line only says how long the night is.
 *
 * `p(p−1)/2`, the count of unordered pairs, which is exactly one match per pair of players.
 * The plural goes through `confirm-copy.ts`'s helper rather than a second one declared here:
 * at two players this reads `1 match`, and 05-UI-SPEC requires every interpolated count to
 * take a helper.
 */
function roundRobinSizeLine(playerCount: number): string {
  return `A round robin at ${playerCount} players is ${matches((playerCount * (playerCount - 1)) / 2)}.`;
}

/**
 * `Match result`'s two options — TOUR-07, D-04. Verbatim from 05-UI-SPEC §Copywriting →
 * Config screen, accent included: the first label carries an acute e, not a bare `e`.
 *
 * The VALUES are {@link MatchMetric}'s members and the labels are what the host reads. The
 * two are deliberately not the same string: the members are written into every saved
 * document from schema 5 onward, so renaming one breaks every tournament already on disk,
 * while a label is free to be reworded.
 *
 * The three LEGENDS are inline at the render site rather than constants here, matching
 * `legend="Tournament depth"` directly above them. `ReadOnlyBanner.tsx:42-51`'s
 * constants-not-prose rule is about multi-line sentences whose whitespace JSX collapses;
 * a two-word attribute value has no whitespace to lose.
 */
const MATCH_METRIC_OPTIONS: readonly SegmentedOption<MatchMetric>[] = [
  { value: 'pokemonLeft', label: 'Pokémon left' },
  { value: 'koDifference', label: 'KO difference' },
];

/**
 * `Round robin format` and `Bracket format` share these two — D-08.
 *
 * TWO controls over ONE options list, and the split is the decision `model.ts`'s
 * {@link StageFormat} doc block records: the common shape of a draft night is a quick
 * best-of-one round robin feeding a best-of-three bracket, and one field for both would
 * force the whole night to run at whichever length was picked.
 */
const STAGE_FORMAT_OPTIONS: readonly SegmentedOption<StageFormat>[] = [
  { value: 'bo1', label: 'Best of one' },
  { value: 'bo3', label: 'Best of three' },
];

/**
 * `Match result`'s reason at the two lighter depths — 05-UI-SPEC §1 and §Copywriting →
 * Config screen, and it EXCLUDES the `— ` separator for `DUPLICATE_BANS_SNAKE_REASON`'s
 * stated reason: the separator is markup, so the copy contract, this constant and the test
 * assertion stay one value (WR-03).
 *
 * It names the depth that WOULD make the control live. D-01/D-02 make `Draft and brackets`
 * a winners-only tier, so there is no number for a metric to give a meaning to — and a
 * reason that only said "unavailable" would leave the host with nothing to do about it.
 */
const MATCH_METRIC_REASON =
  'Draft and brackets records winners only. Choose Draft, brackets and match log to record a number per match.';

/**
 * Both format controls' reason at `draftOnly` — ONE constant, read from two call sites.
 *
 * Two constants holding the same sentence would be two places to amend it, and 05-UI-SPEC
 * §Copywriting gives it once as `Format inert reason` for both rows of the control table.
 */
const STAGE_FORMAT_REASON = 'Draft only has no matches.';

/**
 * The ids the three inert-able controls name as their description.
 *
 * Module constants rather than generated ones, on `FeasibilityBar.tsx:42-48`'s reasoning:
 * there is exactly one config screen and exactly one of each control on it, so a pinned id
 * is the answer and a generated one would be a second answer to one question.
 *
 * THREE ids even though two of them label the same sentence. Two elements sharing one id is
 * invalid markup and `aria-describedby` resolves to whichever the parser saw first, so the
 * bracket control would be described by the round robin's copy of the reason — correct by
 * accident, and silently wrong the day the two sentences diverge.
 */
const MATCH_METRIC_REASON_ID = 'config-match-metric-reason';
const ROUND_ROBIN_FORMAT_REASON_ID = 'config-round-robin-format-reason';
const BRACKET_FORMAT_REASON_ID = 'config-bracket-format-reason';

/**
 * A `SegmentedControl` that can be inert, with its reason visible beneath it.
 *
 * ## `aria-disabled` WITHOUT native `disabled`, on the WHOLE control — do not "fix" it
 *
 * `SegmentedControl` has a per-OPTION `disabled` mechanism (`:73-79`) and this deliberately
 * does not use it: 05-UI-SPEC §1 is explicit that at these depths EVERY member of the
 * control is unavailable rather than one of them. So it takes `Start draft`'s pattern
 * instead — `FeasibilityBar.tsx:18-25`: a natively disabled control is not focusable, so a
 * keyboard user could never reach the explanation, and the explanation is the entire point
 * of rendering an unusable control at all.
 *
 * ## The attribute is shed, never set to `'false'`
 *
 * `undefined` when live, so the attribute is ABSENT from the markup. Setting it to the
 * string false instead is not the same thing, and plenty of assistive technology reports
 * that as disabled anyway (WR-04, of which this phase adds seven consumers and this
 * component is two of them). `aria-describedby` sheds with it: a live control has no
 * description to point at, and a dangling id reference is a promise the DOM does not keep.
 *
 * This block DESCRIBES the attribute values rather than quoting them, following the
 * repository pattern `FeasibilityBar`'s doc block states: the acceptance checks here are
 * plain text searches, and a comment that quotes what it forbids makes the gate match its
 * own documentation.
 *
 * ## One vnode shape across the boundary
 *
 * The wrapper, the control and its radios render identically in both states; only the reason
 * appears. Rendering a different element in the inert branch would unmount the focused radio
 * and drop focus to `<body>` — the regression 02-11 fixed on `SplitPanes`.
 */
function InertibleSegmentedControl<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  inert,
  reason,
  reasonId,
}: SegmentedControlProps<T> & {
  inert: boolean;
  reason: string;
  reasonId: string;
}) {
  return (
    <div
      class="config-screen__inert-control"
      aria-disabled={inert ? 'true' : undefined}
      aria-describedby={inert ? reasonId : undefined}
    >
      <SegmentedControl
        legend={legend}
        name={name}
        options={options}
        value={value}
        onChange={(next) => {
          // The early return IS the refusal, and it is what keeps the ARIA honest: without
          // it the attribute would claim the control is inert while an interaction still
          // changed the config the host is about to commit to. Same guard the `Duplicate
          // bans` control carries, for the same reason.
          if (inert) return;
          onChange(next);
        }}
      />

      {inert && (
        <span class="config-screen__inert-reason" id={reasonId}>
          {/*
            The `— ` separator is MARKUP rather than `::before` content — a dash generated
            by a stylesheet is half a visible line that no test reads (WR-03) — and it is
            `aria-hidden` so the description `aria-describedby` resolves to is the sentence
            alone. An expression container holding a string literal, not bare JSX text,
            because JSX collapses trailing whitespace and the space is half of the two
            characters.
          */}
          <span aria-hidden="true">{'— '}</span>
          {reason}
        </span>
      )}
    </div>
  );
}

/**
 * Verbatim from 02-UI-SPEC §Copywriting Contract → Config screen.
 *
 * `Either` is the default and it is what an ABSENT entry in `dualMegaChoices` means, so a
 * host who never touches these rows stores nothing (see `DualMegaChoice` in `model.ts`).
 */
const DUAL_MEGA_OPTIONS: readonly SegmentedOption<DualMegaForme>[] = [
  { value: 'x', label: 'Mega X' },
  { value: 'y', label: 'Mega Y' },
  { value: 'either', label: 'Either' },
];

const DUAL_MEGA_HEADING = 'Dual-Mega species';

/**
 * The `Round schedule` sub-section — verbatim from 03-UI-SPEC §Copywriting Contract.
 *
 * The helper states the freeze in the same breath as the invitation, because D-13 makes
 * config time the ONLY time this is editable: there is no `schedule/reordered` action and
 * no mid-draft reorder surface, so a host who assumes they can fix it later has assumed
 * wrong and this line is where they find out.
 */
const SCHEDULE_HEADING = 'Round schedule';
const SCHEDULE_HELPER =
  'The draft runs these rounds in this order. Reorder them before you start; the schedule is fixed once the draft begins.';

/**
 * The `Mega-forme bans` sub-section — verbatim from 03-UI-SPEC §3 and §Copywriting Contract.
 *
 * The helper's SECOND SENTENCE is load-bearing and must not be trimmed as a repetition of
 * the first. D-10 makes "Charizard pinned to X with X banned" a normal outcome with no error
 * state, no warning and no feasibility code — so the species simply stops appearing in the
 * Mega rounds, and a host who has not been told that reads a missing species as a bug and
 * goes looking for the setting that broke it.
 */
const MEGA_BAN_HEADING = 'Mega-forme bans';
const MEGA_BAN_HELPER =
  'A banned forme cannot be used this tournament. A species with no forme left simply stays out of the Mega rounds — it is still draftable in an open round.';
const MEGA_BAN_FIELD_LABEL = 'Ban a Mega forme by name';
const MEGA_BAN_FIELD_PLACEHOLDER = 'Name';
/** The singular noun in the typeahead's no-match line: `No Mega forme matches "{query}".` */
const MEGA_BAN_SUBJECT = 'Mega forme';
/** The plural noun in the grid's count line: `{n} of {total} Mega formes banned`. */
const MEGA_BAN_COUNT_SUBJECT = 'Mega formes';
/** The list every chip names: `Remove {formeName} from the Mega-forme banlist`. */
const MEGA_BAN_LIST_NAME = 'the Mega-forme banlist';
/**
 * Why the `Mega capability` filter is unusable over this grid.
 *
 * EXCLUDES the `— ` separator, which `FilterBar` renders as markup beside it. Keeping the
 * separator out of the constant is what makes the copy table, this value and the assertion
 * one string rather than three that agree today.
 */
const MEGA_FILTER_INERT_REASON = 'This list is Mega formes only';

/** `1 Mega-forme ban` / `{n} Mega-forme bans`, for the same reason `banCountPhrase` exists. */
function megaFormeBanCountPhrase(count: number): string {
  return count === 1 ? '1 Mega-forme ban' : `${count} Mega-forme bans`;
}

/**
 * The live-region sentence for a forme ban or unban — 03-UI-SPEC §Live-region announcements.
 *
 * Composed in ONE place, exactly as `banAnnouncement` is, so the typeahead and the grid
 * cannot describe one write two ways.
 */
function megaFormeBanAnnouncement(name: string, banned: boolean, count: number): string {
  return `${name} ${banned ? 'banned' : 'unbanned'}. ${megaFormeBanCountPhrase(count)}.`;
}

/**
 * Verbatim from 03-UI-SPEC §Live-region announcements.
 *
 * A move exchanges two kinds, so exactly one round becomes a Mega round and exactly one
 * becomes open — the two sentences are the whole of what changed, not a summary of it.
 */
function reorderAnnouncement(megaRound: number, openRound: number): string {
  return `Round ${megaRound} is now a Mega round. Round ${openRound} is now open.`;
}

/**
 * Interpolated from the player count and the value ON SCREEN, so the number the host is
 * reasoning about is the one in front of them rather than a worked example.
 *
 * An unparseable field reads as `0` here rather than as `NaN`. The gate says what is wrong
 * with the field; a helper line repeating it in arithmetic would be a second voice.
 *
 * AMENDED by 03-UI-SPEC §Copywriting Contract, and the first clause is the amendment. It
 * answers the likeliest confusion in this phase (03-RESEARCH stress-test case 3): a host
 * who wants a Mega-less night otherwise reaches for a full sweep of forme bans instead of
 * typing `0`.
 * Saying what 0 DOES — no slot is a Mega slot, nothing exports with a stone — is the
 * difference between a field that states a number and one that states a rule set.
 */
function megasRequiredHelper(players: number, megasPerTeam: number): string {
  return `0 means no Mega requirement, and no slot is a Mega slot — nothing exports with a Mega Stone. A requirement of ${megasPerTeam} makes ${megasPerTeam} rounds Mega-only and needs at least ${players * megasPerTeam} Pokémon that can still Mega.`;
}

/** Verbatim from 02-UI-SPEC §Copywriting Contract → Config screen — BAN-02. */
const BAN_FIELD_LABEL = 'Ban a Pokémon by name';
const BAN_FIELD_PLACEHOLDER = 'Name';

/**
 * Verbatim from 03-UI-SPEC §Copywriting Contract → Config screen — SWAP-01, SWAP-03.
 *
 * Module constants rather than inline JSX text, because JSX collapses whitespace between
 * text lines and these are contracts asserted on exact equality. The budget's helper
 * states D-29's one-budget-two-moments rule in one sentence so the host does not go
 * looking for a second allowance they never got.
 */
const SWAP_BUDGET_LABEL = 'Swap budget per player';
const SWAP_BUDGET_HELPER =
  'Each player may swap this many times in total, mid-draft or in a swap round. 0 means no swaps.';
const SWAP_ROUNDS_LABEL = 'Swap rounds after the draft';
const SWAP_ROUNDS_HELPER =
  'Each swap round gives every player one chance to swap or pass. 0 means the draft ends with the last pick.';

/**
 * The three ban modes — BAN-01, D-12. All three render and **all three are now selectable.**
 *
 * ## D-12's promised payoff, paid in full
 *
 * `BanMode` has carried all three values since 02-02, so Phase 4 enabled two options rather
 * than redesigning the control and migrating every saved tournament. 04-05 took the suffix
 * and the `disabled` flag off `snake`; 04-09 took them off `blind` once its locked state
 * existed to land on. Neither change moved anything else about this control, which is what
 * shipping an unbuilt mode as a disabled member of a real control was for.
 *
 * A mode is enabled only once the surfaces behind it exist — enabling one earlier routes a
 * host to a screen with nothing on it and no way back (T-04-21), which is why these two
 * moves were sequenced rather than made together.
 *
 * ## The suffix mechanism is still live, one control down
 *
 * No member here carries it any more, but `DUPLICATE_POLICY_OPTIONS` does: BAN-07 is
 * partial by D-19 and its `Re-ban` member ships disabled. The reasoning for the shape lives
 * there now, because that is where the last unbuilt option is.
 */
const BAN_MODE_OPTIONS: readonly SegmentedOption<BanMode>[] = [
  { value: 'hostBanlist', label: 'Host banlist' },
  { value: 'blind', label: 'Blind' },
  { value: 'snake', label: 'Snake' },
];

const BANS_PER_PLAYER_LABEL = 'Bans per player';
const BANS_PER_PLAYER_HELPER =
  'Each player bans this many Pokémon before the pool is drawn. Every ban applies to everyone.';

/**
 * The default the field opens on, and it is deliberately NOT `migrate.ts`'s `0`.
 *
 * Every other numeric field on this screen defaults to 0, because a feature the host has not
 * asked for should stay invisible. This field only EXISTS once the host has picked a mode
 * whose entire purpose is player bans, so 0 is never the intent — and a default of 0 would
 * greet every blind or snake host with an immediate `bansPerPlayerNotPositive` blocker on a
 * field they have not touched.
 *
 * The migration default is `0` and it is a different number ON PURPOSE: a schema-3 document
 * was necessarily `hostBanlist` (blind and snake were both disabled), so `0` is its true
 * answer rather than a placeholder. **Do not unify the two constants.** They answer different
 * questions and a single constant would make one of the two answers wrong.
 *
 * A constant, not a derivation from player count or roster size, so it introduces no second
 * authority on what is sensible — the precise thing D-10 rejected.
 */
const DEFAULT_BANS_PER_PLAYER = '1';

const DUPLICATE_BANS_LEGEND = 'Duplicate bans';
const DUPLICATE_BANS_HELPER =
  'Blind mode only. If two players ban the same Pokémon it is banned once, the second ban is spent, and the reveal says who collided.';

/**
 * D-20's inert reason, and it EXCLUDES the `— ` separator.
 *
 * The separator is markup — an `aria-hidden` span beside this string, never `::before`
 * content — so the copy contract, this constant and the test assertion stay one value. WR-03,
 * and the rule is stated in full at `SplitPanes`' `POOL_EXPAND_REASON`.
 */
const DUPLICATE_BANS_SNAKE_REASON =
  'Snake shows previous bans, so two players cannot ban the same Pokémon.';

/**
 * BAN-07's config-time surface, and BAN-07 is only PARTIALLY satisfied — D-19.
 *
 * **Only `bothApply` is built.** The re-ban branch is descoped by owner-approved decision, so
 * the option ships DISABLED rather than absent. That is not a placeholder: it means a later
 * milestone enables an option, where an absent control would have meant adding a control AND
 * bumping the schema to carry what it writes. It is the same move Phase 2's D-12 made for
 * blind and snake themselves, and the line above is that move paying out.
 *
 * The suffix below carries a CAPITAL `N`, which is the form `BAN_MODE_OPTIONS` shipped for
 * both of its own unbuilt members before 04-05 and 04-09 enabled them. **This is now the
 * only place in the file that carries it**, so the form it matches is a historical one
 * rather than a live sibling — recorded here because the reference above it is gone and the
 * next reader would otherwise have nothing to check the casing against. D-19's own text
 * renders it lowercase while also requiring the established label form be reused exactly;
 * the two cannot both be met literally, and two casings of one label form IS the second way
 * of saying it that D-19 exists to prevent. 04-UI-SPEC §A conflict in the upstream
 * instructions records the resolution. The string is written once, in `label` — a comment
 * restating it would be the third copy and the first one free to drift.
 *
 * ## The refused option takes the native attribute AND the ARIA one
 *
 * This is deliberately UNLIKE `FeasibilityBar`'s `Start draft`, which carries the ARIA state
 * alone so it stays focusable. Do not "fix" either of them into agreement with the other.
 *
 * `Start draft`'s reason is COMPUTED, changes on every keystroke, and lives in a separate
 * status element that only a focusable control can point at. This one carries a reason that
 * is static and sits INSIDE the option's own accessible name — the visible suffix below,
 * which 02-UI-SPEC §2 specifies and which `SegmentedControl` was built to accept from the
 * caller rather than synthesize. A natively disabled radio is still in the accessibility
 * tree and still announces that name, so nothing is lost by refusing the click outright.
 */
const DUPLICATE_POLICY_OPTIONS: readonly SegmentedOption<DuplicateBanPolicy>[] = [
  { value: 'bothApply', label: 'Both apply, one is spent' },
  { value: 'reBan', label: 'Re-ban — Not yet available', disabled: true },
];

/**
 * `1 ban` / `{n} bans`, and the reason it is a helper rather than a template.
 *
 * 02-UI-SPEC gives the announcement as `{name} banned. {n} bans.`, which renders "1 bans" on
 * the first ban — and the first ban is the one every host makes. S-5 requires a
 * singular/plural helper for every interpolated count, `importConfirmBody` set the precedent
 * in Phase 1, and 02-06 made the same call on `REMOVE_PLAYER_CONFIRM`. Every other character
 * of the announcement is verbatim.
 */
function banCountPhrase(count: number): string {
  return count === 1 ? '1 ban' : `${count} bans`;
}

/**
 * The live-region sentence for a ban or an unban — 02-UI-SPEC §Live-region announcements.
 *
 * Composed in ONE place so the typeahead and the grid cannot announce differently for the
 * same action. Two surfaces writing one list is D-10; two surfaces describing one write
 * differently is how a host learns to distrust the region.
 */
function banAnnouncement(name: string, banned: boolean, count: number): string {
  return `${name} ${banned ? 'banned' : 'unbanned'}. ${banCountPhrase(count)}.`;
}

/**
 * Verbatim from 02-UI-SPEC §Copywriting Contract → Config screen — DRFT-02, D-05.
 *
 * The labels carry the multiplication sign rather than the letter x, matching the copy
 * table and the arithmetic the feasibility reasons are written in.
 */
const POOL_PRESET_OPTIONS: readonly SegmentedOption<PoolPreset>[] = [
  { value: 'exact', label: 'Exact' },
  { value: 'x1_5', label: '1.5×' },
  { value: 'x2', label: '2×' },
];

/**
 * What `Exact` means, in the numbers currently on screen.
 *
 * Fixed on Exact regardless of which preset is selected, per the copy table: it is the
 * sentence that explains the degenerate case the warning severity exists for, and the
 * other two presets are described by being multiples of it.
 */
function poolSizeHelper(players: number, rounds: number): string {
  return `Exact is ${players} players × ${rounds} rounds = ${players * rounds} Pokémon, with nothing left over.`;
}

/**
 * The draw readout — 02-UI-SPEC §2.
 *
 * Both numbers come from the `drawPool` result: `ids.length`, never the requested size,
 * and `megaCapableCount`, never a recount of the roster. It is a pure derivation of
 * (config, seed), so it is stable unless one of those changes.
 */
function drawReadout(poolSize: number, megaCapableCount: number): string {
  return `Pool: ${poolSize} Pokémon — ${megaCapableCount} Mega-capable`;
}

export interface ConfigScreenProps {
  /** The loaded roster snapshot. Supplies the regulation the format label is prefilled from. */
  snapshot: RosterSnapshot;
  /** The draftable roster in display order. */
  entries: readonly RosterEntry[];
  /**
   * The measured sprite inventory, for the ban grid.
   *
   * It arrives beside the snapshot rather than being read from it: the inventory is a
   * measurement of the committed PNG files taken at build time, not a field of the roster,
   * and `spriteSrc` is the only thing allowed to turn it into a filename.
   */
  spriteMeta: SpriteMeta;
  /** A tournament now exists. Routing is the caller's; this screen only reports it. */
  onStarted: () => void;
  /**
   * A NEWER DEFAULT roster was adopted from the origin — REFR-01.
   *
   * Optional, and every roster prop below it is optional for the same stated reason: the
   * `Roster` group is a surface this screen OWNS rather than a service it performs for its
   * caller, so a call site that says nothing about rosters still gets a working group. The
   * shell is the only caller that has anything to do with the answer.
   */
  onRosterRefreshed?: ((bundle: RosterBundle) => void) | undefined;
  /**
   * A roster FILE was read and adopted into the registry — REFR-02. A separate callback
   * from the one above because 05-04 decided an imported roster does NOT become the
   * default; see `RosterRefresh`'s prop doc for what collapsing the two would cost.
   */
  onRosterImported?: ((bundle: RosterBundle) => void) | undefined;
  /**
   * D-26's landing site: the staleness banner on the landing screen routes here and moves
   * focus to `Check for a new roster` rather than duplicating the control.
   */
  focusRosterRefresh?: boolean;
}

export function ConfigScreen({
  snapshot,
  entries,
  spriteMeta,
  onStarted,
  onRosterRefreshed,
  onRosterImported,
  focusRosterRefresh = false,
}: ConfigScreenProps) {
  /**
   * Today, LOCAL, read ONCE per mount rather than on every render — REFR-03.
   *
   * A `useState` initializer for the same reason the player ids below use one: it is an
   * impure read, and calling it in the render body would make this component answer a
   * different question on every keystroke in the form. Once per mount is also the right
   * granularity for the question being asked. A host who leaves this screen open across
   * local midnight on the day a regulation expires does not get the banner until they
   * navigate, which is fine — the banner exists to be read on arrival, and re-rendering a
   * warning underneath someone mid-form would be worse than showing it when they next
   * come back.
   */
  const [today] = useState(todayIso);

  /**
   * Four rows, all blank.
   *
   * NOT prefilled with `Player 1`…`Player 4`. Blank is the honest starting state, the
   * feasibility gate already has a sentence for it (`Every player needs a name. Player
   * {i} is blank.`), and placeholder names would let a host start a draft in which
   * somebody is genuinely called `Player 3` by forgetting to type over it.
   *
   * Ids come from `newId()` at the impure edge, in a `useState` initializer so they are
   * drawn once rather than on every render. The `p1`/`p2` literals Phase 1 scaffolded with
   * are gone from the codebase.
   */
  const [players, setPlayers] = useState<PlayerDraft[]>(() =>
    Array.from({ length: INITIAL_PLAYERS }, () => ({ id: newId(), name: '' })),
  );

  const [formatLabel, setFormatLabel] = useState(`Champions ${snapshot.regulation}`);
  const [depth, setDepth] = useState<TournamentDepth>('draftOnly');

  /**
   * TOUR-07's metric and D-08's two stage formats — pre-document form state like everything
   * else on this screen, resolved into the config `handleStart` writes exactly once.
   *
   * Seeded from `V4_CONFIG_DEFAULTS` rather than from three restated literals, so a
   * tournament created here and a schema 4 tournament migrated forward say the same thing
   * about a host who never touched these controls. `migrate.ts:167-171` records that the two
   * agreeing is a coincidence of two defensible answers rather than a shared fact — which is
   * exactly why the constant is imported rather than copied.
   *
   * The state SURVIVES a depth change that makes a control inert. A host who chose
   * `KO difference`, dropped to `Draft and brackets` to read the note and came back should
   * find their answer where they left it; clearing it on the way down would silently discard
   * a choice they made and never told anyone about.
   */
  const [matchMetric, setMatchMetric] = useState<MatchMetric>(V4_CONFIG_DEFAULTS.matchMetric);
  const [roundRobinFormat, setRoundRobinFormat] = useState<StageFormat>(
    V4_CONFIG_DEFAULTS.roundRobinFormat,
  );
  const [bracketFormat, setBracketFormat] = useState<StageFormat>(
    V4_CONFIG_DEFAULTS.bracketFormat,
  );

  /**
   * Which of the three controls above the host can actually answer right now — 05-UI-SPEC
   * §1's "Inert when" column, and the two conditions are deliberately different.
   *
   * `Match result` is live at ONE tier: D-01/D-02 make `draftBracketsAndLog` the only depth
   * that records a number per match, so at both lighter tiers the metric has nothing to give
   * a meaning to. Both stage formats are live at TWO, because `draftOnly` is the one tier
   * that runs no matches at all and a best-of is a length for a match that exists.
   *
   * DERIVED from `depth` rather than mirrored into state, so the ARIA is shed in the same
   * render the depth changes (WR-04) and there is no second value free to disagree with the
   * first. `hasMatches` rather than a second `!== 'draftOnly'` here: it is the same question
   * the round-robin size line asks, and one predicate cannot answer it two ways.
   */
  const matchMetricInert = depth !== 'draftBracketsAndLog';
  const stageFormatInert = !hasMatches(depth);

  /**
   * The RAW text of `Megas required per team`, not a number — D-06.
   *
   * The string is the state and the parsed value is a derivation of it, because the two
   * cannot then disagree about what is on screen. `'0'` rather than `''` is the default:
   * no Mega requirement is a real answer, and an empty field is the host having deleted
   * one, which is a different thing and blocks.
   */
  const [megasRequiredRaw, setMegasRequiredRaw] = useState('0');

  /**
   * The host's permutation of the compiled schedule, or `null` for "not reordered" —
   * RULE-06, D-13.
   *
   * Two states rather than one, on the same construction as `poolOverride` below and for
   * the same reason: "the host has not reordered anything" and "the host has reordered it
   * back into the canonical order" are different answers, and only the first should follow
   * the requirement when the requirement moves.
   *
   * A reorder writes NO action — see the module block above, which states the rule for the
   * whole screen. This is pre-document form state that resolves into the single
   * `schedule/compiled` action at Start, exactly as the banlist resolves into `pool/built`.
   * There is no `schedule/reordered` member in `actions.ts` and D-13 is why: a mid-draft
   * reorder would retype slots players have already filled, with no validator left to
   * catch the resulting violation.
   */
  const [reorderedSchedule, setReorderedSchedule] = useState<RoundSpec[] | null>(null);

  /**
   * The RAW text of the two swap fields — SWAP-01, SWAP-03, D-30.
   *
   * Same construction as `megasRequiredRaw` above and for the same reason: the string is
   * the state and the parsed value is a derivation of it, so what is on screen and what
   * the gate is judging cannot become two facts that disagree. `'0'` rather than `''` is
   * the default because no swaps is a real answer — and at `swapBudget: 0` nothing about
   * Phase 2's shipped behaviour changes, which is what makes 0 the honest default rather
   * than merely the safe one.
   *
   * Neither field is clamped here. `min={0}` is an affordance for the native stepper, not
   * enforcement, and D-30 puts the judgement in the feasibility gate.
   */
  const [swapBudgetRaw, setSwapBudgetRaw] = useState('0');
  const [swapRoundsRaw, setSwapRoundsRaw] = useState('0');

  /**
   * Only the rows the host actually changed — D-03.
   *
   * An absent entry means `'either'` (see `DualMegaChoice`), so choosing `Either` REMOVES
   * a row rather than recording it. A stale entry left behind by a regulation rotation is
   * then simply ignored instead of resurrecting a species the roster no longer offers.
   */
  const [dualMegaChoices, setDualMegaChoices] = useState<DualMegaChoice[]>([]);

  /**
   * The banlist — one flat list of species ids, two input surfaces over it (D-10).
   *
   * An ARRAY of ids, never a `Set`. It is written into `TournamentConfig.bans` at Start and
   * the document must survive `JSON.stringify` → `JSON.parse` unchanged (CLAUDE.md
   * §Serializability), which undo, autosave and file export all depend on. The `Set`s below
   * are computation-local and none of them is ever stored.
   */
  const [bans, setBans] = useState<string[]>([]);

  /** BAN-01. `hostBanlist` is the default; 04-05 adds `snake` and 04-09 adds `blind` (D-12). */
  const [banMode, setBanMode] = useState<BanMode>('hostBanlist');

  /**
   * The RAW text of `Bans per player`, not a number — D-06, and the same rule as every other
   * numeric field on this screen. `parseNumericField` turns it into `number | null` ONCE,
   * below, and `null` is what reaches the gate. Reading it arithmetically here instead is the
   * F-08 defect: `Number('')` is 0 and every relational comparison with `NaN` is false, so a
   * gate asked the obvious way reports all-clear on a field the host has emptied.
   */
  const [bansPerPlayerRaw, setBansPerPlayerRaw] = useState(DEFAULT_BANS_PER_PLAYER);

  /**
   * BAN-07, partially — see `DUPLICATE_POLICY_OPTIONS`. `reBan` is unreachable through the
   * control because its option ships disabled, so this only ever holds `bothApply` today. It
   * is state rather than a constant so that enabling the option is the whole of the change.
   */
  const [duplicateBanPolicy, setDuplicateBanPolicy] =
    useState<DuplicateBanPolicy>('bothApply');

  /**
   * Whether this mode has player bans at all — the one predicate three surfaces read.
   *
   * `hostBanlist` has none, so both new controls are WHOLLY void there and are not rendered
   * (04-UI-SPEC §1). Absent rather than disabled is the shipped precedent for a wholly void
   * affordance — `Clear the banlist` at zero bans, `Clear filters` with none active — and it
   * is also what keeps `hostBanlist` byte-identical to the screen Phase 2 verified, which is
   * D-01's zero-regression posture.
   */
  const hasPlayerBans = banMode !== 'hostBanlist';

  /**
   * Inert rather than unrendered at `snake`, and the distinction is D-20's.
   *
   * Snake shows previous bans, so a duplicate is impossible by construction and the policy has
   * nothing to decide. It stays on screen because a host flipping between the two modes to
   * compare them will look for it — which is exactly the case the inert-with-a-reason
   * mechanism exists for (the Mega filter during a Mega round, the pane expand during card
   * play). The ARIA is derived rather than stored, so it is SHED the moment the mode changes
   * (WR-04); a `useState` mirroring it would be a second thing that can disagree.
   */
  const duplicatePolicyInert = banMode === 'snake';

  /**
   * The Mega-forme banlist — RULE-04, D-09. One flat list of FORME ids, two surfaces over it.
   *
   * A separate list from `bans` and not a subset of it, because the two exclude different
   * things: a species ban removes a Pokémon from the draw entirely, while a forme ban leaves
   * it draftable and takes away one thing it could have become. Merging them into one array
   * would make `Charizard banned` and `Charizard-Mega-X banned` indistinguishable by
   * membership, which is the whole of D-09.
   *
   * An ARRAY of ids, never a `Set`, for `bans`'s reason: it is written into
   * `TournamentConfig.megaFormeBans` at Start and the document must survive
   * `JSON.stringify` → `JSON.parse` unchanged.
   */
  const [megaFormeBans, setMegaFormeBans] = useState<string[]>([]);

  const [poolPreset, setPoolPreset] = useState<PoolPreset>('exact');

  /**
   * The override's RAW text, or `null` for "not overriding" — D-05, D-06.
   *
   * Two states rather than one, because an empty string and an untouched field are
   * different answers and the gate must be able to tell them apart. While this is `null`
   * the field DISPLAYS the preset and follows it, so adding a player or switching to `2×`
   * moves the number in front of the host. The moment they type, the string is theirs and
   * the preset stops driving it.
   *
   * Emptying the field therefore lands on `''`, not back on `null`: the host has deleted
   * the pool size, and the gate says so. Falling back to the preset on empty would make
   * the F-08 case unreachable through the one field it is about — and would make `abc`,
   * which a number input sanitizes to the empty string, silently satisfiable.
   *
   * There is exactly ONE route back to `null`, and it is a click on the `Pool size`
   * preset control — see its `onChange`. Without that route the preset became a dead
   * control the moment the host typed a character: still rendered, still accepting clicks,
   * still moving its own `:checked` state, and changing nothing on screen or at the gate.
   * `FilterBar` states the rule this file follows — "a control that clears nothing is a
   * control that teaches the host their clicks do not matter".
   */
  const [poolOverride, setPoolOverride] = useState<string | null>(null);

  /**
   * The starting order is rolled ON MOUNT, not on a click.
   *
   * The numbered list is therefore on screen from first paint, `Randomize order` always
   * RE-rolls something the host can already see, and `Start draft` never depends on a
   * prior click. That last part is the point: "no order yet" stops being a state to
   * validate against and becomes unrepresentable.
   *
   * Re-rolling draws a NEW seed rather than advancing a cursor. Two derivations sharing
   * one advancing stream is the collision `src/store.ts` warns about one phase early —
   * the pool draw and the order roll each own a seed and each consume it from cursor 0,
   * so re-rolling one cannot disturb the other.
   */
  const [orderSeed, setOrderSeed] = useState(() => newSeed());

  /**
   * The pool draw's seed — the second of two, and independent of the first.
   *
   * Two seeds rather than one advancing cursor. Each is consumed from cursor 0 by its own
   * pure function and each is re-DRAWN rather than advanced by its own re-roll, so
   * re-rolling the pool cannot disturb the starting order and vice versa. That is the
   * collision `src/store.ts` predicted one phase early, closed structurally rather than by
   * remembering to pass the right cursor.
   */
  const [poolSeed, setPoolSeed] = useState(() => newSeed());

  const order = useMemo(
    () =>
      selectStartingOrder(
        orderSeed,
        players.map((player) => player.id),
      ),
    [orderSeed, players],
  );

  /**
   * `null` when the field is empty or unparseable, and that is the whole mechanism.
   *
   * The gate refuses `null`; nothing here does. See `parseNumericField` for why the
   * alternative — reading the field arithmetically — reports all-clear on a broken value.
   */
  const megasRequiredPerTeam = useMemo(
    () => parseNumericField(megasRequiredRaw),
    [megasRequiredRaw],
  );

  /**
   * The scalar the host typed, as the rule list the document records and the compiler
   * reads — one construction with two consumers rather than two that could disagree.
   *
   * The same wrap `migrateV2ToV3` and `import-guard.buildConfig` perform, so a tournament
   * created here and one recovered from a Phase 2 save describe their Mega requirement
   * identically. `?? 0` is unreachable at Start — `feasibility.blocked` is false there and
   * a null field is itself a blocker — but it is reachable HERE, because this runs on every
   * keystroke including the one that empties the field. An empty field compiles to an
   * all-open schedule and the gate goes on blocking Start.
   */
  const rules = useMemo<CompositionRule[]>(
    () => [{ kind: 'mega', count: megasRequiredPerTeam ?? 0 }],
    [megasRequiredPerTeam],
  );

  /** What the requirement compiles to before the host touches it — RULE-02. */
  const canonicalSchedule = useMemo(() => compile(rules, ROUNDS), [rules]);

  /** What is on screen, and — at Start — what reaches the log. */
  const schedule = reorderedSchedule ?? canonicalSchedule;

  /**
   * A NEW requirement re-seeds from the compiler and drops the old permutation.
   *
   * The requirement is the source and the permutation is applied to what it produces, so a
   * host who raises `Megas required per team` from 2 to 3 gets three leading Mega rounds
   * rather than their old arrangement with one appended. Compared on the PARSED value, so
   * `0` → `00` is not a new requirement and does not discard a reorder the host is still
   * looking at.
   */
  const handleMegasRequiredInput = useCallback(
    (raw: string) => {
      setMegasRequiredRaw(raw);
      if (parseNumericField(raw) !== megasRequiredPerTeam) setReorderedSchedule(null);
    },
    [megasRequiredPerTeam],
  );

  /**
   * RULE-06's write path — a swap of two adjacent KINDS, never of two rows.
   *
   * The index is the round NUMBER, not the kind's identity, so every spec is re-indexed
   * from its position afterwards. Carrying the index along with the kind instead produces
   * rows reading `Round 3` above `Round 2`, which folds into a log the structural guard
   * refuses (`isScheduleCompiledAction` pins `rounds[i].index === i + 1`).
   *
   * The early returns are the same refusal `SchedulePreview` makes in its click handler,
   * one layer up: a move off the end or into a neighbour of the same kind changes nothing,
   * and a caller that asked for one anyway should not get a re-render and an announcement
   * saying something happened.
   */
  const handleMoveRound = useCallback(
    (position: number, direction: MoveDirection) => {
      const target = position + (direction === 'up' ? -1 : 1);
      const moved = schedule[position];
      const displaced = schedule[target];
      if (moved === undefined || displaced === undefined) return;
      if (moved.kind === displaced.kind) return;

      setReorderedSchedule(
        schedule.map((spec, index) => ({
          index: index + 1,
          kind:
            index === position ? displaced.kind : index === target ? moved.kind : spec.kind,
        })),
      );

      // Exactly one round became a Mega round and exactly one became open, because the two
      // kinds differ — checked above rather than assumed.
      const megaRound = moved.kind === 'mega' ? target + 1 : position + 1;
      const openRound = moved.kind === 'mega' ? position + 1 : target + 1;
      announce(reorderAnnouncement(megaRound, openRound));
    },
    [schedule],
  );

  /**
   * `null` when either swap field is empty or unparseable, on the same terms.
   *
   * Nothing here coerces `null` to 0. An emptied field is the host having deleted their
   * answer, which is a different state from having answered 0, and collapsing the two
   * would hide it from the gate that is supposed to notice.
   */
  const swapBudget = useMemo(() => parseNumericField(swapBudgetRaw), [swapBudgetRaw]);
  const swapRounds = useMemo(() => parseNumericField(swapRoundsRaw), [swapRoundsRaw]);

  /**
   * One row per species carrying more than one Mega forme — D-03.
   *
   * Derived from the roster, never a hardcoded pair. A regulation that adds a third
   * dual-Mega species just appears here, and one that drops a species stops rendering it.
   * The `entries` prop arrives in display order (`app.tsx` sorts it once, by dex number
   * with an id tiebreak), and a filter preserves that order — so the rows are
   * deterministic without this screen owning a second comparator that could disagree.
   */
  const dualMegaRows = useMemo(
    () => entries.filter((entry) => entry.megaFormes.length > 1),
    [entries],
  );

  /**
   * Every Mega forme on the roster, in display order — the forme grid's rows.
   *
   * Derived from the snapshot on every change, never a hardcoded list and never a count
   * typed here: the grid's total is this array's length, so a regulation that adds a Mega
   * moves the cells and the count line together. Charizard and Raichu each contribute TWO
   * rows, which is what per-forme banning means (03-UI-SPEC §A locked decision whose reach
   * this spec declines) — not a merged two-toggle cell.
   */
  const megaFormeRowsList = useMemo(() => megaFormeRows(entries), [entries]);

  /**
   * Membership by forme id — CLAUDE.md §Identity. Computation-local and never stored.
   *
   * The sibling of `bannedIdSet`, and the same three consumers: the idempotence check in
   * `applyMegaFormeBan`, the grid's pressed state, and (from 03-05) the eligibility count
   * the RULE-09 gate reads. Never `includes` on a name — that returns Meganium.
   */
  const megaFormeBanSet = useMemo(() => new Set(megaFormeBans), [megaFormeBans]);

  /**
   * The banned formes, name-sorted — the ONE forme-ban derivation on this screen.
   *
   * Every forme-ban figure reads THIS array's length, for `bannedEntries`'s reasons: the raw
   * list can hold an id this regulation no longer carries, and a count that trusted its
   * length would disagree with the grid the host is looking at.
   */
  const bannedFormes = useMemo(
    () => bannedMegaFormes(entries, megaFormeBans),
    [entries, megaFormeBans],
  );

  /**
   * Membership, tested by id — CLAUDE.md §Identity. Computation-local and never stored.
   *
   * One `Set` with three consumers: the idempotence check in `applyBan`, the draw's candidate
   * filter, and (from Task 2) the ban grid's pressed state. Building a second one somewhere
   * else would be a second answer to "is this species banned".
   */
  const bannedIdSet = useMemo(() => new Set(bans), [bans]);

  /**
   * The banned roster entries, name-sorted — the ONE ban derivation on this screen.
   *
   * Every ban count on this screen reads THIS array's length. The length of the raw banlist
   * state is not that number: a duplicate written by the second input surface would inflate
   * it and an id the roster no longer carries would count toward it (02-RESEARCH F-10).
   * `bannedEntries`'s own doc block records the equality with `checkFeasibility`'s
   * `banCount`, and a core test pins it.
   */
  const banned = useMemo(() => bannedEntries(entries, bans), [entries, bans]);

  /**
   * BAN-08, and this is the only place it is enforced.
   *
   * `DrawInput.candidates` is documented "roster entries in DISPLAY order, bans already
   * removed by the caller" — this is that caller. A banned species is therefore absent from
   * `pool/built.ids`, therefore absent from `selectAvailablePool`, therefore absent from the
   * pool's DOM: not dimmed, not struck, not rendered (D-13).
   *
   * The ban grid in the group below is the OPPOSITE surface deliberately, and the two are not
   * in conflict — one shows what you are excluding, the other shows what is left.
   */
  const drawCandidates = useMemo(
    () => entries.filter((entry) => !bannedIdSet.has(entry.id)),
    [entries, bannedIdSet],
  );

  /**
   * The ONE write path for the banlist, and the reason this is not three handlers.
   *
   * It is idempotent: a call whose `next` already matches current membership returns having
   * done nothing. That is 02-RESEARCH F-10's mitigation made structural — the grid TOGGLES
   * and the typeahead ADDS, so without it a name typed after a grid click on the same species
   * lands in the array twice and every length-based count reads one too many.
   *
   * The early return also decides the announcement. A repeat selection would have produced a
   * byte-identical string, which `LiveRegion` drops anyway, so saying nothing costs nothing
   * and states the intent rather than relying on that limitation.
   */
  const applyBan = useCallback(
    (entry: RosterEntry, next: boolean) => {
      if (bannedIdSet.has(entry.id) === next) return;

      const nextBans = next
        ? [...bans, entry.id]
        : bans.filter((id) => id !== entry.id);

      setBans(nextBans);
      // Composed from the roster-intersected length, not from `nextBans.length`, so the
      // announcement quotes the same figure the gate does.
      announce(banAnnouncement(entry.name, next, bannedEntries(entries, nextBans).length));
    },
    [bans, bannedIdSet, entries],
  );

  /**
   * The grid's half of D-10. One list, two surfaces, one write path.
   *
   * The grid TOGGLES because a cell is both the ban control and the unban control; the
   * typeahead only ever ADDS, because there is no such thing as typing a name to unban. Both
   * go through `applyBan`, which is what makes the two surfaces incapable of disagreeing.
   */
  const toggleBan = useCallback(
    (entry: RosterEntry) => applyBan(entry, !bannedIdSet.has(entry.id)),
    [applyBan, bannedIdSet],
  );

  const handleRemoveBan = useCallback(
    (entry: RosterEntry) => applyBan(entry, false),
    [applyBan],
  );

  const handleAddBan = useCallback(
    (entry: RosterEntry) => applyBan(entry, true),
    [applyBan],
  );

  /**
   * The ONE write path for the Mega-forme banlist. `applyBan`'s shape, keyed on forme ids.
   *
   * Idempotent for the same structural reason: two surfaces write one list, so a name typed
   * after a grid click on the same forme would land twice and every length-based count would
   * read one too many. The early return also decides the announcement — a repeat selection
   * changed nothing, so it says nothing.
   *
   * The count in the announcement is the roster-intersected figure, never `nextBans.length`.
   */
  const applyMegaFormeBan = useCallback(
    (forme: MegaForme, next: boolean) => {
      if (megaFormeBanSet.has(forme.id) === next) return;

      const nextBans = next
        ? [...megaFormeBans, forme.id]
        : megaFormeBans.filter((id) => id !== forme.id);

      setMegaFormeBans(nextBans);
      announce(
        megaFormeBanAnnouncement(
          forme.name,
          next,
          bannedMegaFormes(entries, nextBans).length,
        ),
      );
    },
    [entries, megaFormeBans, megaFormeBanSet],
  );

  /**
   * The same two-surface fan-out over one write path the species banlist already has.
   *
   * The grid TOGGLES because a cell is both the ban and the unban control; the typeahead only
   * ADDS, because there is no such thing as typing a name to unban.
   */
  const toggleMegaFormeBan = useCallback(
    (forme: MegaForme) => applyMegaFormeBan(forme, !megaFormeBanSet.has(forme.id)),
    [applyMegaFormeBan, megaFormeBanSet],
  );

  const handleAddMegaFormeBan = useCallback(
    (forme: MegaForme) => applyMegaFormeBan(forme, true),
    [applyMegaFormeBan],
  );

  const handleRemoveMegaFormeBan = useCallback(
    (forme: MegaForme) => applyMegaFormeBan(forme, false),
    [applyMegaFormeBan],
  );

  /** What the selected preset asks for, before the host overrides it — DRFT-02. */
  const presetPoolSize = useMemo(
    () => poolSizeForPreset(players.length, ROUNDS, poolPreset),
    [players.length, poolPreset],
  );

  /** The string the field shows: the host's text, or the preset while there is none. */
  const poolOverrideValue = poolOverride ?? String(presetPoolSize);

  /**
   * The size the gate judges and the draw is asked for — `null` when it is unusable.
   *
   * The parse happens once, HERE, and `null` is what reaches `checkFeasibility`. Reading
   * the raw string arithmetically instead is the highest-severity defect the research
   * found: `Number('')` is 0, `Number('  ')` is 0, and `Number('4e')` is NaN — and NaN
   * silently passes BOTH the too-large and the too-small comparisons, because every
   * IEEE-754 relational comparison with NaN is false. The gate would then report all-clear
   * and Start would enable on a configuration with no pool. That is why
   * `poolSizeNotAnInteger` sits above every arithmetic blocker in the precedence order.
   */
  const poolSize = useMemo(
    () => (poolOverride === null ? presetPoolSize : parseNumericField(poolOverride)),
    [poolOverride, presetPoolSize],
  );

  /**
   * The number the gate judges — parsed ONCE, here, exactly as `poolSize` above.
   *
   * `null` for empty, whitespace and anything non-finite, and `null` is what reaches
   * `checkFeasibility`, which answers with `bansPerPlayerNotAnInteger`. Coercing it to 0 here
   * would hide the emptied field from the one module that is supposed to notice it — and 0 is
   * `hostBanlist`'s legitimate value, so the coercion would be indistinguishable from a host
   * who meant it.
   */
  const bansPerPlayer = useMemo(
    () => parseNumericField(bansPerPlayerRaw),
    [bansPerPlayerRaw],
  );

  /**
   * Recomputed on every keystroke — no debounce and no `Check` button (D-16). It is a pure
   * pass over a few hundred ids, and a gate the host has to ask for is a gate they find out
   * about after typing everything else.
   */
  const feasibility = useMemo(
    () =>
      checkFeasibility({
        playerNames: players.map((player) => player.name),
        rounds: ROUNDS,
        poolSize,
        megasRequiredPerTeam,
        // The WHOLE of the gate integration. No ban warning, no ban-specific message and no
        // second validation path: `checkFeasibility` already counts by set membership and
        // already carries `poolTooLarge`, `tooManyPlayersForRoster` and `notEnoughMegas` with
        // the ban figures interpolated. One predicate, two consumers.
        bannedIds: bans,
        // RULE-09's right-hand side is measured from THESE, not from the `megaCapable` flag:
        // after D-09/D-10 a species can be Mega-capable and have no legal forme left. The
        // pins go with them because a pin can exclude the one forme a ban left standing.
        megaFormeBans,
        // The RAW state rather than `dualMegaChoicesForConfig`, which is declared further
        // down: the ordered copy exists so two hosts who made the same rulings write
        // byte-identical DOCUMENTS, and `choiceFor` looks a species up rather than
        // iterating, so the gate cannot tell the two apart.
        dualMegaChoices,
        // The parsed values, `null` and all. Coercing an emptied field to 0 here would hide
        // it from the one module that is supposed to notice — the same argument the
        // `Swaps` group's own comment makes about not attaching a reason to the field.
        swapBudget,
        swapRounds,
        // The host's actual mode and the host's actual number, both raw. The gate is the one
        // authority on whether the pair is satisfiable, and it already branches: at
        // `hostBanlist` it zeroes the player-ban term and none of the three bans-per-player
        // codes can fire, so this screen stays byte-identical to what Phase 2 verified without
        // a second mode check here. A `banMode === 'hostBanlist' ? 0 : bansPerPlayer` at this
        // line would be that second check, free to disagree with the first.
        banMode,
        bansPerPlayer,
        // The screen's OWN depth state, unlike the two adopted-document call sites which
        // pass `'draftOnly'` — see `FeasibilityInput.depth`. This is the one caller whose
        // depth is still a question, and the one where "choose Draft only, or add players"
        // names two things the host can actually do right now.
        depth,
        entries,
      }),
    [
      players,
      poolSize,
      megasRequiredPerTeam,
      bans,
      megaFormeBans,
      dualMegaChoices,
      swapBudget,
      swapRounds,
      banMode,
      bansPerPlayer,
      depth,
      entries,
    ],
  );

  /**
   * Guarded on the gate, and the guard is load-bearing rather than tidy: a blocked config
   * can ask for a pool larger than the candidate list, and `drawPool` inherits `nextInt`'s
   * empty-range `RangeError` rather than clamping. Blocked means no draw, and `Start draft`
   * refuses on the same condition.
   */
  const draw = useMemo(() => {
    if (feasibility.blocked || poolSize === null) return null;

    // `p × k`, never `k` — D-08. The quota is the number of Mega-capable entries the
    // WHOLE pool needs, because every player must be able to field `k` of them.
    //
    // Safe to run synchronously on every keystroke because `drawPool` is a two-stage
    // partition draw: O(L), exactly `size` generator draws, no loop bound. Reject-and-
    // redraw was rejected rather than merely not chosen — at 8 players requiring 4 Megas
    // each on an Exact pool the probability a uniform 48-draw satisfies the constraint is
    // 1.56 × 10^-8, about sixty-four million expected redraws, and that configuration
    // passes every feasibility blocker. Do not replace this with a retry loop.
    //
    // Measured over the CANDIDATE set — entries minus species bans — and not over
    // `draw.ids`. D-11's wording asks for pool entries that can still Mega, and this is the
    // only place that question is answerable: the guard above makes the draw `null` whenever
    // the gate has anything to say, so the gate can never read the pool. `drawPool`'s stage 2
    // then takes the quota from THIS list, which carries the count into the pool by
    // construction. Do not try to measure `draw.ids` instead — it does not exist yet.
    const megaEligibleIds = drawCandidates
      .filter((entry) =>
        isMegaEligible(entry, megaFormeBanSet, choiceFor(dualMegaChoices, entry.id)),
      )
      .map((entry) => entry.id);

    return drawPool({
      candidates: drawCandidates,
      size: poolSize,
      megasRequired: players.length * (megasRequiredPerTeam ?? 0),
      megaEligibleIds,
      seed: poolSeed,
    });
  }, [
    feasibility.blocked,
    drawCandidates,
    megaFormeBanSet,
    dualMegaChoices,
    poolSize,
    players.length,
    megasRequiredPerTeam,
    poolSeed,
  ]);

  const handleChangeName = useCallback((id: string, name: string) => {
    setPlayers((current) =>
      current.map((player) => (player.id === id ? { ...player, name } : player)),
    );
  }, []);

  const handleAdd = useCallback(() => {
    setPlayers((current) => [...current, { id: newId(), name: '' }]);
  }, []);

  /*
    The three destructive config actions and their confirms — D-36.

    Every one of these commit functions is EXACTLY what it was before 02-06. That is the
    whole point of how 02-04 and 02-05 wired them: each is a single call site taking
    precisely the argument a dialog carries through, so this plan puts a dialog in FRONT
    of them rather than reshaping this component or `PlayerList`. The request functions
    below open the dialog; these commit.
  */
  const handleRemove = useCallback((id: string) => {
    setPlayers((current) => current.filter((player) => player.id !== id));
  }, []);

  const handleRandomize = useCallback(() => {
    setOrderSeed(newSeed());
  }, []);

  /**
   * A NEW seed, never an advanced cursor — D-07.
   *
   * That is what keeps the pool draw and the order roll off one stream, which is the
   * collision `src/store.ts` warns about, and it is why re-rolling the pool provably
   * cannot disturb the starting order rather than merely not disturbing it today.
   *
   * A confirmation sits in front of this (D-36) and its body is above; the seam is
   * unchanged, because this was already a single call site taking no argument.
   */
  const handleRerollPool = useCallback(() => {
    setPoolSeed(newSeed());
  }, []);

  /*
    Which confirmation is open. Same discriminated-union shape as `app.tsx`'s, and the
    same rule: it holds the RESOLVED consequence, never the intent. `removePlayer` carries
    the name and the number of rows below it because both are facts about the list as it
    was when the host clicked, and the dialog must state the world it was opened against.
  */
  const [confirm, setConfirm] = useState<
    | { kind: 'idle' }
    | { kind: 'rerollPool' }
    | { kind: 'rerollOrder' }
    | { kind: 'removePlayer'; id: string; name: string; below: number }
    | { kind: 'clearBans'; count: number }
    | { kind: 'clearMegaFormeBans'; count: number }
  >({ kind: 'idle' });

  const closeConfirm = useCallback(() => setConfirm({ kind: 'idle' }), []);

  const requestRemove = useCallback(
    (id: string) => {
      const index = players.findIndex((player) => player.id === id);
      if (index === -1) return;

      setConfirm({
        kind: 'removePlayer',
        id,
        // An unnamed row has nothing to put in six interpolations, and `Remove ?` is
        // worse than a positional fallback.
        name: (players[index]?.name ?? '').trim() || `Player ${index + 1}`,
        below: players.length - index - 1,
      });
    },
    [players],
  );

  const requestRandomize = useCallback(() => setConfirm({ kind: 'rerollOrder' }), []);
  const requestRerollPool = useCallback(() => setConfirm({ kind: 'rerollPool' }), []);

  /**
   * The fourth variant of the same union, not a second confirm mechanism.
   *
   * It carries the RESOLVED count — the roster-intersected figure at the moment the host
   * asked — because the dialog must state the world it was opened against.
   */
  const requestClearBans = useCallback(
    () => setConfirm({ kind: 'clearBans', count: banned.length }),
    [banned],
  );

  /** The fifth variant, carrying the resolved forme count for the same reason. */
  const requestClearMegaFormeBans = useCallback(
    () => setConfirm({ kind: 'clearMegaFormeBans', count: bannedFormes.length }),
    [bannedFormes],
  );

  /**
   * One assignment, and everything follows from it.
   *
   * The chip list, the grid's pressed cells, its count line, the feasibility gate and the
   * draw's candidate list are all derivations of this array — which is the payoff of the
   * single write path above, and the reason clearing is a one-liner rather than five.
   *
   * Nothing is announced. The dialog already stated the consequence in numbers, and a chip
   * list emptying is the visible feedback; announcing as well would describe a change the
   * host has just authorised twice.
   */
  const handleClearBans = useCallback(() => setBans([]), []);

  /** One assignment again — the chips, the pressed cells and the count all derive from it. */
  const handleClearMegaFormeBans = useCallback(() => setMegaFormeBans([]), []);

  /** The forme a row is showing. Absent means `Either`, which is the default. */
  const formeFor = useCallback(
    (speciesId: string): DualMegaForme =>
      dualMegaChoices.find((choice) => choice.speciesId === speciesId)?.forme ?? 'either',
    [dualMegaChoices],
  );

  const handleDualMega = useCallback((speciesId: string, forme: DualMegaForme) => {
    setDualMegaChoices((current) => {
      const others = current.filter((choice) => choice.speciesId !== speciesId);
      // `Either` is what an absent entry already means, so recording it would be a second
      // way to say the same thing — and two encodings of one answer is how an importer
      // ends up with a rule the host never set.
      return forme === 'either' ? others : [...others, { speciesId, forme }];
    });
  }, []);

  /**
   * The stored list, ordered by the ROWS rather than by the order they were clicked in.
   *
   * Two hosts who made the same rulings get byte-identical documents, which is what makes
   * an exported tournament comparable. ARCHITECTURE sync rule 14 forbids taking order from
   * a key set; this takes it from the roster's display order instead.
   */
  const dualMegaChoicesForConfig = useMemo(
    () =>
      dualMegaRows
        .map((entry) => ({ speciesId: entry.id, forme: formeFor(entry.id) }))
        .filter((choice) => choice.forme !== 'either'),
    [dualMegaRows, formeFor],
  );

  /**
   * The one moment this screen writes anything.
   *
   * Everything above is pre-document form state; this turns it into a document. The
   * results handed to `createTournament` are the ones already on screen — the drawn pool
   * and the numbered order — rather than the seeds that produced them, so the tournament
   * that starts is provably the one the host clicked Start under.
   *
   * Names are trimmed on the way in. The feasibility gate already treats `Sam` and `sam `
   * as one player, so a leading space is a difference the tool has decided is not one; the
   * stored name should agree rather than carry it into the board and every export.
   */
  const handleStart = useCallback(() => {
    // The gate and the pool SIZE are asked about in both modes; the drawn POOL is not, and
    // that is T-04-22. `draw === null` used to sit on this line, and blind and snake have no
    // draw at start by construction (D-23 makes the reveal what decides the draw), so leaving
    // it here would return early on every one of their starts — a dead `Start draft` on a
    // shared screen, silently, with nothing to say why. The guard moved into the `hostBanlist`
    // branch below, where the value it guards is actually used.
    if (feasibility.blocked || poolSize === null) return;

    const config: TournamentConfig = {
      formatLabel: formatLabel.trim(),
      players: players.map((player) => ({ id: player.id, name: player.name.trim() })),
      rounds: ROUNDS,
      rosterVersion: snapshot.regulation,
      rosterChecksum: snapshot.checksum,
      poolSize,
      // A fresh copy, so the document does not share an array with this screen's state.
      bans: [...bans],
      banMode,
      // `?? 0` is unreachable: `feasibility.blocked` is false here, and a null field is
      // itself a blocker. It exists because the compiler cannot see that, and inventing a
      // number the host did not choose would be worse than the branch.
      megasRequiredPerTeam: megasRequiredPerTeam ?? 0,
      // Phase 2 STORES this and renders nothing from it during the draft. The forme it
      // selects is read by Phase 3's compiler and by the export path's
      // `Species @ StoneItemName` form; recording it now costs one field and means no
      // saved tournament needs migrating for it later.
      dualMegaChoices: dualMegaChoicesForConfig,
      depth,
      // A fresh array of fresh rules, never one shared with this screen's memo — the same
      // guarantee `[...bans]` above gives. `rules` itself is documented where it is built.
      rules: rules.map((rule) => ({ ...rule })),
      // A fresh copy, exactly as `bans` above: the document must not share an array with
      // this screen's state. 03-01 wrote the empty literal here because no surface produced
      // the list yet; this plan is that surface.
      megaFormeBans: [...megaFormeBans],
      // The same `?? 0` construction and the same reasoning as `megasRequiredPerTeam`
      // above: unreachable while `feasibility.blocked` is false, present because the
      // compiler cannot see that, and 0 rather than an invented number.
      swapBudget: swapBudget ?? 0,
      swapRounds: swapRounds ?? 0,
      // Version 4's two fields, now host-chosen. `0` at `hostBanlist` because the field is
      // VOID in that mode rather than merely unset — there are no player bans to count — in
      // the same shape and for the same reason `swapBudget: swapBudget ?? 0` above writes a
      // number the compiler cannot prove is there. The `?? 0` is likewise unreachable while
      // `feasibility.blocked` is false: at `snake` a null field is itself a blocker.
      bansPerPlayer: hasPlayerBans ? (bansPerPlayer ?? 0) : 0,
      duplicateBanPolicy,
      // Version 5's three fields, now the host's own answers — TOUR-04, TOUR-07, D-04, D-08.
      // 03-11 wrote `V4_CONFIG_DEFAULTS` on these three lines because no control produced
      // them yet, and named this plan as the one that would replace them; it does, and the
      // note saying otherwise went with it.
      //
      // Written UNCONDITIONALLY, including at the depths where the matching control is
      // inert. The alternative — forcing the default in when the tier does not use the value
      // — would be this screen deciding a rule, and `05-UI-SPEC` §Pure-core boundary says no
      // component owns one. A `draftOnly` document carries a metric nothing reads, exactly
      // as it already carries `swapRounds: 0`, and the day a host deepens a tournament the
      // answer they gave is the one that is there.
      matchMetric,
      roundRobinFormat,
      bracketFormat,
    };

    // D-01's two seams, and the branch is the whole of the routing decision. `hostBanlist`
    // keeps the atomic three-dispatch path Phase 2 verified, byte for byte, with the pool it
    // already drew; blind and snake go to the sibling, which dispatches the schedule and the
    // order and NO pool, because D-23 makes the reveal what decides what the draw may
    // contain. Do not merge these into one parameterised call — `createBanStage`'s own doc
    // block records what the duplication buys.
    if (hasPlayerBans) {
      const stage = createBanStage({ config, order, orderSeed, schedule });

      // A refused creation leaves the host on this screen with their answers intact.
      if (stage === null) return;

      onStarted();
      return;
    }

    if (draw === null) return;

    const created = createTournament({
      config,
      poolIds: draw.ids,
      poolSeed,
      // Materialized into `pool/built` — D-09. Phase 3's RULE-09 gate reads THIS number
      // rather than recomputing against a roster that may since have rotated, and it must
      // handle the day the two disagree: Champions regulations rotate roughly every 2.5
      // months, and a species that leaves the roster does not leave a saved tournament.
      // It is the drawn set's own count, never an echo of what was requested, so an
      // importer cannot infer a guarantee the pool does not hold.
      megaCapableCount: draw.megaCapableCount,
      order,
      orderSeed,
      // The schedule the host was LOOKING AT, not one recompiled here — RULE-06, D-13.
      // Recompiling at this line would discard the reorder silently and every other
      // assertion in the file would still pass, which is why this is the whole of why
      // `schedule/compiled` is materialized into the log rather than derived on load.
      schedule,
    });

    // A refused creation leaves the host on this screen with their answers intact, which
    // is the only place they could act on it.
    if (created === null) return;

    onStarted();
  }, [
    feasibility.blocked,
    draw,
    formatLabel,
    players,
    snapshot,
    poolSize,
    bans,
    banMode,
    megasRequiredPerTeam,
    rules,
    megaFormeBans,
    schedule,
    dualMegaChoicesForConfig,
    depth,
    matchMetric,
    roundRobinFormat,
    bracketFormat,
    swapBudget,
    swapRounds,
    hasPlayerBans,
    bansPerPlayer,
    duplicateBanPolicy,
    poolSeed,
    order,
    orderSeed,
    onStarted,
  ]);

  return (
    <div class="config-screen">
      <h1 class="app-shell__title">Set up the tournament</h1>

      {/*
        REFR-03 / D-25, and one of exactly TWO mount sites in the app — this screen and the
        landing screen. 05-UI-SPEC §3 gives the reason not to add a third: D-24 makes a live
        or filed tournament's roster a settled fact, since the document loads its own
        snapshot by `rosterVersion` and keeps working unchanged, so a banner on the draft,
        ban or completed screens would warn about something that is not a problem and offer
        an action that would not change that tournament. The banner's job is to stop a host
        starting a night on an expired roster by ACCIDENT, and there are exactly two screens
        where a night gets started.

        Above the `Roster` group and not below it, because the config sentence says `Check
        for a new roster below` and that has to be true.

        `todayIso()` is stamped here, at the edge, and handed in as a string. The rule
        itself is `isSnapshotStale` in `src/core`, which is not allowed to know what day it
        is — `npm run check:pure` would fail a core implementation, correctly.
      */}
      <StalenessBanner
        variant="config"
        regulationLabel={snapshot.regulation}
        validUntil={snapshot.validUntil}
        today={today}
      />

      {/*
        D-23: beside the roster the tournament is being created against, and FIRST in the
        form rather than buried in it. Two reasons, both from the contract. The staleness
        banner's config sentence says `Check for a new roster below`, so the control it
        names has to be near the top the banner sits at; and every later answer on this
        screen — the pool size, the bans, the draw — is an answer ABOUT this roster, so
        changing it after them would invalidate work the host had already done.

        A direct child of `.config-screen` rather than a `<fieldset>`, because the group
        holds two buttons and a sentence and no fields at all. Its own `<h2>` sits at the
        same level as the group legends below it, which is the level it belongs at.
      */}
      <RosterRefresh
        regulationLabel={snapshot.regulation}
        entryCount={entries.length}
        validUntil={snapshot.validUntil}
        onRefreshed={onRosterRefreshed}
        onImported={onRosterImported}
        focusOnMount={focusRosterRefresh}
      />

      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Players</legend>

        <PlayerList
          players={players}
          order={order}
          onChangeName={handleChangeName}
          onAdd={handleAdd}
          onRemove={requestRemove}
          onRandomize={requestRandomize}
        />
      </fieldset>

      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Tournament</legend>

        <div class="config-screen__field">
          <label class="config-screen__label" for="config-format-label">
            Format label
          </label>

          <input
            class="config-screen__input"
            id="config-format-label"
            type="text"
            value={formatLabel}
            autocomplete="off"
            onInput={(event) =>
              setFormatLabel((event.currentTarget as HTMLInputElement).value)
            }
          />
        </div>

        <SegmentedControl
          legend="Tournament depth"
          name="tournament-depth"
          options={DEPTH_OPTIONS}
          value={depth}
          onChange={setDepth}
        />

        {/*
          The note is a function of the SELECTION, per 05-UI-SPEC §Amendment 2 — each tier
          states what it actually generates, so the difference between the two deeper ones
          is on screen rather than inferred.
        */}
        <p class="config-screen__note">{DEPTH_NOTES[depth]}</p>

        {/*
          Directly beneath the note and only at the tiers that run a round robin, following
          the group's "field, then its visible consequence" placement rule. It is a plain
          fact rather than a warning — `.config-screen__note`, not a feasibility treatment —
          because a round robin of any size is satisfiable and `feasibility.ts` is the only
          thing on this screen allowed to say otherwise.
        */}
        {hasMatches(depth) && (
          <p class="config-screen__note">{roundRobinSizeLine(players.length)}</p>
        )}

        {/*
          `Match result`, `Round robin format` and `Bracket format` — 05-UI-SPEC §1, in the
          contract's order. All three are in the `Tournament` group rather than a group of
          their own: they are the same question the depth control asks, at a finer grain, and
          a host who has to scroll to find them has to hold the depth in their head to answer.

          All three go through `InertibleSegmentedControl`, whose doc block states which of
          the two available mechanisms was chosen and why: the WHOLE control takes
          `aria-disabled` without native `disabled`, NOT `SegmentedControl`'s per-option
          `disabled`, because §1 says every member is unavailable at these depths rather than
          one of them. They stay in the tab order and their reasons are reachable by keyboard.

          There is deliberately NO sentence here about player counts and brackets. The one
          thing this screen says about a three-player bracket is `feasibility.ts`'s
          `bracketNeedsFourPlayers`, rendered by `FeasibilityBar` from `checkFeasibility`'s
          `problems` — one authority, and a second one in this file would be free to disagree
          with it. It is a WARNING, so `Start draft` stays enabled at three players.
        */}
        <InertibleSegmentedControl
          legend="Match result"
          name="match-metric"
          options={MATCH_METRIC_OPTIONS}
          value={matchMetric}
          onChange={setMatchMetric}
          inert={matchMetricInert}
          reason={MATCH_METRIC_REASON}
          reasonId={MATCH_METRIC_REASON_ID}
        />

        <InertibleSegmentedControl
          legend="Round robin format"
          name="round-robin-format"
          options={STAGE_FORMAT_OPTIONS}
          value={roundRobinFormat}
          onChange={setRoundRobinFormat}
          inert={stageFormatInert}
          reason={STAGE_FORMAT_REASON}
          reasonId={ROUND_ROBIN_FORMAT_REASON_ID}
        />

        <InertibleSegmentedControl
          legend="Bracket format"
          name="bracket-format"
          options={STAGE_FORMAT_OPTIONS}
          value={bracketFormat}
          onChange={setBracketFormat}
          inert={stageFormatInert}
          reason={STAGE_FORMAT_REASON}
          reasonId={BRACKET_FORMAT_REASON_ID}
        />
      </fieldset>

      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Mega rules</legend>

        <NumericField
          label="Megas required per team"
          value={megasRequiredRaw}
          onInput={handleMegasRequiredInput}
          helper={megasRequiredHelper(players.length, megasRequiredPerTeam ?? 0)}
          min={0}
          max={ROUNDS}
        />

        {/*
          Directly beneath the field, per 03-UI-SPEC §1: the schedule is that field's
          visible consequence, and putting it anywhere else makes the host hunt for what
          their number did. A real <h2>, matching `Starting order` inside the `Players`
          group — this sub-section holds a list and a rule line, which is a level the form
          genuinely has.
        */}
        <div class="config-screen__section">
          <h2 class="config-screen__section-heading">{SCHEDULE_HEADING}</h2>
          <p class="config-screen__note">{SCHEDULE_HELPER}</p>

          <SchedulePreview schedule={schedule} onMove={handleMoveRound} />
        </div>

        {/*
          The heading and the rows appear together or not at all. A regulation with no
          dual-Mega species would otherwise leave a heading over nothing.

          The treatment changed here rather than in 03-03, and this is where the group's
          hierarchy was settled: it was a `--text-label` <p> on the argument that a heading
          "would be claiming a level the form does not have", which held while `Mega rules`
          was one field plus a run of rows. The group now holds four sub-sections and
          03-UI-SPEC §1 lists all four, so the level is real and one of them rendering
          differently from the other three is the inconsistency a host sees.
        */}
        {dualMegaRows.length > 0 && (
          <div class="config-screen__section">
            <h2 class="config-screen__section-heading">{DUAL_MEGA_HEADING}</h2>

            {dualMegaRows.map((entry) => (
              <SegmentedControl
                key={entry.id}
                legend={`${entry.name} Mega forme`}
                // Derived per species. A shared name would merge the rows into ONE radio
                // group, so answering the second row would silently unanswer the first —
                // and it would look like a rendering glitch rather than a naming bug.
                name={`dual-mega-${entry.id}`}
                options={DUAL_MEGA_OPTIONS}
                value={formeFor(entry.id)}
                onChange={(forme) => handleDualMega(entry.id, forme)}
              />
            ))}
          </div>
        )}

        {/*
          The group's fourth sub-section — RULE-04, 03-UI-SPEC §3. Last in the group because
          it is the only thing in it that is a whole roster; everything above is a sentence
          or a short list.

          Its internal order is the `Bans` group's, one level in: the field, the chips,
          `Clear the Mega-forme banlist`, then the grid. Both surfaces write one list through
          one path (D-10 again, keyed on `megaFormes[].id` this time).
        */}
        <div class="config-screen__section">
          <h2 class="config-screen__section-heading">{MEGA_BAN_HEADING}</h2>
          <p class="config-screen__note">{MEGA_BAN_HELPER}</p>

          {/*
            `candidates` is every forme, not the formes minus the banlist — the `Bans` group's
            reasoning verbatim: filtering the banned ones out would make
            `No Mega forme matches "{query}".` false for a forme that plainly does match and
            is simply already banned, and `applyMegaFormeBan` already makes re-selecting one
            a no-op.
          */}
          <TypeaheadField
            id="config-mega-forme-ban"
            label={MEGA_BAN_FIELD_LABEL}
            placeholder={MEGA_BAN_FIELD_PLACEHOLDER}
            subject={MEGA_BAN_SUBJECT}
            candidates={megaFormeRowsList}
            onSelect={handleAddMegaFormeBan}
          />

          <BanChipList
            banned={bannedFormes}
            onRemove={handleRemoveMegaFormeBan}
            listName={MEGA_BAN_LIST_NAME}
          />

          {/* Not rendered while the list is empty, for `Clear the banlist`'s reason. */}
          {bannedFormes.length > 0 && (
            <button
              type="button"
              class="config-screen__reroll"
              onClick={requestClearMegaFormeBans}
            >
              {CLEAR_MEGA_FORME_BANLIST_CONFIRM.confirmLabel}
            </button>
          )}

          {/*
            The second surface. Every forme renders, the banned ones included, because this
            grid shows what is being excluded rather than what is left.

            `megaInertReason` is what makes the `Mega capability` control unusable here: every
            cell in this grid IS a Mega, so the three-way control has nothing to say and a
            host who reached `Non-Mega` would empty the grid with no explanation. Search and
            the eighteen type filters stay live and are genuinely useful — `Charizard-Mega-X`
            is Fire/Dragon where Charizard is Fire/Flying.
          */}
          <PoolGrid
            entries={megaFormeRowsList}
            spriteMeta={spriteMeta}
            onPick={toggleMegaFormeBan}
            bannedIds={megaFormeBanSet}
            banSubject={MEGA_BAN_COUNT_SUBJECT}
            // Distinct from the species ban grid's default `pool`, because this screen is
            // the first to mount two grids at once — see `PoolGrid.idPrefix`.
            idPrefix="mega-forme-ban"
            megaInertReason={MEGA_FILTER_INERT_REASON}
          />
        </div>
      </fieldset>

      {/*
        Group 4, between `Mega rules` and `Pool` — 02-UI-SPEC §2's declared order.

        Its internal order is: the ban mode control, then the field, then the chips, then
        `Clear the banlist`, then the grid. The mode reads first because it is what the rest
        of the group MEANS; the grid reads last because it is the whole roster and everything
        above it is a sentence long.
      */}
      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Bans</legend>

        {/* First, because the mode is what the rest of the group MEANS. */}
        <SegmentedControl
          legend="Ban mode"
          name="ban-mode"
          options={BAN_MODE_OPTIONS}
          value={banMode}
          onChange={setBanMode}
        />

        {/*
          Both player-ban controls are ABSENT at `hostBanlist`, not disabled — see
          `hasPlayerBans` for the two halves of the reason (a wholly void affordance is not
          rendered, and `hostBanlist` stays byte-identical to Phase 2's screen).

          There is deliberately NO blocking reason attached to the field here, exactly as the
          `Swaps` group's comment argues: `bansPerPlayerNotAnInteger` and
          `bansPerPlayerNotPositive` belong to `feasibility.ts`, the single authority on what
          is satisfiable, and a second authority in this file would be free to disagree.
        */}
        {hasPlayerBans && (
          <NumericField
            label={BANS_PER_PLAYER_LABEL}
            value={bansPerPlayerRaw}
            onInput={setBansPerPlayerRaw}
            helper={BANS_PER_PLAYER_HELPER}
            min={1}
            // The IMPORTED constant, never a literal 24 — T-04-24. `import-guard.ts` owns the
            // bound `isValidTournament` re-opens a document against, so restating it here
            // would let the build write a document it then refuses to load.
            max={MAX_BANS_PER_PLAYER}
          />
        )}

        {hasPlayerBans && (
          <div
            class="config-screen__duplicate-bans"
            // Derived, so it is SHED the instant the mode leaves `snake` — WR-04, and this
            // phase is the fifth consumer of that rule. `undefined` rather than `'false'`:
            // `aria-disabled="false"` is not the same thing as the attribute being absent, and
            // plenty of assistive technology reports the former as disabled anyway.
            aria-disabled={duplicatePolicyInert ? 'true' : undefined}
          >
            <SegmentedControl
              legend={DUPLICATE_BANS_LEGEND}
              // Its own group name. `SegmentedControl`'s `name` doc block states that two
              // controls sharing one name merge into a single radio group, and this mounts on
              // the same screen as `ban-mode`, the pool preset and one control per dual-Mega
              // row — so a shared name would look like a rendering glitch rather than a
              // naming bug.
              name="duplicate-bans"
              options={DUPLICATE_POLICY_OPTIONS}
              value={duplicateBanPolicy}
              onChange={(value) => {
                // The early return is what keeps the ARIA honest. Without it the attribute
                // would say inert while a click still changed the policy — the same guard
                // `FilterBar`'s Mega toggle carries, and for the same reason.
                if (duplicatePolicyInert) return;
                setDuplicateBanPolicy(value);
              }}
            />

            <p class="config-screen__duplicate-bans-helper">{DUPLICATE_BANS_HELPER}</p>

            {/*
              Reason after the control, in DOM order as in visual order, and the separator is
              MARKUP rather than `::before` content — a dash generated by a stylesheet is half
              a visible line that no test reads. The constant therefore EXCLUDES the separator,
              so the copy contract, the source constant and the assertion are one value (WR-03).

              An expression container holding a string literal, not bare JSX text, because JSX
              collapses trailing whitespace and the space is half of the two characters.
            */}
            {duplicatePolicyInert && (
              <span class="config-screen__inert-reason">
                <span aria-hidden="true">{'— '}</span>
                {DUPLICATE_BANS_SNAKE_REASON}
              </span>
            )}
          </div>
        )}

        {/*
          `candidates` is the FULL entry list, not the entries minus the banlist. Filtering
          the banned ones out would make `No Pokémon matches "{query}".` false for a species
          that plainly does match and is simply already banned — and the idempotent
          `applyBan` already makes selecting one a no-op.
        */}
        <TypeaheadField
          id="config-ban"
          label={BAN_FIELD_LABEL}
          placeholder={BAN_FIELD_PLACEHOLDER}
          candidates={entries}
          onSelect={handleAddBan}
        />

        <BanChipList banned={banned} onRemove={handleRemoveBan} />

        {/*
          Not rendered while the list is empty (02-UI-SPEC §Empty and edge states), for the
          same reason the chip list is not: a control that clears nothing is a control the
          host has to read and dismiss on every visit to a form they have not used yet.
        */}
        {banned.length > 0 && (
          <button
            type="button"
            class="config-screen__reroll"
            onClick={requestClearBans}
          >
            Clear the banlist
          </button>
        )}

        {/*
          The second surface, over the SAME list — D-10. Every draftable entry renders here,
          the banned ones included, because this grid shows what is being excluded rather
          than what is left. The draft pool is the opposite surface and D-13 governs it: a
          banned species is absent there, not dimmed.

          `bannedIds` is the same computation-local `Set` the draw's candidate filter reads.
          Building a second one here would be a second answer to one question.
        */}
        <PoolGrid
          entries={entries}
          spriteMeta={spriteMeta}
          onPick={toggleBan}
          bannedIds={bannedIdSet}
        />
      </fieldset>

      {/*
        Group 5, between `Bans` and `Pool` — 03-UI-SPEC §1's declared order.

        Two free numeric fields and nothing else. There is deliberately NO blocking reason
        attached here for an emptied field: `swapBudgetNotAnInteger` and
        `swapRoundsNotAnInteger` belong to `feasibility.ts`, which its own doc block names
        as the single authority on what is satisfiable. A second authority in this file
        would be free to disagree with it, and the host would be arguing with an input box
        about a rule neither of them stated.
      */}
      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Swaps</legend>

        <NumericField
          label={SWAP_BUDGET_LABEL}
          value={swapBudgetRaw}
          onInput={setSwapBudgetRaw}
          helper={SWAP_BUDGET_HELPER}
          min={0}
        />

        <NumericField
          label={SWAP_ROUNDS_LABEL}
          value={swapRoundsRaw}
          onInput={setSwapRoundsRaw}
          helper={SWAP_ROUNDS_HELPER}
          min={0}
        />
      </fieldset>

      {/*
        LAST, and the position is load-bearing rather than tidy: this is the only group
        whose readout reflects every group above it (02-UI-SPEC §2, 03-UI-SPEC §1).
      */}
      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Pool</legend>

        <SegmentedControl
          legend="Pool size"
          name="pool-size-preset"
          options={POOL_PRESET_OPTIONS}
          value={poolPreset}
          onChange={(preset) => {
            setPoolPreset(preset);
            // The preset is the host's answer again, and dropping the override is what
            // makes that true rather than merely selected. A click here is an unambiguous
            // statement about the pool size; leaving a typed string in place would keep a
            // radio moving its own checked state while the number beside it, the readout
            // below it and the gate at the foot of the screen all ignored it. D-06 refuses
            // silent correction, and silent inertness is the same argument.
            setPoolOverride(null);
          }}
        />

        <p class="config-screen__note">{poolSizeHelper(players.length, ROUNDS)}</p>

        <NumericField
          label="Pool size override"
          value={poolOverrideValue}
          onInput={setPoolOverride}
          min={1}
          max={entries.length}
        />

        {/*
          Rendered only while the configuration is satisfiable. A readout computed from a
          size the gate refused would be a number the host cannot act on, sitting beside a
          sentence telling them the size is wrong.
        */}
        {draw !== null && (
          <p class="config-screen__readout">
            {drawReadout(draw.ids.length, draw.megaCapableCount)}
          </p>
        )}

        <button
          type="button"
          class="config-screen__reroll"
          onClick={requestRerollPool}
        >
          Re-roll pool
        </button>
      </fieldset>

      <FeasibilityBar
        result={feasibility}
        players={players.length}
        rounds={ROUNDS}
        poolSize={poolSize}
        onStart={handleStart}
      />

      {/*
        At the screen root, which is somewhere a dialog is not a child of a fieldset.

        This screen is INSIDE the read-only gate — the whole of it, since T-02-15 — so
        these four confirms are inside it too. That costs nothing in the state it was
        written for: a secondary tab cannot press `Re-roll pool` in the first place, so
        none of them can open there. The one reachable oddity is a tab that opens a
        confirm while it owns the lock and is demoted before answering it; the dialog then
        goes inert alongside the form behind it. `Take over drafting here` is outside the
        gate, so the exit is one click, and hoisting these four out of the screen to shave
        that case would put four dialogs' state in `app.tsx` for no gain.
      */}
      {confirm.kind === 'rerollPool' && (
        <ConfirmDialog
          heading={REROLL_POOL_CONFIRM.heading}
          body={REROLL_POOL_CONFIRM.body(poolSize ?? 0)}
          confirmLabel={REROLL_POOL_CONFIRM.confirmLabel}
          safeLabel={REROLL_POOL_CONFIRM.safeLabel}
          tone={REROLL_POOL_CONFIRM.tone}
          onConfirm={() => {
            closeConfirm();
            handleRerollPool();
          }}
          onSafe={closeConfirm}
        />
      )}

      {confirm.kind === 'rerollOrder' && (
        <ConfirmDialog
          heading={REROLL_ORDER_CONFIRM.heading}
          body={REROLL_ORDER_CONFIRM.body(players.length)}
          confirmLabel={REROLL_ORDER_CONFIRM.confirmLabel}
          safeLabel={REROLL_ORDER_CONFIRM.safeLabel}
          tone={REROLL_ORDER_CONFIRM.tone}
          onConfirm={() => {
            closeConfirm();
            handleRandomize();
          }}
          onSafe={closeConfirm}
        />
      )}

      {confirm.kind === 'clearBans' && (
        <ConfirmDialog
          heading={CLEAR_BANLIST_CONFIRM.heading}
          body={CLEAR_BANLIST_CONFIRM.body(confirm.count)}
          confirmLabel={CLEAR_BANLIST_CONFIRM.confirmLabel}
          safeLabel={CLEAR_BANLIST_CONFIRM.safeLabel}
          tone={CLEAR_BANLIST_CONFIRM.tone}
          onConfirm={() => {
            closeConfirm();
            handleClearBans();
          }}
          onSafe={closeConfirm}
        />
      )}

      {confirm.kind === 'clearMegaFormeBans' && (
        <ConfirmDialog
          heading={CLEAR_MEGA_FORME_BANLIST_CONFIRM.heading}
          body={CLEAR_MEGA_FORME_BANLIST_CONFIRM.body(confirm.count)}
          confirmLabel={CLEAR_MEGA_FORME_BANLIST_CONFIRM.confirmLabel}
          safeLabel={CLEAR_MEGA_FORME_BANLIST_CONFIRM.safeLabel}
          tone={CLEAR_MEGA_FORME_BANLIST_CONFIRM.tone}
          onConfirm={() => {
            handleClearMegaFormeBans();
            closeConfirm();
          }}
          onSafe={closeConfirm}
        />
      )}

      {confirm.kind === 'removePlayer' && (
        <ConfirmDialog
          heading={REMOVE_PLAYER_CONFIRM.heading(confirm.name)}
          body={REMOVE_PLAYER_CONFIRM.body(confirm.name, confirm.below)}
          confirmLabel={REMOVE_PLAYER_CONFIRM.confirmLabel(confirm.name)}
          safeLabel={REMOVE_PLAYER_CONFIRM.safeLabel(confirm.name)}
          tone={REMOVE_PLAYER_CONFIRM.tone}
          onConfirm={() => {
            const id = confirm.id;
            closeConfirm();
            handleRemove(id);
          }}
          onSafe={closeConfirm}
        />
      )}
    </div>
  );
}
