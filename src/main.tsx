import { render } from 'preact';

import { App } from './app';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app mount point in index.html');
}

render(<App />, root);
