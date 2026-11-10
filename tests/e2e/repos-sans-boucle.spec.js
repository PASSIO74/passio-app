// ═══════════════════════════════════════════════════════════════════════════
// AU REPOS, L'APPLICATION NE TOURNE PAS EN ROND (2026-11-09)
//
// Mesuré deux fois, indépendamment : sans le moindre geste, ~470 `setTimeout(0)`
// par seconde. La boucle : `syncResume` (js/ui-v6-composer.js) réaffectait
// `textContent` SANS comparer — affecter `textContent` remplace le nœud texte,
// donc produit une mutation `childList` même quand la valeur est identique ;
// l'observateur du composer (childList + subtree sur `#screen-studio`, présent
// dans le DOM sur TOUS les écrans) rappelait `planifier()` → `setTimeout(0)` →
// `decorer()` → `syncResume()` → … UI-4A4 (observateur sur `document.body`)
// suivait la même cadence, deuxième chaîne. Pour tout le monde, visiteurs
// compris, batterie et CPU payés pour rien.
//
// ⚠️ Le banc `audit-2026-11-perf-derives` ③ ne compte que les `setInterval` :
// une boucle de `setTimeout(0)` relancée par un observateur lui était invisible.
// Ici on compte, pendant un repos franc, les `setTimeout` de délai ≤ 4 ms et les
// rappels de `MutationObserver` — enveloppés AVANT le premier script de la page.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { bootVisiteur } = require("./first-run-helper");

// Durée du repos mesuré, et seuil. Mesuré le 2026-11-09 sur ce banc, 8 s de
// repos : AVANT 3 812 setTimeout(0) et 7 627 rappels d'observateurs (compte),
// 3 394 et 5 091 (visiteur) ; APRÈS 1 et 3 (compte), 0 et 0 (visiteur).
const REPOS_MS = 8000;
const SEUIL = 50;

// Compteurs posés AVANT le boot. Inactifs tant que le test ne les arme pas :
// le démarrage a le droit de planifier ce qu'il veut, le repos non.
const COMPTEURS_REPOS = () => {
  const R = (window.__repos = { actif: false, timeouts0: 0, rappelsMO: 0, sources: {}, observateurs: {} });
  const noter = (table, cle) => { table[cle] = (table[cle] || 0) + 1; };
  const st = window.setTimeout;
  window.setTimeout = function (fn, ms) {
    // `undefined`, 0, 1… 4 : tout ce que le navigateur exécute « tout de suite ».
    if (R.actif && !(Number(ms) > 4)) { R.timeouts0++; noter(R.sources, String(fn).replace(/\s+/g, " ").slice(0, 90)); }
    return st.apply(this, arguments);
  };
  const MO = window.MutationObserver;
  window.MutationObserver = class extends MO {
    constructor(cb) {
      // Qui a créé l'observateur : la ligne d'appel suffit à nommer le module.
      const origine = String((new Error().stack || "").split("\n")[2] || "?").trim().slice(0, 120);
      super(function (recs, obs) {
        if (R.actif) { R.rappelsMO++; noter(R.observateurs, origine); }
        return cb.call(this, recs, obs);
      });
    }
  };
};

async function mesurerRepos(page) {
  // Stabilisation : les rendus différés du démarrage se posent.
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.__repos.actif = true; });
  await page.waitForTimeout(REPOS_MS);
  return page.evaluate(() => {
    const R = window.__repos;
    R.actif = false;
    const top = (t) => Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { timeouts0: R.timeouts0, rappelsMO: R.rappelsMO, sources: top(R.sources), observateurs: top(R.observateurs), ecran: (document.querySelector(".screen.active") || {}).id || null };
  });
}

test.describe("Repos : aucune boucle setTimeout(0) / MutationObserver sans geste", () => {
  test.setTimeout(60000);

  test("① compte embarqué : au repos, ni rafale de setTimeout(0) ni observateur qui se réveille lui-même", async ({ page }) => {
    await page.addInitScript(COMPTEURS_REPOS);
    await bootOnboarded(page);
    // Prémisse : le composer UI-6 est MONTÉ (c'est lui qui bouclait) — sinon le
    // test mesurerait une page où la boucle ne peut pas exister.
    await expect(page.locator("[data-v6-passio]")).toHaveCount(1);
    const r = await mesurerRepos(page);
    expect(r.timeouts0, "setTimeout(≤4 ms) en " + REPOS_MS + " ms de repos : " + JSON.stringify(r.sources)).toBeLessThan(SEUIL);
    expect(r.rappelsMO, "rappels de MutationObserver en " + REPOS_MS + " ms de repos : " + JSON.stringify(r.observateurs)).toBeLessThan(SEUIL);
  });

  test("② visiteur (aucun compte) : même repos, mêmes bornes", async ({ page }) => {
    await page.addInitScript(COMPTEURS_REPOS);
    await bootVisiteur(page);
    await expect(page.locator("[data-v6-passio]")).toHaveCount(1);
    const r = await mesurerRepos(page);
    expect(r.timeouts0, "setTimeout(≤4 ms) en " + REPOS_MS + " ms de repos : " + JSON.stringify(r.sources)).toBeLessThan(SEUIL);
    expect(r.rappelsMO, "rappels de MutationObserver en " + REPOS_MS + " ms de repos : " + JSON.stringify(r.observateurs)).toBeLessThan(SEUIL);
  });

  test("③ le résumé « Publier dans » suit toujours la passion choisie (la comparaison n'a rien figé)", async ({ page }) => {
    // Deux profils : il faut une SECONDE passion dans le sélecteur pour changer.
    await bootOnboarded(page, undefined, 2);
    const r = await page.evaluate(async () => {
      goTo("studio");
      await new Promise((res) => setTimeout(res, 300));
      const s = document.getElementById("postPassion");
      const t = document.querySelector("[data-v6-passio]");
      if (!s || !t) return { manque: !s ? "postPassion" : "data-v6-passio" };
      const options = [...s.options].map((o) => o.value).filter(Boolean);
      const avant = t.textContent;
      const libelle = () => (s.selectedOptions[0] && s.selectedOptions[0].textContent || "").trim();
      const libelleAvant = libelle();
      const autre = options.find((v) => v !== s.value);
      if (!autre) return { manque: "une seconde option", options };
      s.value = autre;
      s.dispatchEvent(new Event("change"));
      await new Promise((res) => setTimeout(res, 50));
      return { avant, libelleAvant, apres: t.textContent, label: libelle() };
    });
    expect(r.manque, JSON.stringify(r)).toBeUndefined();
    // Le résumé disait la passion d'avant, il dit maintenant la nouvelle.
    expect(r.avant.endsWith(r.libelleAvant)).toBe(true);
    expect(r.label).not.toBe(r.libelleAvant);
    expect(r.apres.endsWith(r.label)).toBe(true);
  });
});
