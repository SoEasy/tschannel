/**
 * Prints the next sequential number for an OpenSpec change or ADR.
 *
 * Usage:
 *   node scripts/next-number.mjs
 *     Prints the next change prefix as `t-NNNN` after scanning
 *     `openspec/changes` and `openspec/changes/archive` for `t-NNNN-slug` identifiers.
 *
 *   node scripts/next-number.mjs adr
 *     Prints the next ADR number as `NNNN` after scanning `.ai/adr`
 *     for `NNNN-slug.md` files.
 *
 * Both modes use the same "highest existing number plus one" rule. The script
 * has no filesystem side effects; callers are responsible for creating or
 * renaming directories and files.
 */

import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAD_WIDTH = 4;
const pad = (number) => String(number).padStart(PAD_WIDTH, '0');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const changesDir = resolve(repoRoot, 'openspec', 'changes');
const archiveDir = resolve(changesDir, 'archive');
const adrDir = resolve(repoRoot, '.ai', 'adr');

const MODES = {
  change: {
    // Active: `t-NNNN-slug`; archived: `YYYY-MM-DD-t-NNNN-slug`.
    pattern: /(?:^|-)t-(\d{4})-/,
    directories: [changesDir, archiveDir],
    entryType: 'directory',
    format: (number) => `t-${pad(number)}`,
  },
  adr: {
    pattern: /^(\d{4})-.+\.md$/,
    directories: [adrDir],
    entryType: 'file',
    format: (number) => pad(number),
  },
};

class DirectoryNotFoundError extends Error {
  constructor(path) {
    super(`Required directory not found: ${path}`);
    this.name = 'DirectoryNotFoundError';
  }
}

/**
 * Extracts sequence numbers from matching directory entries.
 * @param {string} directory Directory to scan.
 * @param {RegExp} pattern Pattern containing a capture group for the number.
 * @param {'directory' | 'file'} entryType Required entry type.
 * @param {boolean} required Whether a missing directory is an error.
 * @returns {number[]} Extracted sequence numbers.
 */
const collectNumbers = (directory, pattern, entryType, required) => {
  let entries;

  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (!required && error.code === 'ENOENT') return [];
    if (error.code === 'ENOENT') throw new DirectoryNotFoundError(directory);
    throw error;
  }

  return entries
    .filter((entry) => (entryType === 'directory' ? entry.isDirectory() : entry.isFile()))
    .map((entry) => pattern.exec(entry.name))
    .filter((match) => match !== null)
    .map((match) => Number.parseInt(match[1], 10));
};

const [modeArgument, ...extraArguments] = process.argv.slice(2);

if ((modeArgument !== undefined && modeArgument !== 'adr') || extraArguments.length > 0) {
  process.stderr.write('Usage: node scripts/next-number.mjs [adr]\n');
  process.exit(1);
}

const mode = modeArgument === 'adr' ? MODES.adr : MODES.change;
const numbers = mode.directories.flatMap((directory, index) =>
  collectNumbers(directory, mode.pattern, mode.entryType, index === 0)
);
const next = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;

process.stdout.write(`${mode.format(next)}\n`);
