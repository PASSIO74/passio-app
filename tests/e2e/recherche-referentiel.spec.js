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

// ⚠️ ON ATTEND LA RÉPONSE, PAS UNE DURÉE. Un `waitForTimeout` supposerait que
// l'anti-rebond (160 ms) plus l'aller-retour `rechercher_passions` tiennent dans
// un budget fixe — faux sur un runner chargé, et le test lirait le panneau
// pendant qu'une réponse est encore en vol. C'est la leçon de `passions-plates`
// ⑥ bis : le pire rouge est celui qui envoie chercher au mauvais endroit.
async function taper(page, texte) {
  await page.locator("#explorerSearch").fill(texte);
  await page.waitForFunction(() => {
    const el = document.getElementById("exploreSearchResults");
    return el && el.style.display !== "none" && el.innerText.indexOf("Recherche…") < 0;
  }, null, { timeout: 20000 });
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

    // ⚠️ ET LES TENDANCES AUSSI. Elles nomment des passions par les MÊMES ids,
    // qui sont DISTINCTS : la déduplication ne les fusionne pas, donc un
    // référentiel absent y produirait jusqu'à six tuiles « Passion » côte à côte.
    const tendances = await page.locator("#trendingGrid .trending-name").allTextContents();
    expect(tendances.filter((l) => l.trim() === "Passion"),
      "aucune tuile de tendance au libellé générique").toEqual([]);
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

  test("⑩ dans la fiche d'une passion, c'est le bouton SOUS LE DOIGT qui bouge", async ({ page }) => {
    // ⚠️ DÉFAUT INTRODUIT PAR CE LOT, TROUVÉ EN RELECTURE. Trois surfaces
    // émettaient `followBtn_<uid>` pour la même personne — profil visité,
    // « Créateurs à suivre » et la fiche d'une passion — et
    // `document.getElementById` rend le PREMIER dans l'ordre du document.
    // L'écran précède la modale dans `index.html` : suivre quelqu'un DEPUIS LA
    // MODALE écrivait l'état mais retournait le bouton CACHÉ derrière. Celui
    // sous le doigt restait « Suivre », on retapait — et on se désabonnait en
    // silence.
    await bootOnboarded(page, null, 1);
    await ouvrirRecherche(page);
    const vu = await page.evaluate(() => {
      window.supaFollowUser = async () => true;
      window.supaUnfollowUser = async () => true;
      state.user.following = [];
      // Une personne présente DANS LES DEUX surfaces à la fois.
      const u = (state.seed.users || [])[0];
      renderExplorer();
      openPassionExplorer(u.passion);
      const dansEcran = document.querySelector('#suggestedCreators [data-follow-uid="' + u.id + '"]');
      const dansFiche = document.querySelector('#pexCreators [data-follow-uid="' + u.id + '"]');
      if (!dansEcran || !dansFiche) return { premisse: false };
      dansFiche.click();
      return {
        premisse: true,
        uid: u.id,
        fiche: dansFiche.textContent.trim(),
        ecran: dansEcran.textContent.trim(),
        suivis: (state.user.following || []).slice(),
        // Aucune des deux surfaces ne doit émettre deux fois le même id.
        idsEnDouble: Array.from(document.querySelectorAll('[id="followBtn_' + u.id + '"]')).length,
      };
    });
    expect(vu.premisse, "la même personne figure bien dans l'écran ET dans la fiche").toBe(true);
    expect(vu.suivis, "l'état est écrit").toContain(vu.uid);
    expect(vu.fiche, "le bouton SOUS LE DOIGT change").toContain("Suivi");
    expect(vu.ecran, "et celui de l'écran derrière suit").toContain("Suivi");
    expect(vu.idsEnDouble, "un identifiant, un seul nœud").toBeLessThanOrEqual(1);
  });

  test("⑪ hors ligne, la grille ne rétrécit pas et le compteur SE TAIT", async ({ page }) => {
    // ⚠️ LE REPLI N'EST PAS UN RÉFÉRENTIEL. `repliHorsLigne()` fabrique une
    // vingtaine de lignes à `popularity: 0` ; `suggestions()` filtre sur
    // `popularity >= 1000` et n'en rend alors qu'une poignée — NON VIDE, donc le
    // repli sur le socle ne se déclenchait pas : la grille tombait de 19 tuiles
    // à deux, et le compteur annonçait « un aperçu parmi 21 passions », un
    // nombre inventé présenté comme mesuré.
    // ⚠️ ON COUPE PAR `fetch`, PAS PAR `page.route`. Mesuré à la sonde : la
    // requête part bien vers `/data/passions-v1.json`, mais le gestionnaire de
    // route ne se déclenche JAMAIS — elle transite par le service worker, que
    // `page.route` ne voit pas. Un test bâti dessus serait vert en ne coupant
    // rien, et c'est exactement ce qu'il a fait au premier passage : la prémisse
    // a rougi (`horsLigne` faux), ce qui l'a révélé.
    await page.addInitScript(() => {
      const vrai = window.fetch;
      window.fetch = function (u) {
        try {
          if (String((u && u.url) || u).indexOf("passions-v1.json") >= 0) {
            return Promise.reject(new Error("hors ligne (test)"));
          }
        } catch (e) {}
        return vrai.apply(this, arguments);
      };
      // ⚠️ LA PRÉMISSE, SANS LAQUELLE CE TEST EST VERT PAR ACCIDENT — mesuré par
      // RÉINJECTION du défaut, qui passait. Sur un appareil neuf `recentes()`
      // est vide, `suggestions()` rend alors [] et le repli sur le socle se
      // déclenche quand même : le défaut est INVISIBLE. Il n'apparaît que si
      // `suggestions()` peut rendre une poignée d'entrées — donc si quelqu'un
      // a déjà utilisé la recherche, ce qui est le cas courant.
      localStorage.setItem("passio_passions_recentes", JSON.stringify([
        { id: "musique", label: "Musique", emoji: "🎵" },
        { id: "cuisine", label: "Cuisine", emoji: "🍳" },
      ]));
    });
    await bootOnboarded(page, null, 1);
    await page.evaluate(() => goTo("explore"));
    await page.waitForFunction(() => {
      const el = document.getElementById("screen-explore");
      return el && el.classList.contains("active");
    }, null, { timeout: 10000 });
    await page.waitForFunction(
      () => window.PassioPassions && window.PassioPassions.pret(),
      null, { timeout: 20000 },
    );
    const vu = await page.evaluate(() => ({
      horsLigne: window.PassioPassions.horsLigne(),
      tuiles: document.querySelectorAll("#allPassions .passion-tile").length,
      socle: PASSIONS.length,
      compteur: (document.getElementById("explorePassionsCount") || {}).textContent || "",
    }));
    expect(vu.horsLigne, "prémisse : on mesure bien le repli hors ligne").toBe(true);
    expect(vu.tuiles, "la grille garde au moins tout le socle").toBeGreaterThanOrEqual(vu.socle);
    expect(vu.compteur.trim(), "et le compteur se tait plutôt que d'inventer").toBe("");
  });

  test("⑫ `charger()` invalide les TROIS caches de rendu, quel que soit son appelant", async ({ page }) => {
    // ⚠️ LE DÉFAUT LE PLUS GRAVE DE CE LOT, TROUVÉ EN RELECTURE, ET IL SE JOUE
    // AILLEURS QUE SUR LA PAGE RECHERCHER. `repeindreLesRails()` — seul point qui
    // remet `#profileStrip._lastHtml`, `#v9ProfilePassions[data-v9-sig]` et
    // `window._feedDomSig` à zéro — n'était appelé que par la chaîne
    // d'auto-détection, qui sort en tête sur `pret()`. Dès qu'un AUTRE chargeur
    // gagnait la course (ouvrir la loupe pendant que l'hydratation traîne, ce
    // qui peut durer 10 s), elle ne repeignait plus JAMAIS : les rails du Fil et
    // du Profil gardaient leurs « ✨ Passion » pour toute la session, référentiel
    // pourtant chargé.
    //
    // On mesure donc le CONTRAT de `charger()`, pas le chemin d'un appelant :
    // c'est ce qui protège aussi les chargeurs qui n'existent pas encore.
    await bootOnboarded(page, null, 1);
    const vu = await page.evaluate(async () => {
      if (window.PassioPassions.pret()) return { premisse: false };
      // Trois sentinelles, une par cache. `repeindreLesRails` doit toutes les
      // effacer — en oublier une laisse sa surface générique (constat majeur de
      // la revue du 2026-09-02).
      const rail = document.getElementById("profileStrip");
      const rail9 = document.getElementById("v9ProfilePassions");
      if (rail) rail._lastHtml = "sentinelle";
      if (rail9) rail9.setAttribute("data-v9-sig", "sentinelle");
      window._feedDomSig = "sentinelle";
      await window.PassioPassions.charger();
      await new Promise((r) => setTimeout(r, 400));
      return {
        premisse: true,
        fil: rail ? rail._lastHtml : null,
        profil: rail9 ? rail9.getAttribute("data-v9-sig") : null,
        signature: window._feedDomSig,
      };
    });
    expect(vu.premisse, "prémisse : le référentiel n'était pas déjà chargé").toBe(true);
    expect(vu.fil, "le cache du rail du Fil est invalidé").not.toBe("sentinelle");
    expect(vu.profil, "la signature du rail du Profil est retirée").not.toBe("sentinelle");
    expect(vu.signature, "le guard no-op de renderFeed est invalidé").not.toBe("sentinelle");
  });

  for (const largeur of [320, 390, 430]) {
    test(`⑬ ${largeur} px : la grille ne déborde pas de l'écran`, async ({ page }) => {
      // ⚠️ RÉGRESSION INTRODUITE PAR CE LOT, VUE À L'ÉCRAN ET PAS PAR UN TEST.
      // `.passion-grid` est en `repeat(3, 1fr)`, et une piste `1fr` a un
      // `min-width: auto` : elle refuse de descendre sous la largeur de son
      // contenu le plus large. Tant que la grille ne servait que les DIX-NEUF
      // libellés du socle (« Photo », « Sport »…) rien ne débordait ; dès
      // qu'elle a rendu le référentiel plat, « Astrophotographie » et « Guitare
      // électrique » ont poussé la troisième colonne HORS de l'écran.
      //
      // La leçon est plus large que la règle CSS : CHANGER LES DONNÉES D'UNE
      // MISE EN PAGE, C'EST CHANGER LA MISE EN PAGE. Aucun des douze cas
      // précédents ne pouvait le voir — ils comptaient des tuiles et lisaient
      // des libellés, jamais une largeur.
      await page.setViewportSize({ width: largeur, height: 844 });
      await bootOnboarded(page, null, 1);
      await ouvrirRecherche(page);
      await page.waitForFunction(
        () => document.querySelectorAll("#allPassions .passion-tile").length > 19,
        null, { timeout: 15000 },
      );
      const vu = await page.evaluate(() => {
        const g = document.getElementById("allPassions");
        const ec = document.getElementById("screen-explore");
        return {
          grille: g.scrollWidth - g.clientWidth,
          ecran: ec.scrollWidth - ec.clientWidth,
          // Le libellé le plus long doit RESTER dans sa tuile.
          pire: Array.from(document.querySelectorAll("#allPassions .passion-tile"))
            .reduce((m, t) => Math.max(m, t.scrollWidth - t.clientWidth), 0),
        };
      });
      expect(vu.grille, "la grille tient dans sa colonne").toBeLessThanOrEqual(1);
      expect(vu.ecran, "et l'écran ne défile pas latéralement").toBeLessThanOrEqual(1);
      expect(vu.pire, "aucun libellé ne déborde de sa tuile").toBeLessThanOrEqual(1);
    });
  }
});
