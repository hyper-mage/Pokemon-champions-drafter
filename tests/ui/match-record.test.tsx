// @vitest-environment happy-dom

/**
 * Recording a match, and what correcting one costs — TOUR-04…07, `05-UI-SPEC` §5.
 *
 * The load-bearing claims here are the ones no visual review catches:
 *
 *   THE BUTTON DOES NOT LIE. `Record and void the bracket` and `Record and void 2 matches`
 *   are the confirm DRFT-13 requires — there is no second dialog — so the label and the
 *   seqs the caller voids have to come out of one `selectVoidCascade` call. A label that
 *   understated its cost would be a confirm that lied (T-05-53), and the only way to see
 *   that is to drive a real cascade and read the log afterwards.
 *
 *   THE TWO DISPATCHES ARE PAIRED. `causedBySeq` is what makes "undo puts the whole
 *   correction back in one step" true rather than intended, and it is a number read back
 *   off the document between two dispatches — exactly the kind of wiring that keeps
 *   working after it stops being right. Asserted against the appended log.
 *
 *   THE ATTRIBUTE IS ABSENT, not `"false"`. A button carrying `aria-disabled="false"` is
 *   announced as a disabled control by some assistive technology, so the healthy state has
 *   no attribute at all.
 *
 * `announce` is a module-level signal that outlives any render, so it is reset in
 * `beforeEach` — a sentence left behind by the previous test would satisfy the live-region
 * assertions without anything ever having spoken.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const entries = Array.from({ length: 20 }, (_, index) => ({
    id: `mon-${index}`,
    name: `Mon ${index}`,
    num: index + 1,
    types: ['Normal'],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    baseSpeciesId: `mon-${index}`,
    forme: null,
    megaCapable: false,
    megaFormes: [],
    spriteId: `mon-${index}`,
    spriteMissing: true,
  }));

  return {
    bundle: {
      snapshot: {
        schemaVersion: 1,
        regulation: 'mb',
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
        upstreamRef: 'test',
        generatedAt: '2026-01-01T00:00:00Z',
        counts: {
          legalEntries: entries.length,
          draftable: entries.length,
          megaFormes: 0,
          baseSpecies: entries.length,
        },
        entries,
        checksum: 'test-checksum',
      },
      spriteMeta: {
        nativeWidth: 96,
        nativeHeight: 96,
        byRosterId: Object.fromEntries(
          entries.map((row) => [
            row.id,
            { pokeapiId: row.num, file: `${row.num}.png`, slug: row.id },
          ]),
        ),
      },
    },
  };
});

vi.mock('../../src/adapters/roster-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/adapters/roster-source')>();
  return { ...actual, loadRoster: () => Promise.resolve(fixture.bundle) };
});

/**
 * Every sentence that reached the live region, in order.
 *
 * The ORDER is the assertion, and the DOM cannot carry it: `announce` writes one signal, so
 * the region only ever shows the last sentence written, and `act` flushes the effect that
 * writes the second one before any assertion can observe the first. A wrapper that records
 * the calls and then forwards them is the only way to see a sequence the room hears as two
 * separate announcements — which is exactly the property §Interaction asks for, and exactly
 * the one a naive second `announce` in the same handler destroys.
 */
const spoken = vi.hoisted(() => [] as string[]);

vi.mock('../../src/ui/components/LiveRegion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui/components/LiveRegion')>();

  return {
    ...actual,
    announce: (text: string): void => {
      spoken.push(text);
      actual.announce(text);
    },
  };
});

import { App } from '../../src/app';
import { save as saveTournament } from '../../src/adapters/persistence';
import { disposeTabLock } from '../../src/adapters/tab-lock';
import {
  cutTaken,
  draftStarted,
  matchRecorded,
  pickMade,
  poolBuilt,
  scheduleCompiled,
  TOURNAMENT_MATCH_RECORDED,
  TOURNAMENT_RESULTS_VOIDED,
  type Action,
  type Intent,
} from '../../src/core/actions';
import { MAX_MATCH_METRIC, metricRange } from '../../src/core/import-guard';
import {
  initialState,
  SCHEMA_VERSION,
  type DraftState,
  type MatchResult,
  type StageFormat,
  type TournamentConfig,
  type TournamentDepth,
  type TournamentDoc,
} from '../../src/core/model';
import { selectBracket, selectVoidCascade } from '../../src/core/tournament';
import { getDoc } from '../../src/store';
import { announce } from '../../src/ui/components/LiveRegion';
import {
  IDENTICAL_REASON,
  KEEP_RECORDED,
  MatchRecordDialog,
  metricRangeReason,
  NO_WINNER_REASON,
  RECORD_PLAIN,
  RECORD_VOID_BRACKET,
  type MatchRecord,
} from '../../src/ui/components/MatchRecordDialog';
import { OPEN_TOURNAMENT } from '../../src/ui/screens/CompletedDraft';
import type { VoidCascade } from '../../src/core/tournament';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];

function playersOf(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: NAMES[index] ?? `Player ${index + 1}`,
  }));
}

interface Options {
  players?: number;
  depth?: TournamentDepth;
  format?: StageFormat;
}

function configWith({
  players = 4,
  depth = 'draftAndBrackets',
  format = 'bo1',
}: Options = {}): TournamentConfig {
  return {
    formatLabel: 'Champions MB',
    players: playersOf(players),
    rounds: 2,
    rosterVersion: 'mb',
    rosterChecksum: 'test-checksum',
    poolSize: 12,
    bans: [],
    banMode: 'hostBanlist',
    megasRequiredPerTeam: 0,
    dualMegaChoices: [],
    depth,
    rules: [{ kind: 'mega', count: 0 }],
    megaFormeBans: [],
    swapBudget: 0,
    swapRounds: 0,
    bansPerPlayer: 0,
    duplicateBanPolicy: 'bothApply',
    matchMetric: 'pokemonLeft',
    roundRobinFormat: format,
    bracketFormat: format,
  };
}

/**
 * Every round-robin result, the lower seed index winning throughout.
 *
 * That makes the standings order `p1 … pn` and therefore the seeding order the same, which
 * is what lets the bracket cases below name a quarter-final by position rather than by
 * re-deriving what the chain decided.
 */
function everyRoundRobinResult(players: number, startSeq: number): MatchResult[] {
  const results: MatchResult[] = [];
  let seq = startSeq;

  for (let i = 0; i < players; i++) {
    for (let j = i + 1; j < players; j++) {
      results.push({
        matchId: `rr:${i}:${j}`,
        winnerId: `p${i + 1}`,
        loserId: `p${j + 1}`,
        winnerGames: 1,
        loserGames: 0,
        metric: 0,
        seq: seq++,
      });
    }
  }

  return results;
}

/** Both semi-finals of a four-seed bracket, as the fold holds them. */
function semiFinalResults(): MatchResult[] {
  const round = selectBracket(bracketState(4))?.rounds[0] ?? [];

  return round.flatMap((match, index) =>
    match.upperId === null || match.lowerId === null
      ? []
      : [
          {
            matchId: match.matchId,
            winnerId: match.upperId,
            loserId: match.lowerId,
            winnerGames: 1,
            loserGames: 0,
            metric: 0,
            seq: 600 + index,
          },
        ],
  );
}

/** A folded state at the bracket stage, cut to every player, with `results` recorded. */
function bracketState(players: number, extra: MatchResult[] = []): DraftState {
  const config = configWith({ players });
  const roundRobin = everyRoundRobinResult(players, 100);

  return {
    ...initialState(config),
    order: playersOf(players).map((player) => player.id),
    matchResults: [...roundRobin, ...extra],
    cut: {
      seeds: playersOf(players).map((player) => player.id),
      seq: 500,
    },
  };
}

let host: HTMLDivElement;
let recorded: { record: MatchRecord; cascade: VoidCascade }[];

beforeEach(() => {
  localStorage.clear();
  announce('');
  host = document.createElement('div');
  document.body.append(host);
  recorded = [];
  spoken.length = 0;
});

afterEach(() => {
  render(null, host);
  host.remove();
  disposeTabLock();
  localStorage.clear();
});

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === name,
  );
}

/** The primary is FIRST in DOM order; the safe button is second and last read. */
function primary(): HTMLButtonElement | undefined {
  return host.querySelector<HTMLButtonElement>('.match-record__record') ?? undefined;
}

function drawDialog(
  state: DraftState,
  matchId: string,
  a: { id: string; name: string },
  b: { id: string; name: string },
  format: StageFormat = 'bo1',
): void {
  act(() => {
    render(
      <MatchRecordDialog
        state={state}
        matchId={matchId}
        aId={a.id}
        aName={a.name}
        bId={b.id}
        bName={b.name}
        format={format}
        onRecord={(record, cascade) => recorded.push({ record, cascade })}
        onKeep={() => undefined}
      />,
      host,
    );
  });
}

function chooseWinner(playerId: string): void {
  const radio = host.querySelector<HTMLInputElement>(`input[value="${playerId}"]`);
  expect(radio).not.toBeNull();

  act(() => {
    if (radio !== null) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

// ---------------------------------------------------------------------------

describe('the fields', () => {
  it('heads with both players and offers a winner control always', () => {
    drawDialog(bracketState(4), 'rr:0:1', { id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' });

    expect(host.querySelector('.dialog__heading')?.textContent).toBe('Ada versus Bo');
    expect(host.querySelector('input[value="p1"]')).not.toBeNull();
    expect(host.querySelector('input[value="p2"]')).not.toBeNull();
  });

  it('offers the games control only at a bo3 stage', () => {
    drawDialog(
      bracketState(4),
      'rr:0:1',
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
      'bo1',
    );
    expect(host.textContent).not.toContain('2–1');

    drawDialog(
      bracketState(4),
      'rr:0:1',
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
      'bo3',
    );
    expect(host.textContent).toContain('2–0');
    expect(host.textContent).toContain('2–1');
  });

  it('offers the metric only at tier 3, bounded by the guard’s own constant', () => {
    const tier2 = bracketState(4);
    drawDialog(tier2, 'rr:0:1', { id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' });
    expect(host.querySelector('input[type="number"]')).toBeNull();

    const tier3: DraftState = {
      ...tier2,
      config: { ...tier2.config, depth: 'draftBracketsAndLog' },
    };
    drawDialog(tier3, 'rr:0:1', { id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' });

    const field = host.querySelector<HTMLInputElement>('input[type="number"]');
    expect(field?.getAttribute('max')).toBe(String(MAX_MATCH_METRIC));
    expect(field?.getAttribute('min')).toBe('0');
    expect(host.textContent).toContain('Pokémon left for the winner');
  });

  it('signs the field and the sentence when the metric is koDifference', () => {
    // WR-11: `koDifference` is "KOs scored minus KOs conceded", so half its range is
    // below zero. `min={0}` and `Enter a number from 0 to 18.` left a winner who took a
    // best-of-three 2-1 while conceding more KOs than they scored with no legal value
    // to enter, and the standings' link 2 then summed a systematically wrong total.
    const base = bracketState(4);
    const state: DraftState = {
      ...base,
      config: { ...base.config, depth: 'draftBracketsAndLog', matchMetric: 'koDifference' },
    };
    drawDialog(state, 'rr:0:1', { id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' });

    const field = host.querySelector<HTMLInputElement>('input[type="number"]');
    expect(field?.getAttribute('min')).toBe(String(-MAX_MATCH_METRIC));
    expect(field?.getAttribute('max')).toBe(String(MAX_MATCH_METRIC));
    expect(metricRangeReason('koDifference')).toBe('Enter a number from -18 to 18.');
    expect(metricRangeReason('pokemonLeft')).toBe('Enter a number from 0 to 18.');
    expect(metricRange('koDifference')).toEqual({ min: -18, max: 18 });
  });
});

describe('the primary button', () => {
  it('reads Record the result when nothing downstream is affected', () => {
    // No cut, so a round-robin result takes nothing with it.
    const state: DraftState = { ...bracketState(4), cut: null };
    drawDialog(state, 'rr:0:1', { id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' });

    expect(primary()?.textContent?.trim()).toBe(RECORD_PLAIN);
  });

  it('reads Record and void the bracket for a round-robin correction after the cut', () => {
    drawDialog(bracketState(4), 'rr:0:1', { id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' });

    expect(primary()?.textContent?.trim()).toBe(RECORD_VOID_BRACKET);
    expect(host.textContent).toContain('voids the cut and every bracket match');
  });

  it('reads Record and void 2 matches for a two-match bracket cascade', () => {
    // Eight seeds: a quarter-final feeds a semi-final which feeds the final. Correcting the
    // quarter-final with the other winner takes both of them.
    const base = bracketState(8);
    const bracket = selectBracket(base);
    expect(bracket).not.toBeNull();

    const quarter = bracket?.rounds[0]?.[0];
    const semi = bracket?.rounds[1]?.[0];
    const final = bracket?.final;
    expect(quarter?.upperId).toBe('p1');
    expect(quarter?.lowerId).toBe('p8');

    const downstream: MatchResult[] = [
      {
        matchId: quarter?.matchId ?? '',
        winnerId: 'p1',
        loserId: 'p8',
        winnerGames: 1,
        loserGames: 0,
        metric: 0,
        seq: 600,
      },
      {
        matchId: semi?.matchId ?? '',
        winnerId: 'p1',
        loserId: 'p4',
        winnerGames: 1,
        loserGames: 0,
        metric: 0,
        seq: 601,
      },
      {
        matchId: final?.matchId ?? '',
        winnerId: 'p1',
        loserId: 'p2',
        winnerGames: 1,
        loserGames: 0,
        metric: 0,
        seq: 602,
      },
    ];

    const state = bracketState(8, downstream);
    drawDialog(
      state,
      quarter?.matchId ?? '',
      { id: 'p1', name: 'Ada' },
      { id: 'p8', name: 'Hal' },
    );

    // Opens on the recorded winner, so nothing is affected until the host changes it.
    expect(primary()?.textContent?.trim()).toBe(RECORD_PLAIN);

    chooseWinner('p8');

    expect(primary()?.textContent?.trim()).toBe('Record and void 2 matches');
    expect(host.textContent).toContain('This changes who plays in 2 later matches.');

    // The label and the seqs are one computation, not two that agree by inspection.
    expect(selectVoidCascade(state, quarter?.matchId ?? '', 'p8').targetSeqs).toEqual([601, 602]);
  });

  it('stacks no second confirm on the form, whatever the cascade', () => {
    drawDialog(bracketState(4), 'rr:0:1', { id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' });

    chooseWinner('p2');

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(buttonNamed(KEEP_RECORDED)).toBeDefined();
  });
});

describe('the inert states', () => {
  it('refuses a record with no winner chosen, and says which next step is missing', () => {
    const state: DraftState = { ...bracketState(4), cut: null, matchResults: [] };
    drawDialog(state, 'rr:0:1', { id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' });

    expect(primary()?.getAttribute('aria-disabled')).toBe('true');
    expect(host.textContent).toContain(NO_WINNER_REASON);

    act(() => {
      primary()?.click();
    });
    expect(recorded).toHaveLength(0);
  });

  it('refuses a metric outside the range the guard admits', () => {
    const base = bracketState(4);
    const state: DraftState = {
      ...base,
      cut: null,
      matchResults: [],
      config: { ...base.config, depth: 'draftBracketsAndLog' },
    };
    drawDialog(state, 'rr:0:1', { id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' });

    chooseWinner('p1');
    expect(primary()?.hasAttribute('aria-disabled')).toBe(false);

    const field = host.querySelector<HTMLInputElement>('input[type="number"]');
    act(() => {
      if (field !== null) {
        field.value = String(MAX_MATCH_METRIC + 1);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    expect(primary()?.getAttribute('aria-disabled')).toBe('true');
    expect(host.textContent).toContain(metricRangeReason('pokemonLeft'));

    act(() => {
      primary()?.click();
    });
    expect(recorded).toHaveLength(0);
  });

  it('is inert with the exact reason when every value matches, and dispatches nothing', () => {
    const state: DraftState = { ...bracketState(4), cut: null };
    drawDialog(state, 'rr:0:1', { id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' });

    expect(primary()?.getAttribute('aria-disabled')).toBe('true');
    expect(host.textContent).toContain(IDENTICAL_REASON);

    act(() => {
      primary()?.click();
    });
    expect(recorded).toHaveLength(0);
  });

  it('drops the attribute outright once the values differ — never aria-disabled="false"', () => {
    const state: DraftState = { ...bracketState(4), cut: null };
    drawDialog(state, 'rr:0:1', { id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Bo' });

    chooseWinner('p2');

    expect(primary()?.hasAttribute('aria-disabled')).toBe(false);
    expect(host.innerHTML).not.toContain('aria-disabled="false"');
  });
});

describe('one gesture, one report', () => {
  it('hands over a finished record and the cascade its label was computed from', () => {
    const state: DraftState = { ...bracketState(4), cut: null };
    drawDialog(
      state,
      'rr:0:1',
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
      'bo3',
    );

    chooseWinner('p2');

    act(() => {
      primary()?.click();
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.record).toEqual({
      matchId: 'rr:0:1',
      winnerId: 'p2',
      // CARRIED, never derived — the pairing is the caller's fact, not the dialog's guess.
      loserId: 'p1',
      winnerGames: 2,
      loserGames: 0,
      metric: 0,
    });
    expect(recorded[0]?.cascade.targetSeqs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Through the real app: the two dispatches, their pairing, and the announcements
// ---------------------------------------------------------------------------

function stamp(intent: Intent, seq: number): Action {
  return { ...intent, seq, at: 1_770_000_000_000 + seq, actorId: 'host' };
}

/**
 * A four-player night, as a LOG, taken as far as `stage` says.
 *
 * The log rather than a folded state, because the assertions below are about what
 * `dispatch` appends to it and what `seq` it allocates — neither of which a hand-built fold
 * can answer.
 *
 * `'roundRobin'` stops at the finished draft with nothing recorded, which is the only shape
 * in which a cascade is EMPTY: after the cut every round-robin correction is D-11's.
 * `'bracket'` plays the whole round robin, takes the cut, and records both semi-finals —
 * but never the final, because recording it locks the tournament and `canApply` would then
 * refuse the very correction under test.
 */
/**
 * `cutOnly` is the cut taken with NO bracket result recorded — the cascade of one seq
 * and zero matches that `MatchRecordDialog` documents and WR-03 found unannounced.
 */
function playedDoc(stage: 'roundRobin' | 'bracket' | 'cutOnly'): TournamentDoc {
  const players = playersOf(4);
  const log: Action[] = [
    stamp(
      poolBuilt(
        Array.from({ length: 12 }, (_, index) => `mon-${index}`),
        'mb',
        'test-checksum',
        11,
        0,
      ),
      0,
    ),
    stamp(
      scheduleCompiled([
        { index: 1, kind: 'open' },
        { index: 2, kind: 'open' },
      ]),
      1,
    ),
    stamp(
      draftStarted(
        players.map((player) => player.id),
        13,
      ),
      2,
    ),
  ];

  let seq = 3;
  let pickIndex = 0;
  for (let round = 1; round <= 2; round++) {
    for (const player of players) {
      log.push(
        stamp(pickMade({ playerId: player.id, monId: `mon-${pickIndex}`, round, pickIndex }), seq),
      );
      seq += 1;
      pickIndex += 1;
    }
  }

  if (stage === 'bracket' || stage === 'cutOnly') {
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        log.push(stamp(matchRecorded(`rr:${i}:${j}`, `p${i + 1}`, `p${j + 1}`, 1, 0, 0), seq));
        seq += 1;
      }
    }

    log.push(stamp(cutTaken(players.map((player) => player.id)), seq));
    seq += 1;

    // The bracket's own pairings come from the SELECTOR rather than from a seed order this
    // file works out for itself — the whole point of `selectBracket` is that nothing else
    // decides who meets whom.
    const seeded = bracketState(4);
    const round = stage === 'cutOnly' ? [] : (selectBracket(seeded)?.rounds[0] ?? []);

    for (const match of round) {
      if (match.upperId === null || match.lowerId === null) continue;
      log.push(
        stamp(matchRecorded(match.matchId, match.upperId, match.lowerId, 1, 0, 0), seq),
      );
      seq += 1;
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: `match-record-${stage}`,
    createdAt: 1_770_000_000_000,
    config: configWith({ players: 4 }),
    rng: { seed: 0x5f3a91c2, cursor: 0 },
    log,
  };
}

async function openTournament(stage: 'roundRobin' | 'bracket' | 'cutOnly'): Promise<void> {
  expect(saveTournament(playedDoc(stage))).toBe(true);

  await act(async () => {
    render(<App />, host);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });

  await act(async () => {
    buttonNamed('Resume saved draft')?.click();
    await Promise.resolve();
  });

  await act(async () => {
    buttonNamed(OPEN_TOURNAMENT)?.click();
    await Promise.resolve();
  });
}

function liveRegionText(): string {
  return (
    host.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? ''
  ).trim();
}

describe('through the app', () => {
  it('appends exactly one action when nothing downstream is affected', async () => {
    await openTournament('roundRobin');

    const beforeLength = getDoc()?.log.length ?? 0;

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.results-grid__cell')?.click();
      await Promise.resolve();
    });

    chooseWinner('p1');
    expect(primary()?.textContent?.trim()).toBe(RECORD_PLAIN);

    await act(async () => {
      primary()?.click();
      await Promise.resolve();
    });

    const appended = (getDoc()?.log ?? []).slice(beforeLength);
    expect(appended).toHaveLength(1);
    expect(appended[0]?.type).toBe(TOURNAMENT_MATCH_RECORDED);
  });

  it('dispatches the record then the void, paired by causedBySeq', async () => {
    await openTournament('bracket');

    const before = getDoc();
    const beforeLength = before?.log.length ?? 0;

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.results-grid__cell')?.click();
      await Promise.resolve();
    });

    chooseWinner('p2');
    expect(primary()?.textContent?.trim()).toBe(RECORD_VOID_BRACKET);

    await act(async () => {
      primary()?.click();
      await Promise.resolve();
    });

    const appended = (getDoc()?.log ?? []).slice(beforeLength);
    expect(appended).toHaveLength(2);

    const record = appended[0];
    const voided = appended[1];

    // THE ORDER. A void arriving first would show a result vanishing for no stated reason.
    expect(record?.type).toBe(TOURNAMENT_MATCH_RECORDED);
    expect(voided?.type).toBe(TOURNAMENT_RESULTS_VOIDED);

    // THE PAIRING, and the whole reason `causedBySeq` exists: one undo takes both.
    expect(voided).toMatchObject({ causedBySeq: record?.seq });

    // And what it names is the cascade the button's own label was computed from — the cut
    // plus both recorded semi-finals.
    const cascade = selectVoidCascade(
      // The state the dialog computed against: everything up to the correction.
      bracketState(4, semiFinalResults()),
      'rr:0:1',
      'p2',
    );
    expect(cascade.matchCount).toBe(2);
    expect((voided as { targetSeqs?: number[] }).targetSeqs).toHaveLength(3);
  });

  it('leaves focus on the cell that opened it, with no override anywhere', async () => {
    await openTournament('roundRobin');

    const cell = host.querySelector<HTMLButtonElement>('.results-grid__cell');
    expect(cell).not.toBeNull();

    await act(async () => {
      cell?.focus();
      cell?.click();
      await Promise.resolve();
    });

    chooseWinner('p1');

    await act(async () => {
      primary()?.click();
      await Promise.resolve();
    });

    // `Dialog`'s own restore, and nothing else. The cell still exists and now shows the
    // result — an override here would be a second focus authority for the one case the
    // default already handles correctly.
    expect(document.activeElement).toBe(cell);
  });

  it('announces the record first and the void separately, after it', async () => {
    await openTournament('bracket');

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.results-grid__cell')?.click();
      await Promise.resolve();
    });

    chooseWinner('p2');

    spoken.length = 0;

    await act(async () => {
      primary()?.click();
      await Promise.resolve();
    });

    // TWO sentences, not one long one, and the record before the void — the void is the
    // surprising half and it arrives last, in a later render, so the room hears both.
    // The count is read AFTER both dispatches: a correction REPLACES a result rather than
    // appending one, so the round robin is still complete and nothing is left to play.
    // The void sentence names THE CUT because this correction took it (WR-03): the
    // bracket is gone and the stage has reverted, which is the surprising half.
    expect(spoken).toEqual([
      'Bo beat Ada. 0 matches left.',
      'The cut and 2 matches were voided.',
    ]);

    // And the region really did end on the second, rather than the pair being swallowed.
    expect(liveRegionText()).toBe('The cut and 2 matches were voided.');
  });

  it('announces the voided cut when no bracket result had been recorded yet', async () => {
    /*
      WR-03. `MatchRecordDialog` documents this case and the announcement used to miss it:
      a round-robin correction after the cut, with no bracket result recorded, yields
      `targetSeqs = [cut.seq]` and `matchCount === 0`. Armed on `matchCount > 0`, the only
      thing the room heard was a routine result correction — while the bracket was deleted
      and the stage reverted to the round robin.
    */
    await openTournament('cutOnly');

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.results-grid__cell')?.click();
      await Promise.resolve();
    });

    chooseWinner('p2');
    spoken.length = 0;

    await act(async () => {
      primary()?.click();
      await Promise.resolve();
    });

    expect(spoken).toEqual([
      'Bo beat Ada. 0 matches left.',
      'The cut was voided. The bracket is gone.',
    ]);
  });

  it('announces a BRACKET result with no round-robin count attached', async () => {
    /*
      WR-04. `selectRemainingMatchCount` counts the round-robin pair set and nothing else,
      and a bracket match can only be recorded after the cut — which itself requires that
      count to be zero. So every bracket result in the tournament was announced as
      `"… 0 matches left."`, a true number about the wrong stage, which reads as the
      tournament being over after the first semi-final.
    */
    await openTournament('bracket');

    // The final: round one is already recorded in the fixture, so it is the live card.
    const cards = [...host.querySelectorAll<HTMLButtonElement>('.match-card')];
    const final = cards.filter((card) => card.getAttribute('aria-disabled') === null).at(-1);
    expect(final).toBeDefined();

    await act(async () => {
      final?.click();
      await Promise.resolve();
    });

    const winner = host.querySelector<HTMLInputElement>('.match-record .segmented__input');
    expect(winner).not.toBeNull();
    act(() => {
      if (winner !== null) {
        winner.checked = true;
        winner.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    spoken.length = 0;

    await act(async () => {
      primary()?.click();
      await Promise.resolve();
    });

    // It really is a bracket match, so the assertion below is about the right stage.
    const appended = getDoc()?.log.at(-1) as { type: string; matchId: string } | undefined;
    expect(appended?.type).toBe('tournament/matchRecorded');
    expect(appended?.matchId.startsWith('br:')).toBe(true);

    expect(spoken).toHaveLength(1);
    expect(spoken[0]).not.toContain('matches left');
    expect(spoken[0]).toMatch(/^\w+ beat \w+\.$/);
  });
});
