/**
 * rng.ts — SHEL-07. The only source of randomness in the entire application.
 *
 * There is no generator object and no internal state. `nextInt` is a pure integer hash
 * of `(seed, cursor)`, so the same pair always yields the same value, on every machine,
 * forever. Randomness is therefore *state* — `{ seed, cursor }` lives in the tournament
 * document and is advanced deterministically — which is what lets a reloaded document
 * reproduce its starting order exactly, and what makes a replay of the log produce the
 * identical result rather than a fresh roll.
 *
 * The ambient generator that would otherwise be reached for here is forbidden anywhere
 * under `src/core` and `npm run check:pure` fails the build on it. That is deliberate:
 * a single unseeded draw would silently make the whole document non-reproducible, and
 * it would do so without breaking a single other test.
 *
 * The algorithm is the mulberry32-style integer mix ARCHITECTURE.md gives verbatim in
 * Pattern 2. It is not cryptographic and does not need to be — nothing here is a
 * secret, and the property being bought is reproducibility, not unpredictability.
 */

export interface RngDraw {
  /** An integer in `[0, max)`. */
  value: number;
  /** The cursor to pass to the next draw. Always `cursor + 1`. */
  cursor: number;
}

export function nextInt(seed: number, cursor: number, max: number): RngDraw {
  if (!Number.isInteger(max) || max < 1) {
    // `% 0` is NaN, which would flow into an array index and surface as `undefined`
    // several frames away from the mistake. A caller asking for a draw from an empty
    // range has a bug, and expected-failure tolerance is `canApply`'s job, not this
    // function's.
    throw new RangeError(`nextInt requires a positive integer range, received ${max}`);
  }

  let t = (seed + cursor * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

  return { value: ((t ^ (t >>> 14)) >>> 0) % max, cursor: cursor + 1 };
}
