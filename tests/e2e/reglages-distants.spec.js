const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES DISTANTS (2026-10-11) — l'interrupteur que toute la production écoute
//
// Vrai module (`js/reglages-distants.js`), vrai câblage (`delaiDeleste` d'app-02,
// `_rtReposEtat` d'app-08) ; la table `reglages_distants` est servie par une
// route, jamais par la production. Ce que ce banc prouve :
//   ① table absente (404) : rien ne change, le 404 est mémorisé une heure et
//     ne repart pas à chaque tour ;
//   ② délestage 2 → facteur 4 sur les filets et sur le repos du temps réel,
//     levé au tour suivant quand la base dit 0 ;
//   ③ coupures : liste BLANCHE seulement — une ligne qui contient une clé de
//     données ne pose RIEN ; on ne lève que ce qu'on a posé soi-même ;
//   ④ le cache est appliqué AVANT l'app (coupure posée avant que les lots
//     lisent leur drapeau) ; un délestage trop vieux n'est pas repris ;
//   ⑤ le bandeau est du TEXTE (jamais du HTML), fermable, cible ≥ 44 px ;
//   ⑥ inerte en local sans demande explicite : les suites n'héritent jamais
//     d'un réglage de production ;
//   ⑦ la coupure du module rend ce qu'il avait pris ;
//   ⑧ table RETIRÉE (404 après un retour arrière) : un réglage lu la veille
//     ne reste pas en place pour toujours — 404 = aucun réglage.
// ═══════════════════════════════════════════════════════════════════════════

const MOTIF = /\/rest\/v1\/reglages_distants\?/;

async function preparer(page, opts = {}) {
  const serveur = { status: 404, lignes: [], n: 0 };
  await page.route(MOTIF, (route) => {
    serveur.n++;
    if (serveur.status !== 200) {
      return route.fulfill({ status: serveur.status, contentType: "application/json", body: JSON.stringify({ code: "PGRST205", message: "Could not find the table" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(serveur.lignes) });
  });
  await page.addInitScript((o) => {
    if (o.forcer !== false) window.PASSIO_REGLAGES_DISTANTS = true;
    if (o.cache) localStorage.setItem("passio_reglages_distants_v1", JSON.stringify(o.cache));
    if (o.posees) localStorage.setItem("passio_coupures_distantes_v1", JSON.stringify(o.posees));
    if (o.coupe) localStorage.setItem("passio_reglages_distants", "0");
    for (const [k, v] of Object.entries(o.local || {})) localStorage.setItem(k, v);
    // Ce que voit un lot au moment où il lit son drapeau : AVANT l'app.
    document.addEventListener("DOMContentLoaded", () => {
      window.__auChargement = { invitations: localStorage.getItem("passio_invitations_v1") };
    }, { once: true });
  }, opts);
  await bootOnboarded(page);
  return serveur;
}
const servir = (serveur, lignes) => { serveur.status = 200; serveur.lignes = lignes; };
// Un 404 récent mémorisé : la relecture du démarrage (3 à 8 s après « load »)
// ne part pas, et ce que le cas mesure est le CACHE seul. Sans lui, un 404
// (= aucun réglage) lèverait le réglage en cache selon l'horloge du banc.
const SANS_RELECTURE = () => ({ passio_reglages_distants_absente: String(Date.now()) });

test("① table absente : rien ne change, le 404 est mémorisé et ne repart pas", async ({ page }) => {
  const serveur = await preparer(page);
  expect(await page.evaluate(() => PassioReglages.rafraichir(true))).toBe(false);
  expect(await page.evaluate(() => ({ f: delestageFacteur(), d: delaiDeleste(60000), memo: !!localStorage.getItem("passio_reglages_distants_absente") })))
    .toEqual({ f: 1, d: 60000, memo: true });
  const avant = serveur.n;
  expect(await page.evaluate(() => PassioReglages.rafraichir(false))).toBe(false);
  expect(serveur.n, "le 404 mémorisé ne repart pas avant une heure").toBe(avant);
});

test("② délestage 2 → ×4 sur les filets et le repos du temps réel ; levé quand la base dit 0", async ({ page }) => {
  const serveur = await preparer(page);
  servir(serveur, [{ cle: "delestage", valeur: { niveau: 2 }, maj: "2026-10-11T10:00:00Z" }]);
  await page.evaluate(() => { window.__evts = []; window.addEventListener("passio:delestage", (e) => __evts.push(e.detail)); });
  expect(await page.evaluate(() => PassioReglages.rafraichir(true))).toBe(true);
  const sous = await page.evaluate(() => {
    window._rtRepos = Object.assign(window._rtRepos || {}, { dernierGeste: Date.now() - 60000, masqueeDepuis: 0 });
    return { f: delestageFacteur(), filet: delaiDeleste(60000), inactif: Math.round(_rtReposEtat().inactifDepuisMs / 1000), evts: __evts };
  });
  expect(sous.f).toBe(4);
  expect(sous.filet).toBe(240000);
  expect(sous.inactif, "une minute sans geste compte pour quatre sous délestage 2").toBeGreaterThanOrEqual(239);
  expect(sous.evts).toEqual([{ niveau: 2, facteur: 4 }]);
  servir(serveur, [{ cle: "delestage", valeur: { niveau: 0 }, maj: "2026-10-11T11:00:00Z" }]);
  await page.evaluate(() => PassioReglages.rafraichir(true));
  expect(await page.evaluate(() => [delestageFacteur(), delaiDeleste(60000)])).toEqual([1, 60000]);
  servir(serveur, [{ cle: "delestage", valeur: { niveau: 7 } }]);
  await page.evaluate(() => PassioReglages.rafraichir(true));
  expect(await page.evaluate(() => delestageFacteur()), "un niveau inconnu n'est pas un délestage").toBe(1);
});

test("③ coupures : liste blanche seulement, et on ne lève que ce qu'on a posé", async ({ page }) => {
  const serveur = await preparer(page, { local: { passio_recap_semaine: "0" } });
  const etat = () => page.evaluate(() => ({
    invit: localStorage.getItem("passio_invitations_v1"), recap: localStorage.getItem("passio_recap_semaine"),
    state: localStorage.getItem("passio_mvp_state_v1") === "0", posees: JSON.parse(localStorage.getItem("passio_coupures_distantes_v1") || "[]"),
  }));
  servir(serveur, [{ cle: "coupures", valeur: { cles: ["passio_invitations_v1", "passio_mvp_state_v1"] } }]);
  await page.evaluate(() => PassioReglages.rafraichir(true));
  expect(await etat(), "une clé de données invalide toute la ligne").toEqual({ invit: null, recap: "0", state: false, posees: [] });
  servir(serveur, [{ cle: "coupures", valeur: { cles: ["passio_invitations_v1", "passio_recap_semaine"] } }]);
  await page.evaluate(() => PassioReglages.rafraichir(true));
  expect(await etat(), "le \"0\" déjà posé par l'appareil n'est pas à nous").toEqual({ invit: "0", recap: "0", state: false, posees: ["passio_invitations_v1"] });
  servir(serveur, [{ cle: "coupures", valeur: { cles: [] } }]);
  await page.evaluate(() => PassioReglages.rafraichir(true));
  expect(await etat()).toEqual({ invit: null, recap: "0", state: false, posees: [] });
});

test("④ le cache s'applique AVANT l'app ; un délestage trop vieux n'est pas repris", async ({ page }) => {
  const recuLe = Date.now() - 7 * 3600e3;
  await preparer(page, { cache: { recuLe, reglages: { delestage: 2, coupures: ["passio_invitations_v1"], bandeau: null } }, local: SANS_RELECTURE() });
  expect(await page.evaluate(() => window.__auChargement)).toEqual({ invitations: "0" });
  expect(await page.evaluate(() => delestageFacteur()), "7 h sans confirmation : le délestage est oublié").toBe(1);
  expect(await page.evaluate(() => PassioReglages.coupures())).toEqual(["passio_invitations_v1"]);
});

test("④ bis un délestage récent en cache vaut dès le démarrage", async ({ page }) => {
  await preparer(page, { cache: { recuLe: Date.now() - 60000, reglages: { delestage: 1, coupures: [], bandeau: null } }, local: SANS_RELECTURE() });
  expect(await page.evaluate(() => [delestageFacteur(), delaiDeleste(15000)])).toEqual([2, 30000]);
});

test("⑤ le bandeau est du TEXTE, fermable, avec une cible de 44 px", async ({ page }) => {
  const serveur = await preparer(page);
  servir(serveur, [{ cle: "bandeau", valeur: { texte: "Maintenance <img src=x onerror=\"window.__xss=1\">", niveau: "alerte" }, maj: "2026-10-11T10:00:00Z" }]);
  await page.evaluate(() => PassioReglages.rafraichir(true));
  const b = page.locator("#passioBandeauDistant");
  await expect(b).toBeVisible();
  await expect(b).toHaveAttribute("data-niveau", "alerte");
  await expect(b.locator(".bandeau-distant-texte")).toHaveText("Maintenance <img src=x onerror=\"window.__xss=1\">");
  expect(await b.locator("img").count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  const boite = await b.locator(".bandeau-distant-fermer").boundingBox();
  expect(boite.width).toBeGreaterThanOrEqual(44);
  expect(boite.height).toBeGreaterThanOrEqual(44);
  await b.locator(".bandeau-distant-fermer").click();
  await expect(b).toHaveCount(0);
  await page.evaluate(() => PassioReglages.rafraichir(true));
  await expect(page.locator("#passioBandeauDistant"), "fermé pour la session : il ne revient pas au tour suivant").toHaveCount(0);
});

test("⑥ inerte en local sans demande explicite : aucune lecture, aucun délestage", async ({ page }) => {
  const serveur = await preparer(page, { forcer: false, cache: { recuLe: Date.now(), reglages: { delestage: 2, coupures: ["passio_invitations_v1"], bandeau: null } } });
  expect(await page.evaluate(() => [PassioReglages.actif(), delestageFacteur(), localStorage.getItem("passio_invitations_v1")])).toEqual([false, 1, null]);
  expect(await page.evaluate(() => PassioReglages.rafraichir(true))).toBe(false);
  expect(serveur.n).toBe(0);
});

test("⑦ la coupure du module rend les coupures qu'il avait posées", async ({ page }) => {
  await preparer(page, { coupe: true, posees: ["passio_invitations_v1"], local: { passio_invitations_v1: "0", passio_recap_semaine: "0" } });
  expect(await page.evaluate(() => ({
    invit: localStorage.getItem("passio_invitations_v1"), recap: localStorage.getItem("passio_recap_semaine"),
    posees: localStorage.getItem("passio_coupures_distantes_v1"), actif: PassioReglages.actif(),
  }))).toEqual({ invit: null, recap: "0", posees: null, actif: false });
});

test("⑧ table retirée (404) : les réglages lus la veille sont rendus, rien ne reste coupé", async ({ page }) => {
  await preparer(page, { cache: { recuLe: Date.now() - 60000, reglages: { delestage: 1, coupures: ["passio_invitations_v1"], bandeau: null } }, local: SANS_RELECTURE() });
  expect(await page.evaluate(() => [localStorage.getItem("passio_invitations_v1"), delestageFacteur()]), "le cache s'applique d'abord").toEqual(["0", 2]);
  expect(await page.evaluate(() => PassioReglages.rafraichir(true))).toBe(false);
  expect(await page.evaluate(() => ({ invit: localStorage.getItem("passio_invitations_v1"), coupures: PassioReglages.coupures(), f: delestageFacteur() })))
    .toEqual({ invit: null, coupures: [], f: 1 });
});
