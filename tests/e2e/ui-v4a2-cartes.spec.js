// Lot UI-4A2 — carte d'activité V2 dans « Rencontrer » (aperçu).
//
// Ce que cette suite prouve, et rien d'autre :
//   ① l'URL NORMALE est strictement inchangée — aucune classe racine, aucun
//      bloc du lot, carte historique entière et visible ;
//   ② sous l'aperçu, la carte porte EXACTEMENT ce que la direction §8 énumère :
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
//   ⑧ l'aperçu implique la tête UI-4A0 et le raccord UI-4A1, et les trois
//      coupures restent indépendantes ;
//   ⑨ kill switches local et mémoire : retour intégral à la carte historique ;
//   ⑩ mobile 320 / 390 / 430 px sans débordement, cibles ≥ 44 px.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const APERCU = "?passio_preview=passio-ui-4a2";
const DEMO = "?passio_preview=passio-ui-4a2-demo";
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
  await bootOnboarded(page, null, 1, { query: opts.query || "" });
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
  test("URL normale : rien du lot, carte historique intacte", async ({ page }) => {
    await boot(page);
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a2"))).toBe(false);
    await expect(page.locator("#eventList .v4a2")).toHaveCount(0);
    await expect(page.locator("#eventList .event-card[data-v4a2]")).toHaveCount(0);

    const { carte } = await premiereCarte(page);
    await expect(carte.locator(".event-footer")).toBeVisible();
    await expect(carte.locator(".post-actions")).toBeVisible();
    await expect(carte.locator(".event-date-block")).toBeVisible();
    await expect(carte.locator(".event-title")).toBeVisible();
  });

  test("aperçu : la carte porte les six informations de décision", async ({ page }) => {
    await boot(page, { query: DEMO });
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
    await boot(page, { query: APERCU });
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
    await boot(page, { query: APERCU });
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
    await boot(page, { query: APERCU });
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
    await boot(page, { query: APERCU });
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
    await boot(page, { query: APERCU });
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

  test("l'aperçu implique la tête UI-4A0 et le raccord UI-4A1", async ({ page }) => {
    await boot(page, { query: DEMO });
    await ouvrirIrl(page);

    await expect(page.locator("#v4a0Head")).toBeVisible();
    expect(await page.evaluate(() => window.PassioUIV4A0.isEnabled())).toBe(true);
    expect(await page.evaluate(() => window.PassioUIV4A1.isActive())).toBe(true);

    // Les intentions ne sont pas décoratives : elles pilotent le moteur.
    await page.locator('[data-v4a0-intent="semaine"]').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => irlDateFilters.has("week"))).toBe(true);
    // Et les cartes restantes restent décorées après ce nouveau rendu.
    const total = await page.locator("#eventList .event-card").count();
    if (total) await expect(page.locator("#eventList .event-card[data-v4a2]")).toHaveCount(total);
  });

  test("coupures indépendantes : couper UI-4A1 laisse la tête et les cartes V2", async ({ page }) => {
    await boot(page, { query: DEMO, killLocal: "passio_ui_4a1" });
    await ouvrirIrl(page);

    expect(await page.evaluate(() => window.PassioUIV4A1.isActive())).toBe(false);
    await expect(page.locator("#v4a0Head")).toBeVisible();
    await expect(page.locator("#eventList .event-card[data-v4a2]").first()).toBeVisible();
  });

  test("kill switch local : carte historique rendue intégralement", async ({ page }) => {
    await boot(page, { query: DEMO, killLocal: "passio_ui_4a2" });
    await ouvrirIrl(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-4a2"))).toBe(false);
    await expect(page.locator("#eventList .v4a2")).toHaveCount(0);
    const { carte } = await premiereCarte(page);
    await expect(carte.locator(".event-footer")).toBeVisible();
    await expect(carte.locator(".post-actions")).toBeVisible();
    // C'est bien le lot nommé par l'URL qui est coupé : l'aperçu s'éteint
    // entièrement, plus aucun héritier ne réclamant la tête.
    await expect(page.locator("#v4a0Head")).toHaveCount(0);
  });

  test("kill switch mémoire en cours de session : retour sans rechargement", async ({ page }) => {
    await boot(page, { query: DEMO });
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
      await boot(page, { query: DEMO });
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
