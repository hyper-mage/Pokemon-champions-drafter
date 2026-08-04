import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

// The app is served from a GitHub Pages *project* sub-path, not a user root.
// A bare '/' base would emit absolute asset URLs that 404 on the only URL
// anyone will ever open.
export default defineConfig({
  base: '/Pokemon-champions-drafter/',
  plugins: [preact()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    // The pure core needs no DOM. UI component tests are not in this plan;
    // when they arrive they get their own environment override.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
