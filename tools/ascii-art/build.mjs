#!/usr/bin/env node
// Builds the chat's ASCII-art catalog: tools/ascii-art/art.txt (the source, see its
// header) -> WsCore.Client/src/lobby/asciiArt.json (bundled with the client).
//
//   node tools/ascii-art/build.mjs [source.txt ...]
//
// Normalizes every picture (tabs -> spaces, trailing spaces, blank lines around it, the
// common left indent), filters out what the chat cannot show (non-printable-ASCII, wider
// than MAX_COLS, taller than MAX_ROWS — reported, skipped) and keeps ids that vanished
// from the source as `hidden`: old messages still refer to them.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../WsCore.Client/src/lobby/asciiArt.json');
const SOURCES = process.argv.length > 2 ? process.argv.slice(2) : [resolve(here, 'art.txt')];

export const MAX_COLS = 48;
export const MAX_ROWS = 24;
const ID = /^[a-z0-9-]{1,40}$/;
const PRINTABLE = /^[\x20-\x7e]*$/;
const TAB = 4;

function expandTabs(line) {
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(TAB - (out.length % TAB));
    else out += ch;
  }
  return out;
}

export function normalize(raw) {
  let lines = raw.map(l => expandTabs(l.replace(/\r$/, '')).trimEnd());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const indent = Math.min(...lines.filter(Boolean).map(l => l.length - l.trimStart().length));
  if (Number.isFinite(indent) && indent > 0) lines = lines.map(l => l.slice(indent));
  return lines;
}

function parse(text, file) {
  const entries = [];
  let current = null;
  text.split('\n').forEach((line, i) => {
    if (line.startsWith('=== ')) {
      const [id, title, tags, category] = line.slice(4).split('|').map(s => s.trim());
      current = { id, title, tags: (tags ?? '').split(',').map(t => t.trim()).filter(Boolean), category, raw: [], where: `${file}:${i + 1}` };
      entries.push(current);
    } else if (current) {
      current.raw.push(line);
    }
    // Before the first header: the file's comments.
  });
  return entries;
}

const problems = [];
const seen = new Set();
const items = [];
for (const file of SOURCES) {
  for (const e of parse(readFileSync(file, 'utf8'), file)) {
    const fail = why => problems.push(`${e.where} ${e.id}: ${why}`);
    if (!ID.test(e.id ?? '')) { fail('bad id'); continue; }
    if (seen.has(e.id)) { fail('duplicate id'); continue; }
    if (!e.title || !e.category) { fail('needs a title and a category'); continue; }
    const lines = normalize(e.raw);
    if (!lines.length) { fail('empty'); continue; }
    if (!lines.every(l => PRINTABLE.test(l))) { fail('not printable ASCII'); continue; }
    const cols = Math.max(...lines.map(l => l.length));
    if (cols > MAX_COLS) { fail(`${cols} columns > ${MAX_COLS}`); continue; }
    if (lines.length > MAX_ROWS) { fail(`${lines.length} rows > ${MAX_ROWS}`); continue; }
    seen.add(e.id);
    items.push({ id: e.id, title: e.title, tags: e.tags, category: e.category, cols, rows: lines.length, lines });
  }
}

// Ids are forever: anything the catalog had that the source no longer has stays, hidden.
if (existsSync(OUT)) {
  for (const old of JSON.parse(readFileSync(OUT, 'utf8'))) {
    if (!seen.has(old.id)) items.push({ ...old, hidden: true });
  }
}

// One entry per line: small, reviewable diffs.
writeFileSync(OUT, '[\n' + items.map(i => '  ' + JSON.stringify(i)).join(',\n') + '\n]\n');
for (const p of problems) console.warn('skipped', p);
console.log(`${items.length} arts (${items.filter(i => i.hidden).length} hidden) -> ${OUT}`);
