import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMediaHandler, MEDIA_MAX_BYTES } from '../../supabase/functions/_shared/medias-proteges.js';

const ASSET = '00000000-0000-4000-8000-000000000001';
const OWNER = '00000000-0000-4000-8000-000000000002';
const PATH = `/functions/v1/private-media/posts/post_synthetique/${ASSET}/original`;
const JWT = 'e30.eyJzdWIiOiJzeW50aGV0aWMifQ.signature';
const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
function fixture(options = {}) {
  const calls = [];
  const metadata = { bucket_id: 'content-protected', object_key: `${OWNER}/${ASSET}/original.webp`, mime_type: 'image/webp', byte_size: payload.length };
  let upstreamAbort;
  const handler = createPrivateMediaHandler({
    anonKey: 'synthetic-public-anon-key',
    createActor(actor) {
      calls.push(['actor', actor.mode]);
      return {
        async enabled() { calls.push(['enabled']); return options.enabled === undefined ? true : options.enabled; },
        async verify() { calls.push(['verify']); if (options.verifyError) throw new Error('synthetic-provider-failure'); return options.valid !== false; },
        async sessionActive() { calls.push(['session']); return options.session !== false; },
        async resolve(locator) { calls.push(['resolve', actor.mode, locator.sourceType]); return options.missing ? null : { ...metadata, ...options.metadata }; },
      };
    },
    async openObject(input) {
      calls.push(['open', input.method, input.range]); upstreamAbort = input.signal;
      if (options.open) return options.open(input);
      const range = input.range;
      const bytes = range ? payload.subarray(range.start, range.end + 1) : payload;
      return new Response(input.method === 'HEAD' ? null : bytes, {
        status: range ? 206 : 200,
        headers: { 'Content-Type': 'image/webp', 'Content-Length': String(bytes.length),
          ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${payload.length}` } : {}) },
      });
    },
  });
  return { handler, calls, metadata, get upstreamAbort() { return upstreamAbort; } };
}
function request(path = PATH, options = {}) {
  return new Request('https://edge.invalid' + path, { headers: { Authorization: 'Bearer ' + JWT }, ...options });
}
function security(response) {
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Netlify-CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Content-Security-Policy'), "sandbox; default-src 'none'");
  assert.equal(response.headers.has('Location'), false);
  assert.equal(response.headers.has('Set-Cookie'), false);
}

test('JWT validé puis session puis résolution appelante puis octets privilégiés', async () => {
  const f = fixture(); const response = await f.handler(request());
  assert.equal(response.status, 200); security(response);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...payload]);
  assert.deepEqual(f.calls.map((call) => call[0]), ['actor', 'verify', 'session', 'resolve', 'open']);
});

test('capabilities : protocole fixe, booleen strict, no-store et aucune lecture Storage', async () => {
  for (const enabled of [true, false, 'true', null, {}]) {
    const f = fixture({ enabled });
    const response = await f.handler(request('/private-media/capabilities', { headers: {} }));
    assert.equal(response.status, 200); security(response);
    assert.deepEqual(await response.json(), { protocol: 1, uploads_enabled: enabled === true,
      reads_enabled: enabled === true, min_client: 1, max_bytes: MEDIA_MAX_BYTES });
    assert.deepEqual(f.calls.map(call => call[0]), ['actor', 'enabled']);
  }
  const invalid = fixture({ valid: false });
  assert.equal((await invalid.handler(request('/private-media/capabilities'))).status, 401);
  assert.equal(invalid.calls.some(call => call[0] === 'enabled'), false);
  assert.equal((await fixture().handler(request('/private-media/capabilities?token=forbidden'))).status, 404);
});

test('vrai anon et clé anon exacte ont une voie RLS anon ; aucun helper session requis', async () => {
  for (const headers of [{}, { Authorization: 'Bearer synthetic-public-anon-key' }]) {
    const f = fixture(); const response = await f.handler(request(PATH, { headers }));
    assert.equal(response.status, 200); await response.arrayBuffer();
    assert.deepEqual(f.calls.map((call) => call[0]), ['actor', 'resolve', 'open']);
    assert.equal(f.calls[0][1], 'anon');
  }
});

test('JWT fourni invalide ou session révoquée : aucun repli anon, résolution ou lecture admin', async () => {
  for (const options of [{ valid: false }, { session: false }]) {
    const f = fixture(options); const response = await f.handler(request());
    assert.equal(response.status, 401); assert.equal((await response.arrayBuffer()).byteLength, 0); security(response);
    assert.ok(!f.calls.some((call) => call[0] === 'resolve' || call[0] === 'open'));
    assert.equal(f.calls[0][1], 'user');
  }
  for (const Authorization of ['', 'Basic synthetic', 'Bearer ', 'Bearer x.y', 'Bearer x.y.z, Bearer a.b.c']) {
    const f = fixture(); assert.equal((await f.handler(request(PATH, { headers: { Authorization } }))).status, 401);
    assert.equal(f.calls.length, 0);
  }
});

test('panne Auth et refus ACL fermés, sans appel Storage ni erreur fournisseur divulguée', async () => {
  for (const options of [{ verifyError: true }, { missing: true }]) {
    const f = fixture(options); const response = await f.handler(request());
    assert.equal(response.status, options.missing ? 404 : 503); security(response);
    assert.equal(await response.text(), ''); assert.ok(!f.calls.some((call) => call[0] === 'open'));
  }
});

test('routes, type, UUID, variante et query fermés avant tout effet', async () => {
  for (const path of [PATH + '?token=synthetic', PATH.replace('/posts/', '/unknown/'), PATH.replace(ASSET, 'bad-id'), PATH.replace('/original', '/anything'), PATH + '/extra', PATH.replace('post_synthetique', '%2f')]) {
    const f = fixture(); const response = await f.handler(request(path));
    assert.equal(response.status, 404); security(response); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); const response = await f.handler(request(PATH, { method: 'POST' }));
  assert.equal(response.status, 405); assert.equal(response.headers.get('Allow'), 'GET, HEAD'); assert.equal(f.calls.length, 0);
});

test('résolveur non fiable : aucun bucket, chemin, variante, MIME actif ou taille arbitraire vers Storage', async () => {
  for (const metadata of [
    { bucket_id: 'content' }, { object_key: 'https://other.invalid/file' }, { object_key: '../file' },
    { object_key: `${OWNER}/00000000-0000-4000-8000-000000000003/original.webp` },
    { object_key: `${OWNER}/${ASSET}/poster.webp` }, { object_key: `${OWNER}/${ASSET}/original.svg` },
    { mime_type: 'image/svg+xml' }, { byte_size: MEDIA_MAX_BYTES + 1 }, { byte_size: '8' }, { byte_size: 0 },
  ]) {
    const f = fixture({ metadata }); const response = await f.handler(request());
    assert.equal(response.status, 404); assert.ok(!f.calls.some((call) => call[0] === 'open'));
  }
});

test('HEAD et Range simple/suffixe : longueurs et statuts exacts', async () => {
  const head = fixture(); const h = await head.handler(request(PATH, { method: 'HEAD' }));
  assert.equal(h.status, 200); assert.equal((await h.arrayBuffer()).byteLength, 0); assert.equal(h.headers.get('Content-Length'), '8');
  for (const [Range, expected, contentRange] of [['bytes=2-4', [3, 4, 5], 'bytes 2-4/8'], ['bytes=-2', [7, 8], 'bytes 6-7/8'], ['bytes=6-', [7, 8], 'bytes 6-7/8']]) {
    const f = fixture(); const response = await f.handler(request(PATH, { headers: { Authorization: 'Bearer ' + JWT, Range } }));
    assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Range'), contentRange); security(response);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], expected);
  }
});

test('Range invalide/multiple/hors taille : 416 après ACL, avant octets', async () => {
  for (const Range of ['bytes=8-', 'bytes=4-1', 'bytes=0-1,4-6', 'bytes=-0', 'items=0-1', 'bytes=9007199254740992-']) {
    const f = fixture(); const response = await f.handler(request(PATH, { headers: { Authorization: 'Bearer ' + JWT, Range } }));
    assert.equal(response.status, 416); assert.equal(response.headers.get('Content-Range'), 'bytes */8');
    assert.ok(f.calls.some((call) => call[0] === 'resolve')); assert.ok(!f.calls.some((call) => call[0] === 'open'));
  }
});

test('amont : redirects, statut et MIME/longueur incohérents sont fermés sans corps ni headers recopiés', async () => {
  for (const upstream of [
    new Response(null, { status: 302, headers: { Location: 'https://other.invalid/' } }),
    new Response('active', { headers: { 'Content-Type': 'text/html', 'Content-Length': '6' } }),
    new Response(payload, { headers: { 'Content-Type': 'image/webp', 'Content-Length': '9', 'Set-Cookie': 'no=yes' } }),
  ]) {
    const f = fixture({ open: () => upstream }); const response = await f.handler(request());
    assert.equal(response.status, 502); assert.equal(await response.text(), ''); security(response);
  }
});

test('flux reçu compté sans buffer intégral, dépassement ou troncature interrompus', async () => {
  for (const length of [7, 9]) {
    let cancelled = false;
    const f = fixture({ open: () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(length)); c.close(); }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'image/webp' } }) });
    const response = await f.handler(request());
    await assert.rejects(response.arrayBuffer()); assert.equal(f.upstreamAbort.aborted, true);
  }
  let requested = 0;
  const f = fixture({ open: () => new Response(new ReadableStream({ pull(c) { requested++; c.enqueue(new Uint8Array([requested])); if (requested === 8) c.close(); } }), { headers: { 'Content-Type': 'image/webp' } }) });
  const response = await f.handler(request()); assert.ok(requested < 8, 'ne pas lire le fichier complet avant la réponse');
  assert.equal((await response.arrayBuffer()).byteLength, 8);
});

test('annulation lecteur et signal requête interrompent le fetch amont', async () => {
  const f = fixture({ open: () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array([1])); } }), { headers: { 'Content-Type': 'image/webp' } }) });
  const response = await f.handler(request()); await response.body.cancel(); assert.equal(f.upstreamAbort.aborted, true);
  const control = new AbortController(), g = fixture(); control.abort();
  const refused = await g.handler(request(PATH, { signal: control.signal }));
  assert.equal(refused.status, 408); assert.equal(g.calls.length, 0);
});

test('26 MiB transmis par morceaux sans lecture anticipée du fichier complet', async () => {
  let chunks = 0;
  const f = fixture({ metadata: { byte_size: MEDIA_MAX_BYTES }, open: () => new Response(new ReadableStream({
    pull(controller) { chunks++; controller.enqueue(new Uint8Array(1024 * 1024)); if (chunks === 26) controller.close(); },
  }), { headers: { 'Content-Type': 'image/webp', 'Content-Length': String(MEDIA_MAX_BYTES) } }) });
  const response = await f.handler(request());
  assert.ok(chunks < 26); let received = 0;
  for await (const chunk of response.body) received += chunk.byteLength;
  assert.equal(received, MEDIA_MAX_BYTES); assert.equal(chunks, 26);
});
