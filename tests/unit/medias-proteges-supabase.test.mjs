import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseMediaDependencies } from '../../supabase/functions/_shared/medias-proteges-supabase.js';

const owner = '00000000-0000-4000-8000-000000000001', asset = '00000000-0000-4000-8000-000000000002';
function setup(options = {}) {
  const calls = [];
  const dependencies = createSupabaseMediaDependencies({
    projectUrl: 'https://project.invalid', anonKey: 'synthetic-anon-key', serviceKey: 'synthetic-runtime-key',
    createClient(origin, key, config) {
      calls.push({ kind: 'client', origin, key, config });
      return {
        auth: { async getUser(token) { calls.push({ kind: 'verify', token }); return options.auth || { data: { user: { id: owner } }, error: null }; } },
        rpc(name, params) {
          calls.push({ kind: 'rpc', name, params });
          return { async abortSignal(signal) {
            assert.ok(signal instanceof AbortSignal);
            return { data: name === 'media_session_active' ? true : [{ bucket_id: 'content-protected' }], error: options.rpcError || null };
          } };
        },
      };
    },
    async fetchImpl(url, config) { calls.push({ kind: 'fetch', url: String(url), config }); return new Response(null); },
  });
  return { dependencies, calls };
}

test('SDK appelant uniquement à clé publique ; JWT dans header, aucune persistance SDK', async () => {
  const f = setup(), signal = new AbortController().signal;
  const actor = f.dependencies.createActor({ mode: 'user', bearer: 'synthetic-user-jwt', signal });
  assert.equal(await actor.verify(), true); assert.equal(await actor.sessionActive(), true);
  await actor.resolve({ sourceType: 'posts', displayId: 'post_synthetique', assetId: asset, variant: 'original' });
  const client = f.calls.find((call) => call.kind === 'client');
  assert.equal(client.key, 'synthetic-anon-key'); assert.equal(client.config.global.headers.Authorization, 'Bearer synthetic-user-jwt');
  assert.deepEqual(client.config.auth, { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
  const rpcs = f.calls.filter((call) => call.kind === 'rpc');
  assert.equal(rpcs[0].name, 'media_session_active'); assert.equal(rpcs[0].params, undefined);
  assert.deepEqual(rpcs[1].params, { p_type: 'posts', p_affichant_id: 'post_synthetique', p_asset_id: asset, p_variante: 'original' });
  assert.equal(f.calls.some((call) => call.kind === 'fetch'), false);
});

test('voie anon : aucun bearer utilisateur ni clé privilégiée dans le SDK', () => {
  const f = setup(); f.dependencies.createActor({ mode: 'anon', bearer: null, signal: new AbortController().signal });
  assert.equal(f.calls[0].key, 'synthetic-anon-key'); assert.deepEqual(f.calls[0].config.global.headers, {});
});

test('octets : origine fixe, chemin fermé, service runtime en headers seuls et liste fermée', async () => {
  const f = setup();
  await f.dependencies.openObject({ objectKey: `${owner}/${asset}/original.webp`, method: 'GET', range: { header: 'bytes=1-2' }, signal: new AbortController().signal });
  const call = f.calls[0];
  assert.equal(call.kind, 'fetch'); assert.equal(new URL(call.url).origin, 'https://project.invalid'); assert.equal(new URL(call.url).search, '');
  assert.equal(call.config.headers.get('Authorization'), 'Bearer synthetic-runtime-key');
  assert.equal(call.config.headers.get('apikey'), 'synthetic-runtime-key'); assert.equal(call.config.headers.get('Range'), 'bytes=1-2');
  assert.deepEqual([...call.config.headers.keys()].sort(), ['apikey', 'authorization', 'range']);
  assert.equal(call.config.redirect, 'error'); assert.equal(call.config.cache, 'no-store'); assert.equal(call.config.credentials, 'omit');
  for (const objectKey of ['https://other.invalid/file', '../file', `${owner}/${asset}/original.svg`]) await assert.rejects(() => f.dependencies.openObject({ objectKey, method: 'GET' }));
  assert.equal(f.calls.length, 1);
});

test('refus Auth et panne RPC ne deviennent pas une résolution anonyme', async () => {
  const bad = setup({ auth: { error: { status: 401 }, data: { user: null } } });
  assert.equal(await bad.dependencies.createActor({ mode: 'user', bearer: 'bad', signal: new AbortController().signal }).verify(), false);
  const down = setup({ rpcError: { code: 'synthetic' } });
  const actor = down.dependencies.createActor({ mode: 'user', bearer: 'valid', signal: new AbortController().signal });
  await assert.rejects(actor.sessionActive, /private_media_session_unavailable/);
});

test('configuration invalide et identité fournisseur mal formée : aucun détail brut ni accès octets', async () => {
  assert.throws(() => createSupabaseMediaDependencies({ projectUrl: 'synthetic-not-a-url', anonKey: 'public', serviceKey: 'runtime', createClient() {} }), /^Error: private_media_configuration$/);
  const invalid = setup({ auth: { error: null, data: { user: { id: 'not-a-uuid' } } } });
  assert.equal(await invalid.dependencies.createActor({ mode: 'user', bearer: 'synthetic', signal: new AbortController().signal }).verify(), false);
  assert.equal(invalid.calls.some((call) => call.kind === 'fetch'), false);
});
