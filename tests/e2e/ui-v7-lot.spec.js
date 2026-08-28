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
//   ③ le Fil tient sans défilement horizontal à 320, 390 et 430 px, les
//      passions ne sont plus des bulles de story, et le repli au défilement
//      fonctionne toujours ;
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
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Une vidéo minuscule mais VALIDE en base64 : `_meDataUrlToBlob` cherche
// « ;base64, » et non la première virgule (un mime à codecs en contient une).
const VIDEO_FACTICE = "data:video/webm;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAA";

async function boot(page, errors, n = 3) {
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
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(600);
    await page.locator('[data-v7-tab="apropos"]').click();
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
          stripSw: strip.scrollWidth, stripCw: strip.clientWidth,
          tronques: [...document.querySelectorAll(".feed-intent-btn")]
            .filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent),
        };
      });
      expect(m.docSw, "page").toBeLessThanOrEqual(m.docCw + 1);
      expect(m.railSw, "rail des intentions").toBeLessThanOrEqual(m.railCw + 1);
      expect(m.stripSw, "rangée des passions").toBeLessThanOrEqual(m.stripCw + 1);
      expect(m.tronques, "intentions tronquées").toEqual([]);
    });
  }

  test("les passions sont des pastilles, les stories restent des cercles", async ({ page }) => {
    await boot(page, null, 6);

    const m = await page.evaluate(() => {
      const tuile = document.querySelector("#profileStrip .profile-tile");
      const av = tuile.querySelector(".profile-tile-avatar");
      const anneau = document.querySelector("#screen-feed .story-ring");
      const s = getComputedStyle(tuile);
      return {
        direction: s.flexDirection,
        rayon: s.borderRadius,
        avatar: Math.round(av.getBoundingClientRect().width),
        photoVisible: !!tuile.querySelector(".profile-tile-photo")
          && getComputedStyle(tuile.querySelector(".profile-tile-photo")).display !== "none",
        glyphe: (tuile.querySelector(".profile-tile-glyph") || {}).textContent || "",
        anneau: anneau ? Math.round(anneau.getBoundingClientRect().width) : 0,
        anneauRayon: anneau ? getComputedStyle(anneau).borderRadius : "",
      };
    });
    expect(m.direction).toBe("row");                 // emoji + libellé côte à côte
    expect(m.avatar).toBeLessThanOrEqual(22);        // plus une bulle de story
    expect(m.photoVisible).toBe(false);
    expect(m.glyphe.length).toBeGreaterThan(0);
    expect(m.anneau).toBeGreaterThan(30);            // les stories, elles, restent rondes
    expect(m.anneauRayon).toContain("999px");
  });

  test("« Autres » n'apparaît que s'il y a réellement plus à voir, et déplie", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await boot(page, null, 3);

    const btn = page.locator("#v7StripMore");
    // Trois passions tiennent sur deux rangées : rien à déplier, rien à montrer.
    await expect(btn).toBeHidden();

    // Dix passions, en revanche, débordent — et le bouton apparaît DE LUI-MÊME,
    // sans rechargement : c'est l'observateur qui le remesure.
    await page.evaluate(() => {
      const ids = ["musique", "sport", "cuisine", "photo", "voyage", "art", "cinema", "tech", "jardinage", "jeuxvideo"];
      state.user.profiles = ids.map((p, i) => ({
        id: "pp_" + i, name: "P" + i, passion: p, emoji: "🎵", color: "#7c3aed", createdAt: i + 1,
      }));
      state.user.currentProfileId = "pp_0";
      window.profilesFilterSelection = new Set(state.user.profiles.map((p) => p.id));
      renderProfileStrip();
    });
    await expect(btn).toBeVisible();
    const avant = await page.evaluate(() =>
      Math.round(document.getElementById("profileStrip").getBoundingClientRect().height));
    await btn.click();
    await page.waitForTimeout(200);
    const apres = await page.evaluate(() =>
      Math.round(document.getElementById("profileStrip").getBoundingClientRect().height));
    expect(apres).toBeGreaterThan(avant);
    await expect(btn).toHaveText("Moins");
    // Les filtres eux-mêmes n'ont pas bougé : cliquer une pastille appelle
    // toujours le MÊME moteur.
    expect(await page.evaluate(() => typeof toggleProfileFilter)).toBe("function");
  });

  test("le repli au défilement fonctionne toujours", async ({ page }) => {
    await boot(page, null, 3);
    // On pose la classe comme le fait le moteur d'app-09, et on vérifie que le
    // bloc UI-7 ne l'emporte pas sur elle (même spécificité, ordre inverse).
    const h = await page.evaluate(async () => {
      const main = document.querySelector(".app-main");
      const strip = document.getElementById("profileStrip");
      const avant = strip.getBoundingClientRect().height;
      main.classList.add("chrome-collapsed");
      await new Promise((r) => setTimeout(r, 500));
      const apres = strip.getBoundingClientRect().height;
      const more = document.getElementById("v7StripMore");
      const moreH = more ? more.getBoundingClientRect().height : 0;
      main.classList.remove("chrome-collapsed");
      return { avant, apres, moreH };
    });
    expect(h.avant).toBeGreaterThan(10);
    expect(h.apres).toBeLessThan(2);
    expect(h.moreH).toBeLessThan(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ④ BARRE SUPÉRIEURE (§4)
// ══════════════════════════════════════════════════════════════════════════
test.describe("UI-7 §4 — Messages quitte le bandeau supérieur", () => {
  test("plus d'icône Messages en haut, mais Messages reste atteignable", async ({ page }) => {
    await boot(page);
    await expect(page.locator('.topbar-right .topbar-bell[aria-label="Messages"]')).toHaveCount(0);
    // Le reste du bandeau est intact.
    await expect(page.locator('.topbar-right .topbar-bell[aria-label="Explorer"]')).toHaveCount(1);
    await expect(page.locator('.topbar-right .topbar-bell[aria-label="Notifications"]')).toHaveCount(1);
    await expect(page.locator(".topbar-right .hamburger")).toHaveCount(1);
    await expect(page.locator(".app-topbar .brand-logo")).toHaveCount(1);

    // La pastille reste dans le DOM : plusieurs chemins l'écrivent encore.
    await expect(page.locator("#msgDot")).toHaveCount(1);
    expect(await page.evaluate(() => { renderMsgBadge(); return true; })).toBe(true);

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
test.describe("UI-7 §6 — trois onglets nommés au Profil", () => {
  test("Publications · Activités · À propos, et rien n'est perdu", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, errors, 2);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(700);

    expect(await page.locator("[data-v7-tab]").allTextContents())
      .toEqual(["Publications", "Activités", "À propos"]);

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
    expect(place.profils).toBe("apropos");
    expect(place.sousFiltres).toBe(5);   // les cinq types restent accessibles
    expect(await page.locator(".v7-subfilters .v7-subfilter-label").allTextContents())
      .toEqual(["Tout", "Photos", "Vidéos", "Bobines", "Carnets"]);

    // Publications regroupe tout par défaut : le prédicat « posts » est vrai
    // pour n'importe quel contenu — ce n'est pas un filtre « texte seul ».
    expect(await page.evaluate(() => PROFILE_TAB_PRED.posts({ type: "video", isReel: true }))).toBe(true);

    // La bascule d'onglet ne montre qu'un panneau à la fois.
    await page.locator('[data-v7-tab="activites"]').click();
    expect(await page.evaluate(() =>
      [...document.querySelectorAll("[data-v7-pan]")].filter((p) => !p.hidden)
        .map((p) => p.getAttribute("data-v7-pan")))).toEqual(["activites"]);

    // « À propos » garde l'identité active et l'accès secondaire aux carnets.
    await page.locator('[data-v7-tab="apropos"]').click();
    await expect(page.locator("#profileList .v6b-ident").first()).toBeVisible();
    await expect(page.locator(".v7-secondaire", { hasText: "Carnets de voyage" })).toBeVisible();
    await page.locator(".v7-secondaire", { hasText: "Carnets de voyage" }).click();
    await expect(page.locator("#screen-cdv")).toHaveClass(/active/);

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("« Publications populaires » remplace « Top posts », l'état vide est compact", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(700);

    await expect(page.locator('[data-v7-pan="publications"]')).toContainText("Publications populaires");

    // ⚠️ Sans passion cochée, l'écran affiche l'invitation historique — et,
    // sous le lot, la PORTE vers « À propos », où le sélecteur vit désormais.
    // Sans elle, « Publications » serait un cul-de-sac.
    await expect(page.locator("#myPosts .empty .btn", { hasText: "Mes passions" })).toBeVisible();

    // L'état vide guidé du §6 (« Publie ta première création ») tient sous
    // 200 px : il ne pousse plus « Publications populaires » hors de l'écran.
    const h = await page.evaluate(() => {
      window.profilesFilterSelection = new Set((state.user.profiles || []).map((p) => p.id));
      renderProfileContent();
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
        more: !!document.getElementById("v7StripMore"),
        // Les nœuds historiques sont revenus DIRECTEMENT dans l'écran.
        myPosts: dans("myPosts"),
        profileList: dans("profileList"),
        labels: document.querySelectorAll(".v7-subfilter-label").length,
      };
    });
    expect(apres.racine).toBe(false);
    expect(apres.barre).toBe(false);
    expect(apres.panneaux).toBe(0);
    expect(apres.more).toBe(false);
    expect(apres.labels).toBe(0);
    expect(apres.myPosts).toBe("screen-profiles");
    expect(apres.profileList).toBe("screen-profiles");

    // Et l'écran continue de fonctionner : le rendu historique repasse.
    expect(await page.evaluate(() => { renderProfilesScreen(); return !!document.getElementById("myPosts"); })).toBe(true);
  });
});
