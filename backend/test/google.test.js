// The checks on what Google says about a person. No network needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkClaims } from '../src/auth/google.js';

const ID = 'my-client.apps.googleusercontent.com';
const now = Date.now();
const good = { aud: ID, iss: 'https://accounts.google.com', exp: Math.floor(now / 1000) + 600, sub: '1234', email: 'Mali@Gmail.com', email_verified: true, name: 'Mali' };

test('a valid Google identity is accepted, email lower-cased', () => {
  assert.deepEqual(checkClaims(good, ID, now), { sub: '1234', email: 'mali@gmail.com', name: 'Mali' });
  assert.equal(checkClaims({ ...good, iss: 'accounts.google.com' }, ID, now).sub, '1234');
});

for (const [why, bad] of [
  ['another app', { ...good, aud: 'someone-else' }],
  ['a different issuer', { ...good, iss: 'https://evil.example' }],
  ['an expired sign-in', { ...good, exp: Math.floor(now / 1000) - 5 }],
  ['an unverified email', { ...good, email_verified: false }],
  ['no email', { ...good, email: undefined }],
  ['no subject', { ...good, sub: undefined }],
  ['nothing', null],
]) {
  test(`refuses ${why}`, () => assert.throws(() => checkClaims(bad, ID, now)));
}
