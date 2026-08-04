// This fixture is deliberately PURE, and it names forbidden tokens on purpose.
// A grep-based gate would flag this file for mentioning Date.now and localStorage in a
// comment — that self-invalidating flaw is exactly what check-pure-core.mjs must not have.

/*
 * Block comment naming more forbidden things: Math.random, fetch, document, window,
 * navigator, crypto, performance, setTimeout, setInterval, innerHTML, and new Date.
 * None of this is code, so none of it may be reported.
 */

/** JSDoc mentioning process, indexedDB, and BroadcastChannel. Still not code. */
export function addPicks(a: number, b: number): number {
  return a + b;
}

export const RULE_TEXT = 'Never call Date.now or read localStorage inside src/core.';

export const RULE_TEMPLATE = `Also never touch window, document, fetch, or new Date.`;

// A regex literal is not an access either. The scanner must recognise it as a regex
// rather than as division, and blank its contents before matching.
export const MENTIONS_AMBIENT = /localStorage|Date\.now|Math\.random/;

// Exercises template interpolation: the literal text is blanked, but `${...}` holds real
// code and must survive stripping so a genuine call inside one would still be caught.
export function describeRule(name: string): string {
  return `Rule ${name}: no sessionStorage, no XMLHttpRequest, no requestAnimationFrame.`;
}
