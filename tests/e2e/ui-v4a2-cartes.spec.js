// Lot UI-4A2 — carte d'activité V2 dans « Rencontrer » (ACTIF PAR DÉFAUT).
//
// ⚠️ Réalignement du 2026-08-28 : le lot a été basculé de l'aperçu vers l'URL
// normale, sur décision de Benjamin, en même temps qu'UI-4A0, UI-4A1 et UI-4B.
// L'énoncé « l'URL normale est strictement inchangée » est donc devenu FAUX :
// il décrivait un produit qui n'existe plus. Il est réécrit ci-dessous pour
// dire le comportement vrai, sans qu'aucun contrôle soit retiré — les mêmes
// nœuds sont observés, avec la visibilité désormais attendue. Corollaire : les
// anciennes constantes d'aperçu (`?passio_preview=passio-ui-4a2[-demo]`) ne
// décident plus rien, toute la suite part donc de l'URL NUE, et ce sont les
// deux coupures (`localStorage.passio_ui_4a2="0"`, `window.PASSIO_UI_4A2=false`)
// qui portent seules le chemin de retour arrière.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① sur l'URL NORMALE le lot est en place — classe racine posée, toutes les
//      cartes rendues décorées, et la carte historique RECOUVERTE mais entière
//      dans le DOM (c'est le kill switch, et lui seul, qui la redonne) ;
//   ② la carte porte EXACTEMENT ce que la direction §8 énumère :
//      un visuel, le titre, Passio · quand, ville · distance, participants
//      agrégés · places, puis « Voir » et « Je viens » ;
//   ③ rien n'est retiré du DOM : le pied, la barre d'actions sociales et
//      l'aperçu de commentaires historiques sont MASQUÉS, jamais supprimés —
//      c'est ce qui permet aux patchs asynchrones du moteur de continuer à les
//      retrouver, et au kill switch de rendre la carte d'avant ;
//   ④ le masquage est BORNÉ au marqueur `data-v4a2` : une carte que le lot n'a
//      pas su décorer garde toutes ses portes (leçon du lot UI-3A) ;
//   ⑤ vie privée (§A24) : ni le nom du lieu, ni l'adresse, ni le contact, ni le
//      trombinoscope ne montent sur la carte — ville publique et agrégats ;
//   ⑥ « Je viens » n'écrit RIEN avant le geste, puis passe par le moteur
//      historique `setEventRsvp` — aucun second moteur de participation ;
//   ⑦ annulé et terminé ne sont JAMAIS recouverts d'une invitation à venir ;
//   ⑧ sur cette même URL nue, la tête UI-4A0 et le raccord UI-4A1 sont actifs
//      eux aussi (chacun pour son propre compte, plus par héritage d'aperçu),
//      et les trois coupures restent indépendantes ;
//   ⑨ kill switches local et mémoire : retour intégral à la carte historique ;
//   ⑩ mobile 320 / 390 / 430 px sans débordement, cibles ≥ 44 px.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ⚠️ Plus aucune constante d'aperçu ici. `?passio_preview=passio-ui-4a2` et son
// alias `-demo` sont désormais des paramètres inertes : le drapeau du module ne
// sait plus qu'ENLEVER. Un test qui les passerait mesurerait exactement la même
// chose que l'URL nue tout en laissant croire qu'il a activé quelque chose —
// c'est le contraire de ce que doit dire une suite. Toute la suite boote donc
// sur l'URL normale, celle que voit réellement un utilisateur.
const SEUIL_PX = 4;

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript((cle) => localStorage.setItem(cle, "0"), opts.killLocal);
  }
  // Aucune demande de position réelle : le test observe, il n'accorde ni ne
  // refuse une permission.
  await page.addInitScript(() => {
    try {
      var g = navigator.geolocation;
      if (g) Object.defineProperty(g, "getCurrentPosition", { configurable: true, value: function () {} });
    } catch (e) {}
  });
  await bootOnboarded(page, null, 1);
  await page.evaluate(() => { window.supaLoadPosts = async () => []; });
}

async function ouvrirIrl(page) {
  await page.evaluate(() => goTo("irl"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-irl");
    return el && el.classList.contains("active");
  });
  await page.waitForTimeout(400);
}

// Première carte de la liste et son identifiant d'activité.
async function premiereCarte(page) {
  const carte = page.locator("#eventList .event-card").first();
  await expect(carte).toBeVisible();
  return { carte, id: await carte.getAttribute("data-evid") };
}

test.describe("UI-4A2 — carte d'activité V2", () => {
  // ⚠️ Énoncé RÉÉCRIT le 2026-08-28. Il disait « URL normale : rien du lot,
  // carte historique intacte » et vérifiait l'ABSENCE de la classe racine, du
  // bloc V2 et du marqueur, puis la VISIBILITÉ des quatre nœuds historiques.
  // Ces quatre affirmations sont devenues fausses par un changement de PRODUIT
  // (bascule du lot en actif par défaut), pas par une régression : sur l'URL
  // nue, le lot décore désormais chaque carte et recouvre l'ancienne. On garde
  // exactement les mêmes nœuds sous observation — c'est la visibilité attendue
  // qui s'inverse — plus la coquille (classe racine, marqueur, couverture) que
  // l'ancien énoncé niait. « Recouverte » et non « supprimée » : la carte
  // historique reste entière dans le DOM, sans quoi le retour arrière par kill
  // switch (dernier test de la suite) serait impossible.
  test("URL normale : le lot est en place et recouvre la carte historique", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a2"))).toBe(true);

    const total = await page.locator("#eventList .event-card").count();
    expect(total).toBeGreaterThan(0);
    await expect(page.locator("#eventList .event-card[data-v4a2]")).toHaveCount(total);
    await expect(page.locator("#eventList .v4a2")).toHaveCount(total);

    const { carte } = await premiereCarte(page);
    await expect(carte.locator(".v4a2")).toBeVisible();
    for (const sel of [".event-footer", ".post-actions", ".event-date-block", ".event-title"]) {
      await expect(carte.locator(sel)).toHaveCount(1);
      await expect(carte.locator(sel)).toBeHidden();
    }
  });

  test("la carte porte les six informations de décision", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a2"))).toBe(true);

    // Toutes les cartes rendues sont décorées, aucune ne reste à moitié.
    const total = await page.locator("#eventList .event-card").count();
    expect(total).toBeGreaterThan(0);
    await expect(page.locator("#eventList .event-card[data-v4a2]")).toHaveCount(total);
    await expect(page.locator("#eventList .v4a2")).toHaveCount(total);

    const { carte, id } = await premiereCarte(page);
    await expect(carte.locator(".v4a2-visuel")).toBeVisible();
    await expect(carte.locator(".v4a2-titre")).toBeVisible();
    await expect(carte.locator(".v4a2-quoi")).toBeVisible();
    await expect(carte.locator(".v4a2-monde")).toBeVisible();
    await expect(carte.locator('.v4a2-actions [data-v4a2-act="voir"]')).toBeVisible();

    // Le titre est celui de l'activité, et la Passio ouvre la première ligne.
    const attendu = await page.evaluate((evid) => {
      const ev = allEvents().find((e) => e.id === evid);
      const p = passionById(ev.passion);
      return { titre: ev.title, passion: p.label, ville: ev.city, n: (ev.attendees || []).length };
    }, id);
    await expect(carte.locator(".v4a2-titre")).toHaveText(attendu.titre);
    await expect(carte.locator(".v4a2-quoi")).toContainText(attendu.passion);
    await expect(carte.locator(".v4a2-ou")).toContainText(attendu.ville);
    await expect(carte.locator(".v4a2-monde"))
      .toContainText(attendu.n + " personne" + (attendu.n > 1 ? "s" : ""));
  });

  test("rien n'est retiré : les nœuds historiques sont masqués, pas supprimés", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    const { carte, id } = await premiereCarte(page);
    for (const sel of [".event-footer", ".post-actions", ".event-date-block", ".event-title"]) {
      await expect(carte.locator(sel)).toHaveCount(1);
      await expect(carte.locator(sel)).toBeHidden();
    }
    // Les ancres que les chargements asynchrones du moteur retrouvent APRÈS
    // coup sont toujours là — les retirer ferait échouer ces patchs en silence.
    for (const sel of [`[data-evlike="${id}"]`, `[data-evc="${id}"]`,
                       `[data-evchipholder="${id}"]`, `[data-evcomments="${id}"]`]) {
      await expect(carte.locator(sel)).toHaveCount(1);
    }
  });

  test("masquage borné : une carte non décorée garde toutes ses portes", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    const { carte } = await premiereCarte(page);
    await expect(carte.locator(".event-footer")).toBeHidden();

    // L'activité devient introuvable : le lot doit RENDRE la carte historique,
    // pas la laisser amputée de ce qu'il ne remplace plus.
    //
    // ⚠️ Ce contrôle MET EN SCÈNE le DOM (un identifiant d'activité qui n'existe
    // pas). N'importe quel nouveau rendu de la liste efface cette mise en scène
    // et repeint une carte légitimement décorée : l'assertion devient alors une
    // COURSE, verte ou rouge selon la machine. Elle est passée en local et a
    // échoué sur la CI, plus lente (run 2173). On gèle donc le rendu historique
    // le temps du contrôle — c'est le module UI-4A2 qui est sous test ici, pas
    // le moteur IRL — puis on le rend au moteur.
    await page.evaluate(() => {
      window.__renderIRLGele = window.renderIRL;
      window.renderIRL = function () {};
      const c = document.querySelector("#eventList .event-card");
      c.setAttribute("data-evid", "evid_qui_n_existe_pas");
      window.PassioUIV4A2.refresh();
    });
    await expect(carte.locator(".v4a2")).toHaveCount(0);
    expect(await carte.getAttribute("data-v4a2")).toBeNull();
    await expect(carte.locator(".event-footer")).toBeVisible();
    await expect(carte.locator(".post-actions")).toBeVisible();

    // Le moteur reprend la main, et le rendu suivant redécore normalement :
    // la carte n'a pas été « rendue » définitivement, seulement le temps où son
    // activité était introuvable.
    await page.evaluate(() => {
      window.renderIRL = window.__renderIRLGele;
      renderIRL();
    });
    await expect(page.locator("#eventList .event-card[data-v4a2]").first()).toBeVisible();
  });

  test("vie privée : ni lieu exact, ni adresse, ni contact, ni visages", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    // Une activité seed qui porte lieu, adresse et contact.
    const cible = await page.evaluate(() => {
      const ev = allEvents().find((e) => e.venue && e.address && e.contact
        && document.querySelector('#eventList .event-card[data-evid="' + e.id + '"]'));
      return ev ? { id: ev.id, venue: ev.venue, address: ev.address, contact: ev.contact } : null;
    });
    expect(cible).not.toBeNull();

    const carte = page.locator(`#eventList .event-card[data-evid="${cible.id}"]`);
    const bloc = carte.locator(".v4a2");
    const texte = await bloc.innerText();
    expect(texte).not.toContain(cible.venue);
    expect(texte).not.toContain(cible.address);
    expect(texte).not.toContain(cible.contact);
    // Agrégat, jamais le trombinoscope : aucun avatar de participant dans le bloc.
    await expect(bloc.locator(".avatar")).toHaveCount(0);
  });

  test("« Je viens » : aucune écriture avant le geste, puis setEventRsvp", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    // Une activité à venir, non complète, que je n'organise pas.
    const id = await page.evaluate(() => {
      const cartes = [...document.querySelectorAll("#eventList .event-card[data-v4a2]")];
      for (const c of cartes) {
        const ev = allEvents().find((e) => e.id === c.getAttribute("data-evid"));
        if (ev && !_eventIsOver(ev) && !_eventIsCancelled(ev) && !_eventIsFull(ev) && !_isMyEvent(ev)) return ev.id;
      }
      return null;
    });
    expect(id).not.toBeNull();

    const carte = page.locator(`#eventList .event-card[data-evid="${id}"]`);
    const go = carte.locator('[data-v4a2-act="go"]');
    await expect(go).toHaveText("Je viens");

    // Rien n'a été écrit par le simple affichage de la carte.
    expect(await page.evaluate((e) => myRsvp(e), id)).toBeNull();

    // Le moteur historique est bien le seul appelé.
    await page.evaluate(() => {
      window.__rsvpCalls = [];
      const vrai = window.setEventRsvp;
      window.setEventRsvp = function (id, r) { window.__rsvpCalls.push([id, r]); return vrai.apply(this, arguments); };
    });

    await go.click();
    await page.waitForTimeout(400);

    expect(await page.evaluate(() => window.__rsvpCalls)).toEqual([[id, "going"]]);
    expect(await page.evaluate((e) => myRsvp(e), id)).toBe("going");
    // La carte dit désormais ma réponse, et ouvre la feuille historique à trois
    // états plutôt que d'en dupliquer une seconde.
    await expect(carte.locator('[data-v4a2-act="go"]')).toHaveCount(0);
    await expect(carte.locator('[data-v4a2-act="reponse"]')).toHaveAttribute("data-v4a2-rsvp", "going");
  });

  test("annulé et terminé ne sont jamais recouverts", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    const ids = await page.evaluate(() => {
      const cartes = [...document.querySelectorAll("#eventList .event-card[data-v4a2]")]
        .map((c) => c.getAttribute("data-evid"));
      const futurs = cartes.filter((id) => {
        const ev = allEvents().find((e) => e.id === id);
        return ev && !_eventIsOver(ev) && !_eventIsCancelled(ev);
      });
      if (futurs.length < 2) return null;
      // ⚠️ `allEvents()` rend des copies shallow : muter l'objet qu'il renvoie
      // ne change rien à la source. C'est `_findCanonicalEvent` qui donne
      // l'objet réel — même piège que celui corrigé dans le moteur en 2026-06.
      const annule = _findCanonicalEvent(futurs[0]);
      annule.status = "cancelled";
      const passe = _findCanonicalEvent(futurs[1]);
      passe.date = Date.now() - 7 * 86400000;
      renderIRL();
      return { annule: futurs[0], passe: futurs[1] };
    });
    expect(ids).not.toBeNull();
    await page.waitForTimeout(300);

    const cAnnule = page.locator(`#eventList .event-card[data-evid="${ids.annule}"]`);
    await expect(cAnnule.locator('[data-v4a2-act="annule"]')).toHaveText("Annulé");
    await expect(cAnnule.locator('[data-v4a2-act="go"]')).toHaveCount(0);

    // L'activité passée peut disparaître de la liste selon les filtres du
    // moteur ; si elle y est, elle n'invite jamais à venir.
    const cPasse = page.locator(`#eventList .event-card[data-evid="${ids.passe}"]`);
    if (await cPasse.count()) {
      await expect(cPasse.locator('[data-v4a2-act="go"]')).toHaveCount(0);
      await expect(cPasse.locator('[data-v4a2-act="voir"]')).toHaveText("Revoir");
    }
  });

  // ⚠️ Titre RÉÉCRIT le 2026-08-28. Il disait « l'aperçu implique la tête UI-4A0
  // et le raccord UI-4A1 » : sous aperçu, ouvrir UI-4A2 allumait ses deux
  // prédécesseurs par HÉRITAGE, faute de quoi la carte V2 se serait retrouvée
  // sous une tête historique. Cet héritage n'a plus d'objet — les trois lots
  // sont actifs par défaut, chacun pour son propre compte. Ce qui reste à
  // prouver est le fait, pas le mécanisme : sur l'URL nue les trois surfaces
  // cohabitent et les intentions pilotent réellement le moteur. Aucune
  // assertion n'est retirée.
  test("URL normale : la tête UI-4A0 et le raccord UI-4A1 sont là eux aussi", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    await expect(page.locator("#v4a0Head")).toBeVisible();
    expect(await page.evaluate(() => window.PassioUIV4A0.isEnabled())).toBe(true);
    expect(await page.evaluate(() => window.PassioUIV4A1.isActive())).toBe(true);

    // Les intentions ne sont pas décoratives : elles pilotent le moteur.
    // ⚠️ Elles vivent désormais dans le panneau « Outils » (lot UI-4A4,
    // 2026-08-28) et non plus dans la tête. Ce test décrit l'URL NUE, telle
    // qu'un vrai utilisateur la voit : il les actionne donc là où elles sont,
    // plutôt que de couper UI-4A4 — ce qui mesurerait un écran que plus
    // personne n'ouvre. Toutes les assertions sont conservées, et le contrôle
    // gagne même en portée : il prouve en plus que les cartes V2 survivent à un
    // rendu déclenché DEPUIS le panneau.
    await page.locator("#irlToolsBtn").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#ctxToolsBody [data-v4a0-intent]").length === 4,
      null, { timeout: 8000 },
    );
    await page.locator('#ctxToolsBody [data-v4a0-intent="semaine"]').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => irlDateFilters.has("week"))).toBe(true);
    // Et les cartes restantes restent décorées après ce nouveau rendu.
    const total = await page.locator("#eventList .event-card").count();
    if (total) await expect(page.locator("#eventList .event-card[data-v4a2]")).toHaveCount(total);
  });

  test("coupures indépendantes : couper UI-4A1 laisse la tête et les cartes V2", async ({ page }) => {
    await boot(page, { killLocal: "passio_ui_4a1" });
    await ouvrirIrl(page);

    expect(await page.evaluate(() => window.PassioUIV4A1.isActive())).toBe(false);
    await expect(page.locator("#v4a0Head")).toBeVisible();
    await expect(page.locator("#eventList .event-card[data-v4a2]").first()).toBeVisible();
  });

  test("kill switch local : carte historique rendue intégralement", async ({ page }) => {
    await boot(page, { killLocal: "passio_ui_4a2" });
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a2"))).toBe(false);
    await expect(page.locator("#eventList .v4a2")).toHaveCount(0);
    const { carte } = await premiereCarte(page);
    await expect(carte.locator(".event-footer")).toBeVisible();
    await expect(carte.locator(".post-actions")).toBeVisible();
    // ⚠️ Assertion RÉÉCRITE le 2026-08-28. Elle exigeait `#v4a0Head` ABSENT :
    // du temps de l'aperçu, la tête UI-4A0 ne s'affichait que parce qu'UI-4A2
    // l'allumait par héritage, donc couper UI-4A2 éteignait toute la chaîne.
    // Depuis la bascule, UI-4A0 est actif POUR LUI-MÊME : couper UI-4A2 ne
    // défait que les cartes. C'est précisément l'indépendance des coupures que
    // la suite revendique — la nier ici reviendrait à exiger qu'un kill switch
    // déborde de son lot. On vérifie donc que la tête V2 est toujours servie,
    // et qu'elle l'est de son propre chef.
    await expect(page.locator("#v4a0Head")).toBeVisible();
    expect(await page.evaluate(() => window.PassioUIV4A0.isEnabled())).toBe(true);
  });

  test("kill switch mémoire en cours de session : retour sans rechargement", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);
    await expect(page.locator("#eventList .v4a2").first()).toBeVisible();

    await page.evaluate(() => { window.PASSIO_UI_4A2 = false; window.PassioUIV4A2.apply(); });

    await expect(page.locator("#eventList .v4a2")).toHaveCount(0);
    await expect(page.locator("#eventList .event-card[data-v4a2]")).toHaveCount(0);
    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a2"))).toBe(false);
    const { carte } = await premiereCarte(page);
    await expect(carte.locator(".event-footer")).toBeVisible();
    await expect(carte.locator(".post-actions")).toBeVisible();

    // L'écran historique refonctionne : le moteur rend toujours ses cartes.
    await page.evaluate(() => renderIRL());
    await page.waitForTimeout(300);
    await expect(page.locator("#eventList .event-card").first()).toBeVisible();
    await expect(page.locator("#eventList .v4a2")).toHaveCount(0);
  });

  for (const largeur of [320, 390, 430]) {
    test(`mobile ${largeur} px : aucun débordement, cibles ≥ 44 px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      await boot(page);
      await ouvrirIrl(page);

      const debord = await page.evaluate((seuil) => {
        const bloc = document.querySelector("#eventList .v4a2");
        if (!bloc) return -1;
        return bloc.getBoundingClientRect().right - document.documentElement.clientWidth - seuil;
      }, SEUIL_PX);
      expect(debord).toBeLessThanOrEqual(0);

      const hauteurs = await page.evaluate(() =>
        [...document.querySelectorAll("#eventList .v4a2-actions [data-v4a2-act]")]
          .map((el) => Math.round(el.getBoundingClientRect().height)));
      expect(hauteurs.length).toBeGreaterThan(0);
      for (const h of hauteurs) expect(h).toBeGreaterThanOrEqual(44);
    });
  }
});
