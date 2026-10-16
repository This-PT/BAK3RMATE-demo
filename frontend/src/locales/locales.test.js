// Fails when a translation is missing or inconsistent, so half-translated screens can't be shipped.
// Run: npm test   (no packages needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import en from './en.js';
import th from './th.js';
import { thaiErrors } from './errors.th.js';
import { PRESETS } from '../../../backend/src/presets.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..');
const BACKEND = path.join(here, '..', '..', '..', 'backend', 'src');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

const base = (k) => k.replace(/_one$/, '');
const enKeys = Object.keys(en);
const thKeys = Object.keys(th);
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

// brand names that stay in Latin letters in Thai; an empty note is allowed for "Other shop"
const SAME_IN_THAI = new Set(['preset.shopee.name', 'preset.tiktok.name', 'preset.lazada.name', 'preset.lazada-premium.name']);
const MAY_BE_EMPTY = new Set(['preset.custom.note']);

test('Thai has every key English has (and nothing extra)', () => {
  const needed = enKeys.filter((k) => !k.endsWith('_one'));
  assert.deepEqual(needed.filter((k) => !(k in th)), [], 'missing in th.js');
  assert.deepEqual(thKeys.filter((k) => !(k in en)), [], 'in th.js but not en.js');
  assert.deepEqual(thKeys.filter((k) => k.endsWith('_one')), [], 'Thai has no singular forms');
});

test('every _one form belongs to a real key', () => {
  for (const k of enKeys.filter((x) => x.endsWith('_one'))) assert.ok(base(k) in en, `${k} has no base key`);
});

test('placeholders match between English and Thai', () => {
  for (const k of Object.keys(th)) {
    assert.equal(placeholders(th[k]), placeholders(en[k]), `placeholders differ for ${k}`);
    if (`${k}_one` in en) assert.equal(placeholders(en[`${k}_one`]), placeholders(en[k]), `${k}_one differs from ${k}`);
  }
});

test('no empty text, and Thai text is really Thai', () => {
  for (const k of enKeys) if (!MAY_BE_EMPTY.has(base(k))) assert.notEqual(en[k].trim(), '', `empty English: ${k}`);
  for (const k of thKeys) {
    if (MAY_BE_EMPTY.has(k)) continue;
    assert.notEqual(th[k].trim(), '', `empty Thai: ${k}`);
    if (!SAME_IN_THAI.has(k)) assert.match(th[k], /[฀-๿]/, `Thai text has no Thai letters: ${k} = ${th[k]}`);
  }
});

test('every key the code uses exists', () => {
  const prefixes = new Set(enKeys.map((k) => k.split('.')[0]));
  const used = new Map();
  for (const file of walk(SRC).filter((f) => /\.(js|jsx)$/.test(f) && !f.includes(`${path.sep}locales${path.sep}`))) {
    const text = fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, ''); // ignore comments
    for (const m of text.matchAll(/'([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+)+)'/g)) {
      if (prefixes.has(m[1].split('.')[0])) used.set(m[1], path.relative(SRC, file));
    }
  }
  assert.ok(used.size > 150, `only found ${used.size} keys, the scan is broken`);
  for (const [k, file] of used) assert.ok(k in en, `${file} uses missing key "${k}"`);
});

test('keys built at run time are all there', () => {
  const sets = {
    status: ['healthy', 'thin', 'losing'],
    range: ['today', '7', '30', 'all'],
    source: ['chat', 'receipt', 'manual', 'undo'],
  };
  for (const [prefix, names] of Object.entries(sets)) for (const n of names) assert.ok(`${prefix}.${n}` in en, `${prefix}.${n}`);
  // each platform the server offers has its own Thai text
  for (const p of PRESETS) for (const field of ['name', 'summary', 'note']) assert.ok(`preset.${p.key}.${field}` in th, `preset.${p.key}.${field}`);
});

test('every fixed error message the server can send has a Thai version', () => {
  const messages = new Set();
  for (const file of walk(BACKEND).filter((f) => f.endsWith('.js'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/error:\s*'((?:[^'\\]|\\.)*)'/g)) messages.add(m[1].replace(/\\'/g, "'"));
    for (const m of text.matchAll(/error:\s*"((?:[^"\\]|\\.)*)"/g)) messages.add(m[1]);
  }
  // messages for developers and operators, not shown to people using the app
  const internal = new Set(['Unknown tool', 'Tool loop did not finish']);
  const covered = (msg) => thaiErrors.some(([pattern]) => (typeof pattern === 'string' ? pattern === msg : pattern.test(msg)));
  const missing = [...messages].filter((m) => !internal.has(m) && !covered(m));
  assert.deepEqual(missing, [], 'add these to locales/errors.th.js');
});
