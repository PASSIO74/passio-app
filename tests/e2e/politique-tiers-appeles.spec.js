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
  // Depuis le 2026-11-08, la police des titres est servie par PASSIO : Google Fonts ne reste
  // appelé que pour une police choisie dans l'éditeur de texte (app-04).
  { hote: "fonts.googleapis.com", source: "js/app-04-comments-shop.js", nom: /Google Fonts/ },
  // Le relais des appels et des lives : Cloudflare depuis le 2026-11-09 (identifiants
  // fabriqués par `notify-call`). Open Relay, neutralisé par son opérateur, n'est plus
  // appelé — et ne doit plus être annoncé (③).
  { hote: "rtc.live.cloudflare.com", source: "supabase/functions/notify-call/index.ts", nom: /relais[^.]*\(Cloudflare/ },
  { hote: "stun.l.google.com", source: "js/app-05-config-profil.js", nom: /STUN de Google/ },
  { hote: "tiles.openfreemap.org", source: "netlify.toml", nom: /OpenFreeMap/ },
  { hote: "photon.komoot.io", source: "netlify.toml", nom: /Photon/ },
  { hote: "api-adresse.data.gouv.fr", source: "netlify.toml", nom: /Base Adresse Nationale/ },
  // Les GIF : KLIPY depuis le 2026-11-09 ; Giphy reste (GIF déjà envoyés, liste de
  // secours, fournisseur de réserve). Tenor, API fermée le 2026-06-30, n'est plus
  // appelé ni nommé (③ bis).
  { hote: "api.klipy.com", source: "netlify.toml", nom: /GIF \(KLIPY/ },
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

  test("①bis ce que la première visite n'appelle plus n'est plus annoncé comme tel", async ({ page }) => {
    await page.route(/supabase\.co/, (route) => route.abort());
    await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
    const txt = await page.evaluate(() => passioTextePolitique().replace(/<[^>]+>/g, " "));
    // Police des titres et images d'illustration : servies par PASSIO (fonts/, Edge Function demo).
    expect(lire("index.html")).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(txt).not.toMatch(/à chaque ouverture/);
    expect(txt).not.toMatch(/Unsplash/);
    expect(txt).toMatch(/une police choisie dans l'éditeur de texte \(Google Fonts/);
  });

  test("③ un tiers qui n'est plus appelé n'est plus annoncé : Open Relay (Metered), retiré le 2026-11-09", async ({ page }) => {
    // `openrelay.metered.ca` résout vers 192.0.2.1 / 100::1 (neutralisé par son
    // opérateur) : ses entrées sont sorties de `CALL_ICE_SERVERS`. Le nom de l'hôte
    // peut rester dans un COMMENTAIRE d'app-05 (il dit pourquoi) : c'est la
    // configuration réellement passée à `RTCPeerConnection` qui est mesurée ici.
    await page.route(/supabase\.co/, (route) => route.abort());
    await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
    const r = await page.evaluate(() => ({
      politique: passioTextePolitique().replace(/<[^>]+>/g, " "),
      ice: JSON.stringify(CALL_ICE_SERVERS),
    }));
    expect(r.ice).not.toMatch(/openrelay|metered/i);
    expect(r.politique).not.toMatch(/Open Relay|Metered/);
    // Cible supprimée = tout ce qui la vise part avec : la CSP ne l'autorise plus,
    // elle autorise le relais Cloudflare à sa place (les deux fichiers servis).
    for (const f of ["netlify.toml", "_headers"]) {
      expect(lire(f), f).not.toMatch(/openrelay|metered/i);
      expect(lire(f), f).toMatch(/turns:turn\.cloudflare\.com:443/);
    }
  });

  test("③ bis Tenor (API fermée le 2026-06-30) n'est plus ni appelé ni nommé ; KLIPY l'est", async ({ page }) => {
    await page.route(/supabase\.co/, (route) => route.abort());
    await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
    const txt = await page.evaluate(() => passioTextePolitique().replace(/<[^>]+>/g, " "));
    expect(txt).not.toMatch(/Tenor/);
    expect(txt).toMatch(/GIF \(KLIPY, Giphy\)/);
    for (const f of ["netlify.toml", "_headers", "js/emoji-misc.js"]) expect(lire(f), f).not.toMatch(/tenor\.googleapis\.com/);
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
