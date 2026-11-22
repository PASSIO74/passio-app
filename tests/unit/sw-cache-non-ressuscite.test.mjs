// ═══════════════════════════════════════════════════════════════════════════
// LE WORKER NE RESSUSCITE PAS UN CACHE QU'UNE NOUVELLE VERSION VIENT DE VIDER
// (2026-11-22)
//
// `caches.open(nom)` CRÉE le cache quand il n'existe plus, et TOUS les rangements du
// `fetch` de `sw.js` partent en tâche de fond : la page a déjà sa réponse, le `put` se
// règle après. Un rangement qui se règle APRÈS l'activation du worker suivant — laquelle
// supprime tous les autres caches — faisait donc revivre l'ancien cache, avec l'entrée
// qu'il rangeait, jusqu'au déploiement d'après.
//
// Vu en CI le 2026-11-22 (déploiement 45050821716, job « Suites navigateur ») :
// `app-scripts-par-fichier.spec.js` ④ a relevé `caches.keys()` à DEUX entrées juste
// après une mise à jour, l'ancienne créée APRÈS la nouvelle. Ce verrou-ci le rejoue
// SANS COURSE : le réseau ne rend sa réponse qu'une fois le cache supprimé et le worker
// suivant activé.
//
// ⚠️ LE VRAI `sw.js`, EXÉCUTÉ (machine virtuelle, comme `rappels.test.mjs`) : ni copie
// ni reformulation de son code — c'est son `fetch` qui range, et son `install` qui crée
// le cache de la version. Le stockage est faux, mais il se comporte comme un
// CacheStorage : `open` crée le cache absent, et `keys()` rend les noms DANS L'ORDRE DE
// CRÉATION (c'est cet ordre qui, en CI, a désigné la résurrection).
//
// ⚠️ ③ ET ④ GARDENT LE REVERS : la garde ne doit pas devenir « ne plus jamais ranger ».
// En dev (`sw.js` servi tel quel), `CACHE` porte un `Date.now()` : un worker redémarré
// ouvre un nom neuf, cache absent, et il doit continuer à ranger (④) — sans quoi
// `sw-page-revalidee.spec.js` garderait une page qu'aucun worker n'a rangée.
//
// Mutations attendues : rendre `rangerEnCache` à `caches.open(CACHE).then(c => c.put(…))`
// → ① rougit ; refuser le rangement sur le seul cache absent → ④ rougit.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SOURCE = fs.readFileSync(new URL("../../sw.js", import.meta.url), "utf8");
const ORIGINE = "https://app.invalid";
const JS = "text/javascript; charset=utf-8";

// Rend la main assez longtemps pour que toutes les microtâches en vol se règlent
// (une chaîne de `.then` n'a pas besoin de plus d'un tour de boucle).
const rendreLaMain = () => new Promise((r) => setImmediate(r)).then(() => new Promise((r) => setImmediate(r)));

// Un CacheStorage de banc : l'ordre de `keys()` est celui de la création, `open` crée
// le cache absent (c'est précisément ce qui ressuscitait l'ancien), `delete` l'enlève.
function faussesCaches() {
  const noms = [];
  const contenus = new Map();
  const cle = (requete) => String(requete && requete.url ? requete.url : requete);
  const cache = (nom) => ({
    add: () => Promise.resolve(),
    put: (requete, reponse) => { contenus.get(nom).set(cle(requete), reponse); return Promise.resolve(); },
    match: () => Promise.resolve(undefined),
    keys: () => Promise.resolve([...contenus.get(nom).keys()]),
  });
  return {
    noms,
    entrees: (nom) => [...(contenus.get(nom) || new Map()).keys()],
    api: {
      has: (nom) => Promise.resolve(noms.includes(nom)),
      keys: () => Promise.resolve(noms.slice()),
      open: (nom) => {
        if (!noms.includes(nom)) { noms.push(nom); contenus.set(nom, new Map()); }
        return Promise.resolve(cache(nom));
      },
      delete: (nom) => {
        const i = noms.indexOf(nom);
        if (i < 0) return Promise.resolve(false);
        noms.splice(i, 1); contenus.delete(nom);
        return Promise.resolve(true);
      },
      match: () => Promise.resolve(undefined),
    },
  };
}

// Une réponse complète du site, du type attendu (ce que `contenuVersionne` exige).
function reponseDuSite(type) {
  const res = {
    ok: true, status: 200, type: "basic",
    headers: { get: (n) => (/^content-type$/i.test(String(n)) ? type : null) },
    clone: () => ({ copie: true, ok: true, status: 200, type: "basic", headers: res.headers }),
  };
  return res;
}

function chargerSw() {
  const handlers = {};
  const stockage = faussesCaches();
  let reseauEnCours = null;
  // Ce worker, et celui que la registration sert : le navigateur remplace le second
  // quand une nouvelle version s'active (`registration.active`).
  const moi = { scriptURL: ORIGINE + "/sw.js" };
  const self = {
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); },
    skipWaiting: () => {},
    serviceWorker: moi,
    registration: { active: moi, showNotification: () => Promise.resolve() },
    clients: { matchAll: () => Promise.resolve([]), claim: () => Promise.resolve(), get: () => Promise.resolve(null) },
    location: { href: ORIGINE + "/", origin: ORIGINE, hostname: "app.invalid" },
  };
  vm.runInNewContext(SOURCE, {
    self, caches: stockage.api, URL, console,
    Response: class { constructor(corps, init) { Object.assign(this, { corps, ok: false }, init); } },
    Headers: globalThis.Headers, AbortController, ReadableStream,
    MessageChannel: globalThis.MessageChannel, crypto: globalThis.crypto,
    setTimeout, clearTimeout,
    fetch: () => reseauEnCours,
  });

  return {
    cles: () => stockage.api.keys(),
    entrees: (nom) => stockage.entrees(nom),
    supprimer: (nom) => stockage.api.delete(nom),
    // Le worker SUIVANT s'active : la registration le sert désormais, celui-ci est supplanté.
    activerLeSuivant: () => { self.registration.active = { scriptURL: ORIGINE + "/sw.js", suivant: true }; },
    // L'installation : c'est elle qui crée le cache de cette version.
    async installer() {
      let attendue;
      for (const f of handlers.install) f({ waitUntil: (p) => { attendue = p; } });
      await attendue;
      assert.equal(stockage.noms.length, 1, "l'installation a créé le cache de la version");
      return stockage.noms[0];
    },
    // Une demande servie par le worker, dont la réponse réseau n'arrive que sur ordre.
    demander(chemin, { cache = "", type = "image/png" } = {}) {
      let rendre;
      reseauEnCours = new Promise((r) => { rendre = r; });
      const requete = { method: "GET", url: ORIGINE + chemin, cache, headers: { get: () => null } };
      let servie = null;
      handlers.fetch[0]({ request: requete, respondWith: (p) => { servie = p; }, clientId: "c1" });
      assert.ok(servie, "le worker a bien pris la main sur " + chemin);
      return { servie: () => servie, reseauRepond: () => rendre(reponseDuSite(type)) };
    },
  };
}

test("① un rangement réglé APRÈS l'activation du worker suivant ne recrée pas le cache vidé", async () => {
  const sw = chargerSw();
  const nom = await sw.installer();
  assert.deepEqual(await sw.cles(), [nom]);

  // Une icône part sur le réseau (stale-while-revalidate) : la réponse est attendue.
  const demande = sw.demander("/icon-192.png");
  // Le worker SUIVANT s'active : il prend la main et son `activate` supprime les autres caches.
  assert.equal(await sw.supprimer(nom), true);
  sw.activerLeSuivant();
  assert.deepEqual(await sw.cles(), []);
  // Et SEULEMENT APRÈS, le réseau rend la réponse que ce worker voulait ranger.
  demande.reseauRepond();
  await demande.servie();
  await rendreLaMain();

  assert.deepEqual(await sw.cles(), [], "le cache supprimé ne doit pas réapparaître");
});

test("② le cache de la version EN COURS reçoit toujours ce que le worker range", async () => {
  const sw = chargerSw();
  const nom = await sw.installer();

  const demande = sw.demander("/icon-192.png");
  demande.reseauRepond();
  await demande.servie();
  await rendreLaMain();

  assert.deepEqual(await sw.cles(), [nom]);
  assert.deepEqual(sw.entrees(nom), [ORIGINE + "/icon-192.png"], "la garde ne désactive pas la mise en cache");
});

test("③ la redemande `cache: \"reload\"` rend sa réponse même quand le cache a disparu", async () => {
  const sw = chargerSw();
  const nom = await sw.installer();

  // La reprise du chargeur (scripts/build.js) : un script versionné redemandé au réseau.
  // Cette branche ATTEND son rangement avant de répondre — supplantée, elle doit
  // répondre quand même, sinon la page reste sans son script.
  const demande = sw.demander("/app/app-04-comments-shop.js?v=0123ab", { cache: "reload", type: JS });
  await sw.supprimer(nom);
  sw.activerLeSuivant();
  demande.reseauRepond();
  const res = await demande.servie();

  assert.equal(res.ok, true, "la page reçoit sa réponse");
  assert.deepEqual(await sw.cles(), [], "et aucun cache n'est ressuscité au passage");
});

test("④ cache absent SANS supplantation (worker redémarré, nom neuf en dev) : le rangement a lieu", async () => {
  const sw = chargerSw();
  const nom = await sw.installer();
  // Le stockage du site a été vidé sous le worker, qui reste celui que la registration sert.
  await sw.supprimer(nom);

  const demande = sw.demander("/icon-192.png");
  demande.reseauRepond();
  await demande.servie();
  await rendreLaMain();

  assert.deepEqual(await sw.cles(), [nom], "le worker courant garde le droit d'ouvrir son cache");
  assert.deepEqual(sw.entrees(nom), [ORIGINE + "/icon-192.png"]);
});
