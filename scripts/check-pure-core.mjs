#!/usr/bin/env node
/**
 * check-pure-core.mjs — SHEL-04 enforcement.
 *
 * Fails the build when anything under a core directory (default `src/core`) reaches for
 * ambient state: the clock, randomness, the DOM, the network, storage, or timers; or
 * imports from the impure edge (`adapters/`, `ui/`) or from a renderer (`preact`,
 * `@preact/signals`). The core must stay a pure function of its arguments so the
 * tournament document remains replayable, undoable, testable without mocks, and ready
 * for a sync layer as an integration rather than a rewrite.
 *
 * Why this is a real parser and not a grep:
 *
 *   A naive `grep -c "Date.now" src/core` counts its own documentation. Any file that
 *   explains the rule trips the gate, so the gate gets loosened or deleted. This script
 *   therefore blanks line comments, block comments, string literals, template literal
 *   text, and regex literals BEFORE matching — while keeping template `${...}`
 *   interpolations, which are real code. Blanked regions are replaced with equal-length
 *   spaces and newlines are preserved, so reported line and column numbers point at the
 *   original source.
 *
 * Zero dependencies. Node 18+.
 *
 * Two modes, sharing one scanner:
 *
 *   core    (default)  Scans `src/core` for ambient state and for imports from the
 *                      impure edge. This is SHEL-04.
 *
 *   markup  (--nohtml) Scans ALL of `src` for the raw-HTML sinks. This is T-01-04.
 *                      Preact escapes text children by default, so roster display
 *                      names reach the DOM as inert text — but "by default" is a
 *                      property of how the code is written, and one
 *                      dangerouslySetInnerHTML would quietly undo it. This mode turns
 *                      the guarantee from assumed into enforced. It deliberately does
 *                      NOT apply the ambient-state list: `fetch`, `document` and
 *                      `window` are exactly what `src/adapters` and `src/ui` exist to
 *                      use.
 *
 * Usage:  node scripts/check-pure-core.mjs [directory]
 *         node scripts/check-pure-core.mjs --nohtml [directory]
 * Exit:   0 = clean, 1 = violations found (or the directory does not exist)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, sep } from 'node:path';
import process from 'node:process';

const DEFAULT_CORE_DIR = 'src/core';
const DEFAULT_MARKUP_DIR = 'src';
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

/**
 * Ambient-state identifiers. Matched as whole words against the stripped source.
 *
 * Deliberately strict: a property that happens to be named `document` or `window` will
 * be flagged. That is the correct default for a deny gate — rename the property rather
 * than weaken the check. `\b` already prevents matching inside longer identifiers, so
 * `processResults` does not trip `process`.
 */
const FORBIDDEN_IDENTIFIERS = [
  { token: 'Date.now', pattern: /\bDate\s*\??\s*\.\s*now\b/g },
  { token: 'new Date', pattern: /\bnew\s+Date\b/g },
  { token: 'Math.random', pattern: /\bMath\s*\??\s*\.\s*random\b/g },
  { token: 'localStorage', pattern: /\blocalStorage\b/g },
  { token: 'sessionStorage', pattern: /\bsessionStorage\b/g },
  { token: 'indexedDB', pattern: /\bindexedDB\b/g },
  { token: 'fetch', pattern: /\bfetch\b/g },
  { token: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/g },
  { token: 'document', pattern: /\bdocument\b/g },
  { token: 'window', pattern: /\bwindow\b/g },
  { token: 'navigator', pattern: /\bnavigator\b/g },
  { token: 'crypto', pattern: /\bcrypto\b/g },
  { token: 'performance', pattern: /\bperformance\b/g },
  { token: 'BroadcastChannel', pattern: /\bBroadcastChannel\b/g },
  { token: 'setTimeout', pattern: /\bsetTimeout\b/g },
  { token: 'setInterval', pattern: /\bsetInterval\b/g },
  { token: 'requestAnimationFrame', pattern: /\brequestAnimationFrame\b/g },
  { token: 'process', pattern: /\bprocess\b/g },
  { token: 'dangerouslySetInnerHTML', pattern: /\bdangerouslySetInnerHTML\b/g },
  { token: 'innerHTML', pattern: /\binnerHTML\b/g },
];

/**
 * Raw-HTML sinks (T-01-04). Applied across ALL of `src`, not only the core.
 *
 * Roster display names come from a committed snapshot and are rendered as text
 * children, which Preact escapes. These are the assignments that would silently turn
 * that text back into markup. The list covers the whole class, not only the two names
 * the threat register happens to cite: `outerHTML` and `insertAdjacentHTML` open
 * exactly the same hole through a ref, and leaving them out would make the gate look
 * complete while missing the two most obvious ways around it.
 */
const MARKUP_IDENTIFIERS = [
  { token: 'dangerouslySetInnerHTML', pattern: /\bdangerouslySetInnerHTML\b/g },
  { token: 'innerHTML', pattern: /\binnerHTML\b/g },
  { token: 'outerHTML', pattern: /\bouterHTML\b/g },
  { token: 'insertAdjacentHTML', pattern: /\binsertAdjacentHTML\b/g },
];

/** Module-specifier extractors. Run against source with strings intact, comments blanked. */
const IMPORT_PATTERNS = [
  /\bfrom\s*(['"])([^'"\n]*)\1/g,
  /\bimport\s*\(\s*(['"])([^'"\n]*)\1\s*\)/g,
  /\bimport\s+(['"])([^'"\n]*)\1/g,
  /\brequire\s*\(\s*(['"])([^'"\n]*)\1\s*\)/g,
];

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'case',
  'do',
  'else',
  'yield',
  'await',
  'throw',
]);

const REGEX_PRECEDING_PUNCTUATION = '(,=:[!&|?{};+-*%^~';

const WORD_CHARACTER = /[A-Za-z0-9_$]/;

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

/**
 * Blank a single index in every supplied array, preserving line structure.
 * Newlines and carriage returns are never blanked, so line numbers stay accurate.
 */
function blankAt(source, arrays, index) {
  const character = source[index];
  if (character === '\n' || character === '\r') return;
  for (const array of arrays) array[index] = ' ';
}

/**
 * Decide whether a `/` at `index` opens a regex literal or is a division operator.
 * Looks back over `codeCharacters`, whose comments are already blanked, so a comment
 * immediately before the slash cannot skew the decision.
 */
function isRegexPosition(codeCharacters, index) {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(codeCharacters[cursor])) cursor--;
  if (cursor < 0) return true;

  const character = codeCharacters[cursor];
  if (REGEX_PRECEDING_PUNCTUATION.includes(character)) return true;

  if (WORD_CHARACTER.test(character)) {
    let start = cursor;
    while (start >= 0 && WORD_CHARACTER.test(codeCharacters[start])) start--;
    const word = codeCharacters.slice(start + 1, cursor + 1).join('');
    return REGEX_PRECEDING_KEYWORDS.has(word);
  }

  return false;
}

/** Find the end of a regex literal starting at `start`, or `start` if it is not one. */
function scanRegexLiteral(source, start) {
  let cursor = start + 1;
  let insideCharacterClass = false;

  while (cursor < source.length) {
    const character = source[cursor];
    if (character === '\n') return start;
    if (character === '\\') {
      cursor += 2;
      continue;
    }
    if (character === '[') insideCharacterClass = true;
    else if (character === ']') insideCharacterClass = false;
    else if (character === '/' && !insideCharacterClass) {
      cursor++;
      while (cursor < source.length && /[a-z]/i.test(source[cursor])) cursor++;
      return cursor;
    }
    cursor++;
  }

  return start;
}

/**
 * Produce two length-preserving views of the source:
 *
 *   code     — comments and regex literals blanked; string and template literals intact.
 *              Used to read module specifiers.
 *   stripped — additionally blanks string literal contents and template literal text,
 *              while KEEPING template `${...}` interpolations, which are real code.
 *              Used to match forbidden identifiers.
 */
function scanSource(source) {
  const code = Array.from(source);
  const stripped = Array.from(source);
  const both = [code, stripped];
  const strippedOnly = [stripped];

  const stack = [{ kind: 'code', interpolation: false, braceDepth: 0 }];
  let index = 0;

  while (index < source.length) {
    const context = stack[stack.length - 1];
    const character = source[index];
    const next = source[index + 1];

    if (context.kind === 'code') {
      if (character === '/' && next === '/') {
        while (index < source.length && source[index] !== '\n') {
          blankAt(source, both, index);
          index++;
        }
        continue;
      }

      if (character === '/' && next === '*') {
        const start = index;
        index += 2;
        while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
          index++;
        }
        index = Math.min(index + 2, source.length);
        for (let k = start; k < index; k++) blankAt(source, both, k);
        continue;
      }

      if (character === '/' && isRegexPosition(code, index)) {
        const end = scanRegexLiteral(source, index);
        if (end > index) {
          for (let k = index; k < end; k++) blankAt(source, both, k);
          index = end;
          continue;
        }
      }

      if (character === "'" || character === '"') {
        blankAt(source, strippedOnly, index);
        stack.push({ kind: 'string', quote: character });
        index++;
        continue;
      }

      if (character === '`') {
        blankAt(source, strippedOnly, index);
        stack.push({ kind: 'template' });
        index++;
        continue;
      }

      if (character === '{') {
        context.braceDepth++;
        index++;
        continue;
      }

      if (character === '}') {
        if (context.braceDepth === 0 && context.interpolation) {
          blankAt(source, strippedOnly, index);
          stack.pop();
        } else if (context.braceDepth > 0) {
          context.braceDepth--;
        }
        index++;
        continue;
      }

      index++;
      continue;
    }

    if (context.kind === 'string') {
      if (character === '\\') {
        blankAt(source, strippedOnly, index);
        if (index + 1 < source.length) blankAt(source, strippedOnly, index + 1);
        index += 2;
        continue;
      }
      if (character === context.quote) {
        blankAt(source, strippedOnly, index);
        stack.pop();
        index++;
        continue;
      }
      if (character === '\n') {
        // Unterminated string literal. Recover rather than mis-scan the rest of the file.
        stack.pop();
        index++;
        continue;
      }
      blankAt(source, strippedOnly, index);
      index++;
      continue;
    }

    // context.kind === 'template'
    if (character === '\\') {
      blankAt(source, strippedOnly, index);
      if (index + 1 < source.length) blankAt(source, strippedOnly, index + 1);
      index += 2;
      continue;
    }
    if (character === '`') {
      blankAt(source, strippedOnly, index);
      stack.pop();
      index++;
      continue;
    }
    if (character === '$' && next === '{') {
      blankAt(source, strippedOnly, index);
      blankAt(source, strippedOnly, index + 1);
      stack.push({ kind: 'code', interpolation: true, braceDepth: 0 });
      index += 2;
      continue;
    }
    blankAt(source, strippedOnly, index);
    index++;
  }

  return { code: code.join(''), stripped: stripped.join('') };
}

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------

function buildLineIndex(source) {
  const lineStarts = [0];
  for (let k = 0; k < source.length; k++) {
    if (source[k] === '\n') lineStarts.push(k + 1);
  }
  return lineStarts;
}

function locationOf(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (lineStarts[middle] <= index) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: index - lineStarts[low] + 1 };
}

function toPosixPath(value) {
  return value.split(sep).join(posix.sep);
}

// ---------------------------------------------------------------------------
// Violation detection
// ---------------------------------------------------------------------------

function classifySpecifier(specifier) {
  const segments = specifier.split('/');
  if (specifier.includes('adapters')) {
    return 'adapters are the impure edge; the core may not import them';
  }
  if (segments.includes('ui')) {
    return 'the ui layer sits above the core; the core may not import it';
  }
  if (
    specifier === 'preact' ||
    specifier.startsWith('preact/') ||
    specifier.startsWith('@preact/')
  ) {
    return 'the core must stay renderer-agnostic';
  }
  return null;
}

function findViolations(relativePath, source, mode) {
  const { code, stripped } = scanSource(source);
  const lineStarts = buildLineIndex(source);
  const violations = [];

  const identifiers = mode === 'markup' ? MARKUP_IDENTIFIERS : FORBIDDEN_IDENTIFIERS;
  const identifierReason = mode === 'markup' ? 'raw HTML sink' : 'ambient state';

  for (const { token, pattern } of identifiers) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(stripped)) !== null) {
      const { line, column } = locationOf(lineStarts, match.index);
      violations.push({ path: relativePath, line, column, token, reason: identifierReason });
      if (match[0].length === 0) pattern.lastIndex++;
    }
  }

  // Layering is a core-only concern. `src/ui` importing `src/adapters` is the design.
  if (mode === 'markup') {
    violations.sort(
      (a, b) => a.line - b.line || a.column - b.column || a.token.localeCompare(b.token),
    );
    return violations;
  }

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const specifier = match[2];
      const reason = classifySpecifier(specifier);
      if (reason === null) continue;
      const quoteOffset = match[0].indexOf(match[1]);
      const specifierIndex = match.index + quoteOffset + 1;
      const { line, column } = locationOf(lineStarts, specifierIndex);
      violations.push({
        path: relativePath,
        line,
        column,
        token: `import '${specifier}'`,
        reason,
      });
    }
  }

  violations.sort((a, b) => a.line - b.line || a.column - b.column || a.token.localeCompare(b.token));
  return violations;
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

function collectSourceFiles(directory) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        found.push(full);
      }
    }
  };
  walk(directory);
  return found;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parse argv into a mode and a target directory.
 *
 * An unrecognised flag is fatal rather than ignored: a typo'd flag that silently fell
 * back to core mode would report `check:nohtml` as passing while checking the wrong
 * list, which is the same self-invalidating failure the whole script exists to avoid.
 */
function parseArguments(argv) {
  let mode = 'core';
  const positional = [];

  for (const argument of argv.slice(2)) {
    if (argument === '--nohtml' || argument === '--markup') {
      mode = 'markup';
      continue;
    }
    if (argument === '--core') {
      mode = 'core';
      continue;
    }
    if (argument.startsWith('--')) {
      console.error(`check:pure — unknown flag: ${argument}`);
      console.error('Usage: node scripts/check-pure-core.mjs [--nohtml] [directory]');
      process.exit(1);
    }
    positional.push(argument);
  }

  const fallback = mode === 'markup' ? DEFAULT_MARKUP_DIR : DEFAULT_CORE_DIR;
  return { mode, target: positional[0] ?? fallback };
}

function main() {
  const { mode, target } = parseArguments(process.argv);
  const label = mode === 'markup' ? 'check:nohtml' : 'check:pure';

  let stats;
  try {
    stats = statSync(target);
  } catch {
    // A typo'd path that silently passed would be exactly the self-invalidating gate
    // this script exists to avoid. Fail loudly instead.
    console.error(`${label} — target directory not found: ${toPosixPath(target)}`);
    process.exit(1);
  }

  if (!stats.isDirectory()) {
    console.error(`${label} — target is not a directory: ${toPosixPath(target)}`);
    process.exit(1);
  }

  const files = collectSourceFiles(target);
  if (files.length === 0) {
    console.log(
      `${label} — no .ts or .tsx files under ${toPosixPath(target)} yet; nothing to check`,
    );
    process.exit(0);
  }

  const violations = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    violations.push(...findViolations(toPosixPath(file), source, mode));
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.log(
        `${violation.path}:${violation.line}:${violation.column}  forbidden: ${violation.token}  (${violation.reason})`,
      );
    }
    console.log('');
    console.log(
      `${label} — ${violations.length} violation(s) in ${files.length} file(s) under ${toPosixPath(target)}`,
    );
    console.log(
      mode === 'markup'
        ? 'Roster display names reach the DOM as text children, which the renderer escapes. Render text, not markup — if a surface genuinely needs rich content, build it from elements.'
        : 'The core must be a pure function of its arguments. Move the ambient value to an adapter and stamp it onto the action at dispatch time.',
    );
    process.exit(1);
  }

  console.log(`${label} — 0 violations in ${files.length} file(s) under ${toPosixPath(target)}`);
  process.exit(0);
}

main();
