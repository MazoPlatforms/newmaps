const encoder = new TextEncoder();
const SHA256_HEX = /^[a-f0-9]{64}$/;

export async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', value));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function signatureMessage({ timestamp, nonce, method, pathname, bodySha256, filePath = '', contentType = '' }) {
  return `mazo-live-data-v1\n${timestamp}\n${nonce}\n${method.toUpperCase()}\n${pathname}\n${bodySha256}\n${filePath}\n${contentType}`;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function equalHexConstantTime(left, right) {
  const validLeft = SHA256_HEX.test(left || '') ? left : '0'.repeat(64);
  const validRight = SHA256_HEX.test(right || '') ? right : '0'.repeat(64);
  let difference = 0;
  for (let index = 0; index < 64; index += 1) difference |= validLeft.charCodeAt(index) ^ validRight.charCodeAt(index);
  return difference === 0 && SHA256_HEX.test(left || '') && SHA256_HEX.test(right || '');
}

export async function createSignedHeaders({ secret, method, pathname, body, filePath = '', contentType = '', now = Date.now(), nonce = crypto.randomUUID() }) {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  const timestamp = String(Math.floor(now / 1000));
  const bodySha256 = await sha256Hex(bytes);
  const message = signatureMessage({ timestamp, nonce, method, pathname, bodySha256, filePath, contentType });
  return {
    'X-Mazo-Timestamp': timestamp,
    'X-Mazo-Nonce': nonce,
    'X-Mazo-Content-SHA256': bodySha256,
    'X-Mazo-Signature': await hmacHex(secret, message),
    ...(filePath ? { 'X-Mazo-File-Path': filePath } : {}),
    ...(contentType ? { 'X-Mazo-Content-Type': contentType } : {}),
  };
}

export async function verifySignedRequest(request, secret, { now = Date.now(), maxAgeSeconds = 300, maxBodyBytes = 32 * 1024 * 1024 } = {}) {
  if (typeof secret !== 'string' || secret.length < 32) return null;
  const timestamp = request.headers.get('x-mazo-timestamp') || '';
  const nonce = request.headers.get('x-mazo-nonce') || '';
  const suppliedHash = request.headers.get('x-mazo-content-sha256') || '';
  const suppliedSignature = request.headers.get('x-mazo-signature') || '';
  const filePath = request.headers.get('x-mazo-file-path') || '';
  const contentType = request.headers.get('x-mazo-content-type') || '';
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9-]{16,64}$/i.test(nonce)) return null;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > maxAgeSeconds) return null;
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) return null;

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBodyBytes) return null;
  const bodySha256 = await sha256Hex(bytes);
  if (!equalHexConstantTime(suppliedHash, bodySha256)) return null;
  const message = signatureMessage({ timestamp, nonce, method: request.method, pathname: new URL(request.url).pathname, bodySha256, filePath, contentType });
  const expected = await hmacHex(secret, message);
  if (!equalHexConstantTime(suppliedSignature, expected)) return null;
  return { bytes, bodySha256, filePath, contentType, nonce, timestamp: Number(timestamp) };
}
