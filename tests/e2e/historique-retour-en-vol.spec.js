// ═══════════════════════════════════════════════════════════════════════════
// HISTORIQUE — UNE ÉCRITURE PENDANT QU'UN RETOUR EST EN VOL (2026-11-07)
// ---------------------------------------------------------------------------
// `closeModal()` reprend l'entrée de la modale par un `history.back()` différé.
// Si `openModal()` écrit l'historique avant que ce retour ait atterri, le moteur
// atterrit quand même sur l'entrée d'écran, alors que `_navOverlayDepth` dit 1. Le
// `closeModal(); openModal()` suivant réécrit alors l'entrée d'ÉCRAN en entrée
// d'overlay, et la fermeture d'après recule hors de l'application : `about:blank`
// ici, le site d'où il venait pour un utilisateur.
//
// ⚠️ LES DEUX MOTEURS ONT LE DÉFAUT, SEULE LA FENÊTRE CHANGE : ~2 ms sur Chromium,
// 30 à 90 ms sur WebKit. Un écart de 2 ms ne le déclenche donc que sur WebKit (①).
// Pour l'éprouver sur les deux, le journal ci-dessous rejoue la suite du geste
// JUSTE APRÈS le `history.back()` (`apresRetour`) : on est alors en vol à coup sûr,
// sur tout moteur et à toute charge.
//
// La suite est dans `SUITES_WEBKIT` (playwright.config.js) : c'est sur ce moteur que
// la fenêtre est à portée d'un geste. Récit : docs/journal/comptes-inscription-legal.md.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootVisiteur } = require("./first-run-helper");

// Posé AVANT tout script de l'application : son `popstate` passe donc avant le sien,
// et une écriture faite PAR l'atterrissage ne se compte pas comme faite en vol.
//   · `retardMs` ralentit le retour, comme un iPhone occupé ;
//   · `apresRetour` exécute un geste aussitôt le retour parti.
async function poserJournal(page) {
  await page.addInitScript(() => {
    const j = (window.__hist = {
      retardMs: 0, apresRetour: null, enVol: 0, ecrituresEnVol: [], retours: 0, retoursEnVol: 0, atterrissages: 0,
    });
    const vraiBack = history.back.bind(history);
    history.back = function () {
      j.retours++;
      if (j.enVol > 0) j.retoursEnVol++;
      j.enVol++;
      if (j.retardMs > 0) setTimeout(vraiBack, j.retardMs);
      else vraiBack();
      const suite = j.apresRetour;
      j.apresRetour = null;
      if (suite) suite();
    };
    for (const nom of ["pushState", "replaceState"]) {
      const vrai = history[nom].bind(history);
      history[nom] = function (etat, titre, url) {
        if (j.enVol > 0) j.ecrituresEnVol.push(nom + " " + url);
        return vrai(etat, titre, url);
      };
    }
    window.addEventListener("popstate", () => {
      j.atterrissages++;
      if (j.enVol > 0) j.enVol--;
    });
  });
}

async function bootAvecJournal(page) {
  await poserJournal(page);
  await bootVisiteur(page);
  // Le marqueur meurt avec le document : le retrouver prouve qu'on n'en est pas sorti.
  await page.evaluate(() => { window.__memeDocument = true; });
}

// Ouvre une modale sur l'écran « Rencontrer » et la laisse poser son entrée.
async function modaleSurIrl(page) {
  await page.evaluate(() => goTo("irl"));
  await page.evaluate(() => openModal("<div>une</div>"));
  await page.waitForTimeout(300);
}

// Hors de l'application, ce qu'on attend n'arrivera plus : rougir vite, pas à 45 s.
const ATTENTE = { polling: 50, timeout: 5000 };
const atterri = (page) => page.waitForFunction(() => window.__hist.enVol === 0 && !_releasePending, null, ATTENTE);

async function lire(page) {
  return page.evaluate(() => ({
    modaleOuverte: document.getElementById("modalBackdrop").classList.contains("active"),
    sommetOverlay: !!(history.state && history.state.passioOverlay),
    ecranEntree: history.state && history.state.screen,
    ecranActif: (document.querySelector(".screen.active") || {}).id,
    profondeur: _navOverlayDepth,
    enVol: _navExpectingBack,
    ecrituresEnVol: window.__hist.ecrituresEnVol,
  }));
}

// Lue sur `page.url()` et sur le document : `about:blank` n'a ni l'un ni l'autre.
async function exigerDansApplication(page, message) {
  expect(page.url(), message + " : on est sorti de l'application").toContain("/index.html");
  const dedans = await page.evaluate(() => window.__memeDocument === true);
  expect(dedans, message + " : le document a changé").toBe(true);
}

// La séquence du défaut, une fois la modale rouverte pendant le vol.
async function exigerFinDeSequence(page) {
  await page.waitForTimeout(400);
  await page.evaluate(() => { closeModal(); openModal("<div id='m3'>trois</div>"); });
  await page.waitForTimeout(300);
  await page.evaluate(() => closeModal());
  await page.waitForTimeout(1200);

  await exigerDansApplication(page, "après la séquence");
  const fin = await lire(page);
  expect(fin.modaleOuverte).toBe(false);
  expect(fin.sommetOverlay, "l'entrée de la modale est restée sur la pile").toBe(false);
  expect(fin.ecranActif).toBe("screen-feed");
  expect(fin.profondeur).toBe(0);
  expect(fin.enVol).toBe(0);
  expect(fin.ecrituresEnVol, "une écriture d'historique est partie pendant le vol").toEqual([]);
}

test.describe("Historique — une écriture pendant qu'un retour est en vol", () => {
  // Les portes du produit au plus près : `closeModal();setTimeout(…,200)`, app-06.
  test("① modale rouverte à 2 ms : on reste dans l'application", async ({ page }) => {
    await bootAvecJournal(page);
    await page.evaluate(() => openModal("<div id='m1'>une</div>"));
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      closeModal();
      await new Promise((r) => setTimeout(r, 2));
      openModal("<div id='m2'>deux</div>");
    });
    await exigerFinDeSequence(page);
  });

  test("② modale rouverte aussitôt le retour parti : même verdict sur tout moteur", async ({ page }) => {
    await bootAvecJournal(page);
    await page.evaluate(() => openModal("<div id='m1'>une</div>"));
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__hist.apresRetour = () => openModal("<div id='m2'>deux</div>");
      closeModal();
    });
    await exigerFinDeSequence(page);
  });

  test("③ la modale rouverte a son entrée : le retour la ferme, sans sortir", async ({ page }) => {
    await bootAvecJournal(page);
    await modaleSurIrl(page);
    await page.evaluate(() => {
      window.__hist.apresRetour = () => openModal("<div id='rouverte'>rouverte</div>");
      closeModal();
    });
    await expect(page.locator("#rouverte")).toBeVisible();
    await atterri(page);

    const pose = await lire(page);
    expect(pose.sommetOverlay, "modale ouverte sans entrée : le retour sortirait de l'écran").toBe(true);
    expect(pose.profondeur).toBe(1);
    expect(pose.ecrituresEnVol).toEqual([]);

    await page.goBack();
    await page.waitForFunction(() => !document.getElementById("modalBackdrop").classList.contains("active"), null, ATTENTE);
    await exigerDansApplication(page, "après le retour");
    const apres = await lire(page);
    expect(apres.ecranActif, "le retour devait fermer la modale, pas changer d'écran").toBe("screen-irl");
    expect(apres.ecranEntree).toBe("irl");
    expect(apres.profondeur).toBe(0);
  });

  test("④ changer d'écran pendant le vol laisse l'entrée de cet écran au sommet", async ({ page }) => {
    await bootAvecJournal(page);
    await modaleSurIrl(page);
    await page.evaluate(() => {
      window.__hist.apresRetour = () => goTo("messages");
      closeModal();
    });
    await atterri(page);
    await page.waitForTimeout(100);

    const fin = await lire(page);
    expect(fin.ecranActif).toBe("screen-messages");
    expect(fin.ecranEntree, "l'écran affiché n'est pas celui de l'entrée courante").toBe("messages");
    expect(fin.ecrituresEnVol).toEqual([]);

    await page.goBack();
    await page.waitForFunction(() => document.getElementById("screen-irl").classList.contains("active"), null, ATTENTE);
    await exigerDansApplication(page, "après le retour");
  });

  test("⑤ ouvrir puis refermer pendant le vol ne laisse rien sur la pile", async ({ page }) => {
    await bootAvecJournal(page);
    await modaleSurIrl(page);
    await page.evaluate(() => {
      window.__hist.apresRetour = () => { openModal("<div>deux</div>"); closeModal(); };
      closeModal();
    });
    await page.waitForFunction(() => window.__hist.atterrissages >= 1 && window.__hist.enVol === 0 && !_releasePending, null, ATTENTE);
    await page.waitForTimeout(300);

    const fin = await lire(page);
    expect(fin.modaleOuverte).toBe(false);
    expect(fin.sommetOverlay, "un retour de plus serait mort").toBe(false);
    expect(fin.ecranEntree).toBe("irl");
    expect(fin.profondeur).toBe(0);
    expect(fin.ecrituresEnVol).toEqual([]);
    // Les deux gestes s'annulent : pas d'écriture rejouée, donc pas de second retour.
    expect(await page.evaluate(() => window.__hist.retours)).toBe(1);

    await page.goBack();
    await page.waitForFunction(() => document.getElementById("screen-feed").classList.contains("active"), null, ATTENTE);
    await exigerDansApplication(page, "après le retour");
  });

  test("⑥ deux overlays fermés coup sur coup : un retour à la fois, aucun de perdu", async ({ page }) => {
    await bootAvecJournal(page);
    await page.evaluate(() => goTo("irl"));
    await page.evaluate(() => { pushOverlayHistory("a", "#a"); pushOverlayHistory("b", "#b"); });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      window.__hist.apresRetour = () => releaseOverlayHistory();
      releaseOverlayHistory();
    });
    await page.waitForFunction(() => _navOverlayDepth === 0 && !_releasePending && window.__hist.enVol === 0, null, ATTENTE);
    await page.waitForTimeout(300);

    const fin = await lire(page);
    expect(fin.ecranEntree, "une entrée d'overlay est restée morte sur la pile").toBe("irl");
    const compte = await page.evaluate(() => {
      const { retours, retoursEnVol, atterrissages } = window.__hist;
      return { retours, retoursEnVol, atterrissages };
    });
    expect(compte).toEqual({ retours: 2, retoursEnVol: 0, atterrissages: 2 });
  });

  test("⑦ un retour lent n'est pas pris pour un geste de la personne", async ({ page }) => {
    await bootAvecJournal(page);
    await modaleSurIrl(page);
    await page.evaluate(() => {
      window.__hist.retardMs = 550;   // au-delà de l'ancien filet (400), sous le nouveau
      window.__hist.apresRetour = () => openModal("<div id='rouverte'>rouverte</div>");
      closeModal();
    });
    await atterri(page);
    await page.waitForTimeout(100);

    const fin = await lire(page);
    expect(fin.modaleOuverte, "l'atterrissage tardif a refermé la modale rouverte").toBe(true);
    expect(fin.sommetOverlay, "modale ouverte sans entrée au sommet").toBe(true);
    expect(fin.profondeur).toBe(1);
  });

  test("⑧ le filet d'un retour déjà atterri ne désarme pas le suivant", async ({ page }) => {
    await bootAvecJournal(page);
    await modaleSurIrl(page);
    await page.evaluate(() => {
      // t0 : premier retour. Son filet échoit à t0+filet (400 ms avant le correctif) ; 70 ms
      // plus tôt le second retour part, et il reste en l'air bien au-delà. Deux minuteries
      // partent dans l'ordre de leurs échéances : ce test ne dépend pas de la charge du poste.
      const filet = typeof _NAV_FILET_RETOUR_MS === "number" ? _NAV_FILET_RETOUR_MS : 400;
      window.__hist.apresRetour = () => setTimeout(() => {
        openModal("<div>deux</div>");
        window.__hist.retardMs = 300;
        window.__hist.apresRetour = () => openModal("<div id='troisieme'>trois</div>");
        closeModal();
        _flushOverlayRelease();
        window.__secondRetourParti = true;
      }, filet - 70);
      closeModal();
    });
    await page.waitForFunction(() => window.__secondRetourParti === true && window.__hist.enVol === 0, null, ATTENTE);
    await page.waitForTimeout(100);

    const fin = await lire(page);
    expect(fin.modaleOuverte, "le filet du premier retour a fait prendre le second pour un geste").toBe(true);
    expect(fin.sommetOverlay).toBe(true);
    expect(fin.profondeur).toBe(1);
  });

  test("⑨ un retour qui n'atterrit jamais ne retient pas l'historique pour de bon", async ({ page }) => {
    await bootAvecJournal(page);
    await modaleSurIrl(page);
    await page.evaluate(() => {
      // Navigateur qui étouffe le retour : rien ne part, aucun `popstate` n'arrivera.
      history.back = function () {
        history.back = function () {};
        openModal("<div>deux</div>");
        window.__retourEtouffe = true;
      };
      closeModal();
    });
    await page.waitForFunction(() => window.__retourEtouffe === true && _navExpectingBack === 0, null, ATTENTE);
    const fin = await lire(page);
    expect(fin.modaleOuverte).toBe(true);
    expect(fin.sommetOverlay).toBe(true);
    expect(fin.profondeur, "le geste reporté n'a pas été rejoué").toBe(1);
  });

  test("⑩ la fiche d'activité, l'autre porte d'entrée d'un overlay, attend aussi", async ({ page }) => {
    await bootAvecJournal(page);
    await modaleSurIrl(page);
    await page.evaluate(() => {
      window.__hist.apresRetour = () => pushOverlayToHistory("event", "ev0");
      closeModal();
    });
    await atterri(page);
    await page.waitForTimeout(100);

    const fin = await lire(page);
    expect(fin.sommetOverlay, "la fiche ouverte n'a pas son entrée au sommet").toBe(true);
    expect(await page.evaluate(() => location.hash)).toBe("#event-ev0");
    expect(fin.profondeur).toBe(1);
    expect(fin.ecrituresEnVol).toEqual([]);
  });

  // Sans crochet ni ralenti : de vrais écarts, qui balaient la fenêtre d'atterrissage de
  // chaque moteur. Ce qui compte n'est pas où tombe chaque geste, c'est où finit la pile.
  test("⑪ des ouvertures et fermetures à écarts réels ne laissent aucune entrée morte", async ({ page }) => {
    await bootAvecJournal(page);
    await page.evaluate(() => goTo("irl"));
    await page.waitForTimeout(100);
    await page.evaluate(async () => {
      for (const ecart of [0, 1, 2, 5, 10, 20, 40, 80]) {
        openModal("<div>modale</div>");
        await new Promise((r) => setTimeout(r, ecart));
        closeModal();
        await new Promise((r) => setTimeout(r, ecart));
      }
    });
    await atterri(page);
    await page.waitForTimeout(300);

    const fin = await lire(page);
    expect(fin.sommetOverlay, "une entrée d'overlay est restée morte sur la pile").toBe(false);
    expect(fin.ecranEntree).toBe("irl");
    expect(fin.profondeur).toBe(0);
    expect(fin.ecrituresEnVol).toEqual([]);

    await page.goBack();
    await page.waitForFunction(() => document.getElementById("screen-feed").classList.contains("active"), null, ATTENTE);
    await exigerDansApplication(page, "après le retour");
  });

  // La garde qui transformait une erreur de compte en sortie de l'application : même si
  // la comptabilité se trompe encore un jour (une écriture qu'on n'a pas vue), on ne
  // réécrit QUE ce qui est à nous. Aucune course ici : l'état fautif est posé tel quel.
  test("⑫ un compte faux ne réécrit jamais une entrée d'écran", async ({ page }) => {
    await bootAvecJournal(page);
    await page.evaluate(() => goTo("irl"));
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      // Modale affichée, sommet = l'entrée d'écran, et un compte qui dit 1 : l'état
      // exact où le défaut laissait l'application après l'atterrissage.
      _navOverlayDepth = 1;
      document.getElementById("modalBackdrop").classList.add("active");
      closeModal();
      openModal("<div>remplaçante</div>");
    });
    await page.waitForTimeout(100);
    expect((await lire(page)).profondeur, "le compte faux n'a pas été remis à sa valeur").toBe(1);

    await page.goBack();
    await page.waitForFunction(() => !document.getElementById("modalBackdrop").classList.contains("active"), null, ATTENTE);
    await page.waitForTimeout(100);
    const fin = await lire(page);
    expect(fin.ecranEntree, "l'entrée d'écran a été réécrite en entrée d'overlay").toBe("irl");
    await exigerDansApplication(page, "après le retour");
  });

  // Le chemin ordinaire reste une RÉUTILISATION : le correctif ne doit pas transformer
  // le remplacement en empilement (un appui « retour » mort).
  test("⑬ remplacer une modale hors de tout vol reste un seul replaceState", async ({ page }) => {
    await bootAvecJournal(page);
    await modaleSurIrl(page);
    const c = await page.evaluate(() => {
      const compte = { push: 0, replace: 0 };
      const p = history.pushState, r = history.replaceState;
      history.pushState = function (...a) { compte.push++; return p.apply(history, a); };
      history.replaceState = function (...a) { compte.replace++; return r.apply(history, a); };
      closeModal();
      openModal("<div>deux</div>");
      return compte;
    });
    expect(c).toEqual({ push: 0, replace: 1 });
    expect((await lire(page)).profondeur).toBe(1);
  });
});
