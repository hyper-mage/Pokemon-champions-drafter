import { render } from 'preact';

// Order matters and is load-bearing: tokens.css declares every custom property on
// :root, app.css consumes them. Swapping these two lines leaves the shell styled
// against undeclared variables.
import './ui/tokens.css';
import './ui/app.css';

import { App } from './app';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app mount point in index.html');
}

render(<App />, root);
