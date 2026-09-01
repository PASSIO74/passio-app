// ══════════════════════════════════════════════════════════════════════════
// LOT TAXO-1 — catalogue hiérarchique des passions et spécialités.
//
// Portée assumée : les tests CIBLÉS demandés pendant le développement, pas une
// couverture exhaustive. Ils vérifient ce qui casserait des données ou qui
// rendrait le kill switch faux — le reste attend la validation visuelle.
//
// ⚠️ L'ACTIVATION SE FAIT PAR `localStorage` AVANT LE BOOT, jamais par la query
// après coup : le module lit l'URL une seule fois, au chargement.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

const CLE = "passion_taxonomy_v1";

async function bootTaxo(page, { on = true } = {}) {
  await page.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [CLE, on ? "1" : "0"]);
  await bootOnboarded(page);
}

// Ouvre le champ « Passion liée » du Studio, replié par le lot UI-6 derrière
// le résumé « Passio : … · Changer ». On passe par le VRAI bouton : poser la
// classe à la main testerait notre propre idée du repli, pas celle du produit.
async function ouvrirChampPassion(page) {
  const lien = page.locator("#studioComposer .v6-lien, .v6-passio ~ .v6-lien, .v6-lien").filter({ hasText: /^(Changer|Modifier)$/ });
  if (await lien.count()) { await lien.first().click(); }
  else { await page.evaluate(() => { const f = document.getElementById("fieldPassion"); if (f) f.classList.add("v6-ouvert"); }); }
  await page.waitForTimeout(250);
}

// ── Le catalogue, sans passer par l'application ────────────────────────────
// Ces cas n'ont besoin que du fichier de données : ils tournent sur une page
// nue, ce qui les rend insensibles à l'état de l'app et au réseau.
async function catalogue(page) {
  await page.goto("/index.html");
  await page.waitForFunction(() => !!window.PASSIO_CATALOG, null, { timeout: 15000 });
  return page.evaluate(() => {
    const c = window.PASSIO_CATALOG;
    return {
      universes: c.universes.map(u => u.id),
      passions: c.passions.map(p => ({ id: p.id, u: p.universe_id, label: p.label, emoji: p.emoji, color: p.color })),
      specialties: c.specialties.map(s => ({ id: s.id, p: s.passion_id })),
      canoniques: c.canoniques
    };
  });
}

test.describe("TAXO-1 · catalogue", () => {
  test("les 19 identifiants canoniques sont préservés à l'identique", async ({ page }) => {
    const c = await catalogue(page);
    // Copie littérale de `const PASSIONS` (js/app-01-diag-seed.js). Recopier
    // plutôt que lire le fichier : si app-01 change, le test doit rougir, pas
    // se réaligner en silence.
    const attendus = {
      musique: "Musique", photo: "Photo", voyage: "Voyage", cuisine: "Cuisine",
      sport: "Sport", litterature: "Littérature", cinema: "Cinéma", tech: "Tech / IA",
      art: "Art", jardinage: "Jardinage", metier: "Artisanat", jeuxvideo: "Jeux vidéo",
      yoga: "Yoga / Bien-être", mode: "Mode", danse: "Danse", podcast: "Podcast",
      moto: "Moto", animaux: "Animaux", actu: "Actualité"
    };
    expect(Object.keys(attendus)).toHaveLength(19);
    expect(c.canoniques.slice().sort()).toEqual(Object.keys(attendus).sort());
    for (const [id, label] of Object.entries(attendus)) {
      const p = c.passions.find(x => x.id === id);
      expect(p, `passion canonique « ${id} » absente du catalogue`).toBeTruthy();
      expect(p.label, `libellé de « ${id} » modifié`).toBe(label);
    }
  });

  test("volumes tenus : 8-10 univers, 35-45 passions, 600-1000 spécialités", async ({ page }) => {
    const c = await catalogue(page);
    expect(c.universes.length).toBeGreaterThanOrEqual(8);
    expect(c.universes.length).toBeLessThanOrEqual(10);
    expect(c.passions.length).toBeGreaterThanOrEqual(35);
    expect(c.passions.length).toBeLessThanOrEqual(45);
    expect(c.specialties.length).toBeGreaterThanOrEqual(600);
    expect(c.specialties.length).toBeLessThanOrEqual(1000);
  });

  test("unicité et intégrité : aucun doublon, aucun orphelin", async ({ page }) => {
    const c = await catalogue(page);
    const uniq = (l) => new Set(l).size === l.length;
    expect(uniq(c.universes), "univers en double").toBe(true);
    expect(uniq(c.passions.map(p => p.id)), "passion en double").toBe(true);
    expect(uniq(c.specialties.map(s => s.id)), "spécialité en double").toBe(true);

    const U = new Set(c.universes), P = new Set(c.passions.map(p => p.id));
    const passionsOrphelines = c.passions.filter(p => !U.has(p.u)).map(p => p.id);
    expect(passionsOrphelines, "passions sans univers").toEqual([]);
    const specsOrphelines = c.specialties.filter(s => !P.has(s.p)).map(s => s.id);
    expect(specsOrphelines, "spécialités sans passion").toEqual([]);

    // Une spécialité appartient à UNE passion : son identifiant le porte, et
    // la base l'impose par clé composite.
    const malPrefixees = c.specialties.filter(s => s.id.indexOf(s.p + "-") !== 0).map(s => s.id);
    expect(malPrefixees, "spécialités mal préfixées").toEqual([]);
    // Aucun identifiant de passion ne contient de tiret — c'est ce qui rend le
    // préfixe non ambigu.
    expect(c.passions.filter(p => /-/.test(p.id)).map(p => p.id)).toEqual([]);
  });

  test("la recherche trouve passions, spécialités, synonymes et accents", async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForFunction(() => !!window.PASSIO_CATALOG, null, { timeout: 15000 });
    const cas = [
      ["running", "running"], ["jogging", "running"], ["muscu", "fitness"],
      ["moto cross", "moto-motocross"], ["photo", "photo"],
      ["Échecs", "jeux-echecs"], ["echecs", "jeux-echecs"],
      ["ping-pong", "sport-tennis-de-table"], ["guitare", "musique-guitare"]
    ];
    for (const [q, attendu] of cas) {
      const ids = await page.evaluate(x => window.PASSIO_CATALOG.chercher(x, 8).map(r => r.id), q);
      expect(ids, `« ${q} » ne trouve pas « ${attendu} »`).toContain(attendu);
    }
    // Une passion qui correspond passe toujours devant une spécialité.
    const premier = await page.evaluate(() => window.PASSIO_CATALOG.chercher("running", 3)[0]);
    expect(premier.kind).toBe("passion");
    expect(premier.id).toBe("running");
  });
});

test.describe("TAXO-1 · interface", () => {
  test("l'onboarding montre les populaires et l'accès au catalogue complet", async ({ page }) => {
    await page.addInitScript(([k, t]) => {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
      localStorage.setItem("passion_taxonomy_v1", "1");
      localStorage.removeItem("passio_mvp_state_v1");
    }, [GATE_KEY, GATE_TOKEN]);
    await page.goto("/index.html");
    await page.waitForFunction(() => !!window.PassioTaxo, null, { timeout: 15000 });

    // On rend l'étape « passions » visible et on demande le rendu au moteur,
    // sans traverser tout le tunnel d'inscription : le lot ne change pas le
    // tunnel, seulement cette grille.
    await page.evaluate(() => {
      document.querySelectorAll("[data-onb-step]").forEach(e => { e.style.display = "none"; });
      const s = document.querySelector('[data-onb-step="passions"]');
      if (s) s.style.display = "block";
      const o = document.getElementById("onboarding");
      if (o) { o.style.display = "block"; o.classList.add("active"); }
      // La landing est encore « active » (aucune session Supabase en test
      // hors ligne) et intercepte les taps : elle recouvre l'onboarding.
      const l = document.getElementById("landing");
      if (l) { l.classList.remove("active"); l.style.display = "none"; }
      window.renderPassionGrid();
    });

    const grille = page.locator("#passionGrid");
    // 20 populaires, pas 42 et surtout pas 790.
    await expect(grille.locator('.taxo-chip[data-taxo-act="onb"]')).toHaveCount(20);
    await expect(grille.locator('[data-taxo-act="catalogue-onb"]')).toBeVisible();

    // « Voir toutes les passions » ouvre le catalogue organisé par univers.
    await grille.locator('[data-taxo-act="catalogue-onb"]').click();
    await expect(page.locator("#taxoCatalogueCorps")).toBeVisible();
    const univers = await page.locator("#taxoCatalogueCorps .taxo-univers").count();
    expect(univers).toBeGreaterThanOrEqual(8);
  });

  test("toucher une spécialité sélectionne sa passion principale", async ({ page }) => {
    await bootTaxo(page);
    await page.evaluate(() => { window.PassioTaxo.ouvrirCatalogue(); });
    await page.locator("#taxoCatalogueSearch").fill("enduro");
    await page.waitForTimeout(250);

    const avant = await page.evaluate(() => window.PassioTaxo.mesPassions());
    expect(avant).not.toContain("moto");

    await page.locator('.taxo-chip[data-taxo-id="moto-enduro"]').first().click();
    await page.waitForTimeout(400);

    const apres = await page.evaluate(() => ({
      passions: window.PassioTaxo.mesPassions(),
      specs: window.PassioTaxo.mesSpecialites("moto")
    }));
    expect(apres.passions, "la passion « moto » n'a pas été ajoutée").toContain("moto");
    expect(apres.specs).toContain("moto-enduro");
  });

  test("le catalogue reste ouvert après un ajout : on en coche plusieurs d'affilée", async ({ page }) => {
    // ⚠️ DÉFAUT RÉEL, trouvé en relisant le diff. `confirmCreateProfile` —
    // le moteur d'ajout — termine par `closeModal()`. La feuille « Toutes les
    // passions » se refermait donc à CHAQUE tap, dans l'écran même dont la
    // raison d'être est d'en cocher plusieurs.
    await bootTaxo(page);
    await page.evaluate(() => { window.PassioTaxo.ouvrirCatalogue(); });
    await expect(page.locator("#taxoCatalogueCorps")).toBeVisible();

    await page.locator('.taxo-chip[data-taxo-act="passion"][data-taxo-id="combat"]').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator("#taxoCatalogueCorps"), "la feuille s'est refermée après le premier ajout").toBeVisible();

    await page.locator('.taxo-chip[data-taxo-act="passion"][data-taxo-id="peche"]').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator("#taxoCatalogueCorps")).toBeVisible();

    const p = await page.evaluate(() => window.PassioTaxo.mesPassions());
    expect(p).toContain("combat");
    expect(p).toContain("peche");

    // Et la recherche en cours n'est pas perdue au passage.
    await page.locator("#taxoCatalogueSearch").fill("guitare");
    await page.waitForTimeout(250);
    await page.locator('.taxo-chip[data-taxo-id="musique-guitare"]').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator("#taxoCatalogueCorps")).toBeVisible();
    expect(await page.locator("#taxoCatalogueSearch").inputValue(),
      "la recherche en cours a été perdue").toBe("guitare");
  });

  test("une passion nouvelle garde son nom et son emoji — pas « ✨ Passion »", async ({ page }) => {
    // ⚠️ DÉFAUT RÉEL, mesuré à l'écran. `passionById` retombe sur un générique
    // { emoji: "✨", label: "Passion" } dès que l'identifiant lui est inconnu —
    // et `confirmCreateProfile` RECOPIE cet emoji dans le profil qu'elle crée.
    // Les 23 passions hors des 19 canoniques s'affichaient donc « ✨ Passion »
    // partout, et la valeur fausse était PERSISTÉE.
    await bootTaxo(page);
    await page.evaluate(() => { window.PassioTaxo.ouvrirCatalogue(); });
    await page.locator('.taxo-chip[data-taxo-act="passion"][data-taxo-id="combat"]').first().click();
    await page.waitForTimeout(700);

    const r = await page.evaluate(() => ({
      meta: passionById("combat"),
      profil: state.user.profiles.find(x => x.passion === "combat"),
      rail: (document.getElementById("profileStrip") || {}).innerText || ""
    }));
    expect(r.meta.label).toBe("Sports de combat");
    expect(r.meta.emoji).toBe("🥊");
    // La valeur PERSISTÉE, pas seulement celle affichée.
    expect(r.profil.emoji, "l'emoji générique a été enregistré dans le profil").toBe("🥊");
    // Et le rail du Fil la montre TOUT DE SUITE : `confirmCreateProfile`
    // n'appelle pas `renderProfileStrip`, donc la passion était cochée dans un
    // rail qui ne l'affichait pas encore.
    expect(r.rail, "le rail du Fil n'a pas été repeint").toContain("Sports de combat");
  });

  test("la sélection survit à un rechargement", async ({ page }) => {
    await bootTaxo(page);
    await page.evaluate(() => {
      window.PassioTaxo.ouvrirCatalogue();
    });
    await page.locator("#taxoCatalogueSearch").fill("patisserie");
    await page.waitForTimeout(250);
    await page.locator('.taxo-chip[data-taxo-id="cuisine-patisserie"]').first().click();
    await page.waitForTimeout(500);

    await page.reload();
    await page.waitForFunction(() => !!window.PassioTaxo && typeof state !== "undefined" && state, null, { timeout: 20000 });
    const specs = await page.evaluate(() => window.PassioTaxo.mesSpecialites("cuisine"));
    expect(specs, "la spécialité n'a pas survécu au rechargement").toContain("cuisine-patisserie");
  });

  test("l'identité publique ne change pas : ni pseudo, ni profil par passion", async ({ page }) => {
    await bootTaxo(page);
    const avant = await page.evaluate(() => ({
      pseudo: state.user.general.username,
      profils: state.user.profiles.length
    }));
    await page.evaluate(() => { window.PassioTaxo.ouvrirCatalogue(); });
    await page.locator("#taxoCatalogueSearch").fill("guitare");
    await page.waitForTimeout(250);
    await page.locator('.taxo-chip[data-taxo-id="musique-guitare"]').first().click();
    await page.waitForTimeout(400);

    const apres = await page.evaluate(() => ({
      pseudo: state.user.general.username,
      profils: state.user.profiles.length,
      // Une spécialité ne crée JAMAIS d'entrée dans `profiles`.
      passionsDesProfils: state.user.profiles.map(p => p.passion)
    }));
    expect(apres.pseudo).toBe(avant.pseudo);
    // « musique » est déjà une passion du compte de test : aucun profil n'a
    // dû être créé, et surtout aucun profil « guitare ».
    expect(apres.passionsDesProfils).not.toContain("musique-guitare");
    expect(apres.profils).toBe(avant.profils);
  });

  test("Studio : la passion reste obligatoire, la spécialité est facultative", async ({ page }) => {
    await bootTaxo(page);
    await page.evaluate(() => { goTo("studio"); });
    await page.waitForTimeout(700);
    // ⚠️ Sous le lot UI-6, `#fieldPassion` est REPLIÉ derrière « Passio : … ·
    // Changer » et ne s'ouvre qu'au tap. La spécialité étant montée DANS ce
    // champ, elle suit le même repli — c'est voulu : passion et spécialité
    // sont un seul choix, et les séparer les ferait diverger à l'écran.
    await ouvrirChampPassion(page);

    // Le select historique de passion est toujours là, peuplé, et obligatoire.
    const passion = await page.evaluate(() => document.getElementById("postPassion").value);
    expect(passion).toBeTruthy();

    // Le select de spécialité existe et démarre sur « aucune ».
    const spec = page.locator("#taxoStudioSelect");
    await expect(spec).toBeVisible();
    expect(await spec.inputValue()).toBe("");
    expect(await page.evaluate(() => window.PassioTaxo.specialiteAPublier())).toBeNull();

    // On en choisit une : elle est retenue, et l'aperçu dit « Passion · Spécialité ».
    const premiere = await page.evaluate(p => window.PassioTaxo.specialitesDe(p)[0].id, passion);
    await spec.selectOption(premiere);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.PassioTaxo.specialiteAPublier())).toBe(premiere);
    await expect(page.locator("#taxoStudioApercu")).toContainText("·");
  });

  test("un contenu SANS spécialité reste visible dans le fil affiné", async ({ page }) => {
    await bootTaxo(page);
    const r = await page.evaluate(() => {
      // Une publication d'avant le lot : passion, pas de spécialité.
      const ancien = { id: "p_old", passion: "moto" };
      const neuf = { id: "p_new", passion: "moto", specialty: "moto-enduro" };
      const autre = { id: "p_autre", passion: "moto", specialty: "moto-trial" };
      // Rien d'affiné : tout passe.
      const sansFiltre = [ancien, neuf, autre].map(p => window.PassioTaxo.postPasseAffinage(p));
      // On affine sur « enduro ».
      state.user.feedSpecialties = { moto: ["moto-enduro"] };
      const avecFiltre = [ancien, neuf, autre].map(p => window.PassioTaxo.postPasseAffinage(p));
      return { sansFiltre, avecFiltre };
    });
    expect(r.sansFiltre).toEqual([true, true, true]);
    // ⚠️ L'ancien contenu passe TOUJOURS : c'est la promesse de transition.
    expect(r.avecFiltre[0], "un contenu sans spécialité a été écarté").toBe(true);
    expect(r.avecFiltre[1]).toBe(true);
    expect(r.avecFiltre[2], "une autre spécialité aurait dû être écartée").toBe(false);
  });

  test("un specialty_id qui ne correspond pas à sa passion est refusé", async ({ page }) => {
    await bootTaxo(page);
    const r = await page.evaluate(() => ({
      bonne: window.PassioTaxo.valideSpecialite("moto-enduro", "moto"),
      croisee: window.PassioTaxo.valideSpecialite("moto-enduro", "cuisine"),
      inventee: window.PassioTaxo.valideSpecialite("moto-nimportequoi", "moto"),
      vide: window.PassioTaxo.valideSpecialite("", "moto")
    }));
    expect(r.bonne).toBe(true);
    expect(r.croisee, "une spécialité a été acceptée sous une autre passion").toBe(false);
    expect(r.inventee).toBe(false);
    expect(r.vide).toBe(false);
  });

  test("« Je ne trouve pas ma passion » crée une DEMANDE, jamais une passion", async ({ page }) => {
    await bootTaxo(page);
    await page.evaluate(() => { window.PassioTaxo.ouvrirProposition(); });
    await page.locator("#taxoProposeLabel").fill("Aquariophilie récifale");
    await page.locator('[data-taxo-act="proposer-envoyer"]').click();
    await page.waitForTimeout(400);

    const r = await page.evaluate(() => ({
      demandes: (state.user.passionRequests || []).map(d => ({ label: d.label, status: d.status })),
      // Elle n'entre NI dans le catalogue, NI dans les passions du compte.
      dansCatalogue: !!window.PASSIO_CATALOG.passions.find(p => /récifale/i.test(p.label)),
      mesPassions: window.PassioTaxo.mesPassions(),
      profils: state.user.profiles.map(p => p.passion)
    }));
    expect(r.demandes).toEqual([{ label: "Aquariophilie récifale", status: "pending" }]);
    expect(r.dansCatalogue, "une demande est devenue une passion canonique").toBe(false);
    expect(r.mesPassions.join(",")).not.toMatch(/récifale/i);
    expect(r.profils.join(",")).not.toMatch(/récifale/i);
  });

  test("kill switch OFF : l'onboarding et le Studio retrouvent leur forme d'avant", async ({ page }) => {
    await bootTaxo(page, { on: false });

    // Aucune surface du lot.
    await expect(page.locator("#taxoManager")).toHaveCount(0);
    await expect(page.locator("#taxoAffiner")).toHaveCount(0);
    expect(await page.evaluate(() => window.PassioTaxo.actif())).toBe(false);
    expect(await page.evaluate(() => document.documentElement.classList.contains("passio-taxo-v1"))).toBe(false);

    // Studio : le select historique, et rien du lot.
    await page.evaluate(() => { goTo("studio"); });
    await page.waitForTimeout(700);
    await ouvrirChampPassion(page);
    await expect(page.locator("#postPassion")).toBeVisible();
    await expect(page.locator("#taxoStudioSelect")).toHaveCount(0);
    expect(await page.evaluate(() => window.PassioTaxo.specialiteAPublier())).toBeNull();

    // Grille d'onboarding : la fonction d'origine, avec ses tuiles historiques.
    await page.evaluate(() => {
      const s = document.querySelector('[data-onb-step="passions"]');
      if (s) s.style.display = "block";
      window.renderPassionGrid();
    });
    await expect(page.locator("#passionGrid .passion-tile").first()).toHaveCount(1);
    await expect(page.locator("#passionGrid .taxo-chip")).toHaveCount(0);

    // Et le prédicat d'affinage laisse tout passer, même avec un filtre posé.
    const passe = await page.evaluate(() => {
      state.user.feedSpecialties = { moto: ["moto-enduro"] };
      return window.PassioTaxo.postPasseAffinage({ id: "x", passion: "moto", specialty: "moto-trial" });
    });
    expect(passe, "le kill switch n'a pas rendu son comportement au fil").toBe(true);
  });

  test("cadrage mobile : 320, 390 et 430 px sans débordement horizontal", async ({ page }) => {
    await bootTaxo(page);
    for (const w of [320, 390, 430]) {
      await page.setViewportSize({ width: w, height: 780 });
      await page.evaluate(() => { window.PassioTaxo.ouvrirCatalogue(); });
      await page.waitForTimeout(300);
      const debord = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(debord, `débordement horizontal à ${w} px`).toBeLessThanOrEqual(1);

      // La cible tactile se mesure sur la BOÎTE du bouton, pas sur la pilule.
      const h = await page.locator("#taxoCatalogueCorps .taxo-chip").first().evaluate(
        el => Math.round(el.getBoundingClientRect().height));
      expect(h, `pastille trop basse à ${w} px`).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    }
  });
});
