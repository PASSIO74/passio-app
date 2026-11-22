// ═════════════════════════════════════════════════════════════════════
// LE PROFIL VISITÉ N'ÉCRIT JAMAIS LA VALEUR REÇUE DANS UN ATTRIBUT (2026-11-10, CLI-01)
//
// Trouvé par l'audit de stabilisation du 10/11, par lecture, avant toute exploitation
// (mesuré au canal ① le même jour : 0 pseudo portant un guillemet, 0 activité avec
// co-organisateur).
//
// Trois faits, lus dans le code et dans le catalogue de production :
//   ① la base ne borne un pseudo qu'en longueur, et les éléments de `co_organizers` pas du tout ;
//   ② `supaLoadEvents` rendait `co_organizers` tel quel, et la fiche d'une activité ouvre le
//      profil de chaque co-organisateur ;
//   ③ `openUserProfile` retrouve aussi un compte PAR PSEUDO, et gardait la valeur reçue comme
//      identifiant de toute la fiche — écrite sans échappement dans un attribut.
// Le détail du scénario est au dossier de l'audit (hors dépôt).
//
// Ce que la suite garde :
//   ① le profil ouvert par un pseudo hostile ne porte aucun attribut venu du pseudo, et
//      le bouton « Suivre » garde le geste de l'application ;
//   ② une fois le compte résolu, c'est SON identifiant qui sert partout (bouton, suivi) ;
//   ③ une activité relue du serveur ne garde de `co_organizers` que des identifiants de
//      compte.
// Mutations : sans `escapeHtml` sur l'attribut → ① rouge ; sans l'identifiant du compte
// résolu → ② rouge ; sans le filtre de `supaLoadEvents` → ③ rouge.
// ═════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UUID_HOSTILE = "9b2f6c1e-3a47-4d58-8e19-5c7a2b4d6f01";
// 26 caractères : accepté par `profiles_username_forme` (1 à 40, sans caractère de contrôle).
const PSEUDO_HOSTILE = 'x" onclick="window.__xss=1';
const ENTETES = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "content-range",
  "content-range": "0-0/1",
};

// Le serveur tel qu'il répondrait : aucun compte sous cet « identifiant », un compte sous ce pseudo.
async function fauxProfils(page) {
  await page.route("**/rest/v1/profiles*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.fallback();
    const q = new URL(req.url()).searchParams;
    const ligne = {
      id: UUID_HOSTILE, username: PSEUDO_HOSTILE, emoji: "✨", color: "#8b5cf6", passion_id: null,
      passions: [], bio: "", avatar_url: null, cover_url: null, is_private: false, rs_links: [],
    };
    const parPseudo = q.get("username") === "ilike." + PSEUDO_HOSTILE;
    const parId = String(q.get("id") || "").indexOf(UUID_HOSTILE) !== -1;
    const corps = parPseudo || parId ? [ligne] : [];
    // `.maybeSingle()` demande un objet : le SDK l'annonce par cet en-tête.
    const unSeul = /vnd\.pgrst\.object/.test(String(req.headers()["accept"] || ""));
    await route.fulfill({
      status: 200, contentType: "application/json; charset=utf-8", headers: ENTETES,
      body: JSON.stringify(unSeul ? (corps[0] || null) : corps),
    });
  });
}

test.describe("profil visité : la valeur reçue n'atteint jamais un attribut", () => {
  test.beforeEach(async ({ page }) => {
    await bootOnboarded(page);
    await fauxProfils(page);
    await page.evaluate(() => { window.__xss = 0; });
  });

  test("① ouvert par un pseudo hostile : aucun attribut venu du pseudo, le bouton Suivre garde son geste", async ({ page }) => {
    await page.evaluate((v) => openUserProfile(v), PSEUDO_HOSTILE);
    const bouton = page.locator('#visitedProfileActions button[onclick*="toggleFollowUser"]');
    await expect(bouton, "le bouton Suivre est celui de l'application").toHaveCount(1);
    // Aucun attribut `on*` de la fiche n'a pour CODE celui du pseudo. (Le pseudo, lui, figure
    // bien dans trois gestionnaires — menu, message, suivi — mais comme ARGUMENT de chaîne,
    // posé par `escapeJsArg` : `[onclick*="__xss"]` les compterait à tort.)
    expect(await page.evaluate(() => Array.from(document.querySelectorAll("#modalContent *")).reduce((n, el) =>
      n + Array.from(el.attributes).filter((a) => /^on/i.test(a.name) && /^\s*window\.__xss/.test(a.value)).length, 0)),
    "aucun gestionnaire écrit par le pseudo").toBe(0);
    // Le pseudo, lui, s'affiche tel quel : c'est du texte.
    await expect(page.locator("#modalContent .main-profile-username")).toContainText('x" onclick=');
    // Et un vrai toucher ne lance que le geste de l'application.
    await page.evaluate(() => { window.__suivi = []; window.toggleFollowUser = function (id) { window.__suivi.push(id); }; });
    await bouton.click();
    expect(await page.evaluate(() => window.__xss), "le script du pseudo n'a pas tourné").toBe(0);
    expect(await page.evaluate(() => window.__suivi)).toHaveLength(1);
  });

  test("② une fois le compte retrouvé par pseudo, c'est son identifiant qui sert partout", async ({ page }) => {
    await page.evaluate((v) => openUserProfile(v), PSEUDO_HOSTILE);
    const bouton = page.locator('#visitedProfileActions button[onclick*="toggleFollowUser"]');
    await expect(bouton).toHaveCount(1);
    expect(await bouton.getAttribute("id"), "l'identifiant du bouton est celui du COMPTE").toBe("followBtn_" + UUID_HOSTILE);
    expect(await page.evaluate(() => window._visited && window._visited.authorId), "le profil visité est le compte résolu").toBe(UUID_HOSTILE);
    await page.evaluate(() => { window.__suivi = []; window.toggleFollowUser = function (id) { window.__suivi.push(id); }; });
    await bouton.click();
    expect(await page.evaluate(() => window.__suivi), "on suit un compte, jamais un pseudo").toEqual([UUID_HOSTILE]);
  });

  test("③ une activité relue du serveur ne garde de co_organizers que des identifiants de compte", async ({ page }) => {
    const VRAI = "1c9e7a52-6b3d-4f80-9a1e-2d4c6b8f0a13";
    await page.route("**/rest/v1/events*", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200, contentType: "application/json; charset=utf-8", headers: ENTETES,
        body: JSON.stringify([{
          id: "evt_hostile", author_id: UUID_HOSTILE, organizer_id: UUID_HOSTILE, title: "Sortie", passion_id: "musique",
          lat: 45.9, lng: 6.12, city: "Annecy", description: "", emoji: "🎵", max_attendees: 10,
          date_at: new Date(Date.now() + 86400000).toISOString().replace("Z", ""), created_at: new Date().toISOString().replace("Z", ""),
          venue: "", postal_code: "", price: 0, external_link: "", event_type: "Autre", cover_url: null, end_at: null,
          status: "active", updated_at: null, series_id: null, recurrence: "none", conv_id: null,
          co_organizers: [PSEUDO_HOSTILE, VRAI, 42, { id: "x" }, null, "u_personnage"],
        }]),
      });
    });
    const co = await page.evaluate(async () => {
      const liste = await supaLoadEvents();
      const e = (liste || []).find((x) => x.id === "evt_hostile");
      return e ? e.coOrganizers : "activité absente";
    });
    expect(co, "seul l'identifiant de compte reste").toEqual([VRAI]);
  });
});
