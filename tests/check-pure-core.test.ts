import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const CHECKER = 'scripts/check-pure-core.mjs';

function runChecker(target: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [CHECKER, target], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

describe('check-pure-core (SHEL-04 gate)', () => {
  it('passes on the real src/core', () => {
    expect(runChecker('src/core').status).toBe(0);
  });

  it('does not flag forbidden tokens that appear only in comments, strings, templates, or regex literals', () => {
    const result = runChecker('scripts/__fixtures__/pure');
    expect(result.output).not.toContain('forbidden:');
    expect(result.status).toBe(0);
  });

  it('flags a fixture that actually reaches for ambient state', () => {
    const result = runChecker('scripts/__fixtures__/impure');
    expect(result.status).toBe(1);
    expect(result.output).toContain('Date.now');
    expect(result.output).toContain('localStorage');
    expect(result.output).toContain('Math.random');
  });

  it('fails loudly rather than silently passing when the target directory is missing', () => {
    const result = runChecker('src/core-typo-that-does-not-exist');
    expect(result.status).toBe(1);
    expect(result.output).toContain('not found');
  });
});
