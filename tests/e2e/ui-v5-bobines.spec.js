// Lot UI-5 — « Bobines connectées au réel » (§7 et §15 de la direction).
//
// Ce que cette suite prouve, et rien d'autre :
//   ① sur l'URL normale, une bobine dont la Passio est CONNUE reçoit les quatre
//      actions de la direction, dans l'ordre, et rien de plus ;
//   ② une bobine RELIÉE à une activité reçoit le seul lien « Voir l'activité » —
//      les deux branches sont EXCLUSIVES, jamais les deux à la fois ;
//   ③ « Ça m'intéresse » pose un signal RÉEL et réversible : il est persisté, il
//      pèse dans le classement du fil, et re-taper le retire ;
//   ④ les trois sorties appellent les moteurs EXISTANTS d'UI-3A, jamais un
//      second moteur, et ferment le viewer d'abord (sans quoi la surface
//      s'ouvrirait invisible sous un overlay en z-index 9999) ;
//   ⑤ « À vivre près de moi » ne demande JAMAIS la position ;
//   ⑥ le kill switch rend le viewer historique, sans rechargement ;
//   ⑦ mobile 320 / 390 / 430 px : aucun débordement, cibles ≥ 44 px.
//
// ⚠️ Convention maison : rien n'est retiré du viewer historique. La rangée est
// AJOUTÉE dans `.reel-info` ; le like, le commentaire, le soutien et le partage
// restent intacts et sont vérifiés ici, sinon « ajouter » aurait pu vouloir
// dire « remplacer » sans que personne le voie.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Deux bobines injectées dans une source que `buildReels()` lit réellement.
// La première porte une passion connue et AUCUNE activité, la seconde est
// reliée à l'activité de démonstration `e1`.
const BOBINES = [
  {
    id: "v5_reel_libre", authorId: "author_x", authorName: "Iris", authorEmoji: "🎬",
    passion: "musique", type: "photo", isReel: true, photo: PIXEL, image: PIXEL,
    text: "Bobine sans activité", createdAt: 9000, likes: 0, comments: [],
  },
  {
    id: "v5_reel_reliee", authorId: "author_y", authorName: "Sacha", authorEmoji: "🎬",
    passion: "musique", type: "photo", isReel: true, photo: PIXEL, image: PIXEL,
    eventId: "e1",
    text: "Bobine reliée à une activité", createdAt: 8000, likes: 0, comments: [],
  },
];

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_5", "0"));
  }
  // Compte les demandes de position SANS jamais y répondre.
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
  await bootOnboarded(page, opts.errors || null, 1, {});
  await page.evaluate(() => { window.supaLoadPosts = async () => []; });
}

// Injecte les bobines de test et ouvre le viewer sur celle demandée.
async function ouvrirBobine(page, id, bobines) {
  await page.evaluate(([liste, cible]) => {
    // ⚠️ Le seed porte 20 bobines de démonstration : sans ce vidage, le viewer
    // en afficherait 22 et aucun comptage ne serait déterministe. Les bobines
    // de démonstration sont exercées à part, par le test « contenu de
    // démonstration » plus bas.
    state.seed.posts = (state.seed.posts || []).filter((p) => !p.isReel);
    state.userPosts = [];
    state.supabasePosts = liste;
    openReelById(cible);
  }, [bobines || BOBINES, id]);
  await page.waitForFunction(() => {
    const v = document.getElementById("reelsViewer");
    return v && v.classList.contains("open");
  }, null, { timeout: 8000 });
  // La décoration est cadencée par un setTimeout(0) derrière un MutationObserver.
  await page.waitForFunction((cible) => {
    const el = document.querySelector('.reel-item[data-post-id="' + cible + '"]');
    return !!(el && el.getAttribute("data-v5") === "1");
  }, id, { timeout: 8000 });
}

function item(page, id) {
  return page.locator('.reel-item[data-post-id="' + id + '"]');
}

test.describe("UI-5 — Bobines connectées au réel", () => {
  test("URL normale : les quatre actions de la direction, dans l'ordre", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await ouvrirBobine(page, "v5_reel_libre");

    const b = item(page, "v5_reel_libre");
    await expect(b).toHaveAttribute("data-v5-kind", "passio");

    const chips = b.locator(".v5-actions .v5-chip");
    await expect(chips).toHaveCount(4);
    expect(await chips.allTextContents()).toEqual([
      "Ça m'intéresse", "Découvrir Musique", "À vivre près de moi", "Proposer une sortie",
    ]);

    // La rangée vit DANS le bloc d'information, pas dans le rail d'actions
    // historique — celui-ci reste intégralement à sa place.
    expect(await page.evaluate(() => {
      const r = document.querySelector('.reel-item[data-post-id="v5_reel_libre"] .v5-actions');
      return !!(r && r.parentElement && r.parentElement.classList.contains("reel-info"));
    })).toBe(true);
    await expect(b.locator(".reel-actions .reel-action-btn")).toHaveCount(4);
    await expect(b.locator("[data-reellike]")).toHaveCount(1);

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("bobine reliée à une activité : le seul lien « Voir l'activité »", async ({ page }) => {
    await boot(page);
    await ouvrirBobine(page, "v5_reel_reliee");

    const b = item(page, "v5_reel_reliee");
    await expect(b).toHaveAttribute("data-v5-kind", "activite");

    const chips = b.locator(".v5-actions .v5-chip");
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toHaveText("Voir l'activité");
    // Les deux branches sont EXCLUSIVES : une bobine reliée ne reçoit jamais
    // « Proposer une sortie », qui inviterait à créer un doublon de l'activité
    // qu'elle montre déjà.
    await expect(b.locator(".v5-chip", { hasText: "Proposer une sortie" })).toHaveCount(0);
    await expect(b.locator(".v5-chip", { hasText: "Ça m'intéresse" })).toHaveCount(0);
  });

  test("une bobine sans Passio reconnue garde sa mise en page d'avant", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      state.seed.posts = (state.seed.posts || []).filter((p) => !p.isReel);
      state.userPosts = [];
      state.supabasePosts = [{
        id: "v5_reel_muet", authorId: "author_z", authorName: "Nour", authorEmoji: "🎬",
        passion: "cette-passion-nexiste-pas", type: "photo", isReel: true,
        photo: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        text: "Sans passion connue", createdAt: 9000, likes: 0, comments: [],
      }];
      openReelById("v5_reel_muet");
    });
    await page.waitForFunction(() => {
      const v = document.getElementById("reelsViewer");
      return v && v.classList.contains("open");
    }, null, { timeout: 8000 });
    await page.waitForTimeout(300);   // laisser la décoration s'exécuter si elle devait

    const b = item(page, "v5_reel_muet");
    await expect(b).toHaveCount(1);
    await expect(b).not.toHaveAttribute("data-v5", "1");
    await expect(b.locator(".v5-actions")).toHaveCount(0);
    // Rien n'est masqué : la bobine garde toutes ses actions historiques.
    await expect(b.locator(".reel-actions .reel-action-btn")).toHaveCount(4);
  });

  test("« Ça m'intéresse » : signal réel, persisté, réversible, et il pèse", async ({ page }) => {
    await boot(page);
    await ouvrirBobine(page, "v5_reel_libre");
    const chip = item(page, "v5_reel_libre").locator(".v5-chip", { hasText: "Ça m'intéresse" });

    await expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => !!(state.user.passionSignals || {}).musique)).toBe(false);

    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => !!(state.user.passionSignals || {}).musique)).toBe(true);

    // Il PÈSE : le même post marque plus haut avec le signal que sans. Sans cet
    // effet, le bouton serait décoratif — `likedPosts` n'est lu par aucun
    // classement, et le viewer de bobines n'en a aucun.
    const scores = await page.evaluate(() => {
      const p = { id: "x", passion: "musique", createdAt: Date.now(), likes: 0, comments: [] };
      const bucket = Math.floor(Date.now() / 300000);
      const vide = new Set();
      return {
        avec: feedPostScore(p, bucket, vide, vide, new Set(["musique"])),
        sans: feedPostScore(p, bucket, vide, vide, new Set()),
      };
    });
    expect(scores.avec).toBeGreaterThan(scores.sans);

    // Réversible : re-taper retire le signal, comme un like.
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => !!(state.user.passionSignals || {}).musique)).toBe(false);
  });

  test("le signal survit à un rechargement", async ({ page }) => {
    await boot(page);
    await ouvrirBobine(page, "v5_reel_libre");
    await item(page, "v5_reel_libre").locator(".v5-chip", { hasText: "Ça m'intéresse" }).click();
    await page.waitForTimeout(600);   // saveState est débouncé

    await page.reload();
    await page.waitForFunction(() => typeof renderFeed === "function", null, { timeout: 20000 });
    expect(await page.evaluate(() => !!(state.user.passionSignals || {}).musique)).toBe(true);
  });

  test("les trois sorties appellent les moteurs d'UI-3A, viewer fermé d'abord", async ({ page }) => {
    await boot(page);

    // On observe les MOTEURS, pas leurs effets : c'est ce qui prouve qu'aucun
    // second moteur n'a été écrit. On mémorise aussi si le viewer était encore
    // ouvert au moment de l'appel — il ne doit jamais l'être.
    await page.evaluate(() => {
      window.__v5 = [];
      const api = window.PassioUIV3;
      ["seeActivities", "discoverPeople", "proposeOuting"].forEach((nom) => {
        api[nom] = function () {
          window.__v5.push({ nom, viewerOuvert: !!(reelsState && reelsState.open) });
        };
      });
    });

    for (const [texte, attendu] of [
      ["À vivre près de moi", "seeActivities"],
      ["Découvrir Musique", "discoverPeople"],
      ["Proposer une sortie", "proposeOuting"],
    ]) {
      await ouvrirBobine(page, "v5_reel_libre");
      await item(page, "v5_reel_libre").locator(".v5-chip", { hasText: texte }).click();
      await page.waitForFunction(
        (n) => (window.__v5 || []).some((a) => a.nom === n),
        attendu, { timeout: 8000 },
      );
    }

    const appels = await page.evaluate(() => window.__v5);
    expect(appels.map((a) => a.nom)).toEqual(["seeActivities", "discoverPeople", "proposeOuting"]);
    // Le viewer est en z-index 9999 : ouvrir une surface par-dessus la rendrait
    // invisible. Il doit donc être fermé AVANT chaque sortie, sans exception.
    appels.forEach((a) => expect(a.viewerOuvert, a.nom + " : viewer encore ouvert").toBe(false));
  });

  test("« Voir l'activité » passe par openActivity d'UI-3B, viewer fermé", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.__v5act = null;
      window.PassioUIV3.openActivity = function (evId) {
        window.__v5act = { evId, viewerOuvert: !!(reelsState && reelsState.open) };
      };
    });
    await ouvrirBobine(page, "v5_reel_reliee");
    await item(page, "v5_reel_reliee").locator(".v5-chip").first().click();

    await page.waitForFunction(() => !!window.__v5act, null, { timeout: 8000 });
    const a = await page.evaluate(() => window.__v5act);
    expect(a.evId).toBe("e1");
    expect(a.viewerOuvert).toBe(false);
  });

  test("« À vivre près de moi » ne demande jamais la position", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { irlUserLocation = null; window.__geoCalls = 0; });
    await ouvrirBobine(page, "v5_reel_libre");
    await item(page, "v5_reel_libre").locator(".v5-chip", { hasText: "À vivre près de moi" }).click();

    await page.waitForFunction(() => {
      const el = document.getElementById("screen-irl");
      return el && el.classList.contains("active");
    }, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__geoCalls)).toBe(0);
  });

  test("kill switch local au boot : viewer historique, rien du lot", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { killLocal: true, errors });
    await page.evaluate(() => {
      state.seed.posts = (state.seed.posts || []).filter((p) => !p.isReel);
      state.userPosts = [];
      state.supabasePosts = [{
        id: "v5_reel_libre", authorId: "author_x", authorName: "Iris", authorEmoji: "🎬",
        passion: "musique", type: "photo", isReel: true,
        photo: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        text: "Bobine sans activité", createdAt: 9000, likes: 0, comments: [],
      }];
      openReelById("v5_reel_libre");
    });
    await page.waitForFunction(() => {
      const v = document.getElementById("reelsViewer");
      return v && v.classList.contains("open");
    }, null, { timeout: 8000 });
    await page.waitForTimeout(300);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-5"))).toBe(false);
    await expect(page.locator(".v5-actions")).toHaveCount(0);
    // Le viewer historique est intact.
    await expect(item(page, "v5_reel_libre").locator(".reel-actions .reel-action-btn")).toHaveCount(4);
    expect(errors.js, "exceptions JS avec le kill switch").toEqual([]);
  });

  test("kill switch mémoire en cours de session : retour sans rechargement", async ({ page }) => {
    await boot(page);
    await ouvrirBobine(page, "v5_reel_libre");
    // Deux bobines de test, donc deux rangées : le décompte est exact, pas
    // approximatif — c'est lui qui prouvera que la coupure les retire TOUTES.
    await expect(page.locator(".v5-actions")).toHaveCount(BOBINES.length);

    await page.evaluate(() => { window.PASSIO_UI_5 = false; window.PassioUIV5.apply(); });
    await expect(page.locator(".v5-actions")).toHaveCount(0);
    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-5"))).toBe(false);
    // Le nœud décoré redevient un `.reel-item` ordinaire : le marqueur est retiré.
    await expect(item(page, "v5_reel_libre")).not.toHaveAttribute("data-v5", "1");
    await expect(item(page, "v5_reel_libre").locator(".reel-actions .reel-action-btn")).toHaveCount(4);
  });

  test("la décoration survit à une réouverture du viewer", async ({ page }) => {
    await boot(page);
    await ouvrirBobine(page, "v5_reel_libre");
    await page.evaluate(() => closeReels());
    // `openReels` réécrit #reelsList.innerHTML : sans observateur, la rangée
    // aurait disparu pour de bon.
    await ouvrirBobine(page, "v5_reel_libre");
    await expect(item(page, "v5_reel_libre").locator(".v5-actions .v5-chip")).toHaveCount(4);
  });

  test("contenu de démonstration : des bobines sont reliées à une activité", async ({ page }) => {
    await boot(page);
    // Aucune injection : on observe le seed tel qu'il est livré. Sans bobine
    // éligible, la branche « Voir l'activité » serait invisible à la
    // validation, donc indiscernable d'un lot cassé.
    await page.evaluate(() => openReels());
    await page.waitForFunction(() => {
      const v = document.getElementById("reelsViewer");
      return v && v.classList.contains("open");
    }, null, { timeout: 8000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.reel-item[data-v5-kind="activite"]').length > 0,
      null, { timeout: 8000 },
    );

    const reliees = page.locator('.reel-item[data-v5-kind="activite"]');
    expect(await reliees.count()).toBeGreaterThan(0);
    await expect(reliees.first().locator(".v5-chip")).toHaveText("Voir l'activité");
    // Et l'activité référencée EXISTE : une référence morte ne produirait
    // aucun bouton, en silence.
    expect(await page.evaluate(() => {
      const el = document.querySelector('.reel-item[data-v5-kind="activite"]');
      const reel = findPostAnywhere(el.getAttribute("data-post-id"));
      const ref = window.PassioUIV3.eventRefOf(reel);
      return !!(state.seed.events || []).find((e) => e.id === ref);
    })).toBe(true);
  });

  for (const largeur of [320, 390, 430]) {
    test("mobile " + largeur + " px : aucun débordement, cibles ≥ 44 px", async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      await boot(page);
      await ouvrirBobine(page, "v5_reel_libre");

      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const row = document.querySelector('.reel-item[data-post-id="v5_reel_libre"] .v5-actions');
        const chips = Array.from(row.querySelectorAll(".v5-chip"));
        return {
          pageDeborde: doc.scrollWidth > doc.clientWidth + 1,
          rangeeDansLeCadre: row.getBoundingClientRect().right <= doc.clientWidth + 1,
          minHauteur: Math.min.apply(null, chips.map((c) => c.getBoundingClientRect().height)),
        };
      });
      expect(m.pageDeborde, "la page déborde horizontalement").toBe(false);
      expect(m.rangeeDansLeCadre, "la rangée sort du cadre").toBe(true);
      expect(m.minHauteur, "cible tactile d'une action").toBeGreaterThanOrEqual(44);
    });
  }
});
