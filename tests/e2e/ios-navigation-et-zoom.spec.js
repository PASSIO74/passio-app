// ═══════════════════════════════════════════════════════════════════════════
// iPHONE — les trois défauts du 2026-09-02 (« les écrans se figent »,
// « les retours de page ne fonctionnent pas »), invisibles sur Android.
// ---------------------------------------------------------------------------
// Rapport du testeur : sur iPhone l'application se fige et le retour ne marche
// pas ; sur Android tout va bien. Trois causes distinctes, toutes trois
// SPÉCIFIQUES au moteur WebKit ou au tactile, donc toutes absentes d'un
// Chromium de bureau si on ne les provoque pas explicitement.
//
// ⚠️ CE QUI EST MESURABLE ICI — et ce qui ne l'est pas. Le headless de la CI
// n'est pas Safari : il n'applique NI le plafond d'écritures d'historique de
// WebKit, NI l'auto-zoom au focus d'un champ. On ne peut donc pas observer le
// symptôme ; on observe la CAUSE, là où elle se décide :
//   ① on fait LEVER `pushState` nous-mêmes, exactement comme WebKit le fait au
//      delà de ~100 écritures / 30 s, et on exige que la bascule d'écran
//      aboutisse quand même ;
//   ② on compte les entrées d'historique laissées derrière par un overlay
//      ouvert puis refermé au doigt ;
//   ③ on lit la taille de police CALCULÉE des champs de saisie — c'est elle,
//      et elle seule, qui déclenche l'auto-zoom d'iOS sous 16 px.
// Chacun des trois a été éprouvé par mutation : rétablir le code d'avant fait
// rougir le cas correspondant.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("iPhone — navigation, historique et saisie", () => {

  // ─── ① « L'ÉCRAN SE FIGE » ───────────────────────────────────────────────
  // WebKit plafonne les écritures d'historique (~100 / 30 s) et LÈVE au-delà.
  // `goTo` écrivait l'historique en TÊTE, sans `try` : l'exception sautait tout
  // le reste — bascule d'écran comprise. L'écran restait donc sur son contenu
  // précédent, et chaque tap suivant levait à son tour.
  test("un pushState qui LÈVE n'empêche pas le changement d'écran", async ({ page }) => {
    await bootOnboarded(page);

    // Reproduit fidèlement le refus de WebKit : même exception, même nom.
    await page.evaluate(() => {
      window.__pushRefuses = 0;
      history.pushState = function () {
        window.__pushRefuses++;
        const e = new Error("Attempt to use history.pushState() more than 100 times per 30 seconds");
        e.name = "SecurityError";
        throw e;
      };
    });

    await page.evaluate(() => goTo("irl"));
    await expect(page.locator("#screen-irl")).toHaveClass(/active/);
    expect(await page.evaluate(() => window.__pushRefuses)).toBeGreaterThan(0);

    // Et ça continue de fonctionner : le refus ne laisse pas l'app dans un état
    // dont elle ne se relève pas (c'est ce « chaque tap suivant lève » qui
    // faisait vivre le blocage comme définitif).
    await page.evaluate(() => goTo("messages"));
    await expect(page.locator("#screen-messages")).toHaveClass(/active/);
    await page.evaluate(() => goTo("feed"));
    await expect(page.locator("#screen-feed")).toHaveClass(/active/);
  });

  // Le plafond est aussi respecté DE NOUS-MÊMES : au-delà de la marge, on
  // renonce à l'entrée d'historique au lieu d'aller se faire refuser.
  test("les écritures d'historique sont bornées sous le plafond WebKit", async ({ page }) => {
    await bootOnboarded(page);

    const n = await page.evaluate(() => {
      let ecrites = 0;
      const vrai = history.pushState.bind(history);
      history.pushState = function (...a) { ecrites++; return vrai(...a); };
      const ecrans = ["feed", "irl", "messages", "profiles", "explore"];
      for (let i = 0; i < 200; i++) goTo(ecrans[i % ecrans.length]);
      return ecrites;
    });

    // 200 navigations en rafale : sans borne on aurait 200 écritures, donc le
    // refus de WebKit. La marge du projet est de 90 par fenêtre de 30 s.
    expect(n).toBeLessThanOrEqual(90);

    // ⚠️ ET l'application reste navigable : borner l'historique ne doit pas
    // border la navigation elle-même.
    await page.evaluate(() => goTo("irl"));
    await expect(page.locator("#screen-irl")).toHaveClass(/active/);
  });

  // ─── ② « LES RETOURS DE PAGE NE FONCTIONNENT PAS » ───────────────────────
  // Chaque overlay poussait une entrée à l'ouverture et n'en retirait AUCUNE à
  // la fermeture au doigt. Ouvrir puis fermer cinq modales laissait cinq
  // entrées mortes : il fallait cinq retours avant que quoi que ce soit bouge.
  // ⚠️ `history.length` NE CONVIENT PAS pour mesurer cela : un `history.back()`
  // ne le fait pas diminuer (les entrées « en avant » sont conservées). Le seul
  // témoin honnête est donc le COMPORTEMENT — combien d'appuis sur retour il
  // faut pour quitter l'écran — et le compte des écritures d'historique.
  test("quatre modales ouvertes et refermées au doigt ne coûtent AUCUN retour", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => goTo("irl"));
    await expect(page.locator("#screen-irl")).toHaveClass(/active/);

    for (let i = 0; i < 4; i++) {
      await page.evaluate((n) => openModal("<div id='m" + n + "'>essai</div>"), i);
      await expect(page.locator("#modalBackdrop")).toHaveClass(/active/);
      await page.evaluate(() => closeModal());       // fermeture au doigt (le ×)
      await expect(page.locator("#modalBackdrop")).not.toHaveClass(/active/);
      await page.waitForTimeout(80);                 // la reprise est différée d'un tour
    }

    // Aucune entrée morte : plus rien de « à nous » au sommet de la pile.
    const sommet = await page.evaluate(() => history.state && history.state.passioOverlay);
    expect(sommet, "une entrée d'overlay est restée sur la pile").toBeFalsy();

    // La preuve par l'usage : UN seul retour quitte l'écran. Avant le correctif
    // il en fallait cinq — les quatre premiers étaient avalés en silence.
    await page.goBack();
    await expect(page.locator("#screen-irl")).not.toHaveClass(/active/);
  });

  test("le retour matériel ferme la modale, puis ramène à l'écran précédent", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => goTo("irl"));
    await expect(page.locator("#screen-irl")).toHaveClass(/active/);

    await page.evaluate(() => openModal("<div>essai</div>"));
    await expect(page.locator("#modalBackdrop")).toHaveClass(/active/);

    // Premier retour : ferme la modale, SANS quitter l'écran.
    await page.goBack();
    await expect(page.locator("#modalBackdrop")).not.toHaveClass(/active/);
    await expect(page.locator("#screen-irl")).toHaveClass(/active/);

    // Second retour : quitte l'écran. C'est ce qu'attend quelqu'un qui utilise
    // le geste de retour depuis le bord, sur iPhone.
    await page.goBack();
    await expect(page.locator("#screen-irl")).not.toHaveClass(/active/);
    await expect(page.locator("#screen-feed")).toHaveClass(/active/);
  });

  // Ouvrir une modale depuis une autre la REMPLACE (openModal n'empile pas,
  // cf. CLAUDE.md) : cela ne doit pas non plus laisser d'entrée orpheline.
  test("remplacer une modale par une autre n'empile pas d'entrée", async ({ page }) => {
    await bootOnboarded(page);

    await page.evaluate(() => {
      window.__push = 0; window.__replace = 0;
      const p = history.pushState.bind(history), r = history.replaceState.bind(history);
      history.pushState = function (...a) { window.__push++; return p(...a); };
      history.replaceState = function (...a) { window.__replace++; return r(...a); };
    });

    await page.evaluate(() => openModal("<div>première</div>"));
    await page.waitForTimeout(40);
    await page.evaluate(() => { closeModal(); openModal("<div id='seconde'>seconde</div>"); });
    await page.waitForTimeout(120);
    await expect(page.locator("#seconde")).toBeVisible();

    // UNE seule entrée pour les deux modales successives : la seconde RÉUTILISE
    // celle de la première au lieu d'en empiler une nouvelle.
    const c = await page.evaluate(() => ({ push: window.__push, replace: window.__replace }));
    expect(c.push, "la seconde modale a empilé une entrée de plus").toBe(1);
    expect(c.replace, "la seconde modale aurait dû réutiliser l'entrée").toBe(1);

    // Et cette unique entrée est bien reprise à la fermeture.
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(120);
    const sommet = await page.evaluate(() => history.state && history.state.passioOverlay);
    expect(sommet, "l'entrée de la modale est restée sur la pile").toBeFalsy();
  });

  // ─── ②bis LES QUATRE GRANDS PANNEAUX PLEIN ÉCRAN ────────────────────────
  // `closeCurrentOverlay()` — l'unique filet du bouton retour — interrogeait
  // `eventDetail`, `postDetail`, `profileDetail` et `commentsPanel`. AUCUN de
  // ces identifiants n'existe dans index.html : les vrais sont
  // `eventDetailPage`, `postDetailPage`, `conv-fullpage` et `mediaEditor`. La
  // branche entière était morte et n'a jamais rien fermé.
  //
  // Conséquence : on ouvre une publication, une conversation ou l'éditeur média
  // (caméra allumée), on fait le geste de retour — rien n'est trouvé, le code
  // enchaîne sur `goTo(écran)`, et l'écran change SOUS un panneau
  // `position:fixed; inset:0` toujours affiché. Le panneau paraît figé, et le
  // retour suivant quitte l'application. Sur iPhone c'est le chemin principal
  // (geste depuis le bord) et, en PWA installée, il n'existe aucun bouton
  // retour du navigateur pour rattraper.
  const PANNEAUX = [
    ["#mediaEditor",     "editeur média",   (p) => p.evaluate(() => document.getElementById("mediaEditor").classList.add("open"))],
    ["#conv-fullpage",   "conversation",    (p) => p.evaluate(() => document.getElementById("conv-fullpage").classList.add("active"))],
    ["#eventDetailPage", "fiche activité",  (p) => p.evaluate(() => { document.getElementById("eventDetailPage").style.display = "flex"; })],
    ["#postDetailPage",  "page publication",(p) => p.evaluate(() => { document.getElementById("postDetailPage").style.display = "flex"; })],
  ];

  for (const [sel, nom, ouvrir] of PANNEAUX) {
    test(`closeCurrentOverlay ferme ${nom} (${sel})`, async ({ page }) => {
      await bootOnboarded(page);
      await ouvrir(page);

      // Le filet doit RECONNAÎTRE le panneau — c'est très exactement ce que la
      // branche morte ne faisait pas.
      const ferme = await page.evaluate(() => closeCurrentOverlay());
      expect(ferme, `closeCurrentOverlay n'a pas reconnu ${sel}`).toBe(true);

      const encoreVisible = await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return false;
        // ⚠️ `!!` obligatoire : `el.style.display` vaut la chaîne VIDE quand la
        // propriété n'est pas posée, et l'expression rendrait `""` au lieu de
        // `false` — un faux échec sur un panneau pourtant bien refermé.
        return !!(el.classList.contains("open") || el.classList.contains("active") ||
                  (el.style.display && el.style.display !== "none"));
      }, sel);
      expect(encoreVisible, `${sel} est resté à l'écran après le retour`).toBe(false);
    });
  }

  // Le chemin RÉEL, de bout en bout : ouvrir une publication puis faire le
  // geste de retour doit refermer la page — pas changer d'écran derrière elle.
  test("le retour referme la page publication au lieu de changer d'écran", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => goTo("feed"));

    const ouverte = await page.evaluate(async () => {
      const p = (state.seed.posts || [])[0];
      if (!p) return false;
      await openPost(p.id);
      const el = document.getElementById("postDetailPage");
      return !!(el && el.style.display && el.style.display !== "none");
    });
    expect(ouverte, "aucune publication de départ pour ce cas").toBe(true);

    await page.goBack();
    await page.waitForTimeout(150);

    const etat = await page.evaluate(() => ({
      pageOuverte: (function () {
        const el = document.getElementById("postDetailPage");
        return !!(el && el.style.display && el.style.display !== "none");
      })(),
      filActif: document.getElementById("screen-feed").classList.contains("active"),
    }));
    expect(etat.pageOuverte, "la page publication est restée par-dessus l'écran").toBe(false);
    expect(etat.filActif, "on ne doit pas avoir quitté le fil pendant ce temps").toBe(true);
  });

  // ─── ③ « L'ÉCRAN SE FIGE » (le vrai coupable) ────────────────────────────
  // Safari iOS ZOOME la page au focus d'un champ dont la police calculée est
  // sous 16 px, et n'annule pas ce zoom en sortant. Comme `html` est en
  // `overflow: hidden` et `.app-shell` borné à `--app-vh`, plus rien ne peut
  // ramener la page : elle reste agrandie et tronquée. Chrome/Android ne zoome
  // jamais — d'où « pourtant sur Android ça marche bien ».
  test("aucun champ de saisie n'est sous 16 px", async ({ page }) => {
    await bootOnboarded(page);

    const fautifs = await page.evaluate(() => {
      const sel = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"])' +
                  ':not([type="color"]):not([type="file"]):not([type="submit"]):not([type="button"]),' +
                  'textarea, select, [contenteditable="true"]';
      return Array.from(document.querySelectorAll(sel))
        .map((el) => ({
          id: el.id || el.name || el.className || el.tagName,
          px: parseFloat(getComputedStyle(el).fontSize),
        }))
        .filter((x) => x.px && x.px < 16);
    });

    expect(fautifs, "champs qui déclencheraient l'auto-zoom iOS : " +
      JSON.stringify(fautifs)).toEqual([]);
  });

  // Le champ e-mail de la connexion est le tout PREMIER que touche un nouveau
  // testeur : il était à 15 px, donc le défaut se déclenchait dès l'entrée.
  test("les champs de connexion sont à 16 px au moins", async ({ page }) => {
    await bootOnboarded(page);
    for (const id of ["#authEmail", "#authPassword", "#authPasswordConfirm"]) {
      const px = await page.locator(id).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(px, id + " déclencherait l'auto-zoom iOS").toBeGreaterThanOrEqual(16);
    }
  });

  // ⚠️ Le remède ne doit pas être « bloquer le zoom » : le zoom VOLONTAIRE est
  // une exigence d'accessibilité (WCAG 1.4.4). Un futur `maximum-scale=1` ou
  // `user-scalable=no` glissé dans le <meta viewport> ferait rougir ce cas.
  test("le zoom volontaire reste autorisé", async ({ page }) => {
    await bootOnboarded(page);
    const vp = await page.evaluate(() => {
      const m = document.querySelector('meta[name="viewport"]');
      return m ? m.getAttribute("content") : "";
    });
    expect(vp).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
    expect(vp).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/i);
  });

  // ─── VERROU DE DÉFILEMENT ────────────────────────────────────────────────
  // `document.body.style.overflow` était une ressource unique que plusieurs
  // overlays se disputaient : le second parti déverrouillait pour le premier,
  // et un chemin de fermeture oublié laissait la page bloquée pour de bon.
  test("le défilement ne revient qu'au dernier overlay fermé", async ({ page }) => {
    await bootOnboarded(page);
    const overflow = () => page.evaluate(() => document.body.style.overflow);

    await page.evaluate(() => { lockBodyScroll("a"); lockBodyScroll("b"); });
    expect(await overflow()).toBe("hidden");

    await page.evaluate(() => unlockBodyScroll("a"));
    expect(await overflow(), "b tient encore le verrou").toBe("hidden");

    await page.evaluate(() => unlockBodyScroll("b"));
    expect(await overflow()).toBe("");

    // Idempotence : un même propriétaire qui verrouille deux fois ne doit pas
    // rendre la libération impossible (sinon la page ne défile plus jamais).
    await page.evaluate(() => { lockBodyScroll("a"); lockBodyScroll("a"); unlockBodyScroll("a"); });
    expect(await overflow()).toBe("");
  });
});
