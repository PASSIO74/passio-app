// ════════════════════════════════════════════════════════════════════════════
// CAPACITÉ — L'AMPLIFICATION (2026-09-20)
//
// Suite du lot du 19/09. Une fois la lecture, le stockage et la télémétrie
// réglés, ce qui borne PASSIO n'est plus « combien de gens lisent » mais
// L'AMPLIFICATION : une écriture qui se transforme en N lectures, et une frappe
// qui coûte cent fois ce qu'elle devrait. Mesuré en production le 2026-09-20
// (canal ① d'ADR-012, compteurs cumulés sur 129 jours) :
//
//   `profiles`     18 964 110 balayages · 132 550 791 tuples — table de 9 lignes
//   `video_lives`     223 315 balayages —                     table de 21 lignes
//   `rechercher_passions`  92,2 ms de moyenne sur 18 185 appels
//
// ⚠️ CHAQUE CAS MESURE LE CÂBLAGE, PAS LA FONCTION. Le dépôt a déjà payé
// `_notifierMessage` (douze verrous appelaient une fonction morte) et, le
// 19/09, un cas ① qui restait vert sur le défaut qu'il devait fermer.
// ════════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");


// ⚠️ LE DÉMARRAGE APPELLE `supaRefreshVideoLives` UNE FOIS, ET C'EST INVISIBLE
// EN LOCAL. `supaInit` (app-08) le fait pour peindre les bulles « 🔴 LIVE »,
// gardé par `window._supaReal` : FAUX en local (le SDK n'est pas chargé), VRAI
// en CI. Les trois cas ⑧ ont donc été verts ici et rouges là-bas, à exactement
// UN appel près (0 → 1, 1 → 2) — la divergence d'environnement que ce dépôt
// connaît par cœur, prise par son autre bout.
//
// On ne « tolère » pas cet appel et on ne l'ignore pas à l'aveugle : on attend
// que le compteur soit STABLE (plus aucun appel pendant 400 ms), puis on le
// remet à zéro. Le sujet de ces cas est « mon geste déclenche-t-il un
// rechargement ? », pas « l'application en fait-elle un au démarrage ». Un
// simple `setTimeout` de complaisance aurait rouvert la même course sur un
// runner plus lent.
async function compteurVliveAuCalme(page) {
  await page.evaluate(() => {
    window.__vliveAppels = 0;
    window.supaRefreshVideoLives = function () { window.__vliveAppels++; return Promise.resolve(); };
  });
  let precedent = -1;
  for (let i = 0; i < 20; i++) {
    const n = await page.evaluate(() => window.__vliveAppels);
    if (n === precedent) break;
    precedent = n;
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => { window.__vliveAppels = 0; });
}

// ── ⑥ LA RECHERCHE : LES DEUX PREMIÈRES LETTRES COÛTAIENT 97 % DU MOT ───────

test("⑥ sous trois caractères, AUCUNE requête ne part — et le local répond quand même", async ({ page }) => {
  await bootOnboarded(page);
  // On mute `supa.rpc` pour COMPTER, jamais pour empêcher : le cas doit rougir
  // si le plancher disparaît, pas si le réseau est coupé.
  const r = await page.evaluate(async () => {
    const appels = [];
    window.supa = window.supa || {};
    const vrai = window.supa.rpc;
    window.supa.rpc = function (nom, args) { appels.push((args && args.q) || ""); return Promise.resolve({ data: [], error: null }); };
    window._supaReal = true;
    const m = window.PassioPassions;
    const res = {};
    for (const q of ["g", "gu", "gui", "guita"]) {
      const out = await m.chercherAsync(q, { serveur: true, limite: 20 });
      res[q] = (out || []).length;
    }
    window.supa.rpc = vrai;
    return { appels, res };
  });
  expect(r.appels, "une et deux lettres ne doivent JAMAIS atteindre le serveur").not.toContain("g");
  expect(r.appels).not.toContain("gu");
  expect(r.appels, "trois lettres et plus, si").toContain("gui");
  expect(r.appels).toContain("guita");
  // ⚠️ LE PLANCHER NE DOIT RIEN RETIRER À L'ÉCRAN : c'est ce qui le rend
  // acceptable. La recherche locale (index préfixe sur les 5 001 entrées)
  // répond déjà à ces frappes, immédiatement et hors ligne.
  expect(r.res["g"], "« g » doit rendre des résultats LOCAUX").toBeGreaterThan(0);
  expect(r.res["gu"], "« gu » doit rendre des résultats LOCAUX").toBeGreaterThan(0);
});

test("⑥ bis les quatre passions à nom court restent trouvables par le local", async ({ page }) => {
  await bootOnboarded(page);
  // Mesuré en base le 2026-09-20 : C++, C#, Go et DJ sont les SEULES passions
  // dont le libellé normalisé fait moins de trois caractères, sur 5 009. Le
  // plancher serveur ne doit pas les rendre introuvables — l'index local les
  // sert par PRÉFIXE, qui est justement la bonne réponse à « dj ».
  const r = await page.evaluate(async () => {
    const m = window.PassioPassions;
    const out = {};
    for (const q of ["dj", "go", "c"]) {
      const l = await m.chercherAsync(q, { serveur: false, limite: 20 });
      out[q] = (l || []).map((p) => p.id);
    }
    return out;
  });
  expect(r["dj"], "« dj » doit rendre musique-dj").toContain("musique-dj");
  expect(r["go"], "« go » doit rendre jeux-go").toContain("jeux-go");
  expect(r["c"].length, "« c » doit rendre quelque chose").toBeGreaterThan(0);
});

test("⑥ ter le plancher se prend sur la frappe NORMALISÉE, pas sur le texte brut", async ({ page }) => {
  await bootOnboarded(page);
  // «  é  » fait quatre caractères bruts et UN une fois normalisé : c'est la
  // forme normalisée que le serveur recevrait, donc c'est elle qui décide.
  const r = await page.evaluate(async () => {
    const appels = [];
    window.supa = window.supa || {};
    window.supa.rpc = function (n, a) { appels.push((a && a.q) || ""); return Promise.resolve({ data: [], error: null }); };
    window._supaReal = true;
    await window.PassioPassions.chercherAsync("  é  ", { serveur: true });
    await window.PassioPassions.chercherAsync("  ski  ", { serveur: true });
    return appels;
  });
  expect(r.length, "une seule des deux frappes doit partir").toBe(1);
  expect(r[0]).toContain("ski");
});

// ── ⑦ UN ÉVÉNEMENT REÇU NE DÉCLENCHE PLUS UNE REQUÊTE CHEZ CHACUN ───────────

test("⑦ les gestionnaires temps réel passent par `_profilAuteur` — à la SOURCE", () => {
  const src = lire("js/app-08-ui-modals-tour.js");
  // ⚠️ MESURÉ À LA SOURCE, et c'est délibéré : le chemin vivant est un
  // gestionnaire `postgres_changes`, qu'un banc local ne déclenche pas (aucun
  // WAL, aucun canal). Un cas qui appellerait `_profilAuteur` à la main
  // resterait vert le jour où les gestionnaires cesseraient de l'appeler —
  // exactement le défaut `_notifierMessage`.
  // ⚠️ LA TRANCHE SE BORNE À LA FONCTION, et la première rédaction l'a oublié :
  // elle allait jusqu'à la fin du fichier et attrapait le `from("profiles")` de
  // `supaInit` — un chemin de DÉMARRAGE, appelé une fois par session, qui n'a
  // rien à voir avec l'amplification. Un verrou qui rougit sur un innocent finit
  // par être désarmé.
  const debut = src.indexOf("function _creerCanalDb(");
  expect(debut, "la fonction doit exister").toBeGreaterThan(0);
  const fin = src.indexOf("\nfunction ", debut + 10);
  const canal = src.slice(debut, fin > debut ? fin : undefined);
  expect(canal.length, "le corps du canal doit être trouvé").toBeGreaterThan(1000);
  expect(canal, "la tranche doit s'arrêter avant supaInit").not.toContain("PROFIL STABLE PAR COMPTE");
  expect(
    canal.match(/from\(["']profiles["']\)/g),
    "AUCUN gestionnaire du canal temps réel ne doit interroger `profiles` : l'événement est poussé à TOUS les connectés, donc une écriture coûterait N requêtes"
  ).toBeNull();
  expect(
    (canal.match(/_profilAuteur\(/g) || []).length,
    "les deux gestionnaires (posts, post_comments) doivent passer par l'autorité unique"
  ).toBeGreaterThanOrEqual(2);
});

test("⑦ bis `_profilAuteur` sert le cache sans réseau, et n'interroge qu'au manque", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const requetes = [];
    const uidConnu = "11111111-1111-4111-8111-111111111111";
    const uidInconnu = "22222222-2222-4222-8222-222222222222";
    // ⚠️ On MUTE `supa.from`, on ne remplace pas le binding : `supa` est un
    // `let` de portée script, `window.supa = x` créerait une propriété séparée
    // (piège du 2026-09-10).
    window.supa.from = function (t) {
      requetes.push(t);
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: uidInconnu, username: "Venue du réseau", emoji: "🎯", color: "#123456" } }) }) }) };
    };
    cacheRemoteProfile({ id: uidConnu, username: "Déjà en cache", emoji: "🎸", color: "#abcdef" });
    const a = await _profilAuteur(uidConnu);
    const apresCache = requetes.slice();
    const b = await _profilAuteur(uidInconnu);
    // Le manque doit être INSCRIT : la publication suivante du même auteur ne
    // doit pas repayer la requête, chez tout le monde.
    const c = await _profilAuteur(uidInconnu);
    return { a, b, c, apresCache, total: requetes.length };
  });
  expect(r.apresCache, "un auteur déjà en cache ne déclenche AUCUNE requête").toEqual([]);
  expect(r.a.username).toBe("Déjà en cache");
  expect(r.a.emoji).toBe("🎸");
  expect(r.b.username, "un auteur inconnu est bien demandé au réseau").toBe("Venue du réseau");
  expect(r.total, "le second passage sur le MÊME auteur doit être servi par le cache").toBe(1);
  expect(r.c.username).toBe("Venue du réseau");
});

// ── ⑧ LE BATTEMENT DE CŒUR D'UN LIVE NE RECHARGE PLUS RIEN ─────────────────

test("⑧ le battement de cœur d'un live ne déclenche AUCUN rechargement", async ({ page }) => {
  await bootOnboarded(page);
  // ⚠️ C'EST LE CAS QUE LA PRODUCTION PRODUIT VRAIMENT, et la première version
  // de ce verrou ne le mesurait pas : elle envoyait douze appels dans le même
  // tick, une rafale que la donnée mesurée ne montre nulle part. L'hôte d'un
  // live envoie un UPDATE `last_seen` toutes les 25 SECONDES — aucun débounce
  // de 250 ms ne le coalesce. Un verrou qui exerce une forme de charge que la
  // production n'a pas est vert sans rien prouver.
  await compteurVliveAuCalme(page);
  const r = await page.evaluate(async () => {
    window._videoLives = [{ id: "vl1", status: "live", author_id: "u_x", last_seen: "2026-09-20T06:00:00Z" }];
    // Six battements, espacés comme en production (le débounce a le temps
    // d'expirer entre deux) : rien ne doit partir.
    for (let i = 0; i < 6; i++) {
      window.vliveRefreshCoalesce({ eventType: "UPDATE", new: { id: "vl1", status: "live", last_seen: "2026-09-20T06:0" + i + ":00Z" } });
      await new Promise((r2) => setTimeout(r2, 300));
    }
    const battements = window.__vliveAppels;
    // Un changement de STATUT, lui, doit recharger.
    window.vliveRefreshCoalesce({ eventType: "UPDATE", new: { id: "vl1", status: "ended" } });
    await new Promise((r2) => setTimeout(r2, 400));
    const apresStatut = window.__vliveAppels;
    // Un live INCONNU aussi : un événement qu'on ne sait pas lire est honoré.
    window.vliveRefreshCoalesce({ eventType: "INSERT", new: { id: "vl2", status: "live" } });
    await new Promise((r2) => setTimeout(r2, 400));
    return { battements, apresStatut, total: window.__vliveAppels };
  });
  expect(r.battements, "six battements de cœur : AUCUN rechargement").toBe(0);
  expect(r.apresStatut, "un changement de statut recharge").toBe(1);
  expect(r.total, "un identifiant inconnu recharge aussi").toBe(2);
});

test("⑧ bis un appel sans payload recharge — on n'honore jamais un événement qu'on ne sait pas lire", async ({ page }) => {
  await bootOnboarded(page);
  await compteurVliveAuCalme(page);
  const r = await page.evaluate(async () => {
    window._videoLives = [{ id: "vl1", status: "live" }];
    window.vliveRefreshCoalesce();                                       // aucun payload
    window.vliveRefreshCoalesce({ eventType: "DELETE", old: { id: "vl1" } });
    await new Promise((r2) => setTimeout(r2, 400));
    return window.__vliveAppels;
  });
  expect(r, "sans payload lisible, on recharge (et la rafale reste coalescée en un seul appel)").toBe(1);
});

test("⑧ ter page masquée : rien ne part, et le retour à l'écran RATTRAPE", async ({ page }) => {
  await bootOnboarded(page);
  await compteurVliveAuCalme(page);
  const r = await page.evaluate(async () => {
    window._videoLives = [];
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    for (let i = 0; i < 5; i++) window.vliveRefreshCoalesce({ eventType: "INSERT", new: { id: "vl9", status: "live" } });
    await new Promise((r2) => setTimeout(r2, 400));
    const masquee = window.__vliveAppels;
    // ⚠️ Le rendez-vous est REPORTÉ, jamais annulé : un live ouvert pendant que
    // le téléphone est en poche doit apparaître au retour, sinon on aurait
    // remplacé « trop de requêtes » par « une bulle éteinte ».
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r2) => setTimeout(r2, 500));
    return { masquee, apresRetour: window.__vliveAppels };
  });
  expect(r.masquee, "une page masquée ne demande rien : la réponse ne peut rien peindre").toBe(0);
  expect(r.apresRetour, "le retour à l'écran rattrape ce qui a été reporté").toBe(1);
});

test("⑧ quater `pageshow` rattrape aussi — iOS revient du bfcache sans `visibilitychange`", async ({ page }) => {
  await bootOnboarded(page);
  // ⚠️ La première rédaction NOMMAIT `pageshow` dans son commentaire sans
  // jamais l'écouter. Un commentaire qui promet une couverture qu'il n'a pas
  // est pire qu'un trou : on croit le cas traité.
  await compteurVliveAuCalme(page);
  const r = await page.evaluate(async () => {
    window._videoLives = [];
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    window.vliveRefreshCoalesce({ eventType: "INSERT", new: { id: "vlA", status: "live" } });
    await new Promise((r2) => setTimeout(r2, 300));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    window.dispatchEvent(new Event("pageshow"));
    await new Promise((r2) => setTimeout(r2, 500));
    return window.__vliveAppels;
  });
  expect(r, "`pageshow` seul doit rattraper le report").toBe(1);
});

test("⑧ quinquies le gestionnaire temps réel TRANSMET le payload — à la SOURCE", () => {
  const src = lire("js/app-08-ui-modals-tour.js");
  const i = src.indexOf('table: "video_lives"');
  expect(i, "le binding video_lives doit exister").toBeGreaterThan(0);
  const bloc = src.slice(i, i + 900);
  // Sans l'argument, la garde ne peut RIEN décider et chaque battement repaie
  // une requête chez chaque connecté : le câblage est tout le lot.
  expect(bloc, "le payload doit être reçu").toMatch(/function\s*\(\s*payload\s*\)/);
  expect(bloc, "et transmis à la coalescence").toContain("vliveRefreshCoalesce(payload)");
  expect(bloc, "le repli direct reste").toContain("supaRefreshVideoLives");
});

// ── ⑨ conv_members : O(N) → O(1) ────────────────────────────────────────────

test("⑨ `conv_members` porte un filtre SERVEUR, et la garde client reste", () => {
  const src = lire("js/app-08-ui-modals-tour.js");
  const i = src.indexOf('table: "conv_members"');
  expect(i, "le binding conv_members doit exister").toBeGreaterThan(0);
  const ligne = src.slice(i, i + 220);
  expect(
    ligne,
    "sans filtre serveur, CHAQUE ligne conv_members de tout PASSIO est poussée à TOUS les connectés pour être jetée à la première ligne du gestionnaire"
  ).toMatch(/filter:\s*`user_id=eq\.\$\{MY_UID\}`/);
  // ⚠️ Un filtre Realtime est une optimisation de TRANSPORT, jamais une
  // frontière de sécurité : la garde client ne part pas avec.
  expect(src.slice(i, i + 500)).toContain("r.user_id !== MY_UID");
});
