/**
 * plural.ts — the plural rules that BOTH layers need, and only those.
 *
 * ## Why one of them lives in core
 *
 * `confirm-copy.ts` holds this project's plural helpers and states the standing argument
 * for keeping each rule in exactly one place: "a second private copy is how two surfaces
 * end up disagreeing about the singular". That file is under `src/ui/`, and
 * `feasibility.ts` — which composes its own sentences, verbatim from the UI-SPEC, in
 * core — may not import from it. The dependency arrow points inward only, and
 * `npm run check:pure` fails the build on the reverse.
 *
 * So the rule core needs lives here, where core may use it and `src/ui/` may import it
 * (IN-03). That is the whole of this module's remit: it is NOT a new home for the copy
 * helpers in general, and a plural only belongs here once a sentence composed in core
 * needs it. `matches`, `picks`, `bans`, `swaps` and the rest stay in `confirm-copy.ts`
 * beside the dialogs that are their only readers.
 *
 * No strings beyond the count itself. The sentences remain where they are written down —
 * `feasibility.ts` for the ones core composes, `confirm-copy.ts` and the components for
 * the rest — because a copy table split across two layers is worse than a helper shared
 * between them.
 */

/**
 * `1 player`, `2 players`.
 *
 * Two sentences reached one player and rendered `1 players`: `feasibility.ts`'s
 * `A bracket needs at least 4 players to mean much. At {n} players the round robin
 * already decides it.` and the config screen's `A round robin at {n} players is
 * {m} matches.` Both are reachable — `TOO_FEW_PLAYERS` blocks below two, but blocking is
 * not hiding, and both sentences render beside it while the host is still typing names in.
 */
export function players(count: number): string {
  return count === 1 ? '1 player' : `${count} players`;
}
