/**
 * id.ts — identity and seeds, generated at the impure edge and never in a reducer.
 *
 * Sync rule 9: ids are created here and passed in on the action. Sync rule 13: the RNG
 * seed is drawn here exactly once, when the tournament is created, and then stored in
 * the document — after which all randomness is the pure `nextInt` in `src/core/rng.ts`
 * advancing a cursor. `npm run check:pure` forbids the token this module is built on
 * anywhere under `src/core`, which is the whole reason the module exists.
 *
 * `randomUUID` is restricted to secure contexts. HTTPS and localhost both qualify, so
 * the deployed site and `npm run dev` are covered — but a phone opening the host's
 * laptop over `http://192.168.x.x` is not, and that is a completely plausible way for
 * this audience to use the tool. `getRandomValues` carries no such restriction, so the
 * fallback composes the same v4 UUID from it rather than letting the app fail to start.
 */

/** A random 32-bit unsigned integer, used once per tournament as the RNG seed. */
export function newSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? 0;
}

/** A v4 UUID composed from `getRandomValues`, for insecure-context browsers. */
function composeUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Version 4 and the RFC 4122 variant bits, set exactly as the built-in would.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** A fresh unique id. Used for the tournament document id. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return composeUuid();
}
