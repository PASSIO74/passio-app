// Frontière HTTP pure partagée Node/Deno. Aucun secret, URL amont ou état d'identité global.
export const MEDIA_MAX_BYTES = 26 * 1024 * 1024;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ROUTE = new RegExp('^/(?:functions/v1/)?private-media/(posts|stories)/([A-Za-z0-9_-]{1,120})/(' + UUID + ')/(original|v720|poster)$');
const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mp4': 'm4a', 'audio/webm': 'webm',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
});
const SECURITY = Object.freeze({
  'Cache-Control': 'private, no-store', 'Netlify-CDN-Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "sandbox; default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
});
function empty(status, extra = {}) { return new Response(null, { status, headers: { ...SECURITY, ...extra } }); }
function locatorFor(request) {
  const url = new URL(request.url);
  if (url.search) return null;
  const match = ROUTE.exec(url.pathname);
  return match ? { sourceType: match[1], displayId: match[2], assetId: match[3], variant: match[4] } : null;
}
function actorFor(request, anonKey) {
  if (!request.headers.has('Authorization')) return { mode: 'anon', bearer: null };
  const header = request.headers.get('Authorization');
  if (anonKey && header === 'Bearer ' + anonKey) return { mode: 'anon', bearer: null };
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header || '');
  return match && header.length <= 8192 ? { mode: 'user', bearer: match[1] } : null;
}
function checkedMetadata(value, locator) {
  if (!value || value.bucket_id !== 'content-protected' || !Number.isSafeInteger(value.byte_size) || value.byte_size < 1 || value.byte_size > MEDIA_MAX_BYTES) return null;
  const extension = MIME_EXTENSIONS[value.mime_type];
  if (!extension || typeof value.object_key !== 'string') return null;
  const expected = new RegExp('^' + UUID + '/' + locator.assetId + '/' + locator.variant + '\\.' + extension + '$');
  if (!expected.test(value.object_key)) return null;
  if (locator.variant !== 'original' && !value.mime_type.startsWith('image/')) return null;
  return { bucket: value.bucket_id, objectKey: value.object_key, mime: value.mime_type, size: value.byte_size };
}
function rangeFor(header, size) {
  if (header === null) return null;
  const match = /^bytes=(\d{0,15})-(\d{0,15})$/.exec(header);
  if (!match || (!match[1] && !match[2])) return false;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (suffix < 1) return false;
    start = Math.max(0, size - suffix); end = size - 1;
  } else { start = Number(match[1]); end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return false;
  return { start, end, length: end - start + 1, header: `bytes=${start}-${end}`, contentRange: `bytes ${start}-${end}/${size}` };
}
function upstreamHeadersValid(response, object, range, method) {
  if (!response || !(response instanceof Response)) return false;
  const expectedStatus = range ? 206 : 200;
  // HEAD peut être calculé depuis les métadonnées après vérification d'existence amont.
  if (response.status !== expectedStatus && !(method === 'HEAD' && range && response.status === 200)) return false;
  if ((response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== object.mime) return false;
  const length = response.headers.get('Content-Length');
  const expectedLength = method === 'HEAD' && response.status === 200 ? object.size : range ? range.length : object.size;
  if (length !== null && (!/^\d{1,9}$/.test(length) || Number(length) !== expectedLength)) return false;
  if (range && response.status === 206 && response.headers.get('Content-Range') !== range.contentRange) return false;
  return true;
}

/**
 * Dépendances par requête : createActor({mode,bearer,signal}) fournit verify/sessionActive/resolve.
 * openObject reçoit uniquement une référence validée après ces contrôles, jamais un URL client.
 * Aucun callback de télémétrie n'accepte ici URL, claims ou erreur brute.
 */
export function createPrivateMediaHandler(dependencies) {
  return async function privateMedia(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return empty(405, { Allow: 'GET, HEAD' });
    const url = new URL(request.url);
    const capabilities = !url.search && /^\/(?:functions\/v1\/)?private-media\/capabilities$/.test(url.pathname);
    const locator = locatorFor(request);
    if (!locator && !capabilities) return empty(404);
    const identity = actorFor(request, dependencies.anonKey);
    if (!identity) return empty(401);
    if (request.signal.aborted) return empty(408);
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    request.signal.addEventListener('abort', onAbort, { once: true });
    const cleanup = () => request.signal.removeEventListener('abort', onAbort);
    let upstream;
    try {
      const actor = dependencies.createActor({ ...identity, signal: abort.signal });
      if (identity.mode === 'user' && (!await actor.verify() || !await actor.sessionActive())) { cleanup(); return empty(401); }
      if (capabilities) {
        const active = await actor.enabled() === true;
        cleanup();
        return new Response(request.method === 'HEAD' ? null : JSON.stringify({ protocol: 1, uploads_enabled: active,
          reads_enabled: active, min_client: 1, max_bytes: MEDIA_MAX_BYTES }), {
          status: 200, headers: { ...SECURITY, 'Content-Type': 'application/json' },
        });
      }
      const object = checkedMetadata(await actor.resolve(locator), locator);
      if (!object) { cleanup(); return empty(404); }
      const range = rangeFor(request.headers.get('Range'), object.size);
      if (range === false) { cleanup(); return empty(416, { 'Content-Range': `bytes */${object.size}` }); }
      if (abort.signal.aborted) { cleanup(); return empty(408); }
      upstream = await dependencies.openObject({ ...object, method: request.method, range, signal: abort.signal });
      if (upstream.status === 404) { await upstream.body?.cancel(); cleanup(); return empty(404); }
      if (!upstreamHeadersValid(upstream, object, range, request.method)) {
        abort.abort(); await upstream.body?.cancel(); cleanup(); return empty(502);
      }
      const length = range ? range.length : object.size;
      const headers = {
        ...SECURITY, 'Content-Type': object.mime, 'Content-Length': String(length), 'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': range.contentRange } : {}),
      };
      if (request.method === 'HEAD') { await upstream.body?.cancel(); cleanup(); return new Response(null, { status: range ? 206 : 200, headers }); }
      if (!upstream.body) { abort.abort(); cleanup(); return empty(502); }
      const reader = upstream.body.getReader(); let received = 0;
      const body = new ReadableStream({
        async pull(controller) {
          try {
            const item = await reader.read();
            if (abort.signal.aborted) throw new Error('media_aborted');
            if (item.done) {
              if (received !== length) throw new Error('media_length');
              cleanup(); controller.close(); return;
            }
            if (!(item.value instanceof Uint8Array) || received + item.value.byteLength > length || received + item.value.byteLength > MEDIA_MAX_BYTES) throw new Error('media_length');
            received += item.value.byteLength; controller.enqueue(item.value);
          } catch {
            abort.abort(); cleanup(); await reader.cancel().catch(() => {}); controller.error(new Error('media_stream_unavailable'));
          }
        },
        async cancel() { abort.abort(); cleanup(); await reader.cancel().catch(() => {}); },
      });
      return new Response(body, { status: range ? 206 : 200, headers });
    } catch {
      abort.abort(); cleanup(); await upstream?.body?.cancel().catch(() => {});
      return empty(request.signal.aborted ? 408 : 503);
    }
  };
}
