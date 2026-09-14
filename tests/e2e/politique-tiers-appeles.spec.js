// AUTH-10 (contre-revue Astra, 2026-09-14) — la politique nomme TOUT ce que le
// navigateur appelle ailleurs, et rien qu'on ne fasse.
//
// LE DÉFAUT : le §6 de la politique listait cartes, adresses, GIF, images de
// démonstration — mais pas la police des titres (Google Fonts, chargée à
// CHAQUE ouverture par `index.html`, donc l'adresse IP de chaque visite part
// chez Google) ni le relais TURN des appels (Open Relay / Metered, qui voit
// l'adresse IP des deux bouts d'un appel quand la connexion directe échoue).
// Un tiers appelé sans être nommé est une information manquante au sens de
// l'art. 13 RGPD. Ce verrou compare le TEXTE à la RÉALITÉ du dépôt : chaque
// hôte tiers que la page ou le code appelle doit être nommé — et un hôte nommé
// mais plus appelé serait un mensonge dans l'autre sens.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");

// Hôte réellement appelé → ce que la politique doit dire. La clé de gauche est
// mesurée dans les SOURCES (index.html, app-05, app-07…) ; celle de droite
// dans le texte rendu.
const TIERS = [
  { hote: "fonts.googleapis.com", source: "index.html", nom: /Google Fonts/ },
  { hote: "openrelay.metered.ca", source: "js/app-05-config-profil.js", nom: /Open Relay/ },
  { hote: "stun.l.google.com", source: "js/app-05-config-profil.js", nom: /STUN de Google/ },
  { hote: "tiles.openfreemap.org", source: "netlify.toml", nom: /OpenFreeMap/ },
  { hote: "photon.komoot.io", source: "netlify.toml", nom: /Photon/ },
  { hote: "api-adresse.data.gouv.fr", source: "netlify.toml", nom: /Base Adresse Nationale/ },
  { hote: "tenor.googleapis.com", source: "netlify.toml", nom: /Tenor/ },
  { hote: "api.giphy.com", source: "netlify.toml", nom: /Giphy/ },
];

test.describe("politique de confidentialité — les tiers appelés sont nommés", () => {
  test("① chaque hôte tiers appelé par le dépôt est nommé au §6, et il est bien appelé", async ({ page }) => {
    await page.route(/supabase\.co/, (route) => route.abort());
    await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
    const txt = await page.evaluate(() => passioTextePolitique().replace(/<[^>]+>/g, " "));
    for (const t of TIERS) {
      expect(lire(t.source), `${t.hote} n'est plus dans ${t.source} : retirer la mention, ou corriger la liste du test`).toContain(t.hote);
      expect(txt, `${t.hote} est appelé mais la politique ne le nomme pas`).toMatch(t.nom);
    }
  });

  test("② le §6 dit QUAND le relais d'appel est sollicité, et que ni le compte ni le nom ne partent", async ({ page }) => {
    await page.route(/supabase\.co/, (route) => route.abort());
    await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
    const txt = await page.evaluate(() => passioTextePolitique().replace(/<[^>]+>/g, " "));
    const six = txt.slice(txt.indexOf("6. Ce que ton navigateur appelle ailleurs"));
    expect(six).toMatch(/pendant un appel ou un live vidéo seulement/);
    expect(six).toMatch(/ni ton compte, ni ton nom/);
  });
});
