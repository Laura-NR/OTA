#!/usr/bin/env node
/**
 * Read one screen's copy from the design's copy inventory
 * (design/vereda-v1.1/handoff/copy-inventory.json) while building it.
 *
 *   node tools/copy-inventory.mjs <Screen> [--kind text|aria-label|placeholder|page-title]
 *                                          [--skip-chrome] [--json <namespace>]
 *
 * Without --json it lists the strings in board order with their inventory key, kind and
 * flags: [config] marks a bracketed value that belongs in configuration (T-Signoff §03,
 * never hard-coded), {var} a string with holes. --skip-chrome drops strings that also
 * appear on most other screens of the same canvas page (nav, footer, licence line).
 * --json prints a draft i18n namespace keyed by camel-cased slug, EN only; ES and FR
 * are translated and reviewed before they enter packages/i18n. Read-only: it never
 * writes the catalogues.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(
  readFileSync(join(root, 'design/vereda-v1.1/handoff/copy-inventory.json'), 'utf8'),
);

const args = process.argv.slice(2);
const screen = args[0];
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
if (!screen || screen.startsWith('--')) {
  console.error(
    'usage: node tools/copy-inventory.mjs <Screen> [--kind k] [--skip-chrome] [--json <namespace>]',
  );
  process.exit(1);
}

const rows = inventory.strings;
const own = rows.filter((row) => row.screen === screen);
if (own.length === 0) {
  const screens = [...new Set(rows.map((row) => row.screen))].sort();
  console.error(`no strings for "${screen}". Screens: ${screens.join(', ')}`);
  process.exit(1);
}

let selected = own;
const kind = option('--kind');
if (kind) {
  selected = selected.filter((row) => row.kind === kind);
}
if (args.includes('--skip-chrome')) {
  const page = own[0].page;
  const siblings = [...new Set(rows.filter((row) => row.page === page).map((row) => row.screen))];
  const seenOn = new Map();
  for (const row of rows.filter((candidate) => candidate.page === page)) {
    const screens = seenOn.get(row.en) ?? new Set();
    screens.add(row.screen);
    seenOn.set(row.en, screens);
  }
  const threshold = Math.max(2, Math.ceil(siblings.length / 2));
  selected = selected.filter((row) => (seenOn.get(row.en)?.size ?? 0) < threshold);
}

const camel = (slug) =>
  slug
    .replace(/[^a-z0-9]+(.)?/gi, (_, next) => (next ? next.toUpperCase() : ''))
    .replace(/^[A-Z]/, (first) => first.toLowerCase())
    .replace(/^(\d)/, 'n$1') || 'text';

const namespace = option('--json');
if (namespace) {
  const draft = {};
  for (const row of selected) {
    const slug = row.key.split('.').slice(2).join('.');
    let key = camel(slug).slice(0, 40);
    let suffix = 2;
    while (key in draft && draft[key] !== row.en) {
      key = `${camel(slug).slice(0, 38)}${suffix++}`;
    }
    draft[key] = row.en;
  }
  console.log(JSON.stringify({ [namespace]: draft }, null, 2));
} else {
  for (const row of selected) {
    const flags = [row.has_placeholder ? '[config]' : '', row.has_variable ? '{var}' : '']
      .filter(Boolean)
      .join(' ');
    console.log(`${row.key}\t${row.kind}\t${flags}\t${row.en}`);
  }
  console.error(`${selected.length} of ${own.length} strings on ${screen}`);
}
