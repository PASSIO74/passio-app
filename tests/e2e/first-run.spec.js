// ══════════════════════════════════════════════════════════════════════════
// PREMIÈRE VISITE — « l'application est elle-même le pitch »
// Drapeau `first_run_experience_v1`. Couvre les 16 points de vérification du lot.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootVisiteur, couperReseauSupabase, etatOnboarde, GATE_TOKEN, GATE_KEY } = require("./first-run-helper");

const feedActif = () => {
  const el = document.getElementById("screen-feed");
  return !!el && el.classList.contains("active");
};

// ─────────────────────────────────────────────────────────────────────────
// 1. ENTRÉE DIRECTE
// ─────────────────────────────────────────────────────────────────────────
test.describe("Entrée", () => {
  test("un nouveau visiteur arrive directement dans Découvrir", async ({ page }) => {
    await bootVisiteur(page);

    expect(await page.evaluate(feedActif)).toBe(true);
    // Rien de ce que le lot interdit avant le fil.
    expect(await page.locator("#landing.active").count()).toBe(0);
    expect(await page.locator("#onboarding.active").count()).toBe(0);
    expect(await page.locator("#tourOverlay.active").count()).toBe(0);
    // Le formulaire d'inscription n'est pas à l'écran (il vit dans #onboarding).
    await expect(page.locator("#authSubmitBtn")).toBeHidden();
    // Et du contenu est VISIBLE tout de suite : c'est la promesse du lot.
    expect(await page.locator("#feedList .post").count()).toBeGreaterThan(0);
  });

  test("aucune demande de géolocalisation ni de notification n'est déclenchée", async ({ page }) => {
    // Sondes posées AVANT tout script de l'application.
    await page.addInitScript(() => {
      window.__geo = 0;
      window.__notif = 0;
      try {
        const g = navigator.geolocation;
        if (g) {
          const vrai = g.getCurrentPosition.bind(g);
          g.getCurrentPosition = function () { window.__geo++; return vrai.apply(g, arguments); };
          const vraiW = g.watchPosition && g.watchPosition.bind(g);
          if (vraiW) g.watchPosition = function () { window.__geo++; return vraiW.apply(g, arguments); };
        }
      } catch (e) {}
      try {
        if (window.Notification && Notification.requestPermission) {
          Notification.requestPermission = function () { window.__notif++; return Promise.resolve("default"); };
        }
      } catch (e) {}
    });
    await bootVisiteur(page);
    expect(await page.evaluate(() => window.__geo)).toBe(0);
    expect(await page.evaluate(() => window.__notif)).toBe(0);

    // Et même en allant sur Rencontrer, l'écran qui a le plus de raisons d'en
    // vouloir une : « sans activer automatiquement ta position ».
    await page.evaluate(() => goTo("irl"));
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__geo)).toBe(0);
    expect(await page.evaluate(() => window.__notif)).toBe(0);
  });

  test("aucune écriture Supabase en mode invité — et pas de compte anonyme", async ({ page }) => {
    const journal = await bootVisiteur(page);
    // Le réseau Supabase est coupé : rien n'a pu partir. On vérifie en plus que
    // le code n'a même pas TENTÉ de créer une identité anonyme ni d'upserter un
    // profil — la garde ne doit pas être le réseau, mais le programme.
    await page.evaluate(() => {
      window.__ecritures = [];
      ["supaEnsureProfileExists", "supaSaveUserState", "supaUpsertProfile", "supaPublishPostWithRetry", "supaInit"].forEach((n) => {
        if (typeof window[n] === "function") {
          window[n] = function () { window.__ecritures.push(n); return Promise.resolve(null); };
        }
      });
    });
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    // ⚠️ `passio_uid` N'EST PAS VIDE, et ce n'est pas un défaut : `getMyUserId()`
    // (app-08) fabrique un identifiant LOCAL `u_xxxxxxxx` au chargement, pour
    // tout le monde, depuis toujours. Ce qui doit être vrai, c'est qu'aucune
    // IDENTITÉ SUPABASE n'a été créée — donc que cet identifiant n'est pas un
    // uuid. Exiger `null` ici aurait fait échouer le test sur un comportement
    // historique sans rapport avec ce lot.
    const uid = await page.evaluate(() => localStorage.getItem("passio_uid"));
    expect(uid).toMatch(/^u_/);
    expect(uid).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(await page.evaluate(() => PassioFirstRun.estVisiteur())).toBe(true);
    // Aucune requête d'ÉCRITURE n'a même été tentée vers Supabase.
    expect(journal.filter((l) => /^(POST|PATCH|PUT|DELETE) /.test(l))).toEqual([]);
  });

  test("un utilisateur existant n'est jamais renvoyé dans le nouveau parcours", async ({ page }) => {
    await couperReseauSupabase(page);
    await page.addInitScript(
      ([k, t, st]) => {
        sessionStorage.setItem(k, t);
        sessionStorage.setItem("passio_pwa_dismissed", "1");
        localStorage.setItem("passio_first_run_experience_v1", "1"); // drapeau ACTIF
        localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
      },
      [GATE_KEY, GATE_TOKEN, etatOnboarde()]
    );
    await page.goto("/index.html");
    await page.waitForTimeout(3200);

    // Le parcours de première visite ne s'est PAS déclenché, malgré le drapeau.
    expect(await page.evaluate(() => PassioFirstRun.estVisiteur())).toBe(false);
    expect(await page.evaluate(() => document.documentElement.classList.contains("passio-first-run"))).toBe(false);
    expect(await page.locator("#frWelcome").count()).toBe(0);
    expect(await page.locator(".fr-tip").count()).toBe(0);
    // Et son fil n'est pas étiqueté « Exemple PASSIO ».
    expect(await page.locator(".fr-demo-tag").count()).toBe(0);
  });

  test("un lien profond garde sa destination, le tour est différé", async ({ page }) => {
    await bootVisiteur(page, { hash: "#irl-event-e1" });

    // La DESTINATION est ouverte. ⚠️ On ne mesure pas le hash : `openEventDetails`
    // repose `#event-e1` par-dessus `#irl-event-e1`, donc un test ancré sur la
    // forme d'ENTRÉE conclurait à tort que le lien est perdu.
    expect(await page.evaluate(() => {
      const e = document.getElementById("eventDetailPage");
      return !!e && e.style.display !== "none" && e.style.display !== "";
    })).toBe(true);
    expect(await page.evaluate(() => (document.querySelector(".screen.active") || {}).id)).toBe("screen-irl");

    // Et RIEN du parcours n'est posé par-dessus : ni la carte de bienvenue, ni
    // une indication. Le tour est différé, pas annulé.
    expect(await page.locator("#frWelcome").count()).toBe(0);
    expect(await page.locator(".fr-tip").count()).toBe(0);
    await page.waitForTimeout(2500);   // laisse toute la chaîne de reprise passer
    expect(await page.locator(".fr-tip").count()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. CARTE DE BIENVENUE
// ─────────────────────────────────────────────────────────────────────────
test.describe("Carte de bienvenue", () => {
  test("elle s'affiche, ne masque pas l'écran, et se ferme sans revenir", async ({ page }) => {
    await bootVisiteur(page);
    const carte = page.locator("#frWelcome");
    await expect(carte).toBeVisible({ timeout: 15000 });
    await expect(carte).toContainText("Bienvenue sur PASSIO");
    await expect(carte).toContainText("Tout ce que tu aimes, au même endroit.");

    // Non bloquante : elle occupe une fraction de l'écran, et le fil reste là.
    const boite = await carte.boundingBox();
    const h = page.viewportSize().height;
    expect(boite.height).toBeLessThan(h * 0.5);
    expect(await page.locator("#feedList .post").count()).toBeGreaterThan(0);

    // Elle est posée en FRÈRE de #feedList : un repeint du fil ne l'emporte pas.
    expect(await page.evaluate(() => !!document.querySelector("#feedList #frWelcome"))).toBe(false);
    await page.evaluate(() => renderFeed());
    await expect(carte).toBeVisible();

    await page.locator("#frWelcome .fr-welcome-alt").click();  // « Explorer d'abord »
    await expect(carte).toHaveCount(0);
    // Fermée, elle n'insiste pas DANS CETTE SESSION : un simple repeint du fil
    // ne la ramène pas.
    await page.evaluate(() => renderFeed());
    await page.waitForTimeout(600);
    expect(await page.locator("#frWelcome").count()).toBe(0);
  });

  test("tant qu'aucun compte n'existe, elle REVIENT à la visite suivante", async ({ page }) => {
    // Ce cas enchaîne TROIS démarrages de l'application (visite, retour, second
    // retour) et chacun coûte un boot complet : le budget par défaut de 45 s ne
    // suffit pas. Ce n'est pas de la lenteur suspecte — c'est le prix d'un test
    // qui mesure des VISITES et non un état, et c'est précisément ce qui lui
    // donne sa valeur ici.
    test.setTimeout(120000);
    // ⚠️ CE TEST INVERSE CE QUE LA PREMIÈRE VERSION AFFIRMAIT, et c'est délibéré.
    // La carte écrivait sa fermeture dans `localStorage` : elle ne revenait donc
    // JAMAIS. Benjamin l'a fermée pour réessayer et s'est retrouvé sans aucun
    // moyen de rouvrir le panneau de passions — la seule autre porte étant une
    // entrée du menu Paramètres, que personne ne va chercher. Résultat mesuré à
    // l'usage : le panneau n'a tout simplement jamais été vu.
    //
    // Tant qu'aucun compte n'existe, rien n'est acquis : la fermeture ne vaut
    // que pour la session en cours.
    await bootVisiteur(page);
    await expect(page.locator("#frWelcome")).toBeVisible({ timeout: 15000 });
    await page.locator("#frWelcome .fr-welcome-close").click();
    await expect(page.locator("#frWelcome")).toHaveCount(0);

    // Nouvelle visite = `sessionStorage` reparti de zéro, comme quand on rouvre
    // l'application. ⚠️ On ne vide PAS tout `sessionStorage` : le jeton du code
    // d'accès y vit aussi, et l'effacer ferait mesurer le gate au lieu de la
    // carte. On retire donc la seule clé en jeu, puis on recharge — ce qui est
    // exactement l'état d'un nouvel onglet du point de vue du module.
    await page.evaluate(() => sessionStorage.removeItem("passio_first_run_bienvenue_fermee"));
    await page.reload();
    await page.waitForTimeout(3400);
    await expect(page.locator("#frWelcome")).toBeVisible({ timeout: 15000 });

    // Et la preuve que ce n'est pas le rechargement qui la ramène : refermée,
    // elle reste absente tant que la clé de session est là.
    await page.locator("#frWelcome .fr-welcome-close").click();
    await page.reload();
    await page.waitForTimeout(3400);
    expect(await page.locator("#frWelcome").count()).toBe(0);
  });

  test("quand des passions sont déjà choisies, la carte le DIT au lieu de répéter « Bienvenue »", async ({ page }) => {
    await bootVisiteur(page, { prefs: { v: 1, passions: ["moto"], specialites: [], intents: [], tour: {}, bienvenue: "vue", retour: null, migre: false, debut: 1 } });
    const carte = page.locator("#frWelcome");
    await expect(carte).toBeVisible({ timeout: 15000 });
    // Le message suit l'état réel : ce que la personne ignore à ce stade n'est
    // plus ce qu'est PASSIO, c'est que ses choix ne vivent que sur cet appareil.
    await expect(carte).toContainText("Tes passions sont sur cet appareil");
    await expect(carte).toContainText("Crée ton compte pour les garder");
    await expect(carte).not.toContainText("Bienvenue sur PASSIO");
    // Et la porte du panneau reste là, sous un libellé qui dit ce qu'elle fait.
    await expect(carte.locator(".fr-welcome-cta")).toHaveText("Modifier mes passions");
    await carte.locator(".fr-welcome-cta").click();
    await expect(page.locator("#modalContent")).toContainText("Qu'est-ce qui te passionne ?");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. PERSONNALISATION DES PASSIONS
// ─────────────────────────────────────────────────────────────────────────
test.describe("Personnalisation", () => {
  test("le panneau propose les populaires, la recherche, tout le catalogue et les spécialités", async ({ page }) => {
    await bootVisiteur(page);
    await page.locator("#frWelcome .fr-welcome-cta").click();

    await expect(page.locator("#modalContent")).toContainText("Qu'est-ce qui te passionne ?");
    await expect(page.locator("#modalContent")).toContainText("Choisis quelques sujets");

    // 10 à 12 passions populaires (+ la tuile « Voir toutes »).
    const populaires = await page.locator("#frGrid .fr-tile:not(.fr-tile-more)").count();
    expect(populaires).toBeGreaterThanOrEqual(10);
    expect(populaires).toBeLessThanOrEqual(12);

    // « Voir toutes les passions » déplie le catalogue entier.
    await page.locator("#frGrid .fr-tile-more").click();
    const toutes = await page.locator("#frGrid .fr-tile").count();
    expect(toutes).toBeGreaterThan(populaires);

    // Recherche COMMUNE : un synonyme trouve sa passion…
    await page.fill("#frSearch", "gaming");
    await expect(page.locator('#frGrid [data-fr-passion="jeuxvideo"]')).toHaveCount(1);
    // …et une spécialité trouve sa passion parente.
    await page.fill("#frSearch", "pâtisserie");
    await expect(page.locator('#frGrid [data-fr-passion="cuisine"]')).toHaveCount(1);
  });

  test("choisir une spécialité sélectionne automatiquement sa passion principale", async ({ page }) => {
    await bootVisiteur(page);
    await page.evaluate(() => PassioFirstRun.ouvrirPersonnalisation("test"));
    await page.locator('#frGrid [data-fr-passion="musique"]').click();
    // Les spécialités de la passion retenue apparaissent.
    await expect(page.locator('#frSpecs [data-fr-spec="musique:guitare"]')).toHaveCount(1);

    // On coche une spécialité d'une AUTRE passion, non encore choisie.
    await page.evaluate(() => PassioFirstRun.basculerSpecialite("photo:portrait"));
    expect(await page.evaluate(() => {
      const t = document.querySelector('#frGrid [data-fr-passion="photo"]');
      return !!t && t.classList.contains("is-on");
    })).toBe(true);
  });

  test("après validation, le Fil se personnalise IMMÉDIATEMENT, sans rechargement", async ({ page }) => {
    await bootVisiteur(page);
    let rechargements = 0;
    page.on("load", () => rechargements++);

    await page.evaluate(() => PassioFirstRun.ouvrirPersonnalisation("test"));
    await page.locator('#frGrid [data-fr-passion="moto"]').click();
    await page.locator("#frValider").click();
    await page.waitForTimeout(900);

    // Le moteur EXISTANT porte la sélection — aucun second moteur de fil.
    expect(await page.evaluate(() => Array.from(_activeFeedPassions))).toContain("moto");
    expect(await page.evaluate(() => state.selectedFeedPassions)).toContain("moto");
    // Persistée dans le format versionné.
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("passio_first_run_v1")));
    expect(prefs.v).toBe(1);
    expect(prefs.passions).toContain("moto");
    // Aucun rechargement, aucun second onboarding.
    expect(rechargements).toBe(0);
    expect(await page.locator("#onboarding.active").count()).toBe(0);
    expect(await page.evaluate(feedActif)).toBe(true);

    // Et le fil montre bien des publications de cette passion.
    await page.waitForTimeout(600);
    expect(await page.locator("#feedList .post").count()).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. TOUR CONTEXTUEL
// ─────────────────────────────────────────────────────────────────────────
test.describe("Tour contextuel", () => {
  test("trois indications au maximum, non bloquantes, mémorisées, relançables", async ({ page }) => {
    await bootVisiteur(page);
    await page.locator("#frWelcome .fr-welcome-alt").click(); // libère la place

    const bulle = page.locator(".fr-tip");
    await expect(bulle).toBeVisible({ timeout: 15000 });
    await expect(bulle).toContainText("Un Fil construit autour de tes passions");
    // Une seule bulle à la fois — jamais d'accumulation de fenêtres.
    expect(await bulle.count()).toBe(1);
    // Non bloquante : elle ne couvre pas l'écran et le fil reste défilable.
    const b = await bulle.boundingBox();
    expect(b.height).toBeLessThan(page.viewportSize().height * 0.4);

    // Fermée par « Compris », elle ne revient pas.
    await page.locator(".fr-tip-ok").click();
    await expect(bulle).toHaveCount(0);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => {
      const t = document.querySelector(".fr-tip");
      return t ? t.getAttribute("data-fr-tip") : null;
    })).not.toBe("decouvrir");

    // Mémorisée dans les préférences versionnées.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("passio_first_run_v1")).tour.decouvrir)).toBe(true);

    // Relançable : les trois repères repartent de zéro.
    await page.evaluate(() => PassioFirstRun.relancerTour());
    await page.waitForTimeout(1400);
    await expect(page.locator('.fr-tip[data-fr-tip="decouvrir"]')).toHaveCount(1);
  });

  test("l'étape « Rencontrer » apparaît à la première ouverture de l'écran IRL", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true, prefs: { v: 1, passions: ["moto"], specialites: [], intents: [], tour: {}, bienvenue: "vue", retour: null, migre: false, debut: 1 } });
    await page.evaluate(() => goTo("irl"));
    await page.waitForTimeout(1600);
    const bulle = page.locator('.fr-tip[data-fr-tip="rencontrer"]');
    await expect(bulle).toHaveCount(1);
    await expect(bulle).toContainText("Passe du numérique au réel");
    await expect(bulle).toContainText("sans activer automatiquement ta position");
  });

  test("navigation clavier : Entrée active une seule fois, Échap ferme", async ({ page }) => {
    await bootVisiteur(page);
    await page.locator("#frWelcome .fr-welcome-alt").click();
    await expect(page.locator(".fr-tip")).toBeVisible({ timeout: 15000 });

    // Le bouton « Compris » reçoit le focus : la bulle est utilisable au clavier.
    expect(await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains("fr-tip-ok"))).toBe(true);

    // ⚠️ DOUBLE ACTIVATION. app-08 porte un délégué clavier générique pour tout
    // `[role="button"]` NON natif. Nos boutons sont des `<button>` natifs, que ce
    // délégué exclut : une frappe = une activation. On le PROUVE en comptant les
    // clics reçus, pas en le supposant.
    await page.evaluate(() => {
      window.__clics = 0;
      document.querySelector(".fr-tip-ok").addEventListener("click", () => { window.__clics++; });
    });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__clics)).toBe(1);
    await expect(page.locator(".fr-tip")).toHaveCount(0);

    // Échap ferme aussi, sans toucher au reste.
    await page.evaluate(() => PassioFirstRun.relancerTour());
    await page.waitForTimeout(1400);
    await expect(page.locator(".fr-tip")).toHaveCount(1);
    await page.locator(".fr-tip-ok").focus();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(page.locator(".fr-tip")).toHaveCount(0);
  });

  test("le premier tour s'arrête à trois étapes ; Profil, Messages et Studio ont la leur, à part", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true, prefs: { v: 1, passions: ["moto"], specialites: [], intents: [], tour: {}, bienvenue: "vue", retour: null, migre: false, debut: 1 } });

    // Les trois surfaces du premier tour portent leur formulation courte.
    // ⚠️ CHAQUE ÉTAPE EST ANCRÉE À UN ÉLÉMENT DE SON ÉCRAN : `montrerHint` et
    // `montrerEtape` refusent une cible sans `offsetParent`, donc demander
    // « Rencontrer » depuis le Fil ne pose rien — et le test échouerait pour une
    // raison qui n'a rien à voir avec ce qu'il mesure. On navigue d'abord.
    const attendus = [
      ["decouvrir", "feed", "Ce qui t'inspire"],
      ["rencontrer", "irl", "Ce que tu veux vivre"],
      ["creer", "feed", "Ce que tu veux partager"],
    ];
    for (const [etape, ecran, formule] of attendus) {
      await page.evaluate(([e, ec]) => {
        PassioFirstRun.fermerBulle();
        PassioFirstRun.prefs().tour = {};
        goTo(ec);
      }, [etape, ecran]);
      await page.waitForTimeout(900);
      await page.evaluate((e) => { PassioFirstRun.fermerBulle(); PassioFirstRun.prefs().tour = {}; PassioFirstRun.montrerEtape(e); }, etape);
      await page.waitForTimeout(300);
      await expect(page.locator(".fr-tip .fr-tip-eyebrow")).toHaveText(formule);
    }
    await page.evaluate(() => { PassioFirstRun.fermerBulle(); goTo("feed"); });
    await page.waitForTimeout(600);

    // ⚠️ Profil / Messages / Studio ne sont PAS dans le premier tour : ils ne se
    // déclenchent qu'à l'ouverture de leur propre écran.
    await page.evaluate(() => { PassioFirstRun.fermerBulle(); PassioFirstRun.prefs().tour = {}; goTo("profiles"); });
    await page.waitForTimeout(1400);
    await expect(page.locator('.fr-tip[data-fr-tip="profil"]')).toHaveCount(1);
    await expect(page.locator(".fr-tip .fr-tip-eyebrow")).toHaveText("Tout ce qui te passionne");

    // Et une seule fois : y revenir ne la remontre pas.
    await page.evaluate(() => { PassioFirstRun.fermerBulle(); goTo("feed"); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { PassioFirstRun.fermerBulle(); goTo("profiles"); });
    await page.waitForTimeout(1400);
    await expect(page.locator('.fr-tip[data-fr-tip="profil"]')).toHaveCount(0);
  });
});

test.describe("Aides au geste", () => {
  // Demandé par Benjamin après essai : « une petite bulle d'explication pour
  // toutes les fonctionnalités — les moods, les bulles de profil en haut… ».
  // ⚠️ Elles ne s'empilent PAS à l'ouverture : chacune attend le premier geste
  // sur la commande dont elle parle. Empiler six bulles sur le premier écran
  // reconstruirait le tutoriel que ce lot remplace.
  const zones = [
    ["#profileStrip .profile-tile", "passions", "Tes passions filtrent le Fil"],
    ["#feedIntentSelector .feed-intent-btn", "envies", "Ton envie du moment"],
    // ⚠️ Deux pièges dans cette seule ligne. ① La classe est `.story-item`, PAS
    // `.story` — une sonde écrite avec `.story` rend 0 et fait conclure à tort
    // que le rail est vide pour un visiteur. Il ne l'est pas : « Ta story »
    // suivie des comptes de la graine. ② On écarte la PREMIÈRE bulle : c'est
    // « Ta story », donc une action de CRÉATION, désormais arrêtée par le gate —
    // et le gate ouvre une modale, que `ecranOccupe()` refuse (à raison). Le
    // geste qui porte l'aide est celui d'un visiteur qui REGARDE une story.
    ["#storiesRowFeed .story-item:not(:first-child)", "stories", "Ce qui se passe maintenant"],
  ];

  for (const [selecteur, etape, titre] of zones) {
    test(`toucher ${etape} explique ${etape}, une seule fois`, async ({ page }) => {
      await bootVisiteur(page, { sansBienvenue: true });

      // Rien AVANT le geste : c'est tout l'intérêt.
      expect(await page.locator(`.fr-tip[data-fr-tip="${etape}"]`).count()).toBe(0);

      const cible = page.locator(selecteur).first();
      await expect(cible).toBeVisible({ timeout: 15000 });
      await page.evaluate(() => PassioFirstRun.fermerBulle());
      await cible.click();
      await page.waitForTimeout(1200);
      const bulle = page.locator(`.fr-tip[data-fr-tip="${etape}"]`);
      await expect(bulle).toHaveCount(1);
      await expect(bulle).toContainText(titre);

      // Une seule fois : refermée, un second geste ne la ramène pas.
      await page.locator(".fr-tip-ok").click();
      await expect(page.locator(".fr-tip")).toHaveCount(0);
      // ⚠️ On revient d'abord au Fil. Le geste qui déclenche l'aide OUVRE
      // souvent quelque chose par-dessus le rail (ouvrir une story pose le
      // lecteur plein écran) : sans ce retour, le second clic ne rate pas
      // parce que l'aide serait revenue, mais parce que la commande n'est plus
      // atteignable — un rouge qui ne dirait rien de ce qu'on veut prouver.
      await page.evaluate(() => {
        try { closeStoryViewer(); } catch (e) {}
        try { closeModal(); } catch (e) {}
        if (typeof goTo === "function") goTo("feed");
      });
      await page.waitForTimeout(800);
      await cible.click();
      await page.waitForTimeout(1200);
      expect(await page.locator(`.fr-tip[data-fr-tip="${etape}"]`).count()).toBe(0);
    });
  }

  test("le geste n'est jamais empêché : la commande touchée agit quand même", async ({ page }) => {
    // ⚠️ L'aide s'affiche APRÈS le geste, elle ne le remplace pas. Sans cette
    // garantie, la première tape sur une passion serait avalée par l'explication
    // — l'utilisateur toucherait deux fois pour un effet.
    await bootVisiteur(page, { sansBienvenue: true });
    // ⚠️ AVANT TOUT CHOIX, LE RAIL NE CONTIENT QUE « Suivis ». `renderProfileStrip`
    // rend les passions DU COMPTE (`state.user.profiles`), et un visiteur n'en a
    // aucune : les tuiles n'apparaissent qu'une fois ses passions choisies.
    // Chercher ici une tuile de passion, c'est chercher ce qui n'existe pas
    // encore — mesuré, pas déduit. On mesure donc ce que le test veut vraiment
    // dire : le geste n'est pas AVALÉ par l'aide, quel que soit le bouton.
    const tuile = page.locator("#profileStrip .profile-tile").first();
    await expect(tuile).toBeVisible({ timeout: 15000 });
    const avant = await page.evaluate(() => ({
      passions: Array.from(_activeFeedPassions).join(","),
      suivis: state.feedFollowingOn !== false,
    }));
    await tuile.click();
    await page.waitForTimeout(1200);
    const apres = await page.evaluate(() => ({
      passions: Array.from(_activeFeedPassions).join(","),
      suivis: state.feedFollowingOn !== false,
    }));
    expect(apres.passions !== avant.passions || apres.suivis !== avant.suivis).toBe(true);
  });

  test("toute aide déclarée a une ancre RÉELLEMENT atteignable", async ({ page }) => {
    // ⚠️ CE TEST EST LE VERROU DE LA FAMILLE, pas d'un cas. Une aide « bobines »
    // a été livrée le 2026-09-01 avec une ancre qui n'existait pas :
    // `.app-nav-v2 [data-v2-key="reels"]` ne matche rien (`DESTINATIONS` n'a
    // pas cette clé) et son repli `.app-nav .nav-bobines` vit dans la nav
    // historique que UI-1 met en `display: none`. Résultat mesuré : 0×0,
    // `offsetParent` nul, `montrerEtape("bobines")` toujours `false`. L'aide
    // était morte — et rien ne le disait, parce qu'aucun test ne l'exerçait.
    // C'est la famille « une règle qui survit à la disparition de sa cible »,
    // déjà payée trois fois dans ce projet. On mesure donc l'ancre de CHAQUE
    // aide au geste, pas seulement celles qu'on a pensé à tester.
    await bootVisiteur(page, { sansBienvenue: true });
    const bilan = await page.evaluate(() => {
      const out = [];
      for (const [selecteur, id] of PassioFirstRun.zonesGeste()) {
        const zone = document.querySelector(selecteur);
        const cible = PassioFirstRun.cibleEtape(id);
        const r = cible ? cible.getBoundingClientRect() : null;
        out.push({
          id,
          selecteur,
          zonePresente: !!zone,
          cibleTrouvee: !!cible,
          cibleVisible: !!(cible && cible.offsetParent && r && (r.width || r.height)),
        });
      }
      return out;
    });
    // Au moins une aide, sinon le test ne prouve rien.
    expect(bilan.length).toBeGreaterThan(0);
    for (const z of bilan) {
      // La ZONE peut légitimement être un repli absent (`#moodSelector` est
      // masqué sous UI-7) — ce qui ne doit JAMAIS arriver, c'est qu'AUCUNE des
      // zones d'une aide ne soit présente, ou que sa cible soit invisible.
      expect(z.cibleTrouvee, `aide « ${z.id} » : cible introuvable`).toBe(true);
      expect(z.cibleVisible, `aide « ${z.id} » : cible présente mais INVISIBLE (0×0 ou offsetParent nul)`).toBe(true);
    }
    const idsAvecZone = new Set(bilan.filter((z) => z.zonePresente).map((z) => z.id));
    for (const z of bilan) {
      expect(idsAvecZone.has(z.id), `aide « ${z.id} » : aucune de ses zones n'existe dans le DOM`).toBe(true);
    }
  });

  test("jamais deux bulles à l'écran en même temps", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true });
    await page.locator("#profileStrip .profile-tile").first().click();
    await page.waitForTimeout(900);
    await page.locator("#feedIntentSelector .feed-intent-btn").first().click();
    await page.waitForTimeout(1400);
    expect(await page.locator(".fr-tip").count()).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. GATES D'AUTHENTIFICATION
// ─────────────────────────────────────────────────────────────────────────
test.describe("Gate d'authentification", () => {
  test("le gate EXPLIQUE l'action demandée, et propose trois issues", async ({ page }) => {
    await bootVisiteur(page);
    const cas = [
      ["suivre", "Crée ton compte pour suivre cette personne"],
      ["rejoindre", "Crée ton compte pour participer à cette activité"],
      ["publier", "Crée ton compte pour publier ta création"],
      ["preferences", "Crée ton compte pour conserver tes passions"],
    ];
    for (const [ctx, attendu] of cas) {
      const autorise = await page.evaluate((c) => requireAuthentication(c), ctx);
      expect(autorise).toBe(false); // l'action est ARRÊTÉE
      await expect(page.locator("#modalContent")).toContainText(attendu);
      await expect(page.locator("#modalContent")).toContainText("Tes passions et tes préférences seront conservées.");
      // Le pitch principal n'a pas d'écran à lui : il apparaît là où il sert,
      // au moment où quelqu'un décide s'il crée un compte.
      await expect(page.locator("#modalContent .fr-gate-pitch")).toContainText("Toutes tes passions. Une seule identité.");
      await expect(page.locator("#modalContent")).toContainText("Créer mon compte");
      await expect(page.locator("#modalContent")).toContainText("J'ai déjà un compte");
      await expect(page.locator("#modalContent")).toContainText("Continuer à explorer");
      await page.evaluate(() => closeModal());
    }
  });

  test("un like de visiteur est ARRÊTÉ : ni état local modifié, ni écriture", async ({ page }) => {
    await bootVisiteur(page);
    const avant = await page.evaluate(() => (state.user.likedPosts || []).length);
    await page.evaluate(() => {
      const p = allFeedPosts()[0];
      window.__pid = p.id;
      likePost(p.id);
    });
    await page.waitForTimeout(400);
    await expect(page.locator("#modalContent")).toContainText("Crée ton compte pour aimer");
    expect(await page.evaluate(() => (state.user.likedPosts || []).length)).toBe(avant);
  });

  test("une activité de DÉMONSTRATION refuse la participation, sans promettre un compte", async ({ page }) => {
    await bootVisiteur(page);
    // On neutralise le gate d'auth pour isoler la garde « exemple » : c'est elle
    // qu'on mesure, et elle doit s'appliquer AVANT toute écriture.
    await page.evaluate(async () => {
      window.__toasts = [];
      const vrai = window.toast;
      window.toast = function (t) { window.__toasts.push(String(t)); return vrai.apply(null, arguments); };
      window.requireAuthentication = () => true;
      const ev = allEvents().find((e) => /^e\d+$/.test(e.id));
      window.__evid = ev && ev.id;
      if (ev) await setEventRsvp(ev.id, "going");
    });
    await page.waitForTimeout(400);
    const toasts = await page.evaluate(() => window.__toasts);
    expect(toasts.join(" ")).toContain("exemple");
    // Aucune participation n'a été enregistrée.
    expect(await page.evaluate(() => myRsvp(window.__evid))).toBeFalsy();
  });

  test("TOUTES les portes d'écriture sont gardées, y compris celles des bobines", async ({ page }) => {
    await bootVisiteur(page);
    // ⚠️ Le lecteur de bobines et la feuille de commentaires ont leurs PROPRES
    // chemins d'écriture : ils ne passent ni par `likePost` ni par
    // `submitComment`. Garder seulement les points « évidents » laissait donc
    // des portes ouvertes. Ce test énumère la surface entière : il rougira le
    // jour où un nouveau point d'écriture oubliera son gate.
    const portes = [
      "likePost", "submitComment", "submitCommentSheet", "toggleFollowUser",
      "sendMessage", "sendMessageFp", "publishPost", "mePublish",
      "openCreateEvent", "submitEvent", "setEventRsvp",
      "toggleReelLike", "submitReelComment", "likeReelComment",
      // ⚠️ `meOpen` a été ajoutée le 2026-09-01, après mesure. `mePublish`
      // était gardée, pas elle — or c'est `meOpen` qui OUVRE l'éditeur média en
      // `phase-capture`, donc qui demande l'accès CAMÉRA. Un visiteur touchant
      // « Ta story » dans la rangée du Fil y tombait à une seule tape de
      // l'entrée directe. Garder la seule fonction qui écrit ne suffit pas :
      // il faut garder celle qui ouvre la porte.
      "meOpen",
    ];
    const resultat = await page.evaluate((noms) => {
      const sansGate = [];
      const absentes = [];
      for (const n of noms) {
        if (typeof window[n] !== "function") { absentes.push(n); continue; }
        // Le gate ouvre la modale : on la referme et on regarde si elle s'est
        // ouverte. Une porte gardée l'ouvre, une porte ouverte ne l'ouvre pas.
        closeModal();
        try { window[n]("x", "y"); } catch (e) { /* l'important est le gate, pas la suite */ }
        const ouverte = !!document.querySelector("#modalBackdrop.active")
          && /Crée ton compte/.test(document.getElementById("modalContent").textContent || "");
        if (!ouverte) sansGate.push(n);
      }
      closeModal();
      return { sansGate, absentes };
    }, portes);

    expect(resultat.absentes).toEqual([]);   // aucun nom n'a été renommé sans suite
    expect(resultat.sansGate).toEqual([]);   // aucune porte n'est restée ouverte
  });

  test("« Ta story » n'ouvre PAS la caméra à un visiteur", async ({ page }) => {
    // Le contrôle par nom de fonction ci-dessus prouve le gate ; celui-ci
    // prouve l'EFFET, sur le geste réel, parce que c'est l'effet qui comptait :
    // l'éditeur média ne doit jamais recevoir sa classe `open`, seul moment où
    // la capture démarre et où le navigateur réclame la caméra. ⚠️ Aucun
    // contrôle d'ÉCRAN ne verrait ce défaut — `#mediaEditor` se pose par-dessus
    // le Fil, qui reste l'écran actif.
    await bootVisiteur(page, { sansBienvenue: true });
    const rail = page.locator("#storiesRowFeed .story-item").first();
    await expect(rail).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => PassioFirstRun.fermerBulle());
    await rail.click();
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => ({
      editeurOuvert: !!(document.getElementById("mediaEditor") || {}).classList
        && document.getElementById("mediaEditor").classList.contains("open"),
      gate: !!document.querySelector("#modalBackdrop.active")
        && /Crée ton compte/.test((document.getElementById("modalContent") || {}).textContent || ""),
    }));
    expect(r.editeurOuvert).toBe(false);
    expect(r.gate).toBe(true);
  });

  test("le contenu de démonstration est étiqueté « Exemple PASSIO »", async ({ page }) => {
    await bootVisiteur(page);
    expect(await page.locator("#feedList .fr-demo-tag").count()).toBeGreaterThan(0);
    await expect(page.locator("#feedList .fr-demo-tag").first()).toHaveText("Exemple PASSIO");
  });

  test("une activité de démonstration n'invente ni proximité ni participants", async ({ page }) => {
    await bootVisiteur(page);
    await page.evaluate(() => goTo("irl"));
    await page.waitForTimeout(1600);

    const texte = await page.locator("#eventList").innerText();
    // Elle DIT ce qu'elle est…
    expect(texte).toContain("Exemple PASSIO");
    // …et ne promet ni distance, ni participants. ⚠️ La distance venait d'un
    // point de RÉFÉRENCE, jamais de la position du visiteur (qu'on ne demande
    // pas) : posée sur un exemple, elle laissait croire à une rencontre à côté
    // de chez soi. Mesuré en capture avant correction : « environ 8,6 km ».
    expect(texte).not.toContain("environ ");
    expect(texte).not.toMatch(/\d+ participants?/);

    // Et le kill switch rend les chiffres historiques.
    await page.evaluate(() => { window.PASSIO_FIRST_RUN_V1 = false; renderIRL(); });
    await page.waitForTimeout(900);
    const apres = await page.locator("#eventList").innerText();
    expect(apres).not.toContain("Exemple PASSIO");
    expect(apres).toMatch(/\d+ participants?/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. MIGRATION DES PRÉFÉRENCES
// ─────────────────────────────────────────────────────────────────────────
test.describe("Transfert du mode invité", () => {
  const prefsInvite = {
    v: 1, passions: ["moto", "photo", "moto", "passion_qui_n_existe_pas"],
    specialites: ["moto:balade", "photo:portrait", "cuisine:bbq"],
    intents: [], tour: { decouvrir: true }, bienvenue: "vue", retour: null, migre: false, debut: 1,
  };

  test("elle fusionne sans écraser, dédoublonne, nettoie, et ne tourne qu'une fois", async ({ page }) => {
    await bootVisiteur(page, { prefs: prefsInvite });
    const resultat = await page.evaluate(() => {
      // Un compte qui a DÉJÀ des choix : ils doivent survivre et rester premiers.
      state.selectedFeedPassions = ["musique"];
      state.onboarded = true;                       // le compte existe désormais
      const premier = PassioFirstRun.migrerPreferences();
      const apres1 = state.selectedFeedPassions.slice();
      const second = PassioFirstRun.migrerPreferences();  // relance : idempotente
      return { premier, second, apres1, apres2: state.selectedFeedPassions.slice(),
               specs: state.user.passionSpecialites, tour: state.firstRunTour };
    });

    expect(resultat.premier).toBe(true);
    expect(resultat.second).toBe(false);              // ne tourne qu'une fois
    expect(resultat.apres1[0]).toBe("musique");       // le choix du compte reste PREMIER
    expect(resultat.apres1).toContain("moto");
    expect(resultat.apres1).toContain("photo");
    expect(resultat.apres1).not.toContain("passion_qui_n_existe_pas"); // identifiant inconnu nettoyé
    expect(resultat.apres1.filter((x) => x === "moto").length).toBe(1); // dédoublonné
    expect(resultat.apres2).toEqual(resultat.apres1);  // relance sans doublon
    // Une spécialité dont la passion parente n'a pas été retenue ne passe pas.
    expect(resultat.specs).toContain("moto:balade");
    expect(resultat.specs).not.toContain("cuisine:bbq");
    // L'état du tour est reporté : on ne le relance pas depuis le début.
    expect(resultat.tour.decouvrir).toBe(true);
  });

  test("une interruption laisse la migration à refaire, et la refaire aboutit", async ({ page }) => {
    await bootVisiteur(page, { prefs: prefsInvite });
    const r = await page.evaluate(() => {
      state.onboarded = true;
      // Panne au moment d'écrire : `setFeedPassions` lève.
      const vrai = window.setFeedPassions;
      window.setFeedPassions = function () { throw new Error("réseau"); };
      const echec = PassioFirstRun.migrerPreferences();
      const marqueApresEchec = PassioFirstRun.prefs().migre;
      window.setFeedPassions = vrai;
      const reussite = PassioFirstRun.migrerPreferences();
      return { echec, marqueApresEchec, reussite, passions: state.selectedFeedPassions };
    });
    expect(r.echec).toBe(false);
    expect(r.marqueApresEchec).toBe(false);  // le drapeau n'est posé qu'APRÈS le travail
    expect(r.reussite).toBe(true);
    expect(r.passions).toContain("moto");
  });

  test("après authentification : retour à la destination, et AUCUNE action rejouée", async ({ page }) => {
    await bootVisiteur(page, { prefs: prefsInvite });
    const r = await page.evaluate(async () => {
      const journal = [];
      ["publishPost", "mePublish", "submitEvent", "sendMessage", "sendMessageFp", "setEventRsvp", "likePost", "submitComment", "toggleFollowUser"]
        .forEach((n) => { if (typeof window[n] === "function") { window[n] = function () { journal.push(n); }; } });
      // Le visiteur voulait rejoindre une activité, depuis l'écran IRL.
      requireAuthentication("rejoindre");
      closeModal();
      // …puis le compte est créé (chemin réel : la fin d'`onbFinish`).
      state.onboarded = true;
      PassioFirstRun.apresAuthentification();
      await new Promise((r2) => setTimeout(r2, 900));
      return { journal, ecran: (document.querySelector(".screen.active") || {}).id,
               migre: PassioFirstRun.prefs().migre, passions: state.selectedFeedPassions };
    });
    // ⚠️ LE POINT CENTRAL DU LOT : rien n'est publié, envoyé ni rejoint tout seul.
    expect(r.journal).toEqual([]);
    expect(r.migre).toBe(true);
    expect(r.passions).toContain("moto");
    // La destination existait (« feed ») : on y revient proprement.
    expect(r.ecran).toBe("screen-feed");
  });

  test("une destination disparue ramène proprement dans Découvrir", async ({ page }) => {
    await bootVisiteur(page, { prefs: prefsInvite });
    const ecran = await page.evaluate(async () => {
      const p = PassioFirstRun.prefs();
      p.retour = { screen: "ecran-qui-nexiste-plus", hash: "", action: "suivre", scroll: 0 };
      state.onboarded = true;
      goTo("irl");
      PassioFirstRun.apresAuthentification();
      await new Promise((r) => setTimeout(r, 900));
      return (document.querySelector(".screen.active") || {}).id;
    });
    expect(ecran).toBe("screen-feed");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. KILL SWITCH
// ─────────────────────────────────────────────────────────────────────────
test.describe("Kill switch", () => {
  test("drapeau COUPÉ : l'ancien parcours est restitué, sans aucune trace du lot", async ({ page }) => {
    await bootVisiteur(page, { flag: "off" });

    // La landing historique reprend la main — c'est le comportement d'avant.
    await expect(page.locator("#landing")).toHaveClass(/active/);
    expect(await page.evaluate(() => PassioFirstRun.actif())).toBe(false);
    expect(await page.evaluate(() => PassioFirstRun.estVisiteur())).toBe(false);
    expect(await page.evaluate(() => document.documentElement.classList.contains("passio-first-run"))).toBe(false);
    expect(await page.locator("#frWelcome").count()).toBe(0);
    expect(await page.locator(".fr-tip").count()).toBe(0);
    expect(await page.locator(".fr-demo-tag").count()).toBe(0);
    // Rien n'est écrit dans localStorage par le lot.
    expect(await page.evaluate(() => localStorage.getItem("passio_first_run_v1"))).toBeNull();
    // Et le gate laisse TOUT passer : aucune action n'est bloquée.
    expect(await page.evaluate(() => requireAuthentication("publier"))).toBe(true);
    expect(await page.evaluate(() => requireAuthentication("rejoindre"))).toBe(true);
    // Les entrées d'options du lot restent invisibles.
    await expect(page.locator(".fr-only").first()).toBeHidden();

    // ⚠️ ET LA MISE EN PAGE HISTORIQUE EST INTACTE. Une première version du bloc
    // CSS posait `#onboarding { position: relative }` pour ancrer le bouton
    // « ← Continuer à explorer » — or `.onboarding-shell` est déjà
    // `position: absolute; inset: 0`, et un sélecteur d'ID bat sa classe : la
    // règle transformait l'onboarding en bloc relatif POUR TOUT LE MONDE, drapeau
    // coupé compris. Aucun test ne l'aurait vu ; celui-ci le voit.
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("onboarding")).position)).toBe("absolute");
    expect(await page.evaluate(() => document.querySelectorAll("#frBackToExplore").length)).toBe(0);
  });

  test("l'URL NORMALE suffit désormais, et le lot n'écrit toujours rien pour activer", async ({ page }) => {
    // ⚠️ CE CAS A ÉTÉ RETOURNÉ, pas supprimé. Il exigeait auparavant que
    // `?passio_preview=first-run-v1` active le parcours ET persiste un "1" —
    // la persistance servait à survivre au lien NEUF de la confirmation
    // d'e-mail. Depuis le basculement du 2026-09-01 le défaut est « actif » :
    // ce lien neuf tombe sur le parcours de toute façon, la persistance n'a plus
    // d'objet, et écrire une valeur positive masquerait une régression du
    // défaut. On mesure donc exactement l'inverse — actif SANS rien écrire.
    await bootVisiteur(page); // aucun paramètre, aucun drapeau posé
    expect(await page.evaluate(() => PassioFirstRun.actif())).toBe(true);
    expect(await page.evaluate(feedActif)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("passio_first_run_experience_v1"))).toBeNull();

    // Et il survit à un rechargement sans qu'on ait rien persisté.
    await page.goto("/index.html");
    await page.waitForTimeout(3200);
    expect(await page.evaluate(() => PassioFirstRun.actif())).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("passio_first_run_experience_v1"))).toBeNull();
  });

  test("un ancien appareil d'aperçu (« 1 » persisté) reste coupable par le kill switch", async ({ page }) => {
    // ⚠️ On cesse d'ÉCRIRE le "1", on ne le renie pas : des appareils qui ont
    // testé l'aperçu en portent un. La coupure "0" est lue AVANT lui, donc un
    // kill switch posé sur un tel appareil gagne quand même. Sans cet ordre,
    // ces appareils-là seraient les seuls à ne plus pouvoir couper le lot.
    await bootVisiteur(page, { flag: "off" });
    await page.evaluate(() => localStorage.setItem("passio_first_run_experience_v1", "0"));
    expect(await page.evaluate(() => {
      const avant = localStorage.getItem("passio_first_run_experience_v1");
      localStorage.setItem("passio_first_run_experience_v1", "1");
      const avecUn = PassioFirstRun.actif();
      localStorage.setItem("passio_first_run_experience_v1", "0");
      const avecZero = PassioFirstRun.actif();
      localStorage.setItem("passio_first_run_experience_v1", avant);
      return { avecUn, avecZero };
    })).toEqual({ avecUn: true, avecZero: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 8. MOBILE
// ─────────────────────────────────────────────────────────────────────────
test.describe("Cadrage mobile", () => {
  for (const largeur of [320, 390, 430]) {
    test(`à ${largeur} px : aucun débordement horizontal, cibles ≥ 44 px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 780 });
      await bootVisiteur(page);
      await expect(page.locator("#frWelcome")).toBeVisible({ timeout: 15000 });

      // Aucune barre horizontale sur le document.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      // Les actions de la carte tiennent dans l'écran et sont assez grandes.
      for (const sel of ["#frWelcome .fr-welcome-cta", "#frWelcome .fr-welcome-alt", "#frWelcome .fr-welcome-close"]) {
        const b = await page.locator(sel).boundingBox();
        expect(b.height).toBeGreaterThanOrEqual(43.5);
        expect(b.x).toBeGreaterThanOrEqual(-0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(largeur + 0.5);
      }

      // Le panneau : la grille de passions PASSE À LA LIGNE, elle ne se fait pas
      // défiler horizontalement (« aucune barre horizontale nécessitant un
      // glissement pour atteindre une action essentielle »).
      await page.locator("#frWelcome .fr-welcome-cta").click();
      await expect(page.locator("#frGrid")).toBeVisible();
      expect(await page.evaluate(() => {
        const g = document.getElementById("frGrid");
        return g.scrollWidth <= g.clientWidth + 1;
      })).toBe(true);
      const valider = await page.locator("#frValider").boundingBox();
      expect(valider.height).toBeGreaterThanOrEqual(43.5);
      expect(valider.x + valider.width).toBeLessThanOrEqual(largeur + 0.5);
      // Le champ de recherche est à 16 px : en dessous, iOS zoome au focus.
      expect(await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("frSearch")).fontSize))).toBeGreaterThanOrEqual(16);
    });
  }
});
