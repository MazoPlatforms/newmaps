function validLiveManifest(manifest, revision) {
  if (manifest?.format !== 'MazoLiveData/1' || manifest.revision !== revision
    || !manifest.files || typeof manifest.files !== 'object') return false;
  return Object.entries(manifest.files).every(([path, file]) => path && file
    && /^[a-f0-9]{64}$/.test(file.sha256 || '') && Number.isSafeInteger(file.bytes) && file.bytes >= 0);
}

export async function discoverLiveData(fetcher = fetch) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const versionResponse = await fetcher('./api/version', { cache: 'no-store' });
      if (!versionResponse.ok) break;
      const version = await versionResponse.json();
      if (version?.format !== 'MazoLiveData/1' || typeof version.revision !== 'string') break;
      const manifestResponse = await fetcher('./api/manifest', { cache: 'no-store' });
      if (!manifestResponse.ok) break;
      const manifest = await manifestResponse.json();
      if (validLiveManifest(manifest, version.revision)) {
        const live = { version, manifest };
        try { globalThis.localStorage?.setItem('mazo-live-data-snapshot-v1', JSON.stringify(live)); } catch {}
        return live;
      }
    } catch {
      break;
    }
  }
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem('mazo-live-data-snapshot-v1') || 'null');
    return validLiveManifest(saved?.manifest, saved?.version?.revision) ? saved : null;
  } catch {
    return null;
  }
}

export function liveDataResourceUrl(relative, liveData, staticHash = '') {
  const cleaned = String(relative).replace(/^\.\//, '').split('?')[0];
  if (!liveData) return `./${cleaned}${staticHash ? `?v=${encodeURIComponent(staticHash)}` : ''}`;
  const entry = liveData.manifest.files[cleaned];
  if (!entry) throw new Error(`The live data manifest does not contain ${cleaned}`);
  const url = new URL(`/api/data/${cleaned}`, globalThis.location?.href || 'https://mazo.invalid/');
  url.searchParams.set('v', entry.sha256);
  url.searchParams.set('bytes', String(entry.bytes));
  url.searchParams.set('rev', liveData.version.revision);
  return url.href;
}

export function startLiveDataPolling({ initialRevision, fetcher = fetch, intervalMs = 15_000, onUpdate,
  schedule = setInterval, cancel = clearInterval } = {}) {
  let stopped = false;
  let pending = false;
  const timer = schedule(async () => {
    if (stopped || pending || globalThis.document?.hidden) return;
    pending = true;
    try {
      const response = await fetcher('./api/version', { cache: 'no-store', headers: { 'If-None-Match': `"${initialRevision}"` } });
      if (!response.ok) return;
      const version = await response.json();
      if (version?.format === 'MazoLiveData/1' && version.revision && version.revision !== initialRevision) {
        stopped = true;
        cancel(timer);
        await onUpdate?.(version);
      }
    } catch {
      // Temporary loss of connectivity is retried on the next poll.
    } finally {
      pending = false;
    }
  }, intervalMs);
  return () => {
    stopped = true;
    cancel(timer);
  };
}
