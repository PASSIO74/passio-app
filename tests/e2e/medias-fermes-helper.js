// Client fermé simulé, puis absence du parent vérifiée sur le vrai staging.
// Les octets et droits du circuit ouvert exigent la recette hébergée distincte.
const { randomUUID } = require('node:crypto');
const { configAdmin } = require('./compte-e2e');
const { cibleSupabase } = require('./cible-supabase');
const STAGING = 'https://fcksxofaelcdmmifnwjo.supabase.co';

function exigerStagingMedias() {
  const cfg = configAdmin();
  let claims, navigateur, anon;
  try { claims = JSON.parse(Buffer.from(cfg.cle.split('.')[1], 'base64url')); } catch (_) {}
  try {
    navigateur = cibleSupabase();
    if (navigateur.anon.split('.').length === 3) anon = JSON.parse(Buffer.from(navigateur.anon.split('.')[1], 'base64url'));
  } catch (_) {}
  if (!cfg || cfg.url !== STAGING || claims?.ref !== 'fcksxofaelcdmmifnwjo' || claims?.role !== 'service_role')
    throw new Error('recette media fermee : configuration admin staging requise');
  if (!navigateur || navigateur.url !== STAGING || anon?.ref !== 'fcksxofaelcdmmifnwjo' || anon?.role !== 'anon' || navigateur.anon === cfg.cle)
    throw new Error('recette media fermee : cible navigateur staging et cle anon requises');
  return cfg;
}

async function observerMediaFerme(page, genre, media) {
  const cfg = exigerStagingMedias();
  if (!['posts', 'stories'].includes(genre)) throw new Error('genre de recette refuse');
  const id = 'media_ferme_' + randomUUID();
  const origine = new URL(page.url()).origin;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origine)) throw new Error('serveur de recette local requis');
  let capacites = 0, capacitesNonConformes = 0, mutations = 0;
  const capUrl = origine + '/private-media/capabilities';
  const cap = route => {
    const req = route.request(), body = req.postData();
    if (req.method() !== 'POST' || req.headers()['x-passio-media-read'] !== '1' || (body !== null && body !== '')) {
      capacitesNonConformes++;
      return route.fulfill({ status: req.method() === 'POST' ? 400 : 405,
        headers: { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store' }, body: '' });
    }
    capacites++;
    return route.fulfill({ status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store' },
      body: JSON.stringify({ protocol: 1, min_client: 1, max_bytes: 27262976, uploads_enabled: false, reads_enabled: false }) });
  };
  const cibleEcriture = /\/rest\/v1\/(?:rpc\/media_reserver|posts|stories)(?:[/?]|$)|\/storage\/v1\/(?:object|upload)(?:[/?]|$)/;
  const retenir = route => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      // Compter l'intention AVANT de l'empêcher : une régression ne dépose rien
      // et n'obtient jamais le verdict « aucune tentative » grâce à ce blocage.
      mutations++; return route.abort('blockedbyclient');
    }
    return route.fallback();
  };
  await page.route(capUrl, cap);
  await page.route(cibleEcriture, retenir);
  try {
    const resultat = await page.evaluate(async ({ genre, id, media }) => {
      const commun = { id, authorId: MY_UID, authorName: 'Temoin ferme', authorEmoji: '✨', authorColor: '#8b5cf6',
        text: 'Refus attendu', content: 'Refus attendu', createdAt: Date.now(), overlays: [] };
      const publie = genre === 'stories'
        ? await supaPublishStory({ ...commun, media, mediaType: 'photo', passion: null })
        : await supaPublishPostWithRetry({ ...commun, passion: 'musique', mood: 'creation', type: 'photo', isReel: true, image: media });
      return { publie, auteur: MY_UID };
    }, { genre, id, media });
    if (!/^[0-9a-f-]{36}$/.test(resultat.auteur)) throw new Error('acteur de recette absent');
    // Autorité service du staging : zéro n'est pas déduit d'une lecture RLS
    // filtrée, du cache UI ou du booléen du client.
    const url = new URL('/rest/v1/' + genre, STAGING);
    url.search = new URLSearchParams({ select: 'id', id: 'eq.' + id });
    const r = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: { apikey: cfg.cle, Authorization: 'Bearer ' + cfg.cle, 'Accept-Encoding': 'identity' } });
    if (r.status !== 200 || !r.body) {
      await r.body?.cancel().catch(() => {});
      throw new Error('absence du parent non verifiable');
    }
    let n = 0; const chunks = [];
    for await (const b of r.body) { n += b.length; if (n > 2048) throw new Error('lecture parent hors borne'); chunks.push(b); }
    let rows;
    try { rows = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { throw new Error('lecture parent invalide'); }
    if (!Array.isArray(rows) || rows.length > 1 || rows.some(x => !x || x.id !== id)) throw new Error('lecture parent invalide');
    return { publie: resultat.publie, capacites, capacitesNonConformes, mutations, parents: rows.length };
  } finally {
    await page.unroute(cibleEcriture, retenir);
    await page.unroute(capUrl, cap);
  }
}

async function compterAvatarTemoin(owner, key) {
  const cfg = exigerStagingMedias();
  if (!/^[0-9a-f-]{36}$/.test(owner) || !key.startsWith('avatars/' + owner + '/') || !/^avatars\/[0-9a-f-]{36}\/reel_[0-9a-f-]{36}\.png$/.test(key))
    throw new Error('temoin avatar hors perimetre');
  // La liste de service ne filtre PAS le propriétaire : un objet NULL/NULL ou
  // attribué à tort ne doit pas disparaître derrière le filtre d'une RPC owner.
  const url = new URL('/storage/v1/object/list/content', STAGING);
  const nom = key.split('/').pop();
  const r = await fetch(url, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
    headers: { apikey: cfg.cle, Authorization: 'Bearer ' + cfg.cle, 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' },
    body: JSON.stringify({ prefix: 'avatars/' + owner, search: nom, limit: 2, offset: 0, sortBy: { column: 'name', order: 'asc' } }) });
  if (r.status !== 200 || !r.body) { await r.body?.cancel().catch(() => {}); throw new Error('absence avatar non verifiable'); }
  let n = 0; const chunks = [];
  for await (const b of r.body) { n += b.length; if (n > 2048) throw new Error('lecture avatar hors borne'); chunks.push(b); }
  let rows;
  try { rows = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { throw new Error('lecture avatar invalide'); }
  if (!Array.isArray(rows) || rows.length > 1 || rows.some(o => !o || o.name !== nom)) throw new Error('lecture avatar invalide');
  return rows.length;
}

module.exports = { exigerStagingMedias, observerMediaFerme, compterAvatarTemoin };
