import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyAiCap } from '../src/auth/limits.js';

const run = (id) => {
  let out = 'next';
  const res = { status: (c) => ({ json: () => { out = c; } }) };
  dailyAiCap({ user: { id } }, res, () => {});
  return out;
};

test('one person is stopped after their daily share, others still work', () => {
  process.env.AI_DAILY_CAP_PER_USER = '3';
  process.env.AI_DAILY_CAP = '100';
  assert.deepEqual([1, 2, 3, 4].map(() => run(900)), ['next', 'next', 'next', 429]);
  assert.equal(run(901), 'next');
});

test('the whole site is stopped at the site cap', () => {
  process.env.AI_DAILY_CAP = '6'; // 4 already used above
  assert.deepEqual([run(910), run(911), run(912)], ['next', 'next', 429]);
});
