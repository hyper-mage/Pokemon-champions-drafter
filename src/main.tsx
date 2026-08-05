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
