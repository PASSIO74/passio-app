// ═════════════════════════════════════════════════════════════════════
// UN PSEUDO NE PORTE PAS DE CARACTÈRE D'INJECTION (CLI-01, côté serveur, 2026-11-12)
//
// La base refuse désormais `" < > \` \` et la barre oblique inverse dans
// `profiles.username` (`profiles_username_forme`). Le client doit les refuser AVANT,
// en français — sinon l'inscription ou l'enregistrement du profil échoue sur une
// erreur de contrainte.
//
//   ① `nomCompteValide` refuse chacun de ces caractères, garde l'apostrophe ;
//   ② l'inscription le dit en clair, sans rien envoyer ;
//   ③ les co-organisateurs écrits en base ne sont que des uuid en minuscules.
// ═════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① les caractères interdits par la base sont refusés, l'apostrophe reste permise", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => ({
    guillemet: nomCompteValide('x" onclick="a'),
    chevron: nomCompteValide("a<b"),
    grave: nomCompteValide("a`b"),
    barre: nomCompteValide("a\\b"),
    apostrophe: nomCompteValide("Zoé d'Annecy"),
  }));
  expect(r.guillemet).toBe("");
  expect(r.chevron).toBe("");
  expect(r.grave).toBe("");
  expect(r.barre).toBe("");
  expect(r.apostrophe).toBe("Zoé d'Annecy");
});

test("② l'inscription refuse le nom en français, sans rien envoyer", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const champ = (id, v) => { let e = document.getElementById(id); if (!e) { e = document.createElement("input"); e.id = id; document.body.appendChild(e); } e.value = v; };
    champ("authName", 'Léa "Lili"'); champ("authEmail", "lea@example.test"); champ("authPassword", "motdepasse1"); champ("authPasswordConfirm", "motdepasse1");
    window.__msgs = [];
    const vrai = window._showAuthMsg;
    window._showAuthMsg = function (m, k) { window.__msgs.push(String(m)); try { return vrai.apply(this, arguments); } catch (e) {} };
    let appels = 0;
    window.supabase = { createClient: () => ({ auth: { signUp: async () => { appels++; return { data: {}, error: null }; } } }) };
    try { _authMode = "signup"; } catch (e) {}
    try { await onbDoAuth(); } catch (e) {}
    return { msgs: window.__msgs.slice(), appels };
  });
  expect(r.appels, "aucune inscription n'est partie").toBe(0);
  expect(r.msgs.some((m) => /guillemet droit/.test(m)), JSON.stringify(r.msgs)).toBe(true);
});

test("③ les co-organisateurs envoyés à la base ne sont que des uuid en minuscules", async ({ page }) => {
  await bootOnboarded(page);
  // `_eventRow` est la ligne que publication ET modification envoient à la base.
  const envoye = await page.evaluate(() => _eventRow({ title: "Banc", passion: "musique", date: Date.now() + 86400000,
    organizerId: MY_UID, coOrganizers: ["3E7D1C9A-5B2F-4A8E-9C6D-0F1E2D3C4B5A", "u_demo", 'x" onclick="a'] }).co_organizers);
  expect(envoye).toEqual(["3e7d1c9a-5b2f-4a8e-9c6d-0f1e2d3c4b5a"]);
});
