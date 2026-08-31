// Lot UI-7 — cohérence des interfaces (§1 vocabulaire · §2 Rencontrer · §3 Fil
// · §4 barre supérieure · §6 Profil · §8 Bobine).
//
// Ce que cette suite prouve, dans l'ordre de l'ordre reçu :
//   ① les libellés visibles ont changé, et EUX SEULS — les identifiants
//      (`data-intent`, `data-tab`, `data-irlfilter`) sont inchangés ;
//   ② Rencontrer : « Filtres » distinct des deux onglets, « Détails »,
//      « Je viens » puis « Inscrit ✓ », la ligne participants/places CALCULÉE,
//      la passion abrégée sans que la passion canonique bouge, et AUCUNE
//      demande de position à l'ouverture ;
//   ③ le Fil ne pousse la page à aucune largeur (320, 390, 430 px), les
//      passions RESTENT des bulles — simplement plus petites, et le kill
//      switch leur rend leur taille d'origine — et elles restent affichées
//      pendant tout le défilement (le repli au défilement a été retiré) ;
//   ④ Messages a quitté la barre supérieure sans quitter l'application ;
//   ⑥ le Profil a trois onglets nommés et RIEN n'est devenu inatteignable ;
//   ⑧ après l'enregistrement d'une bobine : aperçu, « Recommencer » /
//      « Continuer », puis une feuille qui publie via le moteur historique ;
//   ⑨ le kill switch rend l'interface d'avant, sans rechargement.
//
// ⚠️ Le parcours Bobine est joué DEUX FOIS, volontairement : ici par le chemin
// déterministe (`meSetMedia`, exactement ce que `_meOnRecordingStop` appelle
// après le relâchement), pour que les assertions de contenu soient fiables ; et
// dans `ui-v7-bobine-camera.spec.js` avec une CAMÉRA SIMULÉE et un vrai maintien
// du bouton, pour prouver que le chemin réel arrive au même endroit. Ce second
// fichier est séparé parce que `test.use({ launchOptions })` force un worker
// dédié et n'est pas admis dans un `describe`.
// ⚠️ Cette suite pose au boot le kill switch du lot UI-4A5 (2026-08-29), qui
// recouvre le comportement qu'elle observe : depuis ce lot, « Filtres » n'ouvre
// plus le dialogue contextuel, il affiche les choix EN LIGNE sous les onglets.
// Convention du projet : la suite qui observe le comportement historique coupe
// le lot qui le recouvre et garde TOUTES ses assertions ; la cohabitation est
// prouvée à part, dans `ui-v4a5-filtres.spec.js`.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Une vidéo minuscule mais VALIDE en base64 : `_meDataUrlToBlob` cherche
// « ;base64, » et non la première virgule (un mime à codecs en contient une).
const VIDEO_FACTICE = "data:video/webm;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAA";

async function boot(page, errors, n = 3) {
  // ⚠️ CONVENTION DE TEST (la même qu'aux mises en ligne d'UI-3A et d'UI-4) :
  // cette suite observe des surfaces que des lots PLUS RÉCENTS recouvrent. Elle
  // pose leur kill switch et garde TOUTES ses assertions ; leur cohabitation est
  // prouvée à part, dans la suite de chacun.
  //   · UI-4A5 : « Filtres » devient une vue de Rencontrer.
  //   · UI-8   : le libellé du composer (« Passion : » → « Publication dans : »)
  //              et l'état de la carte de passion (rendu par app-06, plus par UI-6B).
  await page.addInitScript(() => localStorage.setItem("passio_ui_4a5", "0"));
  await page.addInitScript(() => localStorage.setItem("passio_ui_8", "0"));
  await bootOnboarded(page, errors, n);
}

async function allerIrl(page) {
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(900);
}

// ══════════════════════════════════════════════════════════════════════════
// ① VOCABULAIRE (§1)
// ══════════════════════════════════════════════════════════════════════════
test.describe("UI-7 §1 — vocabulaire visible", () => {
  test("les libellés changent, les identifiants ne bougent pas", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, errors);

    // Fil : cinq intentions renommées, MÊMES `data-intent`.
    expect(await page.locator(".feed-intent-btn").allTextContents())
      .toEqual(["Tous", "Explorer", "Apprendre", "Idées", "Rencontrer"]);
    expect(await page.locator(".feed-intent-btn").evaluateAll(
      (b) => b.map((x) => x.getAttribute("data-intent"))))
      .toEqual(["for_you", "discover", "learn", "create", "meet"]);

    // Studio : « Passion : … », « Options », « Changer de profil ».
    await page.evaluate(() => goTo("studio"));
    await page.waitForTimeout(600);
    await expect(page.locator("[data-v6-passio]")).toContainText("Passion : ");
    await expect(page.locator(".v6-affiner summary")).toHaveText("Options");
    await expect(page.locator(".v6-identite")).toContainText("Changer de profil");

    // Profil : « Mes passions », « + Ajouter une passion ».
    // ⚠️ ANCRE DÉPLACÉE, ASSERTION CONSERVÉE. La refonte multi-passion (ADR-011)
    // retire l'onglet « À propos » ; le titre et son lien vivent maintenant dans
    // le panneau `#passionManager`, qu'ouvre `openPassionManager`. Le lot UI-7
    // les renomme toujours, et c'est ce que ce cas vérifie.
    await page.evaluate(() => { goTo("profiles"); openPassionManager(); });
    await page.waitForTimeout(600);
    await expect(page.locator("#nouveauProfilLien")).toHaveText("+ Ajouter une passion");
    expect(await page.evaluate(() =>
      document.getElementById("nouveauProfilLien").parentNode.textContent))
      .toContain("Mes passions");

    // La marque n'est JAMAIS touchée.
    await expect(page.locator(".app-topbar .brand-name")).toHaveText("PASSIO");

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("Rencontrer : « Filtres », « Choisir une ville », « Mes inscriptions »", async ({ page }) => {
    await boot(page);
    await allerIrl(page);

    await expect(page.locator("#irlToolsBtn")).toContainText("Filtres");
    await page.locator("#irlToolsBtn").click();

    // ⚠️ NON-RÉGRESSION. UI-4A4 devinait l'écran du panneau en cherchant « IRL »
    // dans son TITRE : renommer ce titre en « Filtres » a fait disparaître les
    // quatre intentions, en silence. L'écran courant est désormais une DONNÉE.
    expect(await page.evaluate(() => ContextualTools.pageType())).toBe("irl");
    await expect(page.locator("#ctxToolsRoot")).toHaveAttribute("data-ctx-page", "irl");
    await expect(page.locator("#ctxToolsBody [data-v4a0-intent]")).toHaveCount(4);
    await expect(page.locator("#ctxToolsTitle")).toHaveText("Filtres");

    const corps = page.locator("#ctxToolsBody");
    await expect(corps).toContainText("Choisir une ville");
    await expect(corps).toContainText("Mes inscriptions");
    // L'identifiant du filtre est inchangé : c'est bien le MÊME état.
    await expect(corps.locator('[data-irlfilter="joined"]')).toHaveCount(1);
    // Et l'action explicite de position vit dans le sélecteur de ville existant.
    await page.evaluate(() => { closeCtxTools(); openIrlCitySelector(); });
    await page.waitForTimeout(300);
    await expect(page.locator(".modal-card, #modalBody, .modal"))
      .toContainText("Utiliser ma position");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ② RENCONTRER (§2)
// ══════════════════════════════════════════════════════════════════════════
test.describe("UI-7 §2 — la carte d'activité dit ce qu'il faut", () => {
  test("« Filtres » n'a pas l'allure des deux onglets", async ({ page }) => {
    await boot(page);
    await allerIrl(page);

    const m = await page.evaluate(() => {
      const onglet = document.querySelector("[data-v4a3-onglet]");
      const filtres = document.getElementById("irlToolsBtn");
      const so = getComputedStyle(onglet), sf = getComputedStyle(filtres);
      return {
        bordureOnglet: so.borderTopWidth,
        bordureFiltres: sf.borderTopWidth,
        fondOnglet: so.backgroundColor,
        fondFiltres: sf.backgroundColor,
        colonnes: getComputedStyle(document.getElementById("v4a3Vue")).gridTemplateColumns.split(" ").length,
      };
    });
    expect(m.colonnes).toBe(3);
    // Distinction réelle, pas seulement déclarée : contour et fond diffèrent.
    expect(m.bordureFiltres).not.toBe(m.bordureOnglet);
    expect(m.fondFiltres).not.toBe(m.fondOnglet);
    // …et il reste sémantiquement une ACTION, pas un onglet.
    await expect(page.locator("#irlToolsBtn")).not.toHaveAttribute("role", "tab");
  });

  test("participants et places sont calculés, la passion est abrégée sans être modifiée", async ({ page }) => {
    await boot(page);
    await allerIrl(page);

    const id = await page.evaluate(() => {
      const c = document.querySelector("#eventList .event-card[data-v4a2]");
      return c ? c.getAttribute("data-evid") : null;
    });
    expect(id).not.toBeNull();

    const attendu = await page.evaluate((evid) => {
      const ev = allEvents().find((e) => e.id === evid);
      const p = passionById(ev.passion);
      return { n: (ev.attendees || []).length, reste: _eventSpotsLeft(ev), label: p.label };
    }, id);

    const carte = page.locator(`#eventList .event-card[data-evid="${id}"]`);
    await expect(carte.locator(".v4a2-monde"))
      .toContainText(attendu.n + " participant" + (attendu.n > 1 ? "s" : ""));
    if (attendu.reste !== null && attendu.reste > 0) {
      await expect(carte.locator(".v4a2-monde"))
        .toContainText(attendu.reste + " place" + (attendu.reste > 1 ? "s" : "")
          + " restante" + (attendu.reste > 1 ? "s" : ""));
    }
    // Le libellé affiché s'arrête avant le « / », la donnée ne bouge pas.
    await expect(carte.locator(".v4a2-quoi")).toContainText(attendu.label.split("/")[0].trim());
    expect(await page.evaluate((evid) =>
      passionById(allEvents().find((e) => e.id === evid).passion).label, id)).toBe(attendu.label);
  });

  test("« Détails », puis « Je viens » → « Inscrit ✓ »", async ({ page }) => {
    await boot(page);
    await allerIrl(page);

    const id = await page.evaluate(() => {
      for (const c of document.querySelectorAll("#eventList .event-card[data-v4a2]")) {
        const ev = allEvents().find((e) => e.id === c.getAttribute("data-evid"));
        if (ev && !_eventIsOver(ev) && !_eventIsCancelled(ev) && !_eventIsFull(ev) && !_isMyEvent(ev)) return ev.id;
      }
      return null;
    });
    expect(id).not.toBeNull();

    const carte = page.locator(`#eventList .event-card[data-evid="${id}"]`);
    await expect(carte.locator('[data-v4a2-act="voir"]')).toHaveText("Détails");
    await expect(carte.locator('[data-v4a2-act="go"]')).toHaveText("Je viens");
    await carte.locator('[data-v4a2-act="go"]').click();
    await page.waitForTimeout(500);
    await expect(carte.locator('[data-v4a2-act="reponse"]')).toHaveText("Inscrit ✓");
  });

  test("ouvrir Rencontrer ne demande JAMAIS la position", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.__geo = 0;
      const vrai = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = function () { window.__geo++; return vrai.apply(this, arguments); };
    });
    await allerIrl(page);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__geo)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ③ LE FIL (§3)
// ══════════════════════════════════════════════════════════════════════════
test.describe("UI-7 §3 — le haut du Fil est compact", () => {
  for (const largeur of [320, 390, 430]) {
    test(`${largeur} px : aucun débordement horizontal, aucune intention tronquée`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 780 });
      await boot(page, null, 6);

      const m = await page.evaluate(() => {
        const rail = document.getElementById("feedIntentSelector");
        const strip = document.getElementById("profileStrip");
        return {
          docSw: document.documentElement.scrollWidth,
          docCw: document.documentElement.clientWidth,
          railSw: rail.scrollWidth, railCw: rail.clientWidth,
          // La rangée des passions défile horizontalement PAR CONSTRUCTION
          // (`overflow-x: auto`) : ce qui compte est qu'elle ne pousse pas la
          // page, mesuré par `docSw` ci-dessus.
          stripDeborde: getComputedStyle(strip).overflowX,
          tronques: [...document.querySelectorAll(".feed-intent-btn")]
            .filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent),
        };
      });
      expect(m.docSw, "page").toBeLessThanOrEqual(m.docCw + 1);
      expect(m.railSw, "rail des intentions").toBeLessThanOrEqual(m.railCw + 1);
      expect(m.stripDeborde, "rangée des passions").toBe("auto");
      expect(m.tronques, "intentions tronquées").toEqual([]);
    });
  }

  test("les passions restent des bulles, plus petites que les stories d'origine", async ({ page }) => {
    await boot(page, null, 6);

    const m = await page.evaluate(() => {
      const strip = document.getElementById("profileStrip");
      const tuile = strip.querySelector(".profile-tile");
      const av = tuile.querySelector(".profile-tile-avatar");
      const photo = tuile.querySelector(".profile-tile-photo");
      const anneau = document.querySelector("#screen-feed .story-ring");
      const s = getComputedStyle(tuile);
      return {
        direction: s.flexDirection,
        enveloppe: getComputedStyle(strip).flexWrap,
        avatar: Math.round(av.getBoundingClientRect().width),
        photoVisible: !!photo && getComputedStyle(photo).display !== "none",
        glypheVisible: [...tuile.querySelectorAll(".profile-tile-glyph")]
          .some((g) => getComputedStyle(g).display !== "none"),
        anneau: anneau ? Math.round(anneau.getBoundingClientRect().width) : 0,
      };
    });
    // C'est toujours une bulle : vignette photo, libellé DESSOUS, pas de retour
    // à la ligne (la rangée défile, comme avant le lot).
    expect(m.direction).toBe("column");
    expect(m.enveloppe).toBe("nowrap");
    expect(m.photoVisible).toBe(true);
    expect(m.glypheVisible).toBe(false);
    // …mais plus petite que les 46 px historiques.
    expect(m.avatar).toBeLessThanOrEqual(38);
    expect(m.avatar).toBeGreaterThanOrEqual(28);
    expect(m.anneau).toBeGreaterThan(30);
  });

  test("couper le lot rend aux bulles leur taille d'origine", async ({ page }) => {
    await boot(page, null, 6);
    // ⚠️ `offsetWidth`, PAS `getBoundingClientRect()`. `renderProfileStrip` pose
    // un `transform: scale(1.07)` EN LIGNE sur une tuile sélectionnée, et
    // `getBoundingClientRect` inclut les transformations : 46 × 1,07 = 49,22.
    // Ce test mesure une taille CSS, pas un agrandissement visuel — et depuis
    // qu'ADR-010 a retiré la tuile « Suivis » (devenue une VUE du fil), la
    // première tuile du rail est une passion, potentiellement sélectionnée,
    // là où c'était auparavant la tuile « Suivis », toujours à `scale(1)`.
    const compact = await page.evaluate(() =>
      document.querySelector("#profileStrip .profile-tile-avatar").offsetWidth);
    await page.evaluate(() => { localStorage.setItem("passio_ui_7", "0"); PassioUIV7.apply(); });
    // ⚠️ `.profile-tile-avatar` porte `transition: all 0.25s` : mesurée dans la
    // foulée, la bulle est encore à mi-chemin. On laisse la transition finir.
    await page.waitForTimeout(500);
    const historique = await page.evaluate(() =>
      document.querySelector("#profileStrip .profile-tile-avatar").offsetWidth);
    expect(historique).toBeGreaterThan(compact);
    expect(historique).toBe(46);
  });

  test("les passions restent affichées quand on descend dans le fil", async ({ page }) => {
    await boot(page, null, 3);
    // Le repli au défilement a été RETIRÉ le 2026-08-29 (cf. la fin d'app-09 et
    // tests/e2e/entete-fil-permanent.spec.js) : ce qui était vérifié ici — que
    // le bloc UI-7 ne l'emportait pas sur `.chrome-collapsed` — n'a plus d'objet.
    // Ce qui reste à prouver côté UI-7, c'est que la rangée de passions garde
    // sa hauteur pendant tout le défilement, descente ET remontée.
    const h = await page.evaluate(async () => {
      const main = document.querySelector(".app-main");
      const strip = document.getElementById("profileStrip");
      const mesure = () => ({ strip: strip.getBoundingClientRect().height });
      const avant = mesure();
      main.scrollTop = 400;
      main.dispatchEvent(new Event("scroll"));
      await new Promise((r) => setTimeout(r, 500));
      const apres = mesure();
      const replie = main.classList.contains("chrome-collapsed");
      main.scrollTop = 0;
      main.dispatchEvent(new Event("scroll"));
      await new Promise((r) => setTimeout(r, 500));
      const remonte = mesure();
      return { avant, apres, remonte, replie };
    });
    expect(h.avant.strip).toBeGreaterThan(10);
    expect(h.replie).toBe(false);
    expect(h.apres.strip).toBeGreaterThan(10);
    expect(h.remonte.strip).toBeGreaterThan(10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ④ BARRE SUPÉRIEURE (§4)
// ══════════════════════════════════════════════════════════════════════════
test.describe("UI-7 §4 — Messages quitte le bandeau supérieur", () => {
  test("plus d'icône Messages VISIBLE en haut, mais Messages reste atteignable", async ({ page }) => {
    await boot(page);
    // ⚠️ Assertion CORRIGÉE le 2026-08-29, pas affaiblie. Elle exigeait
    // `toHaveCount(0)` — c'est-à-dire le RETRAIT du markup — alors que la règle
    // du projet est « masquer, jamais retirer ». Le retrait avait une
    // conséquence mesurée : sous `passio_ui_v2="0"`, la barre V2 disparaît, la
    // barre historique n'a pas d'entrée Messages, et il ne restait AUCUNE porte
    // vers l'écran. L'icône existe donc, masquée par CSS ; ce que §4 promet —
    // une seule porte à l'écran — est exigé ici sous sa forme visuelle.
    const iconeHaut = page.locator('.topbar-right .topbar-bell[aria-label="Messages"]');
    await expect(iconeHaut).toHaveCount(1);
    await expect(iconeHaut).toBeHidden();
    // Le reste du bandeau est intact.
    await expect(page.locator('.topbar-right .topbar-bell[aria-label="Explorer"]')).toHaveCount(1);
    await expect(page.locator('.topbar-right .topbar-bell[aria-label="Notifications"]')).toHaveCount(1);
    await expect(page.locator(".topbar-right .hamburger")).toHaveCount(1);
    await expect(page.locator(".app-topbar .brand-logo")).toHaveCount(1);

    // La pastille reste dans le DOM : plusieurs chemins l'écrivent encore.
    await expect(page.locator("#msgDot")).toHaveCount(1);
    // ⚠️ Cette ligne était `expect(await page.evaluate(() => { renderMsgBadge();
    // return true; })).toBe(true)` — une valeur écrite par le test lui-même,
    // qui ne prouvait que « l'appel ne lève pas ». Or c'est exactement la
    // garantie que le commentaire d'index.html revendique : #msgDot reste dans
    // le DOM PARCE QUE plusieurs chemins l'allument. Et `renderMsgBadge` sort en
    // silence si le nœud manque, tandis que ses cinq sites d'appel l'enveloppent
    // tous dans un `try/catch` : une panne y est structurellement muette.
    // On assère donc une valeur que la PRODUCTION calcule.
    await page.evaluate(() => {
      const convs = getConversations();
      convs.length = 0;
      convs.push({
        id: "conv_v7_badge", userId: "u_autre", userName: "Autre", userEmoji: "✨",
        userColor: "#7c3aed", passion: "musique", unread: 4, lastAt: Date.now(),
        isGroup: false, messages: [],
      });
      renderMsgBadge();
    });
    expect(await page.evaluate(() => document.getElementById("msgDot").textContent)).toBe("4");

    // Et la destination existe toujours, via la barre du bas.
    await page.locator('#appNavV2 [data-v2-key="messages"]').click();
    await page.waitForFunction(() => {
      const e = document.getElementById("screen-messages");
      return e && e.classList.contains("active");
    }, null, { timeout: 5000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ⑥ LE PROFIL (§6)
// ══════════════════════════════════════════════════════════════════════════
test.describe("UI-7 §6 — les onglets nommés au Profil", () => {
  // ⚠️ CE CAS A ÉTÉ RÉALIGNÉ, PAS AFFAIBLI. Le lot UI-7 posait TROIS onglets ;
  // la refonte multi-passion (ADR-011 §2) n'en garde que deux et retire
  // « À propos », dont le contenu est passé dans `#passionManager`. Toutes les
  // assertions « rien n'est perdu » sont conservées — c'est leur destination qui
  // change, pas leur exigence.
  test("Publications · Activité, et rien n'est perdu", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, errors, 2);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(700);

    expect(await page.locator("[data-v7-tab]").allTextContents())
      .toEqual(["Publications", "Activité"]);

    // Chaque bloc historique est DANS un panneau, pas supprimé.
    const place = await page.evaluate(() => {
      const dans = (id) => {
        const n = document.getElementById(id);
        if (!n) return null;
        const p = n.closest("[data-v7-pan]");
        return p ? p.getAttribute("data-v7-pan") : "hors-panneau";
      };
      return {
        myPosts: dans("myPosts"),
        top: dans("profileTopPosts"),
        events: dans("profileEvents"),
        profils: dans("profileList"),
        sousFiltres: document.querySelectorAll(".v7-subfilters .profile-tab").length,
      };
    });
    expect(place.myPosts).toBe("publications");
    expect(place.top).toBe("publications");
    expect(place.events).toBe("activites");
    // La liste des passions n'est plus dans un panneau d'onglet : elle vit dans
    // `#passionManager`, replié, hors du flux de la page.
    expect(place.profils).toBe("hors-panneau");
    // ⚠️ Quatre types, plus cinq : « Carnets » est parti avec la fonctionnalité.
    expect(place.sousFiltres).toBe(4);
    // Les libellés viennent du MARKUP (`.profile-tab-lbl`, PR #185) : ce lot
    // n'en repose aucun — deux libellés pour un onglet, c'était le doublon.
    expect(await page.locator(".v7-subfilters .profile-tab-lbl").allTextContents())
      .toEqual(["Tout", "Photos", "Vidéos", "Bobines"]);
    // La ligne d'aide suit le groupe qu'elle explique.
    expect(await page.evaluate(() => {
      const h = document.querySelector(".profile-tabs-hint");
      const p = h && h.closest("[data-v7-pan]");
      return p ? p.getAttribute("data-v7-pan") : null;
    })).toBe("publications");

    // Publications regroupe tout par défaut : le prédicat « posts » est vrai
    // pour n'importe quel contenu — ce n'est pas un filtre « texte seul ».
    expect(await page.evaluate(() => PROFILE_TAB_PRED.posts({ type: "video", isReel: true }))).toBe(true);

    // La bascule d'onglet ne montre qu'un panneau à la fois.
    await page.locator('[data-v7-tab="activites"]').click();
    expect(await page.evaluate(() =>
      [...document.querySelectorAll("[data-v7-pan]")].filter((p) => !p.hidden)
        .map((p) => p.getAttribute("data-v7-pan")))).toEqual(["activites"]);

    // ⚠️ « À propos » et son lien « Carnets de voyage » ont disparu (ADR-011).
    // Ce qui compte reste vérifié : la gestion des passions n'est pas devenue
    // inatteignable — retirer un onglet ne doit jamais fermer une fonction.
    await expect(page.locator('[data-v7-tab="apropos"]')).toHaveCount(0);
    await expect(page.locator(".v7-secondaire", { hasText: "Carnets de voyage" })).toHaveCount(0);
    await page.evaluate(() => openPassionManager());
    await page.waitForTimeout(300);
    await expect(page.locator("#profileList .profile-card").first()).toBeVisible();

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("« Publications populaires » remplace « Top posts », l'état vide est compact", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(700);

    await expect(page.locator('[data-v7-pan="publications"]')).toContainText("Publications populaires");

    // ⚠️ AUCUNE passion cochée = AUCUN filtre. L'écran ne dit donc plus
    // « Sélectionne un profil passion » : il montre l'état vide guidé du §6,
    // le même que lorsque toutes les passions sont cochées. C'est la règle que
    // la rangée des TYPES applique déjà sur ce même écran.
    expect(await page.evaluate(() => (window.profilesFilterSelection || new Set()).size)).toBe(0);
    await expect(page.locator("#myPosts .empty")).not.toContainText("Sélectionne un profil passion");

    // L'état vide guidé du §6 (« Publie ta première création ») tient sous
    // 200 px : il ne pousse plus « Publications populaires » hors de l'écran.
    const h = await page.evaluate(() => {
      const v = document.querySelector("#myPosts .empty");
      return { hauteur: v ? Math.round(v.getBoundingClientRect().height) : 0, txt: v ? v.innerText : "" };
    });
    expect(h.txt).toContain("Publie ta première création");
    expect(h.hauteur).toBeGreaterThan(0);
    expect(h.hauteur).toBeLessThan(200);
  });

  test("« Activités » montre ce que j'organise et ce que j'ai rejoint", async ({ page }) => {
    await boot(page);
    // Une activité rejointe, une organisée — par les moteurs, pas à la main.
    const ids = await page.evaluate(() => {
      const futurs = allEvents().filter((e) => !_eventIsOver(e) && !_eventIsCancelled(e) && !_isMyEvent(e));
      const rejoint = futurs[0];
      _setMyRsvpLocal(rejoint.id, "going");
      state.userEvents = state.userEvents || [];
      const mien = {
        id: "ev_v7_test", title: "Mon atelier de test", passion: "musique",
        city: "Annecy", date: Date.now() + 86400000, attendees: [], organizerId: MY_UID || "me",
      };
      state.userEvents.push(mien);
      saveState();
      renderProfilesScreen();
      return { rejoint: rejoint.id, rejointTitre: rejoint.title, mien: mien.id };
    });
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(700);
    await page.locator('[data-v7-tab="activites"]').click();

    const liste = page.locator("#profileEvents");
    await expect(liste.locator(`[data-profile-event="${ids.mien}"]`)).toHaveCount(1);
    await expect(liste.locator(`[data-profile-event="${ids.rejoint}"]`)).toHaveCount(1);
    // Miniature, date et ville sur chaque ligne (§6).
    await expect(liste.locator(`[data-profile-event="${ids.mien}"]`)).toContainText("Annecy");
    await expect(liste.locator(`[data-profile-event="${ids.mien}"]`)).toContainText("Tu organises");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ⑧ LA BOBINE (§8)
// ══════════════════════════════════════════════════════════════════════════
test.describe("UI-7 §8 — après l'enregistrement d'une bobine", () => {
  test("aperçu, « Recommencer » et « Continuer », puis publication", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, errors);

    // Exactement ce que `_meOnRecordingStop` fait après le relâchement.
    await page.evaluate((v) => { meOpen("bobine"); meSetMedia(v, "video"); }, VIDEO_FACTICE);
    await page.waitForTimeout(500);

    await expect(page.locator("#mediaEditor")).toHaveClass(/phase-edit/);
    await expect(page.locator("#meMedia video")).toHaveCount(1);          // l'aperçu
    await expect(page.locator('[data-v7-bobine-act="recommencer"]')).toBeVisible();
    await expect(page.locator('[data-v7-bobine-act="continuer"]')).toBeVisible();
    // Le bouton historique ne reste pas en double sous la nouvelle rangée.
    await expect(page.locator("#mePublishBtn")).toBeHidden();

    // « Recommencer » rend la main à la capture, sans rien publier.
    await page.locator('[data-v7-bobine-act="recommencer"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator("#mediaEditor")).toHaveClass(/phase-capture/);
    expect(await page.evaluate(() => (state.userPosts || []).length)).toBe(0);

    // On refilme, puis « Continuer ».
    await page.evaluate((v) => { meSetMedia(v, "video"); }, VIDEO_FACTICE);
    await page.waitForTimeout(400);
    await page.locator('[data-v7-bobine-act="continuer"]').click();
    await page.waitForTimeout(300);

    const feuille = page.locator("#v7BobineSheet");
    await expect(feuille).toBeVisible();
    await expect(feuille.locator("#v7BobineDesc")).toBeVisible();
    await expect(feuille.locator("#v7BobinePassion")).toBeVisible();
    await expect(feuille.locator("#v7BobineCoverBtn")).toBeVisible();
    await expect(feuille.locator("#v7BobineEvent")).toBeVisible();

    // Une activité à venir que j'ai rejointe doit pouvoir être associée.
    const evid = await page.evaluate(() => {
      const opts = [...document.getElementById("v7BobineEvent").options].map((o) => o.value);
      return opts.length > 1 ? opts[1] : "";
    });

    await feuille.locator("#v7BobineDesc").fill("Une prise de son au sommet");
    await feuille.locator("#v7BobinePassion").selectOption({ index: 0 });
    if (evid) await feuille.locator("#v7BobineEvent").selectOption(evid);
    const passionChoisie = await page.evaluate(() => document.getElementById("v7BobinePassion").value);

    await feuille.locator("#v7BobinePublier").click();
    await page.waitForTimeout(1200);

    const post = await page.evaluate(() => (state.userPosts || [])[0] || null);
    expect(post, "la bobine est enregistrée").not.toBeNull();
    expect(post.isReel).toBe(true);
    expect(post.type).toBe("video");
    expect(post.text).toBe("Une prise de son au sommet");
    expect(post.passion).toBe(passionChoisie);
    if (evid) expect(post.eventId).toBe(evid);
    // Et l'éditeur s'est bien refermé : `mePublish` appelle `meClose()`.
    await expect(page.locator("#mediaEditor")).not.toHaveClass(/open/);

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("aucune activité liée = aucun eventId inventé", async ({ page }) => {
    await boot(page);
    await page.evaluate((v) => { meOpen("bobine"); meSetMedia(v, "video"); }, VIDEO_FACTICE);
    await page.waitForTimeout(500);
    await page.locator('[data-v7-bobine-act="continuer"]').click();
    await page.waitForTimeout(300);
    await page.locator("#v7BobinePublier").click();
    await page.waitForTimeout(1200);
    const post = await page.evaluate(() => (state.userPosts || [])[0] || null);
    expect(post).not.toBeNull();
    expect(post.eventId === undefined || post.eventId === null || post.eventId === "").toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ⑨ KILL SWITCH
// ══════════════════════════════════════════════════════════════════════════
test.describe("UI-7 — le kill switch rend l'interface d'avant", () => {
  test("localStorage.passio_ui_7 = « 0 » : tout est restitué, sans rechargement", async ({ page }) => {
    await boot(page, null, 2);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(600);
    await expect(page.locator("#v7ProfileTabs")).toHaveCount(1);

    const apres = await page.evaluate(() => {
      localStorage.setItem("passio_ui_7", "0");
      PassioUIV7.apply();
      const dans = (id) => {
        const n = document.getElementById(id);
        return n && n.parentNode ? n.parentNode.id || n.parentNode.className : null;
      };
      return {
        racine: document.documentElement.classList.contains("passio-ui-7"),
        barre: !!document.getElementById("v7ProfileTabs"),
        panneaux: document.querySelectorAll("[data-v7-pan]").length,
        // Les nœuds historiques sont revenus DIRECTEMENT dans l'écran.
        myPosts: dans("myPosts"),
        // ⚠️ `#profileList` fait exception depuis ADR-011 : sa maison dans le
        // markup est `#passionManager` (§1 a retiré l'onglet « À propos »), et
        // ce lot ne l'en sort plus. La coupure ne doit donc PAS le déménager —
        // un kill switch ne restitue que ce qu'il a lui-même déplacé.
        profileList: dans("profileList"),
        // Les libellés du markup (#185) survivent à la coupure : ce lot ne les
        // a jamais posés, il ne doit pas les emporter. ⚠️ Ils sont QUATRE
        // depuis ADR-011 : l'onglet « Carnets » est parti avec le Carnet de
        // voyage (§6). C'est le markup qui a changé, pas le comportement du
        // kill switch, que ce test mesure.
        labels: document.querySelectorAll(".profile-tab-lbl").length,
      };
    });
    expect(apres.racine).toBe(false);
    expect(apres.barre).toBe(false);
    expect(apres.panneaux).toBe(0);
    expect(apres.labels).toBe(4);
    expect(apres.myPosts).toBe("screen-profiles");
    expect(apres.profileList).toBe("passionManager");

    // Et l'écran continue de fonctionner : le rendu historique repasse.
    expect(await page.evaluate(() => { renderProfilesScreen(); return !!document.getElementById("myPosts"); })).toBe(true);
  });
});
