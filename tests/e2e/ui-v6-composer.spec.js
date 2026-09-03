// Lot UI-6 — composer de publication (§9) et sortie des mécaniques économiques
// du cœur (§11).
//
// Ce que cette suite prouve, et rien d'autre :
//   ① le composer ne demande plus de choisir un format avant de commencer :
//      les cinq onglets sont masqués, et l'écran suit l'ordre du §9 — sans la
//      ligne « Publier en tant que … », retirée le 2026-09-01 ;
//   ② une publication TEXTE part toujours ;
//   ③ une publication PHOTO part avec sa photo — c'est LE contrôle du lot :
//      `studioType` est la seule source de vérité de ce qui est publié, et un
//      bouton média mal branché publierait un « texte » en perdant l'image
//      EN SILENCE ;
//   ④ le libellé ne promet plus de points, et le toast de récompense ne
//      s'affiche plus — sans que le moteur de points soit touché ;
//   ⑤ le kill switch restitue le Studio historique, onglets compris ;
//   ⑥ mobile 320 / 390 / 430 px : aucun débordement, cibles ≥ 44 px.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// GIF 1×1 transparent : aucune requête réseau, et le lecteur de fichiers du
// projet le traite comme n'importe quelle image.
const PIXEL_B64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_6", "0"));
  }
  // ⚠️ CONVENTION DE TEST (la même qu'aux mises en ligne d'UI-3A et d'UI-4) :
  // le lot UI-8 recouvre le VOCABULAIRE de cette ligne — « Passion : … ·
  // Modifier » devient « Publication dans : … · Changer », parce que le mot
  // « profil » y est désormais réservé au profil personnel. Cette suite observe
  // les mots d'avant : elle pose donc le kill switch du lot qui les recouvre, et
  // garde TOUTES ses assertions. Les nouveaux mots sont prouvés à part, dans
  // `ui-v8-passions.spec.js`, avec leur restitution sous coupure.
  await page.addInitScript(() => localStorage.setItem("passio_ui_8", "0"));
  // ⚠️ CONVENTION DE TEST — la même qu'aux mises en ligne d'UI-3A, UI-4 et UI-8.
  // Le lot `flat_passions_v1` (actif par défaut depuis le 2026-09-01) recouvre
  // la surface qu'observe cette suite. Elle pose donc le kill switch du lot qui
  // la recouvre et GARDE TOUTES SES ASSERTIONS — jamais de suppression : c'est
  // ce qui rendrait visible une extinction accidentelle du comportement
  // historique. Le comportement NEUF est prouvé à part, dans
  // `tests/e2e/passions-plates.spec.js`.
  await page.addInitScript(() => localStorage.setItem("flat_passions_v1", "0"));
  await bootOnboarded(page, opts.errors || null, 1, {});
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
  });
}

async function ouvrirStudio(page) {
  await page.evaluate(() => goTo("studio"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-studio");
    return el && el.classList.contains("active");
  });
  await page.waitForTimeout(250);
}

test.describe("UI-6 — composer de publication", () => {
  test("URL normale : plus d'onglets de format, et l'ordre du §9", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await ouvrirStudio(page);

    // Les onglets sont MASQUÉS, jamais retirés : `openStudioOnType` y rejoue un
    // clic pour ouvrir le Studio sur le format audio.
    await expect(page.locator("#studioTypeTabs")).toHaveCount(1);
    await expect(page.locator("#studioTypeTabs")).toBeHidden();

    const hote = page.locator("#v6Composer");
    await expect(hote).toBeVisible();

    // L'ordre du §9 : texte, média, Passion, Mood, Publier.
    // ⚠️ « Options » (le `<details>` `.v6-affiner`) a été RETIRÉ le 2026-09-03 :
    // le mood se lit et se choisit directement sous la passion.
    // ⚠️ ASSERTION RETOURNÉE, JAMAIS VIDÉE (2026-09-01). La ligne d'identité
    // « Publier en tant que … » ouvrait cette liste ; elle a été retirée sur
    // demande de Benjamin — le multi-profil n'existe plus, l'expéditeur n'est
    // plus un choix. Le cas suivant en exige désormais l'ABSENCE, pour qu'un
    // retour silencieux reste visible.
    expect(await page.evaluate(() => {
      const h = document.getElementById("v6Composer");
      return Array.from(h.children).map((c) => {
        if (c.classList.contains("v6-identite")) return "identite";
        if (c.querySelector && c.querySelector("#postText")) return "texte";
        if (c.classList.contains("v6-media")) return "media";
        if (c.id === "studioPhoto" || c.id === "studioVideo") return "apercu";
        if (c.classList.contains("v6-passio")) return "passio";
        if (c.id === "fieldPassion") return "select";
        if (c.id === "fieldMood") return "mood";
        if (c.querySelector && c.querySelector("[data-v6-publier]")) return "publier";
        return "?";
      });
    })).toEqual([
      "texte", "media", "apercu", "apercu", "passio", "select", "mood", "publier",
    ]);

    // Une seule zone média, deux portes.
    await expect(hote.locator("[data-v6-media]")).toHaveCount(2);
    // Le mood est À DÉCOUVERT : visible, cliquable, sans un geste de plus — et
    // le repli qui le cachait n'existe plus nulle part, ni sa classe ni son mot.
    await expect(page.locator(".v6-affiner")).toHaveCount(0);
    await expect(page.locator("#v6Composer > #fieldMood")).toHaveCount(1);
    await expect(page.locator("#postMoodRow .pill").first()).toBeVisible();
    expect(await page.evaluate(() =>
      document.getElementById("screen-studio").textContent.includes("Options"))).toBe(false);
    // Il suit la passion, jamais l'inverse : le bloc de destination se lit d'un
    // trait (où je publie, puis sous quelle envie).
    expect(await page.evaluate(() => {
      const ids = Array.from(document.getElementById("v6Composer").children);
      return ids.indexOf(document.getElementById("fieldMood"))
           > ids.indexOf(document.getElementById("fieldPassion"));
    })).toBe(true);
    // Et il reste CLIQUABLE d'un seul geste, sans rien déplier.
    await page.locator('#postMoodRow .pill[data-postmood="irl"]').click();
    await expect(page.locator('#postMoodRow .pill[data-postmood="irl"]')).toHaveClass(/active/);

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("« Publier en tant que … » a disparu, moteur d'expéditeur intact", async ({ page }) => {
    await boot(page);
    await ouvrirStudio(page);

    // Ni la ligne, ni sa classe, ni sa phrase — et pas davantage sous le kill
    // switch du lot UI-8, qui n'en gouvernait que le second libellé.
    await expect(page.locator(".v6-identite")).toHaveCount(0);
    await expect(page.locator(".v6-identite-txt")).toHaveCount(0);
    expect(await page.evaluate(() =>
      document.getElementById("screen-studio").textContent.includes("Publier en tant que"))).toBe(false);
    expect(await page.evaluate(() =>
      document.getElementById("screen-studio").textContent.includes("Changer de profil"))).toBe(false);

    // Ce qui RESTE : le seul choix encore réel, la passion de destination.
    await expect(page.locator("[data-v6-passio]")).toHaveCount(1);

    // ⚠️ C'est une surface qui part, pas un moteur : `publishPost` envoie
    // toujours le pseudo général. Un post publié ici doit continuer de le
    // porter, sinon on aurait retiré bien plus qu'une ligne de texte.
    await page.fill("#postText", "Un texte publié sans ligne d'identité.");
    await page.locator("[data-v6-publier]").click();
    await page.waitForFunction(() => (state.userPosts || []).length === 1, null, { timeout: 8000 });
    const attendu = await page.evaluate(() =>
      (state.user.general && state.user.general.username)
      || (currentProfile() || {}).name || state.user.name);
    expect(attendu, "le compte doit avoir un nom").toBeTruthy();
    expect(await page.evaluate(() => state.userPosts[0].authorName)).toBe(attendu);
  });

  test("le libellé ne promet plus de points", async ({ page }) => {
    await boot(page);
    await ouvrirStudio(page);
    await expect(page.locator("[data-v6-publier]")).toHaveText("Publier");
    expect(await page.evaluate(() =>
      document.getElementById("screen-studio").textContent.includes("+10 pts"))).toBe(false);
  });

  test("publication TEXTE : elle part, et elle arrive dans le fil", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await ouvrirStudio(page);

    await page.fill("#postText", "Un texte publié depuis le composer unifié.");
    await page.locator("[data-v6-publier]").click();
    await page.waitForFunction(() => (state.userPosts || []).length === 1, null, { timeout: 8000 });

    const post = await page.evaluate(() => state.userPosts[0]);
    expect(post.type).toBe("text");
    expect(post.text).toContain("composer unifié");
    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("publication PHOTO : la photo n'est JAMAIS perdue en silence", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await ouvrirStudio(page);

    // ⚠️ LE contrôle central du lot. `publishPost` type le post et remplit
    // `image` d'après `studioType`, jamais d'après le média réellement attaché.
    // Un bouton média mal branché publierait donc un post « texte » avec
    // `image: null` — la photo perdue sans le moindre message. On passe par le
    // VRAI chemin : le bouton du composer déclenche #photoInput, dont le
    // gestionnaire existant fixe `studioType`.
    await page.fill("#postText", "Une photo publiée sans choisir de format.");
    await page.locator('[data-v6-media="photo"]').click();
    await page.setInputFiles("#photoInput", {
      name: "essai.gif",
      mimeType: "image/gif",
      buffer: Buffer.from(PIXEL_B64, "base64"),
    });
    // ⚠️ `photoDataUrl` et `studioType` sont des `let` de PORTÉE SCRIPT
    // (app-06) : ils existent comme identifiants globaux mais ne sont PAS des
    // propriétés de `window`. `window.photoDataUrl` vaut donc toujours
    // undefined — l'attente expirerait sans rien dire du vrai comportement.
    await page.waitForFunction(() => photoDataUrl && studioType === "photo",
      null, { timeout: 8000 });

    await page.locator("[data-v6-publier]").click();
    await page.waitForFunction(() => (state.userPosts || []).length === 1, null, { timeout: 8000 });

    const post = await page.evaluate(() => state.userPosts[0]);
    expect(post.type, "le post doit être typé photo").toBe("photo");
    expect(!!post.image, "la photo doit être attachée").toBe(true);
    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("« Modifier » révèle le choix de Passio, qui reste la source lue", async ({ page }) => {
    await boot(page);
    await ouvrirStudio(page);

    await expect(page.locator("#fieldPassion")).toBeHidden();
    await expect(page.locator("#postPassion")).toHaveCount(1);

    await page.locator(".v6-passio .v6-lien").click();
    await expect(page.locator("#fieldPassion")).toBeVisible();

    // Le résumé suit le choix réel.
    const valeur = await page.evaluate(() => {
      const s = document.getElementById("postPassion");
      s.selectedIndex = Math.min(1, s.options.length - 1);
      s.dispatchEvent(new Event("change"));
      return s.options[s.selectedIndex].textContent.trim();
    });
    await expect(page.locator("[data-v6-passio]")).toHaveText("Passion : " + valeur);
  });

  test("§11 : les mécaniques économiques ont quitté le cœur, moteur compris", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(300);

    // Ce lot ne faisait que MASQUER la rangée ; l'ADR-009 a depuis retiré les
    // nœuds eux-mêmes. `renderTopbar` n'écrit plus dans #topPassia — c'était la
    // seule raison de garder ce nœud, et elle a disparu avec lui.
    await expect(page.locator("#topPassia")).toHaveCount(0);
    await expect(page.locator("#mainProfileStars")).toHaveCount(0);
    await expect(page.locator("#profilePassiaChip")).toHaveCount(0);
    await expect(page.locator("#screen-wallet")).toHaveCount(0);

    // Et le moteur lui-même n'existe plus.
    expect(await page.evaluate(() => typeof window.grantReward)).toBe("undefined");
    expect(await page.evaluate(() => typeof window.renderWallet)).toBe("undefined");
  });

  test("kill switch local au boot : Studio historique strictement rendu", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { killLocal: true, errors });
    await ouvrirStudio(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-6"))).toBe(false);
    await expect(page.locator("#v6Composer")).toHaveCount(0);
    await expect(page.locator("#studioTypeTabs")).toBeVisible();
    await expect(page.locator("#studioTypeTabs .studio-type")).toHaveCount(5);
    await expect(page.locator("#fieldPassion")).toBeVisible();
    await expect(page.locator("#fieldMood")).toBeVisible();
    // ⚠️ Ce test exigeait le libellé « +10 pts » et des pastilles score/Passia
    // visibles : c'était ce que ce lot MASQUAIT. L'ADR-009 a depuis retiré la
    // mécanique elle-même, donc le kill switch n'a plus rien à rendre de ce
    // côté. Les assertions sont retournées, pas supprimées — elles interdisent
    // maintenant que couper UI-6 ressuscite l'économie retirée.
    expect(await page.evaluate(() =>
      document.getElementById("screen-studio").textContent.includes("+10 pts"))).toBe(false);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(300);
    await expect(page.locator("#topPassia")).toHaveCount(0);
    await expect(page.locator("#mainProfileStars")).toHaveCount(0);
    // ⚠️ 2026-08-31 : la rangée `.profile-chips-row` a été RETIRÉE du profil avec
    // sa dernière pastille (« 🏅 N »), sur demande de Benjamin — « l'app générale
    // n'a plus du tout le système de points ». Il n'y a donc plus ni rangée à
    // masquer, ni rangée à rendre : on exige son absence dans les DEUX états.
    await expect(page.locator(".profile-chips-row")).toHaveCount(0);
    await expect(page.locator("#mainProfileBadges")).toHaveCount(0);

    expect(errors.js, "exceptions JS avec le kill switch").toEqual([]);
  });

  test("kill switch mémoire : les nœuds retrouvent leur place d'origine", async ({ page }) => {
    await boot(page);
    await ouvrirStudio(page);
    await expect(page.locator("#v6Composer")).toHaveCount(1);

    await page.evaluate(() => { window.PASSIO_UI_6 = false; window.PassioUIV6.apply(); });
    await page.waitForTimeout(200);

    await expect(page.locator("#v6Composer")).toHaveCount(0);
    // Chaque nœud déplacé est revenu dans #screen-studio, à sa place.
    expect(await page.evaluate(() => {
      const ec = document.getElementById("screen-studio");
      return ["postText", "fieldPassion", "fieldMood", "studioPhoto", "studioVideo"]
        .every((id) => { const n = document.getElementById(id); return !!(n && ec.contains(n)); });
    })).toBe(true);
    await expect(page.locator("#studioTypeTabs")).toBeVisible();
  });

  for (const largeur of [320, 390, 430]) {
    test("mobile " + largeur + " px : aucun débordement, cibles ≥ 44 px", async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      await boot(page);
      await ouvrirStudio(page);

      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const h = document.getElementById("v6Composer");
        const cibles = Array.from(h.querySelectorAll(".v6-lien, .v6-media-btn, [data-v6-publier]"));
        return {
          deborde: doc.scrollWidth > doc.clientWidth + 1,
          dansLeCadre: h.getBoundingClientRect().right <= doc.clientWidth + 1,
          minHauteur: Math.min.apply(null, cibles.map((c) => c.getBoundingClientRect().height)),
        };
      });
      expect(m.deborde, "la page déborde horizontalement").toBe(false);
      expect(m.dansLeCadre, "le composer sort du cadre").toBe(true);
      expect(m.minHauteur, "cible tactile").toBeGreaterThanOrEqual(44);
    });
  }
});
