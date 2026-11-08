#!/usr/bin/env node
/**
 * Fail-closed audit of the *deployed* Mazo native basemap resource graph.
 * Run: node scripts/verify-ridenow-basemap.mjs https://maps.mazo.workers.dev
 * No writes, no external-provider requests: only the host provided as argument is fetched.
 * Exit nonzero unless both styles, tiles, glyphs and sprites are locally served.
 */
const origin = new URL(process.argv[2] || 'https://maps.mazo.workers.dev').origin;
if (new URL(origin).protocol !== 'https:') throw Error('HTTPS required');
const allowed = new URL(origin).hostname;
const errors = [];
const observations = [];
async function fetchLocal(pathOrUrl, kind, expected = [200]) {
  const url = new URL(pathOrUrl, origin);
  if (url.protocol !== 'https:' || url.hostname !== allowed || url.port) {
    errors.push(`${kind}: EXTERNAL ${url.href}`);
    return null;
  }
  let response;
  try { response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) }); }
  catch (e) { errors.push(`${kind}: request failed: ${e.message}`); return null; }
  observations.push({ kind, path: url.pathname, status: response.status });
  if (!expected.includes(response.status)) {
    errors.push(`${kind}: unexpected HTTP ${response.status} for ${url.href}`);
    return null;
  }
  const redirect = response.headers.get('location');
  if (redirect) {
    errors.push(`${kind}: redirect is forbidden (${redirect})`);
    return null;
  }
  return response;
}
async function json(path, kind) {
  const response = await fetchLocal(path, kind);
  if (!response) return null;
  try { return await response.json(); }
  catch (e) { errors.push(`${kind}: invalid JSON ${e.message}`); return null; }
}
function sameHost(value, kind, parent) {
  if (typeof value !== 'string') return null;
  const sample = value.replaceAll('{z}', '13').replaceAll('{x}', '5955')
    .replaceAll('{y}', '3912').replaceAll('{fontstack}', 'Mazo%20Maps%20Sans%20Regular')
    .replaceAll('{range}', '0-255').replaceAll('{ratio}', '');
  let url;
  try { url = new URL(sample, parent); }
  catch { errors.push(`${kind}: invalid URL ${value}`); return null; }
  if (url.protocol !== 'https:' || url.hostname !== allowed || url.port) {
    errors.push(`${kind}: EXTERNAL ${value}`);
    return null;
  }
  return url;
}
const manifest = await json('/api/v1/basemap/manifest', 'basemap manifest');
if (manifest) {
  if (!manifest.revision || !manifest.attribution || !manifest.license)
    errors.push('Manifest must include revision, attribution and license');
}
for (const theme of ['light', 'dark']) {
  const style = await json(`/api/v1/basemap/style/${theme}.json`, `${theme} style`);
  if (!style) continue;
  if (style.version !== 8 || !Array.isArray(style.layers) || !style.sources)
    errors.push(`${theme}: invalid MapLibre style`);
  const ids = new Set(Object.values(style.layers || {}).map(l => l['source-layer']).filter(Boolean));
  for (const name of ['streets', 'buildings', 'ocean']) {
    if (![...ids].some(s => s === name || s.startsWith(name)))
      errors.push(`${theme}: missing required basemap layer family ${name}`);
  }
  for (const [name, source] of Object.entries(style.sources || {})) {
    if (source.url) {
      const src = sameHost(source.url, `${theme} source ${name}`, origin);
      if (src) {
        const tilejson = await json(src.href, `${theme} source ${name} TileJSON`);
        if (tilejson) {
          if (!Array.isArray(tilejson.tiles) || !tilejson.tiles.length)
            errors.push(`${theme} source ${name}: missing tile URLs`);
          for (const tile of tilejson.tiles || []) {
            const sample = sameHost(tile, `${theme} tile ${name}`, origin);
            if (sample) await fetchLocal(sample.href, `${theme} tile ${name}`, name === 'basemap' ? [200] : [200,204]);
          }
        }
      }
    }
    for (const tile of source.tiles || []) {
      const sample = sameHost(tile, `${theme} inline tile ${name}`, origin);
      if (sample) await fetchLocal(sample.href, `${theme} inline tile ${name}`, name === 'basemap' ? [200] : [200,204]);
    }
  }
  if (style.glyphs) {
    const glyph = sameHost(style.glyphs, `${theme} glyphs`, origin);
    if (glyph) await fetchLocal(glyph.href, `${theme} glyphs`);
  } else errors.push(`${theme}: missing glyph template`);
  if (style.sprite) {
    const sprite = sameHost(style.sprite, `${theme} sprite`, origin);
    if (sprite) {
      await fetchLocal(sprite.href + '.json', `${theme} sprite JSON`);
      await fetchLocal(sprite.href + '.png', `${theme} sprite PNG`);
      await fetchLocal(sprite.href + '@2x.json', `${theme} @2x sprite JSON`);
      await fetchLocal(sprite.href + '@2x.png', `${theme} @2x sprite PNG`);
    }
  } else errors.push(`${theme}: missing sprite base URL`);
}
console.log(JSON.stringify({ origin, checks: observations, errors, passed: errors.length === 0 }, null, 2));
if (errors.length) process.exitCode = 1;
