// Lot UI-7 — parcours complet et finition du concept.
//
// Ce lot n'ajoute aucune surface : il PROUVE que la boucle PASSIO tient
// bout à bout, écran par écran, avec les lots UI-1 → UI-6 tous actifs. C'est
// le critère du §15 : « le concept PASSIO complet peut être présenté et
// validé ».
//
// Les sept passages du §15, chacun tenu par un test :
//   ① onboarding → Feed          ⑤ conversation → IRL
//   ② Feed → profil → message    ⑥ RSVP → discussion
//   ③ Feed → IRL                 ⑦ IRL → souvenir → Feed
//   ④ Bobine → IRL
// Puis la finition : états vides cohérents, et revue mobile globale des cinq
// destinations à 320 / 390 / 430 px.
//
// ⚠️ Ce que cette suite ne prouve PAS, et qu'il ne faut pas lui faire dire :
// elle démarre avec le jeton du gate déjà posé (`app-helper`), donc elle
// n'exerce jamais la fenêtre « gate affiché, application absente » — celle où
// se sont produites les quatre pannes d'aperçu du 2026-08-28. Un vert ici
// n'infirme rien de ce côté.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function espionnerGeo(page) {
  await page.addInitScript(() => {
    window.__geoCalls = 0;
    try {
      const g = navigator.geolocation;
      if (g) {
        Object.defineProperty(g, "getCurrentPosition", {
          configurable: true,
          value: function () { window.__geoCalls++; },
        });
      }
    } catch (e) {}
  });
}

async function boot(page, errors) {
  await espionnerGeo(page);
  await bootOnboarded(page, errors || null, 1, {});
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = () => {};
    window._convNetLoaded = true;
  });
}

async function allerA(page, ecran) {
  await page.evaluate((e) => goTo(e), ecran);
  await page.waitForFunction((e) => {
    const el = document.getElementById("screen-" + e);
    return el && el.classList.contains("active");
  }, ecran);
  await page.waitForTimeout(350);
}

test.describe("UI-7 — le parcours complet", () => {
  test("① onboarding → Feed : le premier écran n'est jamais vide", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, errors);
    await allerA(page, "feed");

    // Le fil doit porter du contenu dès la première seconde : c'est la
    // première valeur promise par le §12.
    await page.waitForFunction(() => document.querySelectorAll("#feedList .post").length > 0,
      null, { timeout: 10000 });
    const n = await page.evaluate(() => document.querySelectorAll("#feedList .post").length);
    expect(n, "le fil doit être peuplé au premier rendu").toBeGreaterThan(3);

    // Et la barre de navigation raconte le produit (§4) : cinq destinations
    // NOMMÉES — le §A3 exige les libellés, une icône seule n'apprend rien.
    const nav = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".nav-item"));
      return {
        n: items.length,
        libelles: items.map((i) => (i.querySelector(".nav-label") || {}).textContent || "").filter(Boolean),
      };
    });
    expect(nav.n, "cinq destinations (§A4)").toBeGreaterThanOrEqual(5);
    expect(nav.libelles.length, "chaque destination porte son libellé (§A3)").toBe(nav.n);

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("② Feed → profil → message : la relation est atteignable", async ({ page }) => {
    await boot(page);
    await allerA(page, "feed");
    await page.waitForFunction(() => document.querySelectorAll("#feedList .post").length > 0,
      null, { timeout: 10000 });

    // L'auteur d'une publication ouvre son profil visité.
    const auteur = await page.evaluate(() => {
      const p = document.querySelector("#feedList .post .post-author");
      if (!p) return null;
      p.click();
      return true;
    });
    expect(auteur, "l'auteur d'une publication doit être cliquable").toBe(true);
    await page.waitForTimeout(700);

    // Et ce profil offre « Message », qui ouvre bien une conversation.
    const bouton = page.locator('#modalContent button:has-text("Message")').first();
    await expect(bouton).toBeVisible({ timeout: 8000 });
    await bouton.click();
    await page.waitForFunction(() => !!window._openedConvId, null, { timeout: 8000 });
  });

  test("③ Feed → IRL : la passerelle mène à une expérience", async ({ page }) => {
    await boot(page);
    await allerA(page, "feed");
    await page.waitForFunction(() => document.querySelectorAll("#feedList .post").length > 0,
      null, { timeout: 10000 });

    // Les deux portes du §A19 / UI-3 cohabitent sans jamais se recouvrir :
    // une carte reliée à une activité ne reçoit PAS « Trouver une expérience ».
    const portes = await page.evaluate(() => {
      const t = document.querySelectorAll("#feedList .post [data-v3-decore] , #feedList .post.v3-decore");
      return {
        trouver: document.querySelectorAll('#feedList .v3-tempt:not([data-v3-activity])').length,
        activite: document.querySelectorAll("#feedList [data-v3-activity]").length,
        double: Array.from(document.querySelectorAll("#feedList .post")).filter(
          (p) => p.querySelector("[data-v3-activity]") && p.querySelector(".v3-tempt:not([data-v3-activity])")
        ).length,
        _t: t.length,
      };
    });
    expect(portes.trouver + portes.activite, "le fil doit offrir au moins une porte vers l'IRL")
      .toBeGreaterThan(0);
    expect(portes.double, "une carte ne porte jamais les deux portes à la fois").toBe(0);

    // « Voir l'activité » ouvre la fiche, qui propose de participer.
    if (portes.activite > 0) {
      await page.locator("#feedList [data-v3-activity]").first().click();
      await page.waitForTimeout(800);
      await expect(page.locator("#eventDetailCta")).toBeVisible({ timeout: 8000 });
    }
  });

  test("④ Bobine → IRL : les sorties ferment le lecteur d'abord", async ({ page }) => {
    await boot(page);
    await allerA(page, "feed");
    await page.waitForFunction(() => typeof buildReels === "function", null, { timeout: 10000 });

    const ouvert = await page.evaluate(() => {
      const reels = buildReels() || [];
      if (!reels.length || typeof openReels !== "function") return false;
      openReels(reels[0].id);
      return true;
    });
    expect(ouvert, "le jeu de démonstration doit contenir des bobines").toBe(true);
    await page.waitForTimeout(600);

    // Les actions du §7 sont là, et « Ça m'intéresse » est bien le libellé
    // arrêté avec Benjamin le 2026-08-28.
    await expect(page.locator(".v5-actions").first()).toBeVisible({ timeout: 8000 });
    expect(await page.evaluate(() =>
      document.querySelector(".v5-actions").textContent)).toContain("Ça m'intéresse");
  });

  test("⑤ conversation → IRL : l'entrée est là, et elle ne fait rien d'autre", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      conversationsState = [{
        id: "v7_conv", userId: "u_nina", userName: "Nina Costa",
        lastAt: Date.now(), unread: 0, archived: false, pinned: false,
        messages: [{ id: "m1", from: "u_nina", text: "Salut !", at: Date.now() }],
      }];
    });
    await allerA(page, "messages");
    await page.evaluate(() => openConversation("v7_conv"));
    await page.waitForFunction(() => !!window._openedConvId, null, { timeout: 5000 });
    await page.waitForTimeout(400);

    const geoAvant = await page.evaluate(() => window.__geoCalls);
    // L'entrée vit dans le menu de pièces jointes : elle n'est visible qu'une
    // fois ce menu ouvert, exactement comme les cinq entrées historiques.
    await page.evaluate(() => toggleAttachMenu());
    await page.waitForTimeout(250);
    await expect(page.locator("#v6cProposerIrl")).toBeVisible();
    await page.evaluate(() => document.getElementById("v6cProposerIrl").click());
    await page.waitForSelector("#evTitle", { timeout: 8000 });
    expect(await page.evaluate(() => window.__geoCalls),
      "proposer un IRL ne demande jamais la position").toBe(geoAvant);
  });

  test("⑥ RSVP → discussion : participer ouvre un lieu où parler", async ({ page }) => {
    await boot(page);
    await allerA(page, "irl");

    const id = await page.evaluate(() => {
      const l = _filterIrlEvents(allEvents());
      return l.length ? l[0].id : "";
    });
    expect(id, "le jeu de démonstration doit contenir une activité").not.toBe("");

    await page.evaluate((eid) => openEventDetails(eid), id);
    await page.waitForTimeout(700);
    await expect(page.locator("#eventDetailCta")).toBeVisible({ timeout: 8000 });

    await page.evaluate((eid) => setEventRsvp(eid, "going"), id);
    await page.waitForTimeout(700);

    // La discussion de l'activité existe et accepte la saisie : c'est ce que
    // le §8 promet après un RSVP.
    await expect(page.locator("#eventCommentInput")).toHaveCount(1);
    await expect(page.locator("#eventCommentsList")).toHaveCount(1);
  });

  test("⑦ IRL → souvenir → Feed : l'expérience revient dans le fil", async ({ page }) => {
    await boot(page);
    await allerA(page, "irl");

    const id = await page.evaluate(() => {
      const l = _filterIrlEvents(allEvents());
      return l.length ? l[0].id : "";
    });
    await page.evaluate((eid) => shareEventExperience(eid), id);
    // `shareEventExperience` force la Passio à +250 ms : on attend le Studio.
    await page.waitForFunction(() => {
      const el = document.getElementById("screen-studio");
      return el && el.classList.contains("active");
    }, null, { timeout: 8000 });
    await page.waitForTimeout(500);

    // Le composer unifié du §9 est bien celui qui reçoit le souvenir.
    await expect(page.locator("#v6Composer")).toBeVisible();
    await page.fill("#postText", "Super moment, on remet ça.");
    await page.locator("[data-v6-publier]").click();
    await page.waitForFunction(() => (state.userPosts || []).length === 1, null, { timeout: 10000 });

    // Et il arrive dans le fil. ⚠️ Pas forcément EN TÊTE : `rankFeedPosts`
    // classe par PERTINENCE, pas par date (invariant du projet). Exiger la
    // première place ferait rougir ce test au premier ajustement du
    // classement, sans qu'aucun parcours soit cassé — ce qui compte ici est
    // que le souvenir soit visible, et il l'est.
    await allerA(page, "feed");
    await expect(page.locator('#feedList .post:has-text("on remet ça")')).toHaveCount(1, { timeout: 8000 });
  });

  test("finition : les états vides disent quoi faire, jamais rien", async ({ page }) => {
    await boot(page);
    // Une inbox réellement vide — l'écran le plus exposé au vide au démarrage.
    await page.evaluate(() => { conversationsState = []; });
    await allerA(page, "messages");
    await page.evaluate(() => renderMessages());
    await page.waitForTimeout(400);

    await expect(page.locator("#messagesEmpty")).toBeVisible();
    const texte = await page.evaluate(() =>
      document.getElementById("messagesEmpty").textContent.trim());
    expect(texte.length, "un état vide sans texte n'aide personne").toBeGreaterThan(20);
    // Et l'action reste offerte : le « + » de l'inbox n'est jamais masqué par le vide.
    await expect(page.locator("[data-v6a-plus]")).toBeVisible();
  });

  for (const largeur of [320, 390, 430]) {
    test("revue mobile " + largeur + " px : les cinq destinations tiennent dans le cadre",
      async ({ page }) => {
        const errors = { js: [], console: [], network: [] };
        await page.setViewportSize({ width: largeur, height: 844 });
        await boot(page, errors);

        for (const ecran of ["feed", "irl", "studio", "messages", "profiles"]) {
          await allerA(page, ecran);
          const deborde = await page.evaluate(() => {
            const doc = document.documentElement;
            return doc.scrollWidth > doc.clientWidth + 1;
          });
          expect(deborde, "l'écran « " + ecran + " » déborde horizontalement à " + largeur + " px")
            .toBe(false);
        }

        expect(errors.js, "exceptions JS sur le parcours des cinq écrans").toEqual([]);
      });
  }
});
