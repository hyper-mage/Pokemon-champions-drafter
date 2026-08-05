import { signal } from '@preact/signals';

/**
 * The single polite live region for the whole app.
 *
 * There is exactly one of these, mounted at app root, and nothing in this project
 * uses `aria-live="assertive"` — an assertive region interrupts whatever the user is
 * reading, which is never warranted by a draft pick, an undo, or a copy result.
 *
 * The message is a module-level signal rather than a prop so any surface can announce
 * without threading a callback down through the tree. Later plans announce turn
 * changes, undo, copy results, and import results through `announce`.
 */
const message = signal('');

/**
 * Speak `text` politely.
 *
 * Known limit, stated rather than faked: assistive technology announces a *change* to
 * the region, so announcing byte-identical text twice in a row is silent the second
 * time. Clearing to the empty string first does not fix it — Preact batches both
 * writes into one render, so the DOM never observes the intermediate value. The real
 * fix is a two-frame clear, and no surface in this phase repeats a message, so it is
 * left undone deliberately rather than papered over.
 */
export function announce(text: string): void {
  message.value = text;
}

export function LiveRegion() {
  return (
    <div role="status" aria-live="polite" class="visually-hidden">
      {message.value}
    </div>
  );
}
