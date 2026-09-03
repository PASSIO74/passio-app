// ══════════════════════════════════════════════════════════════════════════
// LA PAGE « RECHERCHER » (la loupe du bandeau) — 2026-09-03
//
// Constat de Benjamin : « on est censé avoir 5000 passions mais ce n'est plus à
// jour ». Le nombre exact n'a jamais été 5 000 — le référentiel plat en publie
// 1 908 depuis le 2026-09-01 — mais le constat était juste : cette page était
// restée sur `PASSIONS`, les DIX-NEUF entrées du socle embarqué d'app-01, qui
// n'est qu'un repli d'affichage. Elle classait 19 tendances, proposait 19
// tuiles, et sa recherche comparait la frappe à 19 libellés.
//
// ⚠️ CE QUE CHAQUE CAS PROTÈGE, ET POURQUOI IL NE PEUT PAS ÊTRE VERT PAR
// ACCIDENT : chacun pose d'abord sa PRÉMISSE — que l'identifiant visé est bien
// ABSENT du socle. Sans elle, un test qui cherche « Guitare » resterait vert
// avec le code d'avant, puisque « Guitare » est l'une des dix-neuf.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Une passion RÉELLE du référentiel plat, et volontairement HORS socle.
const HORS_SOCLE = { frappe: "enduro", id: "moto-enduro", label: "Enduro" };

async function ouvrirRecherche(page) {
  await page.evaluate(() => goTo("explore"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-explore");
    return el && el.classList.contains("active");
  }, null, { timeout: 10000 });
  // Le référentiel part par `fetch` À L'OUVERTURE de la page, et nulle part
  // avant : c'est très exactement l'usage réel que l'invariant « 160 Ko jamais
  // au démarrage » réserve (passions-plates ⑤ et ⑰ bis).
  await page.waitForFunction(
    () => window.PassioPassions && window.PassioPassions.pret(),
    null, { timeout: 20000 },
  );
}

async function taper(page, texte) {
  await page.locator("#explorerSearch").fill(texte);
  await page.waitForTimeout(900);   // anti-rebond 160 ms + aller-retour
  return page.locator("#exploreSearchResults").innerText();
}

test.describe("la page Rechercher connaît tout le référentiel", () => {

  test("① prémisse : l'identifiant visé est ABSENT du socle embarqué", async ({ page }) => {
    // ⚠️ SANS CE CAS, LES SUIVANTS PEUVENT ÊTRE VERTS AVEC LE CODE D'AVANT.
    // C'est lui qui établit que « Moto enduro » ne pouvait pas être trouvé par
    // `PASSIONS.filter(...)`, et donc que ⓶ mesure bien le référentiel.
    await bootOnboarded(page, null, 1);
    const vu = await page.evaluate((id) => ({
      dansSocle: PASSIONS.some((p) => p.id === id),
      tailleSocle: PASSIONS.length,
    }), HORS_SOCLE.id);
    expect(vu.dansSocle, "le socle embarqué ne connaît pas cette passion").toBe(false);
    expect(vu.tailleSocle, "le socle reste à 19 entrées").toBe(19);
  });

  test("② la recherche trouve une passion hors socle", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    await ouvrirRecherche(page);
    const texte = await taper(page, HORS_SOCLE.frappe);
    expect(texte, "« enduro » doit remonter « Enduro » (id moto-enduro)").toContain(HORS_SOCLE.label);
  });

  test("③ le nombre annoncé vient du référentiel, jamais d'une constante", async ({ page }) => {
    // ⚠️ LE DÉFAUT EXACT QU'ON RÉPARE : la page a laissé croire à un ordre de
    // grandeur qu'elle n'avait jamais mesuré. Le nombre affiché doit ÉGALER
    // `PassioPassions.taille()` — pas « être grand », pas « être plausible ».
    await bootOnboarded(page, null, 1);
    await ouvrirRecherche(page);
    const vu = await page.evaluate(() => ({
      taille: window.PassioPassions.taille(),
      texte: (document.getElementById("explorePassionsCount") || {}).textContent || "",
    }));
    expect(vu.taille, "le référentiel chargé compte bien plus que le socle").toBeGreaterThan(1500);
    // Écrit en français, séparateur d'espace insécable compris : on compare sur
    // les chiffres seuls pour ne pas mesurer la locale du navigateur de CI.
    const chiffres = vu.texte.replace(/[^0-9]/g, "");
    expect(chiffres, "le nombre affiché est celui du référentiel")
      .toBe(String(vu.taille));
  });

  test("④ la grille dépasse le socle et NOMME chaque tuile", async ({ page }) => {
    // ⚠️ « ✨ Passion » est le générique de `passionById` quand le référentiel
    // n'a pas répondu. Une grille pleine de génériques serait plus grande
    // qu'avant ET illisible : la taille seule ne prouverait rien.
    await bootOnboarded(page, null, 1);
    await ouvrirRecherche(page);
    await page.waitForFunction(
      () => document.querySelectorAll("#allPassions .passion-tile").length > 19,
      null, { timeout: 15000 },
    );
    const libelles = await page.locator("#allPassions .passion-tile-label").allTextContents();
    expect(libelles.length).toBeGreaterThan(19);
    expect(libelles.filter((l) => l.trim() === "Passion"),
      "aucune tuile ne doit rester au libellé générique").toEqual([]);
  });

  test("⑤ une passion tendance peut venir de HORS socle", async ({ page }) => {
    // Avant, `ranked` était construit par `PASSIONS.map(...)` : une passion du
    // réseau pouvait porter dix publications sans avoir le moindre chemin vers
    // cette section. On sème donc des publications sur une passion hors socle
    // et on exige qu'elle monte.
    await bootOnboarded(page, null, 1);
    await ouvrirRecherche(page);
    const vu = await page.evaluate((cible) => {
      // ⚠️ On VIDE d'abord : sans ça, le socle de démonstration porte des
      // centaines de publications et noierait les nôtres — le test tiendrait
      // (ou pas) selon le contenu du seed, pas selon le code.
      state.seed.posts = [];
      state.userPosts = [];
      state.supabasePosts = [];
      for (let i = 0; i < 5; i++) {
        state.seed.posts.push({ id: "t_" + i, passion: cible.id, author: "u1", text: "x", createdAt: Date.now() });
      }
      renderExplorer();
      return {
        noms: Array.from(document.querySelectorAll("#trendingGrid .trending-name")).map((e) => e.textContent),
        stats: Array.from(document.querySelectorAll("#trendingGrid .trending-stat")).map((e) => e.textContent),
      };
    }, HORS_SOCLE);
    expect(vu.noms[0], "la passion la plus publiée mène les tendances").toBe(HORS_SOCLE.label);
    expect(vu.stats[0]).toContain("5 posts");
  });

  test("⑥ les passions PERSO restent trouvables et affichées", async ({ page }) => {
    // Elles ne se créent plus (`passionsPersoSuspendues`), mais celles qui
    // existent vivent sur des profils : les faire disparaître de la grille ou
    // des résultats les rendrait introuvables depuis l'écran qui sert à ça.
    await bootOnboarded(page, null, 1);
    await page.evaluate(() => {
      state.user.customPassions = [{ id: "custom_tricot_ab12", label: "Tricot nordique", emoji: "🧶", custom: true }];
      saveState();
    });
    await ouvrirRecherche(page);
    await page.evaluate(() => renderExplorer());
    await page.waitForTimeout(500);
    const grille = await page.locator("#allPassions").innerText();
    expect(grille, "la passion perso reste dans la grille").toContain("Tricot nordique");
    expect(await page.locator("#allPassions .passion-tile-create").count(),
      "et la tuile de création reste fermée").toBe(0);
    const res = await taper(page, "tricot nord");
    expect(res, "elle se retrouve aussi par la recherche").toContain("Tricot nordique");
  });

  test("⑦ une réponse de frappe DÉPASSÉE ne peint plus rien", async ({ page }) => {
    // ⚠️ DÉFAUT DE FLUX RÉEL : les réponses s'écrivaient dans l'ordre d'ARRIVÉE.
    // Une requête lente partie sur une frappe abandonnée écrasait le résultat de
    // la frappe courante. On tient les deux réponses et on résout la CADUQUE en
    // dernier : c'est la seule séquence où le défaut est visible.
    //
    // ⚠️ ON RETIENT LA RECHERCHE DE PASSIONS, PAS CELLE DES UTILISATEURS. `supa`
    // est un `let` d'app-08 : une suite ne peut pas le rendre vrai depuis
    // `window`, donc un test bâti sur `supaSearchUsers` serait VERT PAR ACCIDENT
    // sur tout appareil sans client Supabase — le pire genre de vert.
    await bootOnboarded(page, null, 1);
    await ouvrirRecherche(page);
    await page.evaluate(() => {
      window.__enVol = {};
      window.supaSearchUsers = async () => [];
      const vrai = window.PassioPassions.chercherAsync;
      window.PassioPassions.chercherAsync = function (q, o) {
        return new Promise(function (res) {
          window.__enVol[q] = function () {
            vrai.call(window.PassioPassions, q, o).then(res);
          };
        });
      };
    });
    const inp = page.locator("#explorerSearch");
    await inp.fill("zzqqxx");           // une frappe qui ne rend RIEN
    await page.waitForTimeout(600);
    await inp.fill(HORS_SOCLE.frappe);  // puis la bonne
    await page.waitForTimeout(600);
    await page.evaluate((f) => window.__enVol[f] && window.__enVol[f](), HORS_SOCLE.frappe);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__enVol["zzqqxx"] && window.__enVol["zzqqxx"]());
    await page.waitForTimeout(800);
    const texte = await page.locator("#exploreSearchResults").innerText();
    expect(texte, "la réponse caduque ne doit rien écrire").not.toContain("zzqqxx");
    expect(texte, "l'écran reste celui de la frappe courante").toContain(HORS_SOCLE.label);
  });

  test("⑧ « Suivre » suit vraiment, et sait désuivre", async ({ page }) => {
    // ⚠️ Le bouton des créateurs de démonstration appelait `toast('+ X suivi·e')` :
    // il ne suivait PERSONNE. Celui des comptes réels passait par un second
    // moteur SANS garde d'authentification. Les deux passent désormais par
    // `toggleFollowUser` (app-04), le moteur unique.
    await bootOnboarded(page, null, 1);
    await ouvrirRecherche(page);
    const vu = await page.evaluate(() => {
      // ⚠️ AUCUNE ÉCRITURE VERS LA PRODUCTION : `toggleFollowUser` appelle
      // `supaFollowUser`, qui passe par `supaEnsureProfileExists` — donc un
      // UPSERT réel. Ce cas mesure l'ÉTAT LOCAL et le bouton, rien d'autre.
      window.supaFollowUser = async () => true;
      window.supaUnfollowUser = async () => true;
      const btn = document.querySelector("#suggestedCreators button[id^='followBtn_']");
      if (!btn) return { absent: true };
      const uid = btn.id.replace("followBtn_", "");
      state.user.following = [];
      btn.click();
      const apres = (state.user.following || []).slice();
      const libelleApres = btn.textContent.trim();
      document.getElementById("followBtn_" + uid).click();
      return {
        absent: false, uid, apres, libelleApres,
        final: (state.user.following || []).slice(),
      };
    });
    expect(vu.absent, "la section propose au moins un créateur").toBe(false);
    expect(vu.apres, "le suivi est bien écrit dans l'état").toContain(vu.uid);
    expect(vu.libelleApres, "et le bouton le dit").toContain("Suivi");
    expect(vu.final, "un second appui désuit").not.toContain(vu.uid);
  });

  test("⑨ la fiche d'une passion échappe son libellé et propose les proches", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    await ouvrirRecherche(page);
    // (a) le libellé d'une passion PERSO est tapé par la personne : il ne doit
    //     jamais atteindre le balisage tel quel.
    const LIBELLE = "<img src=x onerror=alert(1)>";
    const vu = await page.evaluate((libelle) => {
      state.user.customPassions = [{ id: "custom_xss_1", label: libelle, emoji: "🧪", custom: true }];
      openPassionExplorer("custom_xss_1");
      const corps = document.getElementById("modalBody") || document.body;
      const titre = corps.querySelector(".modal-title");
      return {
        // ⚠️ ON MESURE LE TITRE, PAS LA MODALE. La fiche rend aussi les
        // publications de la passion, et `renderPostHTML` pose légitimement des
        // `onerror` sur ses images : un `querySelectorAll("img[onerror]")` à
        // l'échelle de la modale compte 29 faux positifs et serait ROUGE sur du
        // code sain.
        enfants: titre ? titre.children.length : -1,
        texte: titre ? titre.textContent : "",
      };
    }, LIBELLE);
    expect(vu.enfants, "le libellé n'a créé AUCUN élément").toBe(0);
    expect(vu.texte, "il s'affiche tel quel, en TEXTE").toBe(LIBELLE);

    // (b) « Passions proches » — ce qui remplace utilement la hiérarchie retirée.
    await page.evaluate((id) => { closeModal(); openPassionExplorer(id); }, HORS_SOCLE.id);
    await page.waitForTimeout(600);
    const proches = await page.locator("#pexLiees").innerText();
    expect(proches.trim().length, "la fiche propose des passions proches").toBeGreaterThan(0);
  });
});
