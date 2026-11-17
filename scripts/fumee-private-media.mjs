// Uniquement capabilities sur les deux projets autorisés, sans données utilisateur.
import { pathToFileURL } from 'node:url';

const TARGETS = new Set([
  'https://njkiyoklssvefstljemx.supabase.co',
  'https://fcksxofaelcdmmifnwjo.supabase.co',
]);
const PROBES = [
  { method: 'GET', status: 200 },
  { method: 'HEAD', status: 200 },
  { method: 'POST', status: 405 },
  { method: 'OPTIONS', status: 405 },
  { method: 'GET', status: 401, invalidBearer: true },
];
const EXPECTED = {
  protocol: 1, min_client: 1, max_bytes: 27262976, uploads_enabled: false, reads_enabled: false,
};
const CACHE_HEADERS = ['Cache-Control', 'CDN-Cache-Control', 'Netlify-CDN-Cache-Control'];

function refuse() {
  throw new Error('private_media_smoke_refused');
}

async function readBody(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const buffer = new Uint8Array(8192);
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (bytes + value.length > buffer.length) refuse();
      buffer.set(value, bytes);
      bytes += value.length;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes));
  } finally {
    reader.releaseLock();
  }
}

export async function verifierMediaPrive({ baseUrl, revision, fetchFn = globalThis.fetch }) {
  if (!TARGETS.has(baseUrl) || typeof revision !== 'string' || !/^[0-9a-f]{40}$/.test(revision)) refuse();
  const url = baseUrl + '/functions/v1/private-media/capabilities';
  for (const probe of PROBES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchFn(url, {
        method: probe.method, redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: probe.invalidBearer ? { Authorization: 'Bearer invalid' } : {},
      });
      if (response.redirected || response.status !== probe.status || response.headers.get('X-Passio-Revision') !== revision) refuse();
      for (const header of CACHE_HEADERS) {
        if (!/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get(header) || '')) refuse();
      }
      const text = await readBody(response);
      controller.signal.throwIfAborted();
      if (probe.method === 'GET' && probe.status === 200) {
        const capabilities = JSON.parse(text);
        if (!capabilities || Object.keys(capabilities).length !== Object.keys(EXPECTED).length) refuse();
        if (!Object.entries(EXPECTED).every(([key, value]) => capabilities[key] === value)) refuse();
      } else if (text !== '') {
        refuse();
      }
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  return { status: 'PRIVATE_MEDIA_PREPARATION_VERIFIED', requests: PROBES.length, revision, uploads_enabled: false, reads_enabled: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) refuse();
    const result = await verifierMediaPrive({
      baseUrl: process.env.PASSIO_MEDIA_SMOKE_URL, revision: process.env.PASSIO_MEDIA_SMOKE_REVISION,
    });
    console.log(JSON.stringify(result));
  } catch {
    console.error('private_media_smoke_refused');
    process.exitCode = 1;
  }
}
