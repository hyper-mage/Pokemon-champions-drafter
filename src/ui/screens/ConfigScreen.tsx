import { useCallback, useMemo, useState } from 'preact/hooks';

import { newId, newSeed } from '../../adapters/id';
import { drawPool } from '../../core/draw';
import {
  checkFeasibility,
  poolSizeForPreset,
  type PoolPreset,
} from '../../core/feasibility';
import type {
  DualMegaChoice,
  DualMegaForme,
  TournamentConfig,
  TournamentDepth,
} from '../../core/model';
import type { RosterEntry, RosterSnapshot } from '../../core/roster/types';
import { selectStartingOrder } from '../../core/selectors';
import { createTournament } from '../../store';
import { FeasibilityBar } from '../components/FeasibilityBar';
import { NumericField, parseNumericField } from '../components/NumericField';
import { PlayerList, type PlayerDraft } from '../components/PlayerList';
import { SegmentedControl, type SegmentedOption } from '../components/SegmentedControl';

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
 * ## Group order
 *
 * Groups 1 (`Players`), 2 (`Tournament`) and 3 (`Mega rules`) are here. Plan 02-07 inserts
 * `Bans` as group 4 — each at its declared position in the 02-UI-SPEC table rather than
 * appended, because the table's order is the reason the pool readout is last: it is the
 * only group whose readout reflects every group above it.
 */

/**
 * Six rounds, six picks, one team of six. Phase 3 makes the round count a host decision;
 * until then it is a constant in one place rather than a `6` scattered through the four
 * derivations that read it.
 */
const ROUNDS = 6;

/** How many blank rows a fresh config screen starts with. */
const INITIAL_PLAYERS = 4;

/**
 * Verbatim from 02-UI-SPEC §Copywriting Contract → Config screen.
 *
 * All three depth options are ENABLED, deliberately unlike ban mode where two are
 * disabled (D-12). ROADMAP criterion 1 says the host "enters … a tournament depth", and a
 * disabled depth would make that criterion unmeetable. What is not yet built is the
 * screens the deeper options lead to, and the note below the group says so rather than
 * the control pretending the choice does not exist.
 */
const DEPTH_OPTIONS: readonly SegmentedOption<TournamentDepth>[] = [
  { value: 'draftOnly', label: 'Draft only' },
  { value: 'draftAndBrackets', label: 'Draft and brackets' },
  { value: 'draftBracketsAndLog', label: 'Draft, brackets and match log' },
];

const DEPTH_NOTE =
  'Depth is recorded now. Round robin and brackets arrive with the tournament screens.';

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
 * Interpolated from the player count and the value ON SCREEN, so the number the host is
 * reasoning about is the one in front of them rather than a worked example.
 *
 * An unparseable field reads as `0` here rather than as `NaN`. The gate says what is wrong
 * with the field; a helper line repeating it in arithmetic would be a second voice.
 */
function megasRequiredHelper(players: number, megasPerTeam: number): string {
  return `0 means no Mega requirement. A requirement of ${megasPerTeam} needs at least ${players * megasPerTeam} Mega-capable Pokémon in the pool.`;
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
  /** A tournament now exists. Routing is the caller's; this screen only reports it. */
  onStarted: () => void;
}

export function ConfigScreen({ snapshot, entries, onStarted }: ConfigScreenProps) {
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
   * The RAW text of `Megas required per team`, not a number — D-06.
   *
   * The string is the state and the parsed value is a derivation of it, because the two
   * cannot then disagree about what is on screen. `'0'` rather than `''` is the default:
   * no Mega requirement is a real answer, and an empty field is the host having deleted
   * one, which is a different thing and blocks.
   */
  const [megasRequiredRaw, setMegasRequiredRaw] = useState('0');

  /**
   * Only the rows the host actually changed — D-03.
   *
   * An absent entry means `'either'` (see `DualMegaChoice`), so choosing `Either` REMOVES
   * a row rather than recording it. A stale entry left behind by a regulation rotation is
   * then simply ignored instead of resurrecting a species the roster no longer offers.
   */
  const [dualMegaChoices, setDualMegaChoices] = useState<DualMegaChoice[]>([]);

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
        // Arrives with plan 02-07. Empty is the honest value today rather than a
        // stand-in: nothing on this screen can yet ban anything.
        bannedIds: [],
        entries,
      }),
    [players, poolSize, megasRequiredPerTeam, entries],
  );

  /**
   * Guarded on the gate, and the guard is load-bearing rather than tidy: a blocked config
   * can ask for a pool larger than the candidate list, and `drawPool` inherits `nextInt`'s
   * empty-range `RangeError` rather than clamping. Blocked means no draw, and `Start draft`
   * refuses on the same condition.
   */
  const draw = useMemo(() => {
    if (feasibility.blocked || poolSize === null) return null;
    return drawPool({ candidates: entries, size: poolSize, megasRequired: 0, seed: poolSeed });
  }, [feasibility.blocked, entries, poolSize, poolSeed]);

  const handleChangeName = useCallback((id: string, name: string) => {
    setPlayers((current) =>
      current.map((player) => (player.id === id ? { ...player, name } : player)),
    );
  }, []);

  const handleAdd = useCallback(() => {
    setPlayers((current) => [...current, { id: newId(), name: '' }]);
  }, []);

  // Plan 02-09 inserts a confirmation in front of both of these (D-36). Both are already
  // single call sites taking exactly the argument a dialog would carry through, so that
  // plan adds a dialog rather than reshaping this component or `PlayerList`.
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
   * Plan 02-09 puts a confirmation in front of this (D-36). It is already a single call
   * site taking no argument, so that plan inserts a dialog rather than reshaping anything.
   */
  const handleRerollPool = useCallback(() => {
    setPoolSeed(newSeed());
  }, []);

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
    if (feasibility.blocked || draw === null || poolSize === null) return;

    const config: TournamentConfig = {
      formatLabel: formatLabel.trim(),
      players: players.map((player) => ({ id: player.id, name: player.name.trim() })),
      rounds: ROUNDS,
      rosterVersion: snapshot.regulation,
      rosterChecksum: snapshot.checksum,
      poolSize,
      bans: [],
      banMode: 'hostBanlist',
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
    };

    const created = createTournament({
      config,
      poolIds: draw.ids,
      poolSeed,
      megaCapableCount: draw.megaCapableCount,
      order,
      orderSeed,
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
    megasRequiredPerTeam,
    dualMegaChoicesForConfig,
    depth,
    poolSeed,
    order,
    orderSeed,
    onStarted,
  ]);

  return (
    <div class="config-screen">
      <h1 class="app-shell__title">Set up the tournament</h1>

      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Players</legend>

        <PlayerList
          players={players}
          order={order}
          onChangeName={handleChangeName}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onRandomize={handleRandomize}
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

        <p class="config-screen__note">{DEPTH_NOTE}</p>
      </fieldset>

      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Mega rules</legend>

        <NumericField
          label="Megas required per team"
          value={megasRequiredRaw}
          onInput={setMegasRequiredRaw}
          helper={megasRequiredHelper(players.length, megasRequiredPerTeam ?? 0)}
          min={0}
          max={ROUNDS}
        />

        {/*
          The heading and the rows appear together or not at all. A regulation with no
          dual-Mega species would otherwise leave a heading over nothing.
        */}
        {dualMegaRows.length > 0 && (
          <>
            <p class="config-screen__subheading">{DUAL_MEGA_HEADING}</p>

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
          </>
        )}
      </fieldset>

      {/*
        LAST, and the position is load-bearing rather than tidy: this is the only group
        whose readout reflects every group above it (02-UI-SPEC §2). Plan 02-07 inserts
        `Bans` BEFORE it, not after.
      */}
      <fieldset class="config-screen__group">
        <legend class="config-screen__legend">Pool</legend>

        <SegmentedControl
          legend="Pool size"
          name="pool-size-preset"
          options={POOL_PRESET_OPTIONS}
          value={poolPreset}
          onChange={setPoolPreset}
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
          onClick={handleRerollPool}
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
    </div>
  );
}
