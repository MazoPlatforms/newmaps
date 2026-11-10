import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchGithubDataAsset, githubDataAssetUrl } from '../src/github-data-assets.mjs';

const revision = 'a'.repeat(40);
const entry = { sha256: 'b'.repeat(64), bytes: 10, content_type: 'application/json' };

test('GitHub snapshot URLs pin the immutable commit and reject unsafe paths', () => {
  assert.equal(githubDataAssetUrl('generated/search-index.json', revision).href,
    `https://raw.githubusercontent.com/MazoPlatforms/newmaps/${revision}/generated/search-index.json`);
  assert.throws(() => githubDataAssetUrl('../secret', revision));
  assert.throws(() => githubDataAssetUrl('data/places.json', 'main'));
});

test('GitHub-backed live data preserves verified 206 ranges and immutable validators', async () => {
  const cache = { match: async () => null, put: async () => {} };
  const response = await fetchGithubDataAsset({ request: new Request('https://maps.test/api/data/generated/file.json', {
    headers: { Range: 'bytes=2-5' },
  }), path: 'generated/file.json', revision, entry, origin: 'https://origin.test/snapshot', cache,
  fetcher: async (url, options) => {
    assert.equal(new URL(url).pathname, `/snapshot/${revision}/generated/file.json`);
    assert.equal(options.headers.get('Range'), 'bytes=2-5');
    return new Response('2345', { status: 206, headers: { 'Content-Range': 'bytes 2-5/10', 'Content-Length': '4' } });
  } });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), '2345');
  assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/10');
  assert.equal(response.headers.get('Content-Length'), '4');
  assert.equal(response.headers.get('ETag'), `"${entry.sha256}"`);
  assert.match(response.headers.get('Cache-Control'), /immutable/);
});

test('malformed GitHub partial responses fail closed', async () => {
  const response = await fetchGithubDataAsset({ request: new Request('https://maps.test/', { headers: { Range: 'bytes=2-5' } }),
    path: 'generated/file.json', revision, entry, origin: 'https://origin.test', cache: null,
    fetcher: async () => new Response('2345', { status: 206, headers: { 'Content-Range': 'bytes 3-6/10' } }) });
  assert.equal(response.status, 502);
});
