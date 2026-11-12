// ═════════════════════════════════════════════════════════════════════
// LES RETRAITS CONVERGENT (ETAT-08, audit de stabilisation du 2026-11-10)
//
// Le démarrage ne faisait qu'AJOUTER ce que la base rendait (union), et les
// lecteurs rendaient `[]`/`{}` sur une panne comme sur une liste vide : un
// désabonnement, un déblocage, une désinscription faits ailleurs revenaient.
//
//   ① suivis : une lecture réussie REMPLACE ; un profil d'exemple reste ; une
//      écriture en vol décide (dans les deux sens) ;
//   ② une lecture en ÉCHEC (`null`) ne touche à rien ;
//   ③ blocages : même règle ;
//   ④ inscriptions : une activité du serveur sans ligne perd sa réponse locale ;
//      une activité d'exemple la garde ;
//   ⑤ « Ne plus suivre » refusé par la base : le suivi revient, et c'est dit.
// ═════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const X = "11111111-2222-4333-8444-555555555555";
const Y = "22222222-3333-4444-8555-666666666666";
const Z = "33333333-4444-4555-8666-777777777777";

test("① suivis : la base remplace, l'exemple reste, l'écriture en vol décide", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(([x, y, z]) => {
    // Local : X (désabonné ailleurs), u_lea (exemple), Y (« ne plus suivre » en vol, donc absent localement).
    state.user.following = [x, "u_lea"];
    _ecritureSuiviEnCours[y] = true;   // ne plus suivre Y, en vol
    _ecritureSuiviEnCours[z] = true;   // suivre Z, en vol
    state.user.following.push(z);
    const ok = _fusionnerSuivisServeur([y], true);   // `true` : session de CE compte vérifiée   // la base : Y encore suivi (le DELETE n'est pas arrivé)
    delete _ecritureSuiviEnCours[y]; delete _ecritureSuiviEnCours[z];
    return { ok, following: state.user.following.slice().sort() };
  }, [X, Y, Z]);
  expect(r.ok).toBe(true);
  expect(r.following).toEqual([Z, "u_lea"].sort());
});

test("② une lecture en échec (null) ne touche à rien", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate((x) => {
    state.user.following = [x];
    state.user.blocked = [x];
    return { s: _fusionnerSuivisServeur(null), b: _fusionnerBlocagesServeur(null), r: _fusionnerRsvpServeur(null),
             following: state.user.following.slice(), blocked: state.user.blocked.slice() };
  }, X);
  expect(r).toEqual({ s: false, b: false, r: false, following: [X], blocked: [X] });
});

test("③ blocages : un déblocage fait ailleurs ne revient pas", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(([x, y]) => {
    state.user.blocked = [x, y];
    _fusionnerBlocagesServeur([y], true);
    return state.user.blocked.slice();
  }, [X, Y]);
  expect(r).toEqual([Y]);
});

test("④ inscriptions : une activité du serveur sans ligne perd sa réponse, l'exemple la garde", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    state.seed.events = state.seed.events || [];
    state.seed.events.push({ id: "evt_serveur_quitte", title: "Serveur", fromSupabase: true, date: Date.now() + 86400000 });
    state.seed.events.push({ id: "evt_serveur_garde", title: "Serveur 2", fromSupabase: true, date: Date.now() + 86400000 });
    state.user.eventRsvp = { evt_serveur_quitte: "going", evt_serveur_garde: "maybe", evt_exemple_local: "going" };
    _fusionnerRsvpServeur({ evt_serveur_garde: { rsvp: "going", checkedIn: false } }, true);
    return { rsvp: state.user.eventRsvp, joined: state.user.joinedEvents.slice().sort() };
  });
  expect(r.rsvp).toEqual({ evt_serveur_garde: "going", evt_exemple_local: "going" });
  expect(r.joined).toEqual(["evt_exemple_local", "evt_serveur_garde"]);
});

test("⑤ « Ne plus suivre » refusé : le suivi revient, et c'est dit", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("passio_uid", "4d5e6f70-8192-4a3b-9c4d-5e6f70819203"); } catch (e) {} });
  await bootOnboarded(page);
  const r = await page.evaluate(async (x) => {
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); try { return vrai.apply(this, arguments); } catch (e) {} };
    window.supaUnfollowUser = async () => ({ ok: false });
    state.user.following = [x];
    // Un bouton à peindre, comme sur un profil visité.
    const b = document.createElement("button"); b.id = "followBtn_" + x; document.body.appendChild(b);
    toggleFollowUser(x, "Camille");
    await new Promise((ok) => setTimeout(ok, 200));
    return { following: state.user.following.slice(), toasts: window.__toasts.slice() };
  }, X);
  expect(r.following).toEqual([X]);
  expect(r.toasts.some((t) => /non enregistré/.test(t)), JSON.stringify(r.toasts)).toBe(true);
});

// ⑥ Sans session vérifiée de CE compte (lecture passée en anonyme, 0 ligne sans
//    erreur), on NE remplace PAS : l'union d'avant (revue du 12/11).
test("⑥ sans session vérifiée : pas de remplacement — une lecture anonyme vide n'efface rien", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(([x, y]) => {
    state.user.blocked = [x, y];
    state.user.following = [x];
    _fusionnerBlocagesServeur([], false);
    _fusionnerSuivisServeur([], false);
    return { blocked: state.user.blocked.slice().sort(), following: state.user.following.slice() };
  }, [X, Y]);
  expect(r.blocked).toEqual([X, Y].sort());
  expect(r.following).toEqual([X]);
});
