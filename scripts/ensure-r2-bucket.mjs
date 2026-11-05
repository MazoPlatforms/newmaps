const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const bucketName = 'mazo-maps-live-data';

if (!accountId || !token) throw new Error('Cloudflare account credentials are required to provision the live-data bucket.');

async function api(path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || body?.success === false) {
    // Do not echo response bodies or request headers; they can contain account metadata.
    throw new Error(`Cloudflare R2 provisioning failed (HTTP ${response.status}). Check token scope for R2 Storage Write.`);
  }
  return body?.result;
}

const endpoint = `/accounts/${encodeURIComponent(accountId)}/r2/buckets`;
const result = await api(endpoint);
const buckets = Array.isArray(result) ? result : result?.buckets;
if (!Array.isArray(buckets)) {
  throw new Error('Cloudflare R2 provisioning returned an unexpected bucket list response.');
}
if (buckets.some((bucket) => bucket.name === bucketName)) {
  console.log('Live-data R2 bucket is ready.');
} else {
  await api(endpoint, { method: 'POST', body: JSON.stringify({ name: bucketName }) });
  console.log('Created live-data R2 bucket.');
}
