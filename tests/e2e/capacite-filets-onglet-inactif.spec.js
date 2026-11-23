const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ═══════════════════════════════════════════════════════════════════════════
// ONGLET VISIBLE SANS GESTE : LES FILETS SE TAISENT, LE PREMIER GESTE LES
// RELANCE (2026-11-23, ADR-013 décision 5, audit 100K D15-01)
//
// Vrai câblage du produit — le détecteur unique (`filetsEnRepos`,
// `_activiteGeste`, app-02), le filet du fil (app-08), celui des lives (app-05),
// les compteurs des cartes (app-03), la relecture d'une discussion en panne
// (app-08) et le battement de la télémétrie (js/telemetry.js) — sous une horloge
// navigateur installée AVANT le démarrage : aucune chaîne de minuteurs native
// n'échappe au banc, le battement compris. Seules les LECTURES sont simulées
// (elles comptent), et le battement part vers le projet Supabase vide du
// helper, intercepté ici : aucun octet ne quitte la machine.
//
// Ce que ce banc prouve :
//   · la politique est PURE et bornée (15 min, visible seulement, jamais en
//     appel ni en live) ;
//   · onglet visible, aucun geste : après 15 min, plus AUCUN tour — ni lecture,
//     ni battement — pendant une demi-heure ; un seul battement marqué
//     `repos: true` dit pourquoi l'appareil disparaît des « en ligne » ;
//   · le premier geste relance TOUT de suite (rattrapage immédiat) chaque filet
//     tu, et un battement ; ensuite les chaînes battent à nouveau ;
//   · un geste régulier (toutes les 10 min) ne suspend jamais rien.
// ═══════════════════════════════════════════════════════════════════════════

const MOTIF_TEL = "**/rest/v1/telemetry_events*";

async function preparer(page) {
  // L'horloge AVANT le démarrage : le battement (js/telemetry.js) arme sa chaîne
  // au chargement, et un minuteur natif n'obéirait pas au banc.
  await page.clock.install();
  // Visiteur (aucune ligne télémétrique avec `user_id`), télémétrie active pour
  // armer le battement ; le projet Supabase vide du helper répond à tout.
  await bootOnboarded(page, undefined, 1, { query: "?telemetry=1" });
  const battements = [];
  await page.route(MOTIF_TEL, (route) => {
    let rows = [];
    try { rows = JSON.parse(route.request().postData() || "[]"); } catch (e) { rows = []; }
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      if (r && r.type === "lifecycle" && r.action === "heartbeat") battements.push({ repos: !!(r.meta && r.meta.repos) });
    });
    return route.fulfill({ status: 201, body: "" });
  });
  await page.waitForFunction(() => window._supaInitTerminee === true || !window._supaReal, null, { timeout: 20000 }).catch(() => {});
  expect(await page.evaluate(() => !!(window.tel && window.tel.enabled)), "télémétrie active (battement armé)").toBe(true);
  await page.evaluate(() => {
    window.__n = { fil: 0, lives: 0, compteurs: 0, discussion: 0 };
    window._supaReal = true;
    window._rechargementImminent = false;
    window._call = null; window._callIncoming = null; window._vliveHost = null; window._vliveView = null;
    // Les LECTURES, simulées et comptées — tout le reste est le produit.
    window.supaLoadPosts = async () => { __n.fil++; return []; };
    window.supaRefreshVideoLives = async () => { __n.lives++; return false; };
    window._postLikeGroupeDisponible = () => true;
    window._filCompteursEnRecul = () => false;
    window._postLikeLireGroupe = async (ids) => { __n.compteurs++; return { counts: new Map(ids.map((id) => [id, 7])) }; };
    // Les compteurs ne tournent que pour un COMPTE (même autorité que le temps
    // réel) : le banc reste visiteur pour tout le reste — aucune ligne de
    // télémétrie ne porte d'identifiant — et ouvre seulement cette porte-là.
    window.connexionTempsReelAutorisee = () => true;
    // Une carte de publication réelle à l'écran, pour les compteurs.
    state.supabasePosts = [{ id: "rep_1", authorId: "auteur_repos", passion: "musique", mood: "all", text: "Publication",
      likes: 7, liked: false, comments: [], fromSupabase: true, createdAt: Date.now(), type: "text" }];
    const scene = document.createElement("div");
    scene.id = "repos-scene";
    scene.style.cssText = "position:fixed;inset:90px 20px 90px;overflow:auto;z-index:250000;background:white;";
    document.body.appendChild(scene);
    scene.innerHTML = state.supabasePosts.map(renderPostHTML).join("");
    // Une discussion dont le sujet temps réel est EN PANNE : elle se relit. Le
    // réconciliateur est neutralisé : un visiteur n'a pas de socket, il
    // lâcherait ce sujet au premier appel (le banc mesure la relecture seule).
    if (typeof goTo === "function") goTo("feed");
    window._filsRtReconcilier = () => {};
    window._filRelire = async () => { __n.discussion++; };
    window._filSignature = () => "x";
    window._filsRt.set("post:rep_1", { etat: "panne", relecture: null });
    _filRelectureArmer("post:rep_1");
    // Ses deux filets et les compteurs repartent sous l'horloge du banc.
    stopFeedRefreshLoop(); startFeedRefreshLoop();
    stopPostLikeRefresh(); startPostLikeRefresh();
    // Point de départ : un geste, maintenant.
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 3000)));
  return battements;
}

const MIN = 60000;
const compter = (page) => page.evaluate(() => ({ ...__n, repos: _activiteOnglet.enRepos }));
// Avance par pas d'une minute (chaque échéance tombe à sa place) et laisse les
// promesses et les envois interceptés se régler.
async function passer(page, ms) {
  for (let t = 0; t < ms; t += MIN) {
    await page.clock.fastForward(Math.min(MIN, ms - t));
    await page.evaluate(() => Promise.resolve());
  }
  await page.clock.runFor(4000);          // le flush différé de la télémétrie (3 s)
  await page.waitForTimeout(150);          // les routes interceptées répondent en temps réel
}
const geste = (page) => page.evaluate(() => document.dispatchEvent(new Event("pointerdown", { bubbles: true })));

test("la politique est pure et bornée : 15 min, visible seulement, jamais en appel ni en live", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const f = filetsAuRepos;
    return [
      f({ visible: true, inactifDepuisMs: 900000 }),
      f({ visible: true, inactifDepuisMs: 899999 }),
      f({ visible: false, inactifDepuisMs: 9e9 }),
      f({ visible: true, inactifDepuisMs: 9e9, appelEnCours: true }),
      f({ visible: true, inactifDepuisMs: 9e9, liveEnCours: true }),
      f(null), f({}), f({ visible: true, inactifDepuisMs: NaN }),
      FILETS_REPOS_INACTIF_MS,
    ];
  });
  expect(r).toEqual([true, false, false, false, false, false, false, false, 900000]);
});

test("onglet visible inactif : aucun tour de filet après 15 minutes ; reprise au premier geste", async ({ page }) => {
  test.setTimeout(180000);
  const battements = await preparer(page);

  // ① Actif : les filets tournent (étalon — sans lui, « zéro » ne prouverait rien).
  await passer(page, 10 * MIN);
  const actif = await compter(page);
  expect(actif.repos).toBe(false);
  expect(actif.fil, "le fil se relit tant qu'on regarde").toBeGreaterThan(0);
  expect(actif.lives).toBeGreaterThan(0);
  expect(actif.compteurs).toBeGreaterThan(0);
  expect(actif.discussion).toBeGreaterThan(0);
  expect(battements.filter((b) => !b.repos).length, "le battement part chaque minute").toBeGreaterThanOrEqual(8);

  // ② Plus aucun geste : à 15 min le repos tombe ; à 20 min chaque filet l'a
  //    constaté (pas maximal 3 min). De 20 à 50 min : RIEN.
  await passer(page, 10 * MIN);
  const tu = await compter(page);
  expect(tu.repos, "repos posé après 15 min sans geste").toBe(true);
  const battementsTu = battements.length;
  expect(battements.filter((b) => b.repos).length, "un seul battement marqué repos").toBe(1);
  await passer(page, 30 * MIN);
  const silence = await compter(page);
  expect({ fil: silence.fil, lives: silence.lives, compteurs: silence.compteurs, discussion: silence.discussion },
    "aucune lecture pendant 30 min d'inactivité").toEqual({ fil: tu.fil, lives: tu.lives, compteurs: tu.compteurs, discussion: tu.discussion });
  expect(battements.length, "aucun battement pendant le repos").toBe(battementsTu);

  // ③ Premier geste : rattrapage IMMÉDIAT de chaque filet, et un battement.
  await geste(page);
  await page.clock.runFor(1500);
  await page.clock.runFor(4000);
  await page.waitForTimeout(150);
  const reprise = await compter(page);
  expect(reprise.repos).toBe(false);
  expect(reprise.fil - silence.fil, "le fil se relit tout de suite").toBe(1);
  expect(reprise.lives - silence.lives, "les lives aussi").toBe(1);
  expect(reprise.compteurs - silence.compteurs, "les compteurs aussi").toBe(1);
  expect(reprise.discussion - silence.discussion, "la discussion en panne aussi").toBe(1);
  expect(battements.length - battementsTu, "un battement part au premier geste").toBe(1);
  expect(battements[battements.length - 1].repos).toBe(false);

  // ④ Et les chaînes battent de nouveau (pas d'un tour isolé).
  await geste(page);
  await passer(page, 5 * MIN);
  const apres = await compter(page);
  expect(apres.fil).toBeGreaterThan(reprise.fil);
  expect(apres.lives).toBeGreaterThan(reprise.lives);
  expect(apres.compteurs).toBeGreaterThan(reprise.compteurs);
  expect(battements.length - battementsTu).toBeGreaterThanOrEqual(5);
});

test("un geste toutes les 10 min ne suspend jamais rien", async ({ page }) => {
  test.setTimeout(180000);
  const battements = await preparer(page);
  for (let i = 0; i < 4; i++) { await passer(page, 10 * MIN); await geste(page); }
  const c = await compter(page);
  expect(c.repos).toBe(false);
  expect(await page.evaluate(() => _activiteOnglet.mises)).toBe(0);
  expect(battements.filter((b) => b.repos).length).toBe(0);
  expect(battements.length, "≈ un battement par minute sur 40 min").toBeGreaterThanOrEqual(36);
});
