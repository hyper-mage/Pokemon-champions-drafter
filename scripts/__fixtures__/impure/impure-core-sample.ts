// This fixture is deliberately IMPURE. Every line below is a real ambient access, and
// check-pure-core.mjs must report each one and exit 1. If this file ever stops being
// flagged, the gate has silently stopped working.

export function stampedAt(): number {
  return Date.now();
}

export function loadSavedDraft(): string | null {
  return localStorage.getItem('champions-draft');
}

export function shuffleSeed(): number {
  return Math.random();
}

export function stampedInTemplate(): string {
  return `saved at ${Date.now()}`;
}
