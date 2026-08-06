import { render } from 'preact';

// tokens.css first, then app.css, then everything a component pulls in.
//
// Stated precisely rather than as folklore: custom properties resolve at used-value
// time, so a var() consumed by a rule that happens to be emitted earlier still picks
// up the :root declaration. Order is enforced here for the two things it does decide
// — which declaration wins when two rules have equal specificity, and where Vite
// places each file in the single bundled stylesheet — and so the entry point reads as
// the definition of the cascade rather than leaving it to module-graph accident.
import './ui/tokens.css';
import './ui/app.css';

import { App } from './app';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app mount point in index.html');
}

render(<App />, root);

// SHEL-03. Registration lives here rather than in a component because it must
// happen exactly once per document and has nothing to do with rendering.
//
// PROD-only: `public/sw.js` ships with un-substituted tokens and is only made
// valid by `scripts/build-sw-manifest.mjs`, so a dev-server registration would
// install a worker that throws on evaluation.
//
// On `load` rather than immediately, so the first paint is never competing with
// ~320 cache writes.
//
// Explicit `scope` (T-01-11): this is a GitHub Pages *project* site. A worker
// registered at the origin root would control every other project on
// `hyper-mage.github.io` — the platform refuses it, and it would be wrong if it
// did not. `BASE_URL` carries its trailing slash, so this scopes to exactly
// `/Pokemon-champions-drafter/`.
//
// `updateViaCache: 'none'` forces the update check for the worker script itself
// to hit the network. Pages serves `Cache-Control: max-age=600`; without this the
// browser may answer the update check from the HTTP cache, which is the one thing
// that could keep a redeploy from ever reaching a returning visitor (D-15).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
      .catch((error: unknown) => {
        // Offline is an enhancement layered over a working app. A refused
        // registration — private browsing, a disabled worker, an install that
        // lost one of its ~320 requests — must never take the draft down with it.
        console.warn('Service worker registration failed; the app still works online.', error);
      });
  });
}
