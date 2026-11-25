import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TOKEN_BUREAU_URL, resolveTokenBureauUrl } from './url.js';

test('empty input resolves to the default URL', () => {
  assert.deepEqual(resolveTokenBureauUrl(''), { url: DEFAULT_TOKEN_BUREAU_URL, warning: null });
  assert.deepEqual(resolveTokenBureauUrl(undefined), { url: DEFAULT_TOKEN_BUREAU_URL, warning: null });
});

for (const retired of [
  'https://token-bureau.fabrique.social.gouv.fr',
  'http://token-bureau.fabrique.social.gouv.fr',
  'https://token-bureau.fabrique.social.gouv.fr/'
]) {
  test(`retired URL ${retired} resolves to the default URL with a warning`, () => {
    const { url, warning } = resolveTokenBureauUrl(retired);
    assert.equal(url, DEFAULT_TOKEN_BUREAU_URL);
    assert.match(warning, /retired/);
    assert.ok(warning.includes(retired));
  });
}

test('any other URL is kept as is', () => {
  assert.deepEqual(resolveTokenBureauUrl('https://token-bureau.example.org'), {
    url: 'https://token-bureau.example.org',
    warning: null
  });
});

test('an invalid URL is rejected', () => {
  assert.throws(() => resolveTokenBureauUrl('not a url'), /Invalid token-bureau-url: not a url/);
});
