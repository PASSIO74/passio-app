import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const source = fs.readFileSync(new URL('../e2e/medias-fermes-helper.js', import.meta.url), 'utf8');
const STAGE = 'https://fcksxofaelcdmmifnwjo.supabase.co';
const A = '00000000-0000-4000-8000-000000000001';
const AVATAR = 'avatars/' + A + '/reel_00000000-0000-4000-8000-000000000002.png';
function fixture(options = {}) {
  const claims = { ref: options.ref || 'fcksxofaelcdmmifnwjo', role: options.role || 'service_role' };
  const cle = 'fixture.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature';
  const anon = 'fixture.' + Buffer.from(JSON.stringify({ ref: options.browserRef || 'fcksxofaelcdmmifnwjo', role: 'anon' })).toString('base64url') + '.signature';
  const routes = [], calls = [], blocked = [];
  let evaluated = 0;
  async function dispatch(url, method = 'GET') {
    async function suivant(i) {
      if (i < 0) throw Error('sortie sans route interdite dans ce banc');
      const r = routes[i];
      if (!(typeof r.pattern === 'string' ? r.pattern === url : r.pattern.test(url))) return suivant(i - 1);
      return r.handler({ request: () => ({ method: () => method, url: () => url,
        headers: () => options.capHeaders || { 'x-passio-media-read': '1' }, postData: () => options.capBody ?? null }),
        fulfill: async o => new Response(o.body, { status: o.status, headers: o.headers }),
        abort: async () => { blocked.push({ url, method }); throw Error('blocked'); },
        fallback: () => suivant(i - 1) });
    }
    return suivant(routes.length - 1);
  }
  const page = {
    url: () => 'http://127.0.0.1:8080/index.html',
    async route(pattern, handler) { routes.push({ pattern, handler }); },
    async unroute(pattern, handler) { const i = routes.findIndex(x => x.pattern === pattern && x.handler === handler); assert.notEqual(i, -1); routes.splice(i, 1); },
    async evaluate(fn, arg) {
      evaluated++;
      const publisher = async () => {
        const caps = await dispatch('http://127.0.0.1:8080/private-media/capabilities', options.capMethod || 'POST');
        if (caps.status !== 200) return false;
        assert.equal((await caps.json()).uploads_enabled, false);
        if (options.rogue) {
          // Régression simulée : le publisher tente quand même une écriture,
          // avale son échec et renvoie false. Le helper doit voir la tentative.
          try { await dispatch(STAGE + options.rogue, options.method || 'POST'); } catch (_) {}
        }
        return options.publie ?? false;
      };
      return vm.runInNewContext('(' + fn.toString() + ')(arg)', { arg, MY_UID: A,
        supaPublishStory: publisher, supaPublishPostWithRetry: publisher });
    },
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, Buffer, URL, URLSearchParams, AbortSignal, Error,
    require: n => {
      if (n === 'node:crypto') return { randomUUID };
      if (n === './compte-e2e') return { configAdmin: () => ({ url: options.url || STAGE, cle }) };
      if (n === './cible-supabase') return { cibleSupabase: () => options.browserAbsent ? null
        : { url: options.browserUrl || STAGE, anon: options.browserAdmin ? cle : anon } };
      throw Error('import refuse');
    },
    async fetch(url, init) {
      assert.equal(url.origin, STAGE);
      assert.equal(init.headers.Authorization, 'Bearer ' + cle);
      assert.equal(init.redirect, 'error');
      if (url.pathname === '/storage/v1/object/list/content') {
        const body = JSON.parse(init.body);
        assert.equal(init.method, 'POST'); assert.equal(body.prefix, 'avatars/' + A);
        assert.equal(body.search, AVATAR.split('/').pop()); assert.equal(body.limit, 2); assert.equal(body.offset, 0);
        assert.equal(Object.hasOwn(body, 'owner'), false); assert.equal(Object.hasOwn(body, 'owner_id'), false);
        calls.push({ avatar: true });
        return new Response(JSON.stringify(options.avatarPresent ? [{ name: AVATAR.split('/').pop(), owner: options.avatarOwner ?? null, owner_id: options.avatarOwner ?? null }] : []), { status: options.status || 200 });
      }
      assert.match(url.pathname, /^\/rest\/v1\/(posts|stories)$/);
      assert.equal(url.searchParams.get('select'), 'id');
      assert.equal(url.searchParams.has('author_id'), false, 'la lecture admin ne cache pas un mauvais propriétaire');
      const id = url.searchParams.get('id').slice(3);
      calls.push({ id, genre: url.pathname.split('/').pop() });
      const body = options.badBody ? '{}' : JSON.stringify(options.parent ? [{ id }] : []);
      return new Response(body, { status: options.status || 200 });
    },
  });
  return { api: mod.exports, page, routes, calls, blocked, evaluated: () => evaluated };
}

test('publisher fermé : résultat brut et absence lue avec autorité staging', async () => {
  const f = fixture(); const r = await f.api.observerMediaFerme(f.page, 'stories', 'synthetic');
  assert.deepEqual({ ...r }, { publie: false, capacites: 1, capacitesNonConformes: 0, mutations: 0, parents: 0 });
  assert.equal(f.calls.length, 1); assert.equal(f.routes.length, 0);
});

for (const rogue of ['/rest/v1/rpc/media_reserver', '/storage/v1/object/content-protected/a/a/original.png',
  '/storage/v1/object/content/photos/a/pixel.png', '/storage/v1/upload/resumable', '/rest/v1/stories', '/rest/v1/posts']) {
  test('une tentative avalée reste comptée : ' + rogue, async () => {
    const f = fixture({ rogue }); const r = await f.api.observerMediaFerme(f.page, 'posts', 'synthetic');
    assert.equal(r.publie, false); assert.equal(r.parents, 0);
    assert.equal(r.mutations, 1); assert.equal(f.blocked.length, 1); assert.equal(f.routes.length, 0);
  });
}

for (const method of ['PUT', 'PATCH', 'DELETE']) {
  test('une mutation ' + method + ' avalée est comptée avant blocage', async () => {
    const f = fixture({ rogue: '/storage/v1/object/content/photos/a/x.png', method });
    const r = await f.api.observerMediaFerme(f.page, 'posts', 'synthetic');
    assert.equal(r.mutations, 1); assert.equal(f.blocked[0].method, method);
  });
}
for (const options of [{ capMethod: 'GET' }, { capHeaders: {} }, { capBody: 'inattendu' }]) {
  test('capacités hors contrat non qualifiées ' + JSON.stringify(options), async () => {
    const f = fixture(options); const r = await f.api.observerMediaFerme(f.page, 'stories', 'synthetic');
    assert.equal(r.publie, false); assert.equal(r.capacites, 0); assert.equal(r.capacitesNonConformes, 1);
  });
}

test('un parent présent ne disparaît pas derrière le false du publisher', async () => {
  const f = fixture({ parent: true }); const r = await f.api.observerMediaFerme(f.page, 'stories', 'synthetic');
  assert.equal(r.publie, false); assert.equal(r.parents, 1);
});
test('un succès du publisher n’est pas converti en refus attendu', async () => {
  const f = fixture({ publie: true }); const r = await f.api.observerMediaFerme(f.page, 'posts', 'synthetic');
  assert.equal(r.publie, true);
});
for (const options of [{ url: 'https://njkiyoklssvefstljemx.supabase.co' }, { role: 'anon' }, { ref: 'autre' }]) {
  test('aucun appel sous configuration admin incorrecte ' + JSON.stringify(options), async () => {
    const f = fixture(options);
    await assert.rejects(f.api.observerMediaFerme(f.page, 'stories', 'synthetic'), /admin staging requise/);
    assert.equal(f.evaluated(), 0); assert.equal(f.calls.length, 0); assert.equal(f.routes.length, 0);
  });
}
for (const options of [{ browserAbsent: true }, { browserAdmin: true }, { browserUrl: 'https://njkiyoklssvefstljemx.supabase.co' }, { browserRef: 'autre' }]) {
  test('aucun navigateur sous cible incohérente ' + JSON.stringify(options), async () => {
    const f = fixture(options);
    await assert.rejects(f.api.observerMediaFerme(f.page, 'stories', 'synthetic'), /cible navigateur staging/);
    assert.equal(f.evaluated(), 0); assert.equal(f.calls.length, 0); assert.equal(f.routes.length, 0);
  });
}
for (const options of [{ status: 403 }, { badBody: true }]) {
  test('lecture admin non vérifiable : refus et retrait des routes ' + JSON.stringify(options), async () => {
    const f = fixture(options);
    await assert.rejects(f.api.observerMediaFerme(f.page, 'stories', 'synthetic'), /parent/);
    assert.equal(f.routes.length, 0);
  });
}
test('avatar : absence catalogue après un retrait qui pourrait être vide', async () => {
  const f = fixture(); assert.equal(await f.api.compterAvatarTemoin(A, AVATAR), 0);
  assert.equal(f.calls.length, 1);
});
test('avatar : une ligne NULL/NULL restante interdit le verdict de retrait', async () => {
  const f = fixture({ avatarPresent: true }); assert.equal(await f.api.compterAvatarTemoin(A, AVATAR), 1);
});
test('avatar : un propriétaire divergent ne cache pas la clé restante', async () => {
  const f = fixture({ avatarPresent: true, avatarOwner: 'autrui' }); assert.equal(await f.api.compterAvatarTemoin(A, AVATAR), 1);
});
test('avatar : une autre clé est refusée avant le réseau', async () => {
  const f = fixture(); await assert.rejects(f.api.compterAvatarTemoin(A, 'avatars/autrui/image.png'), /hors perimetre/);
  assert.equal(f.calls.length, 0);
});
