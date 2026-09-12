// ══════════════════════════════════════════════════════════════════════════
// DEUX SURFACES DE CHOIX RESTÉES AU SOCLE DE 19 PASSIONS (2026-09-12)
// ──────────────────────────────────────────────────────────────────────────
// Trouvées en cherchant les SURVIVANTS du même défaut que le panneau de
// première visite (« taper Ski ne rend rien »). Toutes deux BLOQUENT
// l'utilisateur, elles ne se contentent pas de mal afficher :
//
//   ① « Nouveau groupe » (app-05) intersectait les passions du compte avec
//      `allPassions()` : un compte dont les passions viennent du référentiel
//      plat obtenait une grille VIDE, et « Passion(s) du groupe (1 à 3) » est
//      obligatoire — impasse dure, sans message.
//   ② « Créer un événement IRL » (app-07) listait `passionsPubliables()`, donc
//      le socle. Sur le MÊME écran on peut FILTRER parmi 5 001 passions et on
//      ne pouvait ORGANISER que dans 19.
//
// Le compte de ces cas porte « Ski alpin » (`glisse-ski-alpin`), une passion
// qui n'existe QUE dans le référentiel plat : c'est ce qui rend le banc
// significatif. Prémisse vérifiée par le cas ⓪, jamais supposée.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const PASSION = "glisse-ski-alpin";
const LIBELLE = "Ski alpin";

function compteAvecPassionPlate() {
  return {
    onboarded: true, landingSeen: true, tourSeen: true,
    user: {
      name: "Audit QA", birthYear: 1995, isMinor: false,
      currentProfileId: "pp_0",
      profiles: [{
        id: "pp_0", name: "Audit QA", passion: PASSION,
        emoji: "🏄", bio: "Profil de test", color: "#7c3aed", createdAt: 1,
      }],
      drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
      following: [], savedCarnets: [], general: { username: "Audit QA" },
    },
    userPosts: [], userEvents: [], notifications: [],
    currentMood: "all", selectedFeedPassions: [],
  };
}

test.describe("Organiser et grouper dans les 5 001 passions", () => {
  // ⓪ LA PRÉMISSE. Sans elle, un socle qui gagnerait « Ski alpin » rendrait les
  // deux cas suivants verts sans rien prouver du référentiel.
  test("⓪ la passion du compte est absente du socle embarqué", async ({ page }) => {
    await bootOnboarded(page, null, 1, { state: compteAvecPassionPlate() });
    const dansLeSocle = await page.evaluate(
      (id) => allPassions().some((p) => p.id === id), PASSION
    );
    expect(dansLeSocle).toBe(false);
  });

  // ① LA GRILLE DU GROUPE N'EST PLUS VIDE.
  test("① « Nouveau groupe » propose la passion du compte", async ({ page }) => {
    await bootOnboarded(page, null, 1, { state: compteAvecPassionPlate() });

    await page.evaluate(() => openCreateGroup());
    await page.waitForSelector(".group-passion-grid", { timeout: 10000 });

    // La case existe — c'est elle qui manquait, donc le groupe était impossible.
    await page.waitForFunction(
      (id) => !!document.querySelector('.group-passion-option[data-pid="' + id + '"]'),
      PASSION,
      { timeout: 15000 }
    );
    const n = await page.locator(".group-passion-option").count();
    expect(n).toBeGreaterThan(0);

    // Et une fois le référentiel arrivé, elle porte son NOM, pas son identifiant.
    await page.waitForFunction(
      (l) => new RegExp(l).test(document.querySelector(".group-passion-grid").textContent),
      LIBELLE,
      { timeout: 15000 }
    );
  });

  // ② ON PEUT ORGANISER DANS SA PROPRE PASSION.
  test("② « Créer un événement IRL » propose la passion du compte", async ({ page }) => {
    await bootOnboarded(page, null, 1, { state: compteAvecPassionPlate() });

    await page.evaluate(() => openCreateEvent());
    await page.waitForSelector("#evPassion", { timeout: 10000 });

    await page.waitForFunction(
      (id) => Array.from(document.querySelectorAll("#evPassion option")).some((o) => o.value === id),
      PASSION,
      { timeout: 15000 }
    );

    // Elle est en TÊTE : c'est la passion de la personne, pas une option perdue
    // au milieu du catalogue.
    const premier = await page.evaluate(() => {
      const o = document.querySelector("#evPassion option");
      return o ? o.value : null;
    });
    expect(premier).toBe(PASSION);

    // Et son libellé arrive avec le référentiel.
    await page.waitForFunction(
      (l) => new RegExp(l).test(document.getElementById("evPassion").textContent),
      LIBELLE,
      { timeout: 15000 }
    );
  });

  // ③ LE CHOIX SURVIT AU REPEINT. Le référentiel arrive APRÈS l'ouverture :
  // repeindre le `<select>` en perdant la sélection ferait publier la
  // rencontre sous une AUTRE passion, en silence — la faute que le mode
  // édition avait déjà dû rustiner à la main.
  test("③ le repeint du référentiel ne change pas la passion choisie", async ({ page }) => {
    await bootOnboarded(page, null, 1, { state: compteAvecPassionPlate() });
    await page.evaluate(() => openCreateEvent());
    await page.waitForSelector("#evPassion", { timeout: 10000 });

    await page.waitForFunction(
      (id) => Array.from(document.querySelectorAll("#evPassion option")).some((o) => o.value === id),
      PASSION,
      { timeout: 15000 }
    );

    // On choisit explicitement une AUTRE passion, puis on laisse le référentiel
    // repeindre : le choix doit tenir.
    const autre = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll("#evPassion option"));
      const cible = opts.find((o) => o.value === "musique") || opts[1];
      if (!cible) return null;
      document.getElementById("evPassion").value = cible.value;
      return cible.value;
    });
    expect(autre).toBeTruthy();

    await page.waitForTimeout(2500);
    const apres = await page.evaluate(() => document.getElementById("evPassion").value);
    expect(apres).toBe(autre);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ⚠️ CES CAS N'EXERÇAIENT JAMAIS LE REPEINT, ET C'EST POURQUOI LE DÉFAUT DE LA
  // COCHE EST PASSÉ. Mesuré : avec ce fixture, `PassioPassions.pret()` est DÉJÀ
  // vrai quand la modale s'ouvre (le compte porte une passion hors socle, donc
  // `evaluerBesoinDeNoms` a déclenché `charger()` au boot) — les deux fonctions
  // neuves du lot sortaient sur leur garde `m.pret()` et n'étaient mesurées par
  // rien. On retarde donc le référentiel, comme la maison mute `window.supa.from`.
  // ══════════════════════════════════════════════════════════════════════════
  async function referentielRetarde(page) {
    await page.evaluate(() => {
      const vraiPret = PassioPassions.pret.bind(PassioPassions);
      const vraiCharger = PassioPassions.charger.bind(PassioPassions);
      window.__refLibere = null;
      window.__refPret = false;
      PassioPassions.pret = function () { return window.__refPret && vraiPret(); };
      PassioPassions.charger = function () {
        return new Promise((resoudre) => {
          window.__refLibere = () => {
            window.__refPret = true;
            PassioPassions.pret = vraiPret;
            PassioPassions.charger = vraiCharger;
            resoudre(vraiCharger());
          };
        });
      };
    });
  }

  // ④ LA COCHE DU GROUPE SURVIT AU REPEINT.
  // La grille est le premier bloc interactif après le nom : on coche sa passion
  // tout de suite, le référentiel arrive, `innerHTML` régénère les options — et
  // « Créer le groupe » répondait « Choisis au moins 1 passion ». La même
  // impasse dure que ce lot ferme, décalée de deux secondes.
  test("④ la passion cochée survit à l'arrivée du référentiel", async ({ page }) => {
    await bootOnboarded(page, null, 1, { state: compteAvecPassionPlate() });
    await referentielRetarde(page);

    await page.evaluate(() => openCreateGroup());
    await page.waitForSelector(".group-passion-grid", { timeout: 10000 });
    await page.click('.group-passion-option[data-pid="' + PASSION + '"]');

    const avant = await page.locator(".group-passion-option.selected").count();
    expect(avant).toBe(1);

    // Le référentiel arrive et repeint la grille.
    await page.evaluate(() => window.__refLibere && window.__refLibere());
    await page.waitForFunction(
      (l) => new RegExp(l).test(document.querySelector(".group-passion-grid").textContent),
      LIBELLE,
      { timeout: 15000 }
    );

    // La coche est toujours là — et `confirmCreateGroup` la relit par `.selected`.
    const apres = await page.locator(".group-passion-option.selected").count();
    expect(apres).toBe(1);
    const coche = await page.evaluate(
      (id) => {
        const el = document.querySelector('.group-passion-option[data-pid="' + id + '"]');
        const cb = el && el.querySelector("input[type=checkbox]");
        return !!(el && el.classList.contains("selected") && cb && cb.checked);
      }, PASSION
    );
    expect(coche).toBe(true);
  });

  // ⑤ UNE PASSION ARCHIVÉE N'EST PAS PROPOSÉE À L'ORGANISATION.
  // « Mes passions » doit dire la même chose partout (`passionsVivantes`) : une
  // passion rangée ne remonte pas en tête du `<select>` avec le « ✦ » qui dit
  // « c'est la tienne ».
  test("⑤ une passion archivée ne remonte pas dans « Créer un événement »", async ({ page }) => {
    const etat = compteAvecPassionPlate();
    etat.user.profiles.push({
      id: "pp_1", name: "Audit QA", passion: "musique",
      emoji: "🎸", bio: "rangée", color: "#7c3aed", createdAt: 2, archived: true,
    });
    await bootOnboarded(page, null, 1, { state: etat });

    await page.evaluate(() => openCreateEvent());
    await page.waitForSelector("#evPassion", { timeout: 10000 });
    await page.waitForTimeout(2500);

    // « Musique » appartient au socle, donc elle reste dans le catalogue — ce
    // qu'on refuse, c'est qu'elle soit traitée comme une passion DU COMPTE.
    const marquee = await page.evaluate(() => {
      const o = Array.from(document.querySelectorAll("#evPassion option"))
        .find((x) => x.value === "musique");
      return o ? o.textContent : "";
    });
    expect(marquee).not.toMatch(/✦/);

    // Et la passion vivante, elle, garde sa marque et sa place.
    const premier = await page.evaluate(() => {
      const o = document.querySelector("#evPassion option");
      return o ? { v: o.value, t: o.textContent } : null;
    });
    expect(premier.v).toBe(PASSION);
    expect(premier.t).toMatch(/✦/);
  });

  // ⑥ ON NE PROPOSE PAS CE QUE « PUBLIER » REFUSERA (sortie A, 2026-08-30).
  test("⑥ une passion qui n'existe que chez moi n'est pas proposée", async ({ page }) => {
    const etat = compteAvecPassionPlate();
    etat.user.profiles.push({
      id: "pp_2", name: "Audit QA", passion: "custom_soudure_banc",
      emoji: "🔧", bio: "perso", color: "#7c3aed", createdAt: 3,
    });
    await bootOnboarded(page, null, 1, { state: etat });

    await page.evaluate(() => openCreateEvent());
    await page.waitForSelector("#evPassion", { timeout: 10000 });
    await page.waitForTimeout(2500);

    const presente = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#evPassion option")).some((o) => o.value === "custom_soudure_banc")
    );
    expect(presente).toBe(false);
  });
});
